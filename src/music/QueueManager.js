import { PermissionFlagsBits } from 'discord.js';
import { GuildSession } from './GuildSession.js';
import { nowPlayingEmbed } from './embeds.js';
import { countListeners } from '../utils/guards.js';
import { truncate } from '../utils/format.js';

/**
 * Owns one {@link GuildSession} per guild and turns session events into chat announcements.
 */
export class QueueManager {
    #sessions = new Map();
    #client;
    #youtube;
    #config;
    #logger;

    /**
     * @param {{ client: import('discord.js').Client, youtube: import('./youtube.js').YouTubeService, config: import('../config.js').config, logger: ReturnType<import('../logger.js').createLogger> }} deps
     */
    constructor({ client, youtube, config, logger }) {
        this.#client = client;
        this.#youtube = youtube;
        this.#config = config;
        this.#logger = logger;
    }

    get size() {
        return this.#sessions.size;
    }

    /** @returns {GuildSession | undefined} the live session for a guild */
    get(guildId) {
        const session = this.#sessions.get(guildId);
        return session && !session.isDestroyed ? session : undefined;
    }

    /** @param {import('discord.js').Guild} guild */
    getOrCreate(guild) {
        const existing = this.get(guild.id);
        if (existing) return existing;

        const session = new GuildSession({ guild, youtube: this.#youtube, config: this.#config, logger: this.#logger });
        this.#sessions.set(guild.id, session);
        this.#wire(session);
        return session;
    }

    #wire(session) {
        const guildId = session.guild.id;

        session.on('trackStart', (_track, { silent } = {}) => {
            if (silent || !this.#config.player.announceNowPlaying) return;
            this.#announce(session, { embeds: [nowPlayingEmbed(session, { compact: true })] }, { nowPlaying: true });
        });

        session.on('trackError', (track, error) => {
            this.#announce(session, { content: `⚠️ Skipped **${truncate(track.title, 100)}**: ${truncate(error.message, 300)}` });
        });

        session.on('queueEnd', ({ reason }) => {
            if (reason !== 'finished' && reason !== 'errors') return;
            const idle = this.#config.player.idleTimeoutSeconds;
            const leaving = idle && session.voiceChannelId
                ? ` I'll leave <#${session.voiceChannelId}> in ${Math.round(idle / 60)} minute(s) unless something else is queued.`
                : '';
            this.#announce(session, { content: `✅ The queue is finished.${leaving}` });
        });

        session.on('destroyed', (reason) => {
            if (this.#sessions.get(guildId) === session) this.#sessions.delete(guildId);
            const channel = session.voiceChannelId ? `<#${session.voiceChannelId}>` : 'the voice channel';
            const messages = {
                idle: `👋 Left ${channel} after ${Math.round(this.#config.player.idleTimeoutSeconds / 60)} minute(s) of inactivity.`,
                empty: `👋 Left ${channel} because everyone else left.`,
                disconnected: '👋 I was disconnected from the voice channel, so the queue was cleared.',
            };
            if (messages[reason]) this.#announce(session, { content: messages[reason] });
        });
    }

    async #announce(session, payload, { nowPlaying = false } = {}) {
        const channel = session.textChannel;
        if (!channel || !channel.isSendable?.()) return;

        const me = channel.guild?.members.me;
        const permissions = me ? channel.permissionsFor(me) : null;
        if (permissions && !permissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

        let body = payload;
        if (payload.embeds?.length && permissions && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
            const track = session.current;
            body = { content: track ? `🎶 Now playing: **${truncate(track.title, 200)}** (${track.durationText})` : 'Now playing.' };
        }

        try {
            if (nowPlaying && session.lastNowPlayingMessage) {
                session.lastNowPlayingMessage.delete().catch(() => { /* already gone */ });
                session.lastNowPlayingMessage = null;
            }
            const message = await channel.send(body);
            if (nowPlaying) session.lastNowPlayingMessage = message;
        } catch (error) {
            this.#logger.debug(`Could not announce in #${channel.name ?? channel.id}: ${error.message}`);
        }
    }

    /**
     * Keeps sessions informed about who is in their voice channel and whether the bot was moved.
     * @param {import('discord.js').VoiceState} oldState
     * @param {import('discord.js').VoiceState} newState
     */
    handleVoiceStateUpdate(oldState, newState) {
        const guild = newState.guild ?? oldState.guild;
        const session = this.get(guild.id);
        if (!session?.isConnected || !session.voiceChannelId) return;

        if (newState.id === this.#client.user?.id) {
            if (!newState.channelId) return; // leaving is handled by the voice connection state machine
            if (newState.channelId !== session.voiceChannelId) session.setVoiceChannel(newState.channelId);
        }

        if (oldState.channelId !== session.voiceChannelId && newState.channelId !== session.voiceChannelId) return;

        const channel = guild.channels.cache.get(session.voiceChannelId);
        session.updateOccupancy(countListeners(channel));
    }

    destroyAll(reason = 'shutdown') {
        for (const session of this.#sessions.values()) {
            session.destroy(reason);
        }
        this.#sessions.clear();
    }
}
