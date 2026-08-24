import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { respond } from '../utils/respond.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause playback')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        session.pause();
        await respond(interaction, '⏸️ Paused. Use /resume to continue.');
    },
};
