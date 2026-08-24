import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    InteractionContextType,
    SlashCommandBuilder,
} from 'discord.js';
import { queueEmbed } from '../music/embeds.js';
import { requireSession } from '../utils/guards.js';

const PER_PAGE = 10;
const COLLECTOR_TIMEOUT_MS = 2 * 60_000;

function navigationRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('queue:first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId('queue:prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId('queue:refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('queue:next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages),
        new ButtonBuilder().setCustomId('queue:last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
    );
}

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show what is playing and what is coming up')
        .addIntegerOption((option) =>
            option.setName('page').setDescription('Page to show').setMinValue(1))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireSession(interaction, ctx);
        let page = interaction.options.getInteger('page') ?? 1;

        const render = (requested) => {
            const view = queueEmbed(session, requested, PER_PAGE);
            page = view.page;
            return {
                embeds: [view.embed],
                components: view.totalPages > 1 ? [navigationRow(view.page, view.totalPages)] : [],
            };
        };

        await interaction.reply(render(page));
        const message = await interaction.fetchReply();
        if (!message.components.length) return;

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: COLLECTOR_TIMEOUT_MS,
        });

        collector.on('collect', async (button) => {
            switch (button.customId) {
                case 'queue:first': page = 1; break;
                case 'queue:prev': page -= 1; break;
                case 'queue:next': page += 1; break;
                case 'queue:last': page = Number.MAX_SAFE_INTEGER; break;
                default: break;
            }
            await button.update(render(page)).catch(() => {});
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    },
};
