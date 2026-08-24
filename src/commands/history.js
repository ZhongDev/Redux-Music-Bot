import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { historyEmbed } from '../music/embeds.js';
import { requireSession } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show recently played tracks')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireSession(interaction, ctx);
        await interaction.reply({ embeds: [historyEmbed(session)] });
    },
};
