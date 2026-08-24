import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { enqueueAndPlay, requesterOf } from '../music/enqueue.js';
import { playlistAddedEmbed, trackAddedEmbed } from '../music/embeds.js';
import { assertBotCanJoin, assertUserInVoice } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { shuffleArray, truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a YouTube video or playlist, or search YouTube by name')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('YouTube video/playlist link or search terms')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(500))
        .addBooleanOption((option) =>
            option.setName('next').setDescription('Put it at the front of the queue instead of the end'))
        .addBooleanOption((option) =>
            option.setName('shuffle').setDescription('Shuffle a playlist before adding it'))
        .setContexts(InteractionContextType.Guild),

    async autocomplete(interaction, ctx) {
        const focused = interaction.options.getFocused().trim();
        if (focused.length < 2) return interaction.respond([]);
        const suggestions = await ctx.youtube.suggestions(focused);
        return interaction.respond(
            suggestions.slice(0, 25).map((suggestion) => {
                const value = truncate(suggestion, 100);
                return { name: value, value };
            }),
        );
    },

    async execute(interaction, ctx) {
        const query = interaction.options.getString('query', true);
        const next = interaction.options.getBoolean('next') ?? false;
        const shuffle = interaction.options.getBoolean('shuffle') ?? false;

        const voiceChannel = assertUserInVoice(interaction, ctx.sessions.get(interaction.guildId));
        assertBotCanJoin(voiceChannel);

        await interaction.deferReply();

        const result = await ctx.youtube.resolve(query, requesterOf(interaction));
        if (!result.tracks.length) {
            throw new UserError(`No results found for **${truncate(query, 100)}**.`);
        }
        if (shuffle && result.tracks.length > 1) shuffleArray(result.tracks);

        const outcome = await enqueueAndPlay({ interaction, ctx, tracks: result.tracks, voiceChannel, next });
        const embed = result.playlist
            ? playlistAddedEmbed(result.playlist, outcome)
            : trackAddedEmbed(outcome.added[0], outcome);

        await interaction.editReply({ embeds: [embed] });
    },
};
