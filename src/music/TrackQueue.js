import { shuffleArray } from '../utils/format.js';

export const LoopMode = Object.freeze({
    Off: 'off',
    Track: 'track',
    Queue: 'queue',
});

/**
 * Pure, Discord-agnostic queue state: the current track, upcoming tracks, play history and loop mode.
 * All indices are 0-based; slash commands translate from 1-based positions.
 */
export class TrackQueue {
    #tracks = [];
    #history = [];
    #maxSize;
    #historySize;

    /** @type {import('./Track.js').Track | null} */
    current = null;
    /** @type {typeof LoopMode[keyof typeof LoopMode]} */
    loop = LoopMode.Off;

    constructor({ maxSize = Infinity, historySize = 50 } = {}) {
        this.#maxSize = maxSize;
        this.#historySize = historySize;
    }

    /** Copy of the upcoming tracks. */
    get tracks() {
        return this.#tracks.slice();
    }

    /** Copy of previously played tracks, oldest first. */
    get history() {
        return this.#history.slice();
    }

    get size() {
        return this.#tracks.length;
    }

    get isEmpty() {
        return this.#tracks.length === 0;
    }

    get maxSize() {
        return this.#maxSize;
    }

    get remainingCapacity() {
        return Math.max(0, this.#maxSize - this.#tracks.length);
    }

    /** Total duration in seconds of the upcoming tracks (live tracks count as 0). */
    get totalDuration() {
        return this.#tracks.reduce((sum, track) => sum + (track.isLive ? 0 : track.durationSeconds), 0);
    }

    at(index) {
        return this.#tracks[index];
    }

    #assertIndex(index, label = 'Position') {
        if (!Number.isInteger(index) || index < 0 || index >= this.#tracks.length) {
            throw new RangeError(`${label} is out of range.`);
        }
    }

    /**
     * Adds tracks to the end (or front) of the queue, respecting the capacity limit.
     * @param {import('./Track.js').Track | import('./Track.js').Track[]} tracks
     * @param {{ next?: boolean }} [options]
     * @returns {{ added: import('./Track.js').Track[], rejected: number, position: number }} position is 1-based
     */
    add(tracks, { next = false } = {}) {
        const list = Array.isArray(tracks) ? tracks : [tracks];
        const accepted = list.slice(0, this.remainingCapacity);
        const rejected = list.length - accepted.length;
        if (next) {
            this.#tracks.unshift(...accepted);
        } else {
            this.#tracks.push(...accepted);
        }
        const position = next ? 1 : this.#tracks.length - accepted.length + 1;
        return { added: accepted, rejected, position };
    }

    /**
     * Removes `count` tracks starting at `index`.
     * @returns {import('./Track.js').Track[]} the removed tracks
     */
    remove(index, count = 1) {
        this.#assertIndex(index);
        if (!Number.isInteger(count) || count < 1) throw new RangeError('Count must be at least 1.');
        return this.#tracks.splice(index, count);
    }

    /** Moves the track at `from` so that it sits at `to`. */
    move(from, to) {
        this.#assertIndex(from, 'Source position');
        this.#assertIndex(to, 'Target position');
        const [track] = this.#tracks.splice(from, 1);
        this.#tracks.splice(to, 0, track);
        return track;
    }

    swap(a, b) {
        this.#assertIndex(a, 'First position');
        this.#assertIndex(b, 'Second position');
        [this.#tracks[a], this.#tracks[b]] = [this.#tracks[b], this.#tracks[a]];
        return [this.#tracks[a], this.#tracks[b]];
    }

    shuffle() {
        shuffleArray(this.#tracks);
        return this.#tracks.length;
    }

    /**
     * Removes every upcoming track, or only those matching `predicate`.
     * @param {(track: import('./Track.js').Track, index: number) => boolean} [predicate]
     * @returns {number} how many tracks were removed
     */
    clear(predicate) {
        const before = this.#tracks.length;
        if (!predicate) {
            this.#tracks = [];
        } else {
            this.#tracks = this.#tracks.filter((track, index) => !predicate(track, index));
        }
        return before - this.#tracks.length;
    }

    /** Removes repeated videos, keeping the first occurrence (the current track counts as seen). */
    removeDuplicates() {
        const seen = new Set(this.current ? [this.current.id] : []);
        return this.clear((track) => {
            if (seen.has(track.id)) return true;
            seen.add(track.id);
            return false;
        });
    }

    removeByUser(userId) {
        return this.clear((track) => track.requestedBy?.id === userId);
    }

    /**
     * Prepares to play the track at `index` next. Tracks before it are dropped
     * (or, in queue-loop mode, rotated to the end so nothing is lost).
     * Call {@link advance} afterwards to actually make it current.
     * @returns {import('./Track.js').Track[]} the tracks that were skipped over
     */
    jump(index) {
        this.#assertIndex(index);
        const skipped = this.#tracks.splice(0, index);
        if (this.loop === LoopMode.Queue) this.#tracks.push(...skipped);
        return skipped;
    }

    /**
     * Moves to the next track according to the loop mode and returns it (or null when nothing is left).
     * @param {{ force?: boolean }} [options] force ignores track-loop (used for manual skips)
     */
    advance({ force = false } = {}) {
        const current = this.current;
        if (current && this.loop === LoopMode.Track && !force) {
            return current;
        }
        if (current) {
            if (this.loop === LoopMode.Queue) {
                this.#tracks.push(current);
            } else {
                this.#pushHistory(current);
            }
        }
        this.current = this.#tracks.shift() ?? null;
        return this.current;
    }

    /**
     * Goes back to the most recently played track. The current track (if any) is put back at the front.
     * @returns {import('./Track.js').Track | null}
     */
    previous() {
        const previous = this.#history.pop();
        if (!previous) return null;
        if (this.current) this.#tracks.unshift(this.current);
        this.current = previous;
        return previous;
    }

    /** Marks the current track as finished without starting another. */
    finish() {
        if (this.current) this.#pushHistory(this.current);
        this.current = null;
    }

    /** Clears the current track and every upcoming track and turns looping off. History is kept. */
    reset() {
        this.finish();
        this.#tracks = [];
        this.loop = LoopMode.Off;
    }

    #pushHistory(track) {
        this.#history.push(track);
        if (this.#history.length > this.#historySize) {
            this.#history.splice(0, this.#history.length - this.#historySize);
        }
    }
}
