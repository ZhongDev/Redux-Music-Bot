import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { respond } from '../utils/respond.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and clear the queue (stays in the voice channel)')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        await interaction.deferReply();
        await session.stop();
        await respond(interaction, '⏹️ Stopped playback and cleared the queue. Use /leave to disconnect me.');
    },
};
