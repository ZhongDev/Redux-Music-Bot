import { REST, Routes } from 'discord.js';
import { assertRequiredEnv, config } from './config.js';
import { buildCommandData } from './commands/index.js';

/**
 * Registers the slash commands with Discord.
 *
 *   npm run deploy:commands            -> guild commands if DISCORD_GUILD_ID is set, otherwise global
 *   npm run deploy:commands -- --global -> force global registration (takes up to an hour to propagate)
 *   npm run deploy:commands -- --clear  -> remove every command from the chosen scope
 */
const args = new Set(process.argv.slice(2));
const forceGlobal = args.has('--global');
const clear = args.has('--clear');

assertRequiredEnv(['DISCORD_TOKEN', 'DISCORD_CLIENT_ID']);

const { token, clientId, guildId } = config.discord;
const useGuild = Boolean(guildId) && !forceGlobal;
const route = useGuild
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
const body = clear ? [] : buildCommandData();

const rest = new REST().setToken(token);

try {
    const result = await rest.put(route, { body });
    const scope = useGuild ? `guild ${guildId}` : 'all guilds (global; may take up to an hour to appear)';
    if (clear) {
        console.log(`Removed all slash commands for ${scope}.`);
    } else {
        console.log(`Registered ${result.length} slash commands for ${scope}:`);
        console.log(result.map((command) => `  /${command.name}`).join('\n'));
    }
} catch (error) {
    console.error('Failed to register slash commands:', error);
    process.exit(1);
}
