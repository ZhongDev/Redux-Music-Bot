import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

const env = process.env;

function readString(name, fallback = '') {
    const value = env[name];
    return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function readNumber(name, fallback, { min = -Infinity, max = Infinity } = {}) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`Environment variable ${name} must be a number (got "${raw}").`);
    }
    return Math.min(max, Math.max(min, value));
}

function readBoolean(name, fallback) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function readList(name, fallback) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

/**
 * Immutable, validated view of the process environment.
 * Everything the bot can be tuned with lives here so the rest of the code never touches process.env.
 */
export const config = Object.freeze({
    discord: Object.freeze({
        token: readString('DISCORD_TOKEN'),
        clientId: readString('DISCORD_CLIENT_ID'),
        guildId: readString('DISCORD_GUILD_ID') || null,
    }),
    youtube: Object.freeze({
        cookie: readString('YOUTUBE_COOKIE') || null,
        poToken: readString('YOUTUBE_PO_TOKEN') || null,
        visitorData: readString('YOUTUBE_VISITOR_DATA') || null,
        /** InnerTube clients to try, in order, when resolving an audio stream. */
        clients: Object.freeze(readList('YOUTUBE_CLIENTS', ['VISIONOS', 'IOS', 'MWEB', 'ANDROID_VR'])),
        cacheDir: readString('YOUTUBE_CACHE_DIR', '.cache/youtubei'),
        requestTimeoutMs: readNumber('YOUTUBE_REQUEST_TIMEOUT_MS', 20_000, { min: 1_000 }),
    }),
    player: Object.freeze({
        /** Seconds to stay in an empty queue before leaving. 0 disables. */
        idleTimeoutSeconds: readNumber('IDLE_TIMEOUT_SECONDS', 300, { min: 0 }),
        /** Seconds to stay alone in a voice channel before leaving. 0 disables. */
        emptyChannelTimeoutSeconds: readNumber('EMPTY_CHANNEL_TIMEOUT_SECONDS', 60, { min: 0 }),
        maxQueueSize: readNumber('MAX_QUEUE_SIZE', 500, { min: 1 }),
        maxPlaylistSize: readNumber('MAX_PLAYLIST_SIZE', 200, { min: 1 }),
        defaultVolume: readNumber('DEFAULT_VOLUME', 100, { min: 0, max: 200 }),
        maxVolume: readNumber('MAX_VOLUME', 200, { min: 1, max: 500 }),
        historySize: readNumber('HISTORY_SIZE', 50, { min: 1 }),
        announceNowPlaying: readBoolean('ANNOUNCE_NOW_PLAYING', true),
    }),
    logLevel: readString('LOG_LEVEL', 'info'),
});

/**
 * Throws a readable error if any of the given environment variables are missing.
 * @param {string[]} names
 */
export function assertRequiredEnv(names) {
    const missing = names.filter((name) => !env[name] || env[name].trim() === '');
    if (missing.length) {
        throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. See .env.example.`);
    }
}
