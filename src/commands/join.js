import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { assertBotCanJoin, assertUserInVoice } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';

export default {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel without playing anything')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const existing = ctx.sessions.get(interaction.guildId);
        const voiceChannel = assertUserInVoice(interaction, existing);
        assertBotCanJoin(voiceChannel);
        if (existing?.isConnected && existing.voiceChannelId === voiceChannel.id) {
            throw new UserError("I'm already in your voice channel.");
        }

        await interaction.deferReply();
        const session = ctx.sessions.getOrCreate(interaction.guild);
        session.textChannel = interaction.channel;
        await session.connect(voiceChannel);
        if (!session.isActive) session.scheduleIdleLeave();

        await respond(interaction, `🔊 Joined <#${voiceChannel.id}>. Queue something with /play.`);
    },
};
