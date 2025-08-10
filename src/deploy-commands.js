import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Add a YouTube URL to the queue and play')
        .addStringOption((opt) =>
            opt.setName('url').setDescription('YouTube video URL').setRequired(true)
        )
        .toJSON(),
    new SlashCommandBuilder().setName('skip').setDescription('Skip the current song').toJSON(),
    new SlashCommandBuilder().setName('queue').setDescription('Show the next songs in the queue').toJSON(),
    new SlashCommandBuilder().setName('stop').setDescription('Stop and disconnect').toJSON(),
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
    console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment.');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function deploy() {
    try {
        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
            console.log('Registered guild slash commands.');
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log('Registered global slash commands (may take up to 1 hour).');
        }
    } catch (err) {
        console.error('Failed to register commands:', err);
        process.exit(1);
    }
}

deploy();


