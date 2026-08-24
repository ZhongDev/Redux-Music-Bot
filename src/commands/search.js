import {
    ActionRowBuilder,
    ComponentType,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { enqueueAndPlay, requesterOf } from '../music/enqueue.js';
import { searchResultsEmbed, trackAddedEmbed } from '../music/embeds.js';
import { assertBotCanJoin, assertUserInVoice } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { truncate } from '../utils/format.js';

const RESULT_LIMIT = 10;
const PICK_TIMEOUT_MS = 60_000;

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search YouTube and pick a result to add to the queue')
        .addStringOption((option) =>
            option.setName('query').setDescription('What to search for').setRequired(true).setMaxLength(200))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const query = interaction.options.getString('query', true);
        const voiceChannel = assertUserInVoice(interaction, ctx.sessions.get(interaction.guildId));
        assertBotCanJoin(voiceChannel);

        await interaction.deferReply();

        const tracks = await ctx.youtube.search(query, requesterOf(interaction), { limit: RESULT_LIMIT });
        if (!tracks.length) throw new UserError(`No results found for **${truncate(query, 100)}**.`);

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`search:${interaction.id}`)
            .setPlaceholder('Pick a track to add to the queue')
            .addOptions(tracks.map((track, index) => ({
                label: truncate(track.title, 100),
                description: truncate(`${track.author} • ${track.durationText}`, 100),
                value: String(index),
            })));

        const message = await interaction.editReply({
            embeds: [searchResultsEmbed(query, tracks)],
            components: [new ActionRowBuilder().addComponents(menu)],
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: PICK_TIMEOUT_MS,
        });

        collector.on('collect', async (selection) => {
            if (selection.user.id !== interaction.user.id) {
                await selection.reply({ content: 'Only the person who searched can pick a result.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }

            try {
                const track = tracks[Number(selection.values[0])];
                if (!track) throw new UserError('That result is no longer available.');
                const channel = assertUserInVoice(selection, ctx.sessions.get(selection.guildId));
                assertBotCanJoin(channel);
                await selection.deferUpdate();

                const outcome = await enqueueAndPlay({ interaction: selection, ctx, tracks: [track], voiceChannel: channel });
                collector.stop('picked');
                await interaction.editReply({ embeds: [trackAddedEmbed(track, outcome)], components: [] });
            } catch (error) {
                const text = error instanceof UserError ? error.message : 'Something went wrong while adding that track.';
                if (!(error instanceof UserError)) ctx.logger.error(`/search selection failed: ${error.stack ?? error}`);
                if (selection.deferred || selection.replied) {
                    await interaction.editReply({ content: `❌ ${text}`, embeds: [], components: [] }).catch(() => {});
                } else {
                    await selection.reply({ content: `❌ ${text}`, flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            }
        });

        collector.on('end', (_collected, reason) => {
            if (reason !== 'picked') {
                interaction.editReply({ components: [] }).catch(() => {});
            }
        });
    },
};
