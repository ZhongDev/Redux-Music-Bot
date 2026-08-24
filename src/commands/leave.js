import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { respond } from '../utils/respond.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnect from the voice channel and clear the queue')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const channelId = session.voiceChannelId;
        session.destroy('manual');
        await respond(interaction, `👋 Left ${channelId ? `<#${channelId}>` : 'the voice channel'}.`);
    },
};
