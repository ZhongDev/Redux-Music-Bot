import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeUrl, parseInput } from '../src/music/parse-input.js';
import { UserError } from '../src/utils/errors.js';

describe('parseInput', () => {
    it('recognises watch, short, embed and live links', () => {
        assert.deepEqual(parseInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { kind: 'video', id: 'dQw4w9WgXcQ' });
        assert.deepEqual(parseInput('youtube.com/watch?v=dQw4w9WgXcQ&t=43'), { kind: 'video', id: 'dQw4w9WgXcQ' });
        assert.deepEqual(parseInput('https://youtu.be/dQw4w9WgXcQ?si=abc'), { kind: 'video', id: 'dQw4w9WgXcQ' });
        assert.deepEqual(parseInput('https://m.youtube.com/shorts/dQw4w9WgXcQ'), { kind: 'video', id: 'dQw4w9WgXcQ' });
        assert.deepEqual(parseInput('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'), { kind: 'video', id: 'dQw4w9WgXcQ' });
        assert.deepEqual(parseInput('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), { kind: 'video', id: 'dQw4w9WgXcQ' });
        assert.deepEqual(parseInput('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), { kind: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('recognises playlists, including watch links that carry a playlist', () => {
        assert.deepEqual(
            parseInput('https://www.youtube.com/playlist?list=PLXIclLvfETS0GFbNbRpwCgh1CGwO6hLrv'),
            { kind: 'playlist', id: 'PLXIclLvfETS0GFbNbRpwCgh1CGwO6hLrv' },
        );
        assert.deepEqual(
            parseInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLXIclLvfETS0GFbNbRpwCgh1CGwO6hLrv'),
            { kind: 'playlist', id: 'PLXIclLvfETS0GFbNbRpwCgh1CGwO6hLrv', videoId: 'dQw4w9WgXcQ' },
        );
    });

    it('ignores mix playlists on watch links and rejects standalone mixes', () => {
        assert.deepEqual(
            parseInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'),
            { kind: 'video', id: 'dQw4w9WgXcQ' },
        );
        assert.throws(() => parseInput('https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ'), UserError);
    });

    it('treats anything that is not a URL as a search', () => {
        assert.deepEqual(parseInput('never gonna give you up'), { kind: 'search', query: 'never gonna give you up' });
        assert.deepEqual(parseInput('  lofi beats  '), { kind: 'search', query: 'lofi beats' });
        assert.deepEqual(parseInput('mr. brightside'), { kind: 'search', query: 'mr. brightside' });
    });

    it('rejects non-YouTube links and malformed YouTube links', () => {
        assert.throws(() => parseInput('https://open.spotify.com/track/123'), UserError);
        assert.throws(() => parseInput('https://www.youtube.com/channel/UC123'), UserError);
        assert.throws(() => parseInput('https://youtu.be/short'), UserError);
        assert.throws(() => parseInput(''), UserError);
    });
});

describe('looksLikeUrl', () => {
    it('detects URLs with and without a scheme', () => {
        assert.equal(looksLikeUrl('https://youtu.be/x'), true);
        assert.equal(looksLikeUrl('youtube.com/watch?v=x'), true);
        assert.equal(looksLikeUrl('rick astley'), false);
        assert.equal(looksLikeUrl('mr. brightside'), false);
    });
});
