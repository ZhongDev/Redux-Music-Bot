import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandData, commandMap, commands } from '../src/commands/index.js';
import { aliasMap } from '../src/commands/alias-map.js';

const NAME_PATTERN = /^[-_\p{L}\p{N}]{1,32}$/u;

describe('command registry', () => {
    it('gives every command a unique, valid name and an execute handler', () => {
        const names = new Set();
        for (const command of commands) {
            const { name, description } = command.data;
            assert.match(name, NAME_PATTERN, `bad command name: ${name}`);
            assert.ok(!names.has(name), `duplicate command name: ${name}`);
            names.add(name);
            assert.ok(description.length >= 1 && description.length <= 100, `bad description length for /${name}`);
            assert.equal(typeof command.execute, 'function', `/${name} has no execute()`);
        }
    });

    it('exposes an /aliases command', () => {
        assert.ok(commandMap.has('aliases'));
    });
});

describe('aliases', () => {
    it('point to real commands and do not collide with command names', () => {
        const canonical = new Set(commands.map((command) => command.data.name));
        for (const [alias, target] of Object.entries(aliasMap)) {
            assert.match(alias, NAME_PATTERN, `bad alias name: ${alias}`);
            assert.ok(canonical.has(target), `alias /${alias} targets unknown command /${target}`);
            assert.ok(!canonical.has(alias), `alias /${alias} collides with a real command`);
        }
    });

    it('resolve to the same handler as their target', () => {
        for (const [alias, target] of Object.entries(aliasMap)) {
            assert.equal(commandMap.get(alias), commandMap.get(target), `/${alias} should resolve to /${target}`);
        }
    });

    it('includes the documented shortcuts', () => {
        for (const [alias, target] of [['p', 'play'], ['q', 'queue'], ['np', 'nowplaying'], ['vol', 'volume']]) {
            assert.equal(aliasMap[alias], target);
        }
    });
});

describe('buildCommandData', () => {
    const data = buildCommandData();

    it('produces one entry per command plus one per alias', () => {
        assert.equal(data.length, commands.length + Object.keys(aliasMap).length);
    });

    it('emits unique, Discord-valid names and descriptions', () => {
        const names = new Set();
        for (const entry of data) {
            assert.match(entry.name, NAME_PATTERN, `bad registered name: ${entry.name}`);
            assert.ok(!names.has(entry.name), `duplicate registered name: ${entry.name}`);
            names.add(entry.name);
            assert.ok(entry.description.length >= 1 && entry.description.length <= 100, `bad description for ${entry.name}`);
        }
    });

    it('gives each alias the same options as its target', () => {
        for (const [alias, target] of Object.entries(aliasMap)) {
            const aliasEntry = data.find((entry) => entry.name === alias);
            const targetEntry = data.find((entry) => entry.name === target);
            assert.deepEqual(aliasEntry.options ?? [], targetEntry.options ?? [], `/${alias} options differ from /${target}`);
        }
    });
});
