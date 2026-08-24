import { EventEmitter } from 'node:events';
import { ChannelType } from 'discord.js';
import {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus,
    createAudioPlayer,
    entersState,
    joinVoiceChannel,
} from '@discordjs/voice';
import { TrackQueue } from './TrackQueue.js';
import { UserError } from '../utils/errors.js';
import { sleep } from '../utils/async.js';

const MAX_CONSECUTIVE_FAILURES = 5;
const CONNECT_TIMEOUT_MS = 20_000;
const MAX_REJOIN_ATTEMPTS = 5;

/**
 * Per-guild playback session: owns the voice connection, the audio player and the queue,
 * and serialises every track transition so concurrent commands cannot race each other.
 *
 * Events:
 *  - `trackStart` (track, { silent, seek })
 *  - `trackError` (track, error)
 *  - `queueEnd` ({ reason: 'finished' | 'skipped' | 'errors' | 'empty' })
 *  - `destroyed` (reason)
 */
export class GuildSession extends EventEmitter {
    #guild;
    #youtube;
    #config;
    #logger;
    #player;
    #queue;
    #connection = null;
    #voiceChannelId = null;
    #volume;
    #stream = null;
    #seekOffset = 0;
    #idleTimer = null;
    #emptyTimer = null;
    #listeners = 1;
    #chain = Promise.resolve();
    #suppressIdle = false;
    #destroyed = false;
    #consecutiveFailures = 0;
    /** InnerTube client that produced the currently playing stream. */
    #activeClient = null;
    /** Clients already tried (and failed) for the current track, so recovery skips them. */
    #activeExclude = new Set();
    /** Set when the current stream errors, so the idle handler recovers instead of advancing. */
    #streamErrored = false;
    #lastStreamError = null;

    /** Text channel used for announcements; set by whichever command last touched the session. */
    textChannel = null;
    /** The last "now playing" announcement, deleted when the next one is posted. */
    lastNowPlayingMessage = null;

    /**
     * @param {{ guild: import('discord.js').Guild, youtube: import('./youtube.js').YouTubeService, config: import('../config.js').config, logger: ReturnType<import('../logger.js').createLogger> }} deps
     */
    constructor({ guild, youtube, config, logger }) {
        super();
        this.#guild = guild;
        this.#youtube = youtube;
        this.#config = config;
        this.#logger = logger.child(guild.id);
        this.#volume = config.player.defaultVolume;
        this.#queue = new TrackQueue({ maxSize: config.player.maxQueueSize, historySize: config.player.historySize });

        this.#player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        this.#player.on('stateChange', (oldState, newState) => this.#onPlayerStateChange(oldState, newState));
        this.#player.on('error', (error) => {
            // The rich cause (HTTP 403 etc.) is logged at the source by YouTubeService; AudioPlayerError
            // only carries the message. We flag the error here and let the idle transition that follows
            // decide whether to recover with a different client or give up on the track.
            const track = error.resource?.metadata ?? this.#queue.current;
            this.#lastStreamError = error;
            this.#logger.debug(`Stream errored on "${track?.title ?? 'unknown'}": ${error.message}`);
            if (this.#stream && error.resource === this.#stream.resource) {
                this.#streamErrored = true;
            }
        });
    }

    get guild() {
        return this.#guild;
    }

    get queue() {
        return this.#queue;
    }

    get volume() {
        return this.#volume;
    }

    get voiceChannelId() {
        return this.#voiceChannelId;
    }

    get isDestroyed() {
        return this.#destroyed;
    }

    get isConnected() {
        return !this.#destroyed
            && this.#connection !== null
            && this.#connection.state.status !== VoiceConnectionStatus.Destroyed;
    }

    get status() {
        return this.#player.state.status;
    }

    /** True while a track is loaded (playing, buffering or paused). */
    get isActive() {
        return this.status !== AudioPlayerStatus.Idle;
    }

    get isPaused() {
        return this.status === AudioPlayerStatus.Paused || this.status === AudioPlayerStatus.AutoPaused;
    }

    get isPlaying() {
        return this.status === AudioPlayerStatus.Playing || this.status === AudioPlayerStatus.Buffering;
    }

    /** The track that is currently loaded, if any. */
    get current() {
        return this.#queue.current;
    }

    /** Playback position of the current track in seconds. */
    get position() {
        if (!this.#stream) return 0;
        return this.#seekOffset + this.#stream.resource.playbackDuration / 1000;
    }

    // ---------------------------------------------------------------------
    // Voice connection
    // ---------------------------------------------------------------------

    /**
     * Joins (or moves to) a voice channel and waits until the connection is ready.
     * @param {import('discord.js').VoiceBasedChannel} voiceChannel
     */
    async connect(voiceChannel) {
        if (this.#destroyed) throw new UserError('That session has ended. Please run the command again.');

        const existing = this.#connection;
        if (existing && this.#voiceChannelId === voiceChannel.id && existing.state.status === VoiceConnectionStatus.Ready) {
            return existing;
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false,
        });
        if (connection !== existing) this.#bindConnection(connection);
        this.#voiceChannelId = voiceChannel.id;

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
        } catch {
            this.#logger.warn(`Timed out joining voice channel ${voiceChannel.id}.`);
            this.destroy('connect-failed');
            throw new UserError("I couldn't connect to the voice channel in time. Please try again.");
        }

        if (voiceChannel.type === ChannelType.GuildStageVoice) {
            try {
                await voiceChannel.guild.members.me?.voice.setSuppressed(false);
            } catch {
                this.#logger.warn('Could not become a stage speaker; audio may be suppressed. Grant "Request to Speak"/"Mute Members".');
            }
        }

        this.cancelIdleLeave();
        return connection;
    }

    #bindConnection(connection) {
        this.#connection = connection;
        connection.subscribe(this.#player);

        connection.on(VoiceConnectionStatus.Disconnected, async (_oldState, newState) => {
            if (this.#destroyed) return;
            if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                // Either we were moved to another channel (the connection recovers on its own)
                // or we were kicked. Give it a few seconds to find out which.
                try {
                    await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
                } catch {
                    this.destroy('disconnected');
                }
            } else if (connection.rejoinAttempts < MAX_REJOIN_ATTEMPTS) {
                await sleep((connection.rejoinAttempts + 1) * 5_000);
                if (!this.#destroyed) connection.rejoin();
            } else {
                this.destroy('disconnected');
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy('disconnected'));
        connection.on('error', (error) => this.#logger.warn(`Voice connection error: ${error.message}`));
    }

    /** Called when Discord reports the bot was moved to a different channel. */
    setVoiceChannel(channelId) {
        this.#voiceChannelId = channelId;
    }

    // ---------------------------------------------------------------------
    // Playback control (every mutation is funnelled through #transition)
    // ---------------------------------------------------------------------

    /**
     * Starts playback if nothing is playing. Resolves to true when a new track was started.
     * @param {{ silent?: boolean }} [options] silent suppresses the "now playing" announcement
     */
    play({ silent = false } = {}) {
        return this.#transition(async () => {
            if (this.#queue.current && this.isActive) return false;
            const track = this.#queue.advance({ force: true });
            if (!track) {
                this.#endQueue('empty');
                return false;
            }
            await this.#startTrack(track, { silent });
            return true;
        });
    }

    /**
     * Skips the current track (and `count - 1` upcoming ones).
     * @returns {Promise<{ skipped: import('./Track.js').Track[], next: import('./Track.js').Track | null }>}
     */
    skip(count = 1) {
        return this.#transition(async () => {
            const current = this.#queue.current;
            if (!current) throw new UserError('Nothing is playing.');
            const skipped = [current];
            const extra = Math.min(Math.max(0, count - 1), this.#queue.size);
            if (extra > 0) skipped.push(...this.#queue.remove(0, extra));
            const next = this.#queue.advance({ force: true });
            if (next) {
                await this.#startTrack(next);
            } else {
                this.#endQueue('skipped');
            }
            return { skipped, next };
        });
    }

    /** Replays the most recently played track. */
    previous() {
        return this.#transition(async () => {
            const track = this.#queue.previous();
            if (!track) throw new UserError('There is no previous track to go back to.');
            await this.#startTrack(track);
            return track;
        });
    }

    /**
     * Jumps to the upcoming track at `index` (0-based).
     * @returns {Promise<{ track: import('./Track.js').Track, skipped: import('./Track.js').Track[] }>}
     */
    jump(index) {
        return this.#transition(async () => {
            const skipped = this.#queue.jump(index);
            const track = this.#queue.advance({ force: true });
            await this.#startTrack(track);
            return { track, skipped };
        });
    }

    /** Seeks within the current track. */
    seek(seconds) {
        return this.#transition(async () => {
            const track = this.#queue.current;
            if (!track || !this.isActive) throw new UserError('Nothing is playing.');
            if (track.isLive) throw new UserError('You cannot seek in a live stream.');
            if (track.durationSeconds && seconds >= track.durationSeconds) {
                throw new UserError(`That is past the end of the track (${track.durationText}).`);
            }
            await this.#startTrack(track, { seek: Math.max(0, seconds), silent: true });
            return track;
        });
    }

    /**
     * Sets the volume (percent). If something is playing it is restarted in place at the new level.
     * @returns {Promise<boolean>} whether playback had to be restarted
     */
    setVolume(percent) {
        this.#volume = Math.round(percent);
        return this.#transition(async () => {
            const track = this.#queue.current;
            if (!track || !this.isActive) return false;
            const position = track.isLive ? 0 : Math.floor(this.position);
            await this.#startTrack(track, { seek: position, silent: true });
            return true;
        });
    }

    pause() {
        if (!this.isActive) throw new UserError('Nothing is playing.');
        if (this.isPaused) throw new UserError('Playback is already paused.');
        this.#player.pause(true);
    }

    resume() {
        if (!this.isActive) throw new UserError('Nothing is playing.');
        if (!this.isPaused) throw new UserError('Playback is not paused.');
        this.#player.unpause();
    }

    /** Stops playback and clears the queue, but stays in the voice channel until the idle timeout. */
    stop() {
        return this.#transition(async () => {
            this.#queue.reset();
            this.#stopPlayback();
            this.scheduleIdleLeave();
        });
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /** Runs `fn` after every previously scheduled transition has settled. */
    #transition(fn) {
        const result = this.#chain.then(() => {
            if (this.#destroyed) throw new UserError('That session has ended. Please run the command again.');
            return fn();
        });
        this.#chain = result.catch(() => { /* errors are reported to the caller */ });
        return result;
    }

    async #startTrack(track, { seek = 0, silent = false, exclude = new Set() } = {}) {
        this.cancelIdleLeave();

        let stream;
        try {
            stream = await this.#youtube.createStream(track, { seek, volume: this.#volume, exclude });
        } catch (error) {
            this.#logger.warn(`Could not start "${track.title}" (${track.id}): ${error.message}`);
            this.emit('trackError', track, error);
            this.#consecutiveFailures += 1;
            if (this.#consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                this.#logger.warn(`${MAX_CONSECUTIVE_FAILURES} tracks failed in a row; stopping playback.`);
                this.#consecutiveFailures = 0;
                this.#endQueue('errors');
                return;
            }
            const next = this.#queue.advance({ force: true });
            if (next) {
                await this.#startTrack(next, { silent });
            } else {
                this.#endQueue('errors');
            }
            return;
        }

        if (this.#destroyed) {
            stream.destroy();
            return;
        }

        this.#consecutiveFailures = 0;
        this.#suppressIdle = true;
        try {
            this.#destroyStream();
            this.#stream = stream;
            this.#seekOffset = seek;
            this.#activeClient = stream.client ?? null;
            this.#activeExclude = exclude;
            this.#streamErrored = false;
            this.#player.play(stream.resource);
        } finally {
            this.#suppressIdle = false;
        }
        this.#logger.info(`Playing "${track.title}" (${track.id}) via ${stream.client ?? 'unknown'}${seek ? ` from ${seek}s` : ''}.`);
        this.emit('trackStart', track, { silent, seek });
    }

    #onPlayerStateChange(oldState, newState) {
        if (newState.status !== AudioPlayerStatus.Idle || oldState.status === AudioPlayerStatus.Idle) return;
        if (this.#suppressIdle || this.#destroyed) return;

        const ended = oldState.resource;
        const errored = this.#streamErrored;
        this.#streamErrored = false;

        this.#transition(async () => {
            // A manual skip/seek may already have replaced the resource; ignore stale idles.
            if (!this.#stream || this.#stream.resource !== ended) return;

            if (errored) {
                await this.#recoverOrAdvance();
                return;
            }

            this.#destroyStream();
            const next = this.#queue.advance();
            if (next) {
                await this.#startTrack(next);
            } else {
                this.#endQueue('finished');
            }
        }).catch((error) => this.#logger.error(`Failed to advance the queue: ${error.stack ?? error}`));
    }

    /**
     * Handles a stream that died mid-playback: retry the same track from the current position with a
     * different InnerTube client, and only skip it once every client has been exhausted.
     */
    async #recoverOrAdvance() {
        const track = this.#queue.current;
        const position = track && !track.isLive ? Math.floor(this.position) : 0;
        this.#destroyStream();

        if (track) {
            const exclude = new Set(this.#activeExclude);
            if (this.#activeClient) exclude.add(this.#activeClient);
            if (exclude.size < this.#youtube.clientCount) {
                this.#logger.warn(`Stream for "${track.title}" failed on client ${this.#activeClient}; retrying with another client from ${position}s.`);
                await this.#startTrack(track, { seek: position, silent: true, exclude });
                return;
            }
            this.#logger.warn(`Every client failed for "${track.title}"; skipping it.`);
            this.emit('trackError', track, this.#lastStreamError ?? new Error('Playback failed on every client.'));
        }

        const next = this.#queue.advance({ force: true });
        if (next) {
            await this.#startTrack(next);
        } else {
            this.#endQueue('errors');
        }
    }

    #endQueue(reason) {
        this.#queue.finish();
        this.#stopPlayback();
        this.emit('queueEnd', { reason });
        this.scheduleIdleLeave();
    }

    #stopPlayback() {
        this.#suppressIdle = true;
        try {
            this.#destroyStream();
            this.#player.stop(true);
        } finally {
            this.#suppressIdle = false;
        }
    }

    #destroyStream() {
        const stream = this.#stream;
        this.#stream = null;
        this.#seekOffset = 0;
        if (stream) {
            try {
                stream.destroy();
            } catch (error) {
                this.#logger.debug(`Error while destroying stream: ${error.message}`);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Auto-leave timers
    // ---------------------------------------------------------------------

    scheduleIdleLeave() {
        this.cancelIdleLeave();
        const seconds = this.#config.player.idleTimeoutSeconds;
        if (!seconds || this.#destroyed) return;
        this.#idleTimer = setTimeout(() => {
            this.#idleTimer = null;
            if (!this.#queue.current && !this.isActive) this.destroy('idle');
        }, seconds * 1000);
    }

    cancelIdleLeave() {
        if (this.#idleTimer) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = null;
        }
    }

    /**
     * Tracks how many humans share the voice channel; leaves after a grace period when it hits zero.
     * @param {number} listeners
     */
    updateOccupancy(listeners) {
        this.#listeners = listeners;
        if (listeners > 0) {
            if (this.#emptyTimer) {
                clearTimeout(this.#emptyTimer);
                this.#emptyTimer = null;
            }
            return;
        }
        const seconds = this.#config.player.emptyChannelTimeoutSeconds;
        if (!seconds || this.#emptyTimer || this.#destroyed) return;
        this.#emptyTimer = setTimeout(() => {
            this.#emptyTimer = null;
            if (this.#listeners === 0) this.destroy('empty');
        }, seconds * 1000);
    }

    /**
     * Tears everything down: stops audio, leaves voice, clears timers.
     * @param {'manual' | 'idle' | 'empty' | 'disconnected' | 'connect-failed' | 'shutdown'} reason
     */
    destroy(reason = 'manual') {
        if (this.#destroyed) return;
        this.#destroyed = true;

        this.cancelIdleLeave();
        if (this.#emptyTimer) {
            clearTimeout(this.#emptyTimer);
            this.#emptyTimer = null;
        }

        this.#suppressIdle = true;
        this.#destroyStream();
        try {
            this.#player.stop(true);
        } catch { /* ignore */ }

        const connection = this.#connection;
        this.#connection = null;
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            try {
                connection.destroy();
            } catch (error) {
                this.#logger.debug(`Error while destroying voice connection: ${error.message}`);
            }
        }

        this.#queue.reset();
        this.#logger.info(`Session ended (${reason}).`);
        this.emit('destroyed', reason);
        this.removeAllListeners();
    }
}
