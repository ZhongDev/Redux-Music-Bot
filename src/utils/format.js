/**
 * Formats a duration in seconds as h:mm:ss or m:ss.
 * @param {number} seconds
 * @param {{ live?: boolean }} [options]
 */
export function formatDuration(seconds, { live = false } = {}) {
    if (live) return 'LIVE';
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parses a human timestamp into seconds. Accepts "90", "1:30", "1:02:03", "1h2m3s", "2m", "45s".
 * @param {string} input
 * @returns {number | null} seconds, or null when the input is not understood
 */
export function parseTimestamp(input) {
    if (typeof input !== 'string') return null;
    const text = input.trim().toLowerCase();
    if (!text) return null;

    if (/^\d+$/.test(text)) return Number(text);

    if (/^\d+(:[0-5]?\d){1,2}$/.test(text)) {
        return text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
    }

    const match = text.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/);
    if (match && (match[1] || match[2] || match[3])) {
        return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    }

    return null;
}

/**
 * Renders a text progress bar.
 * @param {number} position seconds
 * @param {number} duration seconds
 * @param {number} [size] number of segments
 */
export function progressBar(position, duration, size = 16) {
    const bar = '▬';
    const knob = '🔘';
    if (!duration || duration <= 0) return bar.repeat(size);
    const ratio = Math.min(1, Math.max(0, position / duration));
    const index = Math.min(size - 1, Math.round(ratio * (size - 1)));
    return `${bar.repeat(index)}${knob}${bar.repeat(size - 1 - index)}`;
}

export function truncate(text, max = 100) {
    const value = String(text ?? '');
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

/** Fisher-Yates in-place shuffle. Returns the same array for convenience. */
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
