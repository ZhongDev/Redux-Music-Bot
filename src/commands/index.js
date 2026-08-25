import aliasesCommand from './aliases.js';
import clear from './clear.js';
import history from './history.js';
import join from './join.js';
import jump from './jump.js';
import leave from './leave.js';
import loop from './loop.js';
import move from './move.js';
import nowplaying from './nowplaying.js';
import pause from './pause.js';
import play from './play.js';
import previous from './previous.js';
import queue from './queue.js';
import remove from './remove.js';
import resume from './resume.js';
import search from './search.js';
import seek from './seek.js';
import shuffle from './shuffle.js';
import skip from './skip.js';
import stop from './stop.js';
import swap from './swap.js';
import volume from './volume.js';
import { aliasMap } from './alias-map.js';
import { truncate } from '../utils/format.js';

/**
 * Every slash command the bot exposes. Each module exports `{ data, execute, autocomplete? }`.
 * @typedef {{ data: import('discord.js').SlashCommandBuilder, execute: (interaction: import('discord.js').ChatInputCommandInteraction<'cached'>, ctx: object) => Promise<void>, autocomplete?: (interaction: import('discord.js').AutocompleteInteraction<'cached'>, ctx: object) => Promise<void> }} Command
 */

/** @type {Command[]} */
export const commands = [
    play,
    search,
    skip,
    previous,
    pause,
    resume,
    stop,
    leave,
    join,
    queue,
    nowplaying,
    history,
    remove,
    move,
    swap,
    jump,
    shuffle,
    clear,
    loop,
    seek,
    volume,
    aliasesCommand,
];

/**
 * Maps every invokable command name — canonical names and aliases — to its command module.
 * Aliases resolve to the same module, so `/p` and `/play` run the exact same handler.
 * @type {Map<string, Command>}
 */
export const commandMap = new Map(commands.map((command) => [command.data.name, command]));

for (const [alias, target] of Object.entries(aliasMap)) {
    const command = commandMap.get(target);
    if (!command) {
        throw new Error(`Alias "/${alias}" points to unknown command "/${target}".`);
    }
    if (commandMap.has(alias)) {
        throw new Error(`Alias "/${alias}" collides with an existing command name.`);
    }
    commandMap.set(alias, command);
}

/**
 * Builds the array of slash command definitions to register with Discord: one per command, plus one
 * per alias (a clone of its target's options under the alias name). Discord has no native alias concept,
 * so each alias must be registered as its own command.
 * @returns {import('discord.js').RESTPostAPIApplicationCommandsJSONBody[]}
 */
export function buildCommandData() {
    const bodies = commands.map((command) => command.data.toJSON());
    for (const [alias, target] of Object.entries(aliasMap)) {
        const json = commandMap.get(target).data.toJSON();
        bodies.push({
            ...json,
            name: alias,
            description: truncate(`Alias for /${target} — ${json.description}`, 100),
        });
    }
    return bodies;
}
