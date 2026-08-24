import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LoopMode, TrackQueue } from '../src/music/TrackQueue.js';
import { Track } from '../src/music/Track.js';

const requester = { id: 'user-1', name: 'Tester' };

function track(id, extra = {}) {
    return new Track({ id, title: `Track ${id}`, durationSeconds: 60, requestedBy: requester, ...extra });
}

function ids(tracks) {
    return tracks.map((item) => item.id);
}

describe('TrackQueue', () => {
    it('adds to the end by default and to the front with next', () => {
        const queue = new TrackQueue();
        assert.deepEqual(queue.add([track('a'), track('b')]), { added: queue.tracks, rejected: 0, position: 1 });
        const result = queue.add(track('c'));
        assert.equal(result.position, 3);
        queue.add(track('z'), { next: true });
        assert.deepEqual(ids(queue.tracks), ['z', 'a', 'b', 'c']);
    });

    it('enforces the capacity limit', () => {
        const queue = new TrackQueue({ maxSize: 2 });
        const result = queue.add([track('a'), track('b'), track('c')]);
        assert.equal(result.added.length, 2);
        assert.equal(result.rejected, 1);
        assert.equal(queue.remainingCapacity, 0);
        assert.equal(queue.add(track('d')).added.length, 0);
    });

    it('advances through tracks and records history', () => {
        const queue = new TrackQueue();
        queue.add([track('a'), track('b')]);
        assert.equal(queue.advance().id, 'a');
        assert.equal(queue.advance().id, 'b');
        assert.equal(queue.advance(), null);
        assert.deepEqual(ids(queue.history), ['a', 'b']);
        assert.equal(queue.current, null);
    });

    it('repeats the current track in track-loop mode unless forced', () => {
        const queue = new TrackQueue();
        queue.add([track('a'), track('b')]);
        queue.advance();
        queue.loop = LoopMode.Track;
        assert.equal(queue.advance().id, 'a');
        assert.equal(queue.advance().id, 'a');
        assert.equal(queue.advance({ force: true }).id, 'b');
        assert.deepEqual(ids(queue.history), ['a']);
    });

    it('rotates tracks in queue-loop mode', () => {
        const queue = new TrackQueue();
        queue.add([track('a'), track('b')]);
        queue.loop = LoopMode.Queue;
        assert.equal(queue.advance().id, 'a');
        assert.equal(queue.advance().id, 'b');
        assert.equal(queue.advance().id, 'a');
        assert.deepEqual(ids(queue.tracks), ['b']);
        assert.equal(queue.history.length, 0);
    });

    it('goes back to the previous track and re-queues the current one', () => {
        const queue = new TrackQueue();
        queue.add([track('a'), track('b'), track('c')]);
        queue.advance();
        queue.advance();
        assert.equal(queue.current.id, 'b');
        assert.equal(queue.previous().id, 'a');
        assert.deepEqual(ids(queue.tracks), ['b', 'c']);
        assert.equal(queue.history.length, 0);
        assert.equal(queue.previous(), null);
    });

    it('removes single tracks and ranges', () => {
        const queue = new TrackQueue();
        queue.add(['a', 'b', 'c', 'd'].map(track));
        assert.deepEqual(ids(queue.remove(1)), ['b']);
        assert.deepEqual(ids(queue.remove(0, 2)), ['a', 'c']);
        assert.deepEqual(ids(queue.tracks), ['d']);
        assert.throws(() => queue.remove(5), RangeError);
        assert.throws(() => queue.remove(0, 0), RangeError);
    });

    it('moves and swaps tracks', () => {
        const queue = new TrackQueue();
        queue.add(['a', 'b', 'c', 'd'].map(track));
        assert.equal(queue.move(3, 0).id, 'd');
        assert.deepEqual(ids(queue.tracks), ['d', 'a', 'b', 'c']);
        queue.move(0, 3);
        assert.deepEqual(ids(queue.tracks), ['a', 'b', 'c', 'd']);
        queue.swap(0, 3);
        assert.deepEqual(ids(queue.tracks), ['d', 'b', 'c', 'a']);
        assert.throws(() => queue.move(0, 9), RangeError);
    });

    it('shuffles without losing tracks', () => {
        const queue = new TrackQueue();
        const list = Array.from({ length: 30 }, (_, index) => track(String(index)));
        queue.add(list);
        assert.equal(queue.shuffle(), 30);
        assert.deepEqual(ids(queue.tracks).sort(), ids(list).sort());
    });

    it('clears everything, by user, or duplicates', () => {
        const queue = new TrackQueue();
        const other = { id: 'user-2', name: 'Other' };
        queue.add([track('a'), track('b', { requestedBy: other }), track('a'), track('c', { requestedBy: other })]);
        assert.equal(queue.removeByUser('user-2'), 2);
        assert.deepEqual(ids(queue.tracks), ['a', 'a']);
        assert.equal(queue.removeDuplicates(), 1);
        queue.add(track('x'));
        assert.equal(queue.clear(), 2);
        assert.equal(queue.size, 0);
    });

    it('treats the current track as seen when removing duplicates', () => {
        const queue = new TrackQueue();
        queue.add([track('a'), track('a'), track('b')]);
        queue.advance();
        assert.equal(queue.removeDuplicates(), 1);
        assert.deepEqual(ids(queue.tracks), ['b']);
    });

    it('jumps ahead, dropping or rotating skipped tracks depending on loop mode', () => {
        const queue = new TrackQueue();
        queue.add(['a', 'b', 'c', 'd'].map(track));
        assert.deepEqual(ids(queue.jump(2)), ['a', 'b']);
        assert.equal(queue.advance({ force: true }).id, 'c');
        assert.deepEqual(ids(queue.tracks), ['d']);

        const looped = new TrackQueue();
        looped.add(['a', 'b', 'c'].map(track));
        looped.loop = LoopMode.Queue;
        looped.jump(2);
        assert.deepEqual(ids(looped.tracks), ['c', 'a', 'b']);
    });

    it('caps the history size', () => {
        const queue = new TrackQueue({ historySize: 2 });
        queue.add(['a', 'b', 'c'].map(track));
        while (queue.advance()) { /* drain */ }
        assert.deepEqual(ids(queue.history), ['b', 'c']);
    });

    it('resets the upcoming queue and loop mode but keeps history', () => {
        const queue = new TrackQueue();
        queue.add(['a', 'b'].map(track));
        queue.loop = LoopMode.Queue;
        queue.advance();
        queue.reset();
        assert.equal(queue.current, null);
        assert.equal(queue.size, 0);
        assert.equal(queue.loop, LoopMode.Off);
        assert.deepEqual(ids(queue.history), ['a']);
    });

    it('sums the duration of upcoming tracks, ignoring live streams', () => {
        const queue = new TrackQueue();
        queue.add([track('a'), track('b', { durationSeconds: 30 }), track('live', { isLive: true, durationSeconds: 999 })]);
        assert.equal(queue.totalDuration, 90);
    });
});
