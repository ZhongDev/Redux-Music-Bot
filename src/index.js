import { Client, Events, GatewayIntentBits, MessageFlags, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { assertRequiredEnv, config } from './config.js';
import { createLogger } from './logger.js';
import { commandMap } from './commands/index.js';
import { YouTubeService } from './music/youtube.js';
import { QueueManager } from './music/QueueManager.js';
import { UserError } from './utils/errors.js';
import { respond } from './utils/respond.js';

const logger = createLogger(config.logLevel, 'bot');

assertRequiredEnv(['DISCORD_TOKEN']);
logger.debug(generateDependencyReport());

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let youtube;
try {
    youtube = await YouTubeService.create(config, logger.child('youtube'));
} catch (error) {
    logger.error(`Could not initialise the YouTube client: ${error.stack ?? error}`);
    process.exit(1);
}

const sessions = new QueueManager({ client, youtube, config, logger: logger.child('session') });
const ctx = { client, youtube, sessions, config, logger };

async function handleInteraction(interaction) {
    if (interaction.isAutocomplete()) {
        const command = commandMap.get(interaction.commandName);
        if (!command?.autocomplete || !interaction.inCachedGuild()) return;
        try {
            await command.autocomplete(interaction, ctx);
        } catch (error) {
            logger.debug(`Autocomplete for /${interaction.commandName} failed: ${error.message}`);
            if (!interaction.responded) await interaction.respond([]).catch(() => {});
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) {
        logger.warn(`Received unknown command /${interaction.commandName}. Run "npm run deploy:commands".`);
        return;
    }

    if (!interaction.inCachedGuild()) {
        await interaction.reply({ content: 'Commands only work inside a server.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
    }

    try {
        await command.execute(interaction, ctx);
    } catch (error) {
        const friendly = error instanceof UserError;
        if (!friendly) {
            logger.error(`/${interaction.commandName} failed in guild ${interaction.guildId}: ${error.stack ?? error}`);
        }
        const content = `❌ ${friendly ? error.message : 'Something went wrong while running that command.'}`;
        await respond(interaction, { content, embeds: [], components: [] }, { ephemeral: true }).catch(() => {});
    }
}

client.once(Events.ClientReady, (ready) => {
    logger.info(`Logged in as ${ready.user.tag}, serving ${ready.guilds.cache.size} guild(s).`);
    logger.info(`Invite me: ${ready.generateInvite({
        scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
        permissions: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.UseVAD,
            PermissionFlagsBits.RequestToSpeak,
        ],
    })}`);
    logger.info(`${commandMap.size} slash commands loaded. Run "npm run deploy:commands" after changing them.`);
});

client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction).catch((error) => logger.error(`Interaction handler crashed: ${error.stack ?? error}`));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
        sessions.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
        logger.warn(`Voice state handler failed: ${error.stack ?? error}`);
    }
});

client.on(Events.Error, (error) => logger.error(`Client error: ${error.stack ?? error}`));
client.on(Events.Warn, (message) => logger.warn(message));

let shuttingDown = false;
function shutdown(code, signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Shutting down${signal ? ` (${signal})` : ''}...`);
    try {
        sessions.destroyAll('shutdown');
        client.destroy();
    } finally {
        setTimeout(() => process.exit(code), 500).unref();
    }
}

process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason?.stack ?? reason}`);
});
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.stack ?? error}`);
    shutdown(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => shutdown(0, signal));
}

await client.login(config.discord.token);
