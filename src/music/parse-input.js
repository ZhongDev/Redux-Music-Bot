import { UserError } from '../utils/errors.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{12,}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be', 'youtube-nocookie.com']);
const LOOKS_LIKE_URL = /^(?:https?:\/\/)?(?:[\w-]+\.)*[\w-]+\.[a-z]{2,}(?:[/?#]|$)/i;

export function isVideoId(value) {
    return typeof value === 'string' && VIDEO_ID.test(value);
}

export function isPlaylistId(value) {
    return typeof value === 'string' && PLAYLIST_ID.test(value);
}

/** Radio/mix playlists (RD...) are generated per-viewer and cannot be fetched. */
export function isMixPlaylist(id) {
    return typeof id === 'string' && id.startsWith('RD');
}

export function looksLikeUrl(input) {
    return LOOKS_LIKE_URL.test(String(input ?? '').trim());
}

function normalizeHost(hostname) {
    return hostname.toLowerCase().replace(/^(www|m|music|gaming)\./, '');
}

/**
 * Classifies user input as a YouTube video, a playlist, or a free-text search.
 * @param {string} raw
 * @returns {{ kind: 'video', id: string } | { kind: 'playlist', id: string, videoId?: string } | { kind: 'search', query: string }}
 */
export function parseInput(raw) {
    const input = String(raw ?? '').trim();
    if (!input) throw new UserError('Please provide a YouTube link or something to search for.');

    if (!looksLikeUrl(input)) {
        return { kind: 'search', query: input };
    }

    let url;
    try {
        url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
        return { kind: 'search', query: input };
    }

    const host = normalizeHost(url.hostname);
    if (!YOUTUBE_HOSTS.has(host)) {
        throw new UserError('Only YouTube links are supported. Paste a YouTube URL or type a search query instead.');
    }

    const list = url.searchParams.get('list');
    const withPlaylist = (videoId) => {
        if (list && isPlaylistId(list) && !isMixPlaylist(list)) {
            return { kind: 'playlist', id: list, videoId };
        }
        return { kind: 'video', id: videoId };
    };

    if (host === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0];
        if (isVideoId(id)) return withPlaylist(id);
        throw new UserError("That youtu.be link doesn't contain a valid video id.");
    }

    const v = url.searchParams.get('v');
    if (url.pathname === '/watch' && isVideoId(v)) {
        return withPlaylist(v);
    }

    const pathMatch = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})(?:[/?]|$)/);
    if (pathMatch) {
        return { kind: 'video', id: pathMatch[1] };
    }

    if (list && isPlaylistId(list)) {
        if (isMixPlaylist(list)) {
            throw new UserError('YouTube mixes (auto-generated radio playlists) cannot be loaded. Try a regular playlist or a video link.');
        }
        return { kind: 'playlist', id: list };
    }

    throw new UserError("I couldn't find a video or playlist in that YouTube link.");
}
