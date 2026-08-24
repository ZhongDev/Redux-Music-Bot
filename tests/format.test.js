import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, parseTimestamp, progressBar, truncate } from '../src/utils/format.js';

describe('formatDuration', () => {
    it('formats minutes and seconds', () => {
        assert.equal(formatDuration(0), '0:00');
        assert.equal(formatDuration(5), '0:05');
        assert.equal(formatDuration(65), '1:05');
        assert.equal(formatDuration(600), '10:00');
    });

    it('formats hours with zero-padded minutes', () => {
        assert.equal(formatDuration(3600), '1:00:00');
        assert.equal(formatDuration(3725), '1:02:05');
    });

    it('handles live streams and junk input', () => {
        assert.equal(formatDuration(0, { live: true }), 'LIVE');
        assert.equal(formatDuration(-10), '0:00');
        assert.equal(formatDuration(Number.NaN), '0:00');
    });
});

describe('parseTimestamp', () => {
    it('parses plain seconds', () => {
        assert.equal(parseTimestamp('90'), 90);
    });

    it('parses colon notation', () => {
        assert.equal(parseTimestamp('1:30'), 90);
        assert.equal(parseTimestamp('1:02:03'), 3723);
        assert.equal(parseTimestamp('0:05'), 5);
    });

    it('parses unit notation', () => {
        assert.equal(parseTimestamp('1h2m3s'), 3723);
        assert.equal(parseTimestamp('2m'), 120);
        assert.equal(parseTimestamp('45s'), 45);
        assert.equal(parseTimestamp('1h'), 3600);
    });

    it('rejects nonsense', () => {
        assert.equal(parseTimestamp(''), null);
        assert.equal(parseTimestamp('abc'), null);
        assert.equal(parseTimestamp('1:99'), null);
        assert.equal(parseTimestamp(null), null);
    });
});

describe('progressBar', () => {
    it('places the knob proportionally', () => {
        assert.equal(progressBar(0, 100, 10).indexOf('🔘'), 0);
        assert.equal(progressBar(100, 100, 10).indexOf('🔘'), 9);
        assert.equal(progressBar(50, 100, 10).indexOf('🔘'), 5);
    });

    it('renders a flat bar when the duration is unknown', () => {
        assert.equal(progressBar(10, 0, 5), '▬▬▬▬▬');
    });
});

describe('truncate', () => {
    it('leaves short text alone and shortens long text with an ellipsis', () => {
        assert.equal(truncate('hello', 10), 'hello');
        assert.equal(truncate('hello world', 6), 'hello…');
        assert.equal(truncate('hello world', 6).length, 6);
    });
});
