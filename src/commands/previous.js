import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { respond } from '../utils/respond.js';
import { truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Go back to the previously played track')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        await interaction.deferReply();
        const track = await session.previous();
        await respond(interaction, `⏮️ Going back to **${truncate(track.title, 100)}**.`);
    },
};
