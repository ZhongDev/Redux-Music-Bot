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
];

/** @type {Map<string, Command>} */
export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
