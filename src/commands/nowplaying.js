import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { nowPlayingEmbed } from '../music/embeds.js';
import { requireSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the current track and playback position')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireSession(interaction, ctx);
        if (!session.current) throw new UserError('Nothing is playing right now.');
        await interaction.reply({ embeds: [nowPlayingEmbed(session)] });
    },
};
