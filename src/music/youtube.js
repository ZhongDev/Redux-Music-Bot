import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import ffmpegPath from 'ffmpeg-static';
import { StreamType, createAudioResource, demuxProbe } from '@discordjs/voice';
import { Innertube, Log, Platform, UniversalCache } from 'youtubei.js';
import { Track } from './Track.js';
import { parseInput, looksLikeUrl } from './parse-input.js';
import { StreamError, UserError } from '../utils/errors.js';
import { withTimeout } from '../utils/async.js';

/**
 * youtubei.js ships without a JavaScript runtime for YouTube's signature/n-parameter deciphering
 * (see https://ytjs.dev/guide/getting-started#providing-a-custom-javascript-interpreter).
 * The generated script is a self-contained IIFE, so a plain Function works fine on Node.
 */
function evaluatePlayerScript(data, env = {}) {
    const names = Object.keys(env);
    const fn = new Function(...names, data.output);
    return fn(...names.map((name) => env[name]));
}

const PLAYABILITY_MESSAGES = {
    LOGIN_REQUIRED: 'This video requires signing in (age-restricted or private). Set YOUTUBE_COOKIE to play it.',
    UNPLAYABLE: 'YouTube reports this video as unplayable.',
    LIVE_STREAM_OFFLINE: 'This live stream is not currently live.',
    CONTENT_CHECK_REQUIRED: 'This video requires a content check that the bot cannot complete.',
    AGE_CHECK_REQUIRED: 'This video is age-restricted. Set YOUTUBE_COOKIE to play it.',
    ERROR: 'YouTube returned an error for this video.',
};

const FFMPEG_OUTPUT_ARGS = [
    '-vn', '-sn', '-dn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-frame_duration', '20',
    '-application', 'audio',
    '-f', 'ogg',
    'pipe:1',
];

function badgeToSeconds(text) {
    if (!text || !/^\d+(:\d{1,2})+$/.test(text)) return null;
    return text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/**
 * Builds a diagnostic, single-line description of a streaming error, pulling out the rich
 * detail youtubei.js attaches (`error.info`) that Discord's AudioPlayerError strips away.
 * This is what turns an opaque "non 2xx status code" into "... [FETCH_FAILED, HTTP 403 Forbidden, ...]".
 */
export function describeStreamError(error) {
    if (!error) return 'unknown error';
    const info = error.info ?? error.cause?.info ?? {};
    const response = info.response;
    const message = error.message || error.name || String(error);
    const meta = [];
    if (info.error_type) meta.push(info.error_type);
    if (response?.status) meta.push(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
    if (response?.url) {
        try {
            meta.push(new URL(response.url).host);
        } catch { /* not a URL */ }
    }
    return meta.length ? `${message} [${meta.join(', ')}]` : message;
}

/**
 * Wraps youtubei.js: resolving user input into tracks, searching, and producing Discord audio resources.
 */
export class YouTubeService {
    #yt;
    #config;
    #logger;

    /**
     * @param {import('youtubei.js').Innertube} innertube
     * @param {import('../config.js').config} config
     * @param {ReturnType<import('../logger.js').createLogger>} logger
     */
    constructor(innertube, config, logger) {
        this.#yt = innertube;
        this.#config = config;
        this.#logger = logger;
    }

    /**
     * @param {import('../config.js').config} config
     * @param {ReturnType<import('../logger.js').createLogger>} logger
     */
    static async create(config, logger) {
        Log.setLevel(config.logLevel === 'debug' ? Log.Level.INFO : Log.Level.ERROR);
        Platform.shim.eval = evaluatePlayerScript;

        const innertube = await Innertube.create({
            cache: new UniversalCache(true, path.resolve(config.youtube.cacheDir)),
            cookie: config.youtube.cookie ?? undefined,
            po_token: config.youtube.poToken ?? undefined,
            visitor_data: config.youtube.visitorData ?? undefined,
        });

        logger.info(`YouTube client ready (stream clients: ${config.youtube.clients.join(' > ')}).`);
        return new YouTubeService(innertube, config, logger);
    }

    get clients() {
        return this.#config.youtube.clients;
    }

    get clientCount() {
        return this.#config.youtube.clients.length;
    }

    #timed(promise, what) {
        return withTimeout(promise, this.#config.youtube.requestTimeoutMs, `YouTube took too long to ${what}.`);
    }

    /**
     * Turns a link or search query into tracks.
     * @param {string} input
     * @param {{ id: string, name: string }} requester
     * @param {{ playlistLimit?: number }} [options]
     * @returns {Promise<{ tracks: Track[], playlist?: PlaylistSummary }>}
     */
    async resolve(input, requester, { playlistLimit = this.#config.player.maxPlaylistSize } = {}) {
        const parsed = parseInput(input);

        if (parsed.kind === 'video') {
            return { tracks: [await this.getTrack(parsed.id, requester)] };
        }

        if (parsed.kind === 'playlist') {
            try {
                const playlist = await this.getPlaylist(parsed.id, requester, { limit: playlistLimit, startVideoId: parsed.videoId });
                return { tracks: playlist.tracks, playlist };
            } catch (error) {
                // A watch URL with a list= we could not load still names a video; fall back to it.
                if (parsed.videoId) {
                    this.#logger.debug(`Playlist ${parsed.id} failed (${error.message}); falling back to video ${parsed.videoId}.`);
                    return { tracks: [await this.getTrack(parsed.videoId, requester)] };
                }
                throw error;
            }
        }

        const results = await this.search(parsed.query, requester, { limit: 1 });
        return { tracks: results.slice(0, 1) };
    }

    /**
     * @param {string} id
     * @param {{ id: string, name: string }} requester
     */
    async getTrack(id, requester) {
        let info;
        try {
            info = await this.#timed(this.#yt.getBasicInfo(id, { client: this.clients[0] }), 'load the video');
        } catch (error) {
            this.#logger.debug(`getBasicInfo(${id}) failed: ${error.message}`);
            throw new UserError("I couldn't load that video. Check the link and try again.");
        }
        const basic = info.basic_info ?? {};
        if (!basic.title) {
            const status = info.playability_status?.status;
            throw new UserError(PLAYABILITY_MESSAGES[status] ?? "I couldn't load that video. It may be private or removed.");
        }
        return new Track({
            id: basic.id ?? id,
            title: basic.title,
            author: basic.author ?? basic.channel?.name ?? 'Unknown',
            durationSeconds: basic.duration ?? 0,
            thumbnail: basic.thumbnail?.[0]?.url ?? null,
            isLive: Boolean(basic.is_live),
            requestedBy: requester,
        });
    }

    /**
     * @param {string} query
     * @param {{ id: string, name: string }} requester
     * @param {{ limit?: number }} [options]
     * @returns {Promise<Track[]>}
     */
    async search(query, requester, { limit = 10 } = {}) {
        const results = await this.#timed(this.#yt.search(query, { type: 'video' }), 'search');
        const tracks = [];
        for (const node of results.results ?? []) {
            const track = this.#nodeToTrack(node, requester);
            if (track) tracks.push(track);
            if (tracks.length >= limit) break;
        }
        return tracks;
    }

    /** Autocomplete-style suggestions for a partial query. */
    async suggestions(query) {
        if (!query || looksLikeUrl(query)) return [];
        const suggestions = await withTimeout(this.#yt.getSearchSuggestions(query), 2_500, 'Suggestions timed out');
        return suggestions.filter((item) => typeof item === 'string' && item.trim());
    }

    /**
     * @typedef {{ id: string, title: string, url: string, thumbnail: string | null, totalItems: string | null, tracks: Track[], truncated: boolean }} PlaylistSummary
     */

    /**
     * Loads up to `limit` playable videos from a playlist.
     * @param {string} id
     * @param {{ id: string, name: string }} requester
     * @param {{ limit?: number, startVideoId?: string }} [options]
     * @returns {Promise<PlaylistSummary>}
     */
    async getPlaylist(id, requester, { limit = this.#config.player.maxPlaylistSize, startVideoId } = {}) {
        let playlist;
        try {
            playlist = await this.#timed(this.#yt.getPlaylist(id), 'load the playlist');
        } catch (error) {
            this.#logger.debug(`getPlaylist(${id}) failed: ${error.message}`);
            throw new UserError("I couldn't load that playlist. It may be private, empty, or a YouTube mix.");
        }

        const tracks = [];
        const collect = (items) => {
            for (const node of items ?? []) {
                const track = this.#nodeToTrack(node, requester);
                if (track) tracks.push(track);
                if (tracks.length >= limit) return true;
            }
            return false;
        };

        let full = collect(playlist.items);
        let page = playlist;
        while (!full && page.has_continuation) {
            page = await this.#timed(page.getContinuation(), 'load more of the playlist');
            full = collect(page.items);
        }

        if (startVideoId) {
            const start = tracks.findIndex((track) => track.id === startVideoId);
            if (start > 0) tracks.push(...tracks.splice(0, start));
        }

        return {
            id,
            title: playlist.info?.title ?? 'Untitled playlist',
            url: `https://www.youtube.com/playlist?list=${id}`,
            thumbnail: playlist.info?.thumbnails?.[0]?.url ?? tracks[0]?.thumbnail ?? null,
            totalItems: playlist.info?.total_items ?? null,
            tracks,
            truncated: full && page.has_continuation,
        };
    }

    /**
     * Converts a parsed InnerTube node (search result / playlist item) into a Track.
     * Returns null for non-video nodes and unplayable entries.
     */
    #nodeToTrack(node, requester) {
        if (!node) return null;
        let id;
        let title;
        let author;
        let duration = 0;
        let thumbnail = null;
        let isLive = false;

        switch (node.type) {
            case 'Video':
            case 'CompactVideo':
            case 'GridVideo':
            case 'PlaylistVideo':
            case 'PlaylistPanelVideo':
            case 'ReelItem': {
                if (node.is_playable === false) return null;
                id = node.video_id ?? node.id;
                title = node.title?.text ?? node.title?.toString?.();
                author = node.author?.name;
                duration = node.duration?.seconds ?? 0;
                thumbnail = node.best_thumbnail?.url ?? node.thumbnails?.[0]?.url ?? null;
                try {
                    isLive = node.is_live === true;
                } catch {
                    isLive = false;
                }
                break;
            }
            case 'LockupView': {
                if (node.content_type !== 'VIDEO' && node.content_type !== 'SHORT') return null;
                id = node.content_id;
                title = node.metadata?.title?.text;
                author = node.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text;
                const image = node.content_image;
                thumbnail = image?.image?.[0]?.url ?? image?.primary_thumbnail?.image?.[0]?.url ?? null;
                const overlays = image?.overlays ?? image?.primary_thumbnail?.overlays ?? [];
                for (const overlay of overlays) {
                    for (const badge of overlay?.badges ?? []) {
                        const text = badge?.text?.trim?.();
                        if (!text) continue;
                        if (/^live$/i.test(text)) isLive = true;
                        const seconds = badgeToSeconds(text);
                        if (seconds !== null) duration = seconds;
                    }
                }
                break;
            }
            default:
                return null;
        }

        if (!id || !title) return null;
        return new Track({
            id,
            title,
            author: author ?? 'Unknown',
            durationSeconds: duration,
            thumbnail,
            isLive,
            requestedBy: requester,
        });
    }

    /**
     * Picks the best audio-only format, preferring Opus (no transcoding needed) and the original language.
     * @returns {(object & { isOpus: boolean }) | null}
     */
    static pickAudioFormat(info) {
        const formats = (info.streaming_data?.adaptive_formats ?? []).filter(
            (format) => format.has_audio && !format.has_video && !format.drm_families?.length,
        );
        if (!formats.length) return null;

        const originals = formats.filter((format) => format.is_original !== false && !format.is_dubbed && !format.is_descriptive);
        const pool = originals.length ? originals : formats;
        const opus = pool.filter((format) => /webm/i.test(format.mime_type) && /opus/i.test(format.mime_type));
        const chosenPool = opus.length ? opus : pool;
        const best = chosenPool.slice().sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
        return Object.assign(best, { isOpus: opus.includes(best) });
    }

    /**
     * Creates an audio resource for a track, trying each configured InnerTube client in turn.
     *
     * YouTube accepts a given client's stream URLs inconsistently (frequent HTTP 403s that vary by
     * client, video and server IP), so we fall through to the next client on any failure. Callers can
     * pass `exclude` to skip clients that have already failed for this track — used by the session to
     * recover with a different client when a stream dies mid-playback.
     *
     * @param {Track} track
     * @param {{ seek?: number, volume?: number, exclude?: Iterable<string> }} [options] seek in seconds, volume in percent
     * @returns {Promise<{ resource: import('@discordjs/voice').AudioResource<Track>, destroy: () => void, client: string }>}
     */
    async createStream(track, { seek = 0, volume = 100, exclude } = {}) {
        const excluded = exclude instanceof Set ? exclude : new Set(exclude ?? []);
        const clients = this.clients.filter((client) => !excluded.has(client));
        const failures = [];
        let playability = null;

        for (const client of clients) {
            let info;
            try {
                info = await this.#timed(this.#yt.getBasicInfo(track.id, { client }), 'load stream info');
            } catch (error) {
                const detail = describeStreamError(error);
                failures.push(`${client}: ${detail}`);
                this.#logger.debug(`[${track.id}] ${client} getBasicInfo failed: ${detail}`);
                continue;
            }

            const status = info.playability_status?.status;
            if (status && status !== 'OK') {
                playability = playability ?? status;
                const reason = info.playability_status?.reason ? ` (${info.playability_status.reason})` : '';
                failures.push(`${client}: ${status}${reason}`);
                this.#logger.debug(`[${track.id}] ${client} not playable: ${status}${reason}`);
                continue;
            }

            if (info.basic_info?.is_live) {
                const hls = info.streaming_data?.hls_manifest_url;
                if (!hls) {
                    failures.push(`${client}: live stream without HLS manifest`);
                    continue;
                }
                this.#logger.debug(`[${track.id}] streaming live via ${client} (HLS).`);
                return { ...this.#ffmpegStream({ input: hls, volume, track, client }), client };
            }

            const format = YouTubeService.pickAudioFormat(info);
            if (!format) {
                failures.push(`${client}: no audio formats`);
                continue;
            }

            let webStream;
            try {
                webStream = await this.#timed(info.download({ itag: format.itag, type: 'audio' }), 'start the stream');
            } catch (error) {
                const detail = describeStreamError(error);
                failures.push(`${client}: ${detail}`);
                this.#logger.debug(`[${track.id}] ${client} download() failed: ${detail}`);
                continue;
            }

            const readable = Readable.fromWeb(webStream);
            // Once a stream is committed and playing, surface any later error loudly with its rich
            // detail here at the source — Discord's AudioPlayerError discards youtubei.js's `error.info`
            // (HTTP status, etc.) before it reaches the session. Before commit, the no-op just prevents
            // an unhandled 'error' while we validate below (the detail is reported via `failures`).
            let committed = false;
            readable.on('error', (error) => {
                if (committed) {
                    this.#logger.warn(`[${track.id}] stream error while playing (client=${client}, itag=${format.itag}): ${describeStreamError(error)}`);
                }
            });

            // Read the first chunk to confirm the URL is actually served (this is where a 403 shows up).
            // Doing it for every path means a rejected client is skipped here instead of only after we
            // have already handed a doomed stream to the audio player.
            let probe;
            try {
                probe = await this.#timed(demuxProbe(readable), 'open the stream');
            } catch (error) {
                readable.destroy();
                const detail = describeStreamError(error);
                failures.push(`${client}: ${detail}`);
                this.#logger.debug(`[${track.id}] ${client} stream check failed: ${detail}`);
                continue;
            }

            const isOpus = probe.type === StreamType.OggOpus || probe.type === StreamType.WebmOpus;
            const needsFfmpeg = seek > 0 || volume !== 100 || !isOpus;
            committed = true;

            if (needsFfmpeg) {
                this.#logger.debug(`[${track.id}] streaming via ${client} + ffmpeg (itag=${format.itag}, type=${probe.type}, seek=${seek}s, volume=${volume}%).`);
                return { ...this.#ffmpegStream({ input: probe.stream, seek, volume, track, client }), client };
            }

            this.#logger.debug(`[${track.id}] streaming via ${client} directly (itag=${format.itag}, type=${probe.type}).`);
            const resource = createAudioResource(probe.stream, { inputType: probe.type, metadata: track });
            return { resource, destroy: () => readable.destroy(), client };
        }

        if (failures.length) {
            this.#logger.warn(`[${track.id}] could not stream "${track.title}": ${failures.join(' | ')}`);
        }
        const friendly = PLAYABILITY_MESSAGES[playability];
        const error = new StreamError(friendly ?? `Unable to stream this track (${failures.join('; ') || 'no clients available'}).`);
        error.details = failures;
        throw error;
    }

    /**
     * Transcodes an input (Node readable or URL) to Ogg/Opus with ffmpeg.
     * @param {{ input: Readable | string, seek?: number, volume?: number, track: Track, client?: string }} options
     */
    #ffmpegStream({ input, seek = 0, volume = 100, track, client = 'ffmpeg' }) {
        if (!ffmpegPath) throw new StreamError('ffmpeg binary not found (ffmpeg-static failed to install).');
        const isUrl = typeof input === 'string';
        const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
        if (isUrl) args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
        if (seek > 0) args.push('-ss', String(seek));
        args.push('-i', isUrl ? input : 'pipe:0');
        if (volume !== 100) args.push('-af', `volume=${(volume / 100).toFixed(3)}`);
        args.push(...FFMPEG_OUTPUT_ARGS);

        const child = spawn(ffmpegPath, args, { stdio: [isUrl ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true });
        let stderr = '';
        let finished = false;

        child.stderr.on('data', (chunk) => {
            stderr = `${stderr}${chunk}`.slice(-2_000);
        });
        child.stdout.on('error', () => { /* consumed by the audio player */ });
        child.on('error', (error) => {
            if (!finished) child.stdout.destroy(new StreamError(`ffmpeg failed to start: ${error.message}`));
        });
        child.on('close', (code) => {
            if (finished) return;
            finished = true;
            if (code !== 0 && code !== null) {
                this.#logger.warn(`[${track.id}] ffmpeg (client=${client}) exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`);
                child.stdout.destroy(new StreamError(`ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
            }
        });

        if (!isUrl) {
            child.stdin.on('error', () => { /* ffmpeg closed early; nothing to do */ });
            input.on('error', (error) => {
                if (!finished) child.stdout.destroy(error);
            });
            input.pipe(child.stdin);
        }

        const resource = createAudioResource(child.stdout, { inputType: StreamType.OggOpus, metadata: track });
        const destroy = () => {
            finished = true;
            if (!isUrl) input.destroy();
            child.stdout.destroy();
            if (child.exitCode === null) child.kill('SIGKILL');
        };
        return { resource, destroy };
    }
}
