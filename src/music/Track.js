import { formatDuration } from '../utils/format.js';

/**
 * A playable YouTube video plus who asked for it.
 */
export class Track {
    /**
     * @param {object} data
     * @param {string} data.id YouTube video id
     * @param {string} data.title
     * @param {string} [data.author]
     * @param {number} [data.durationSeconds] 0 when unknown or live
     * @param {string | null} [data.thumbnail]
     * @param {boolean} [data.isLive]
     * @param {{ id: string, name: string }} data.requestedBy
     */
    constructor({ id, title, author = 'Unknown', durationSeconds = 0, thumbnail = null, isLive = false, requestedBy }) {
        this.id = id;
        this.title = title;
        this.author = author;
        this.durationSeconds = Math.max(0, Math.floor(durationSeconds || 0));
        this.thumbnail = thumbnail;
        this.isLive = Boolean(isLive);
        this.requestedBy = requestedBy;
        this.addedAt = Date.now();
    }

    get url() {
        return `https://www.youtube.com/watch?v=${this.id}`;
    }

    get durationText() {
        return formatDuration(this.durationSeconds, { live: this.isLive });
    }

    toJSON() {
        return {
            id: this.id,
            url: this.url,
            title: this.title,
            author: this.author,
            durationSeconds: this.durationSeconds,
            thumbnail: this.thumbnail,
            isLive: this.isLive,
            requestedBy: this.requestedBy,
            addedAt: this.addedAt,
        };
    }
}
