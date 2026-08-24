import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { respond } from '../utils/respond.js';
import { truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track')
        .addIntegerOption((option) =>
            option.setName('count').setDescription('How many tracks to skip (default 1)').setMinValue(1).setMaxValue(100))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const count = interaction.options.getInteger('count') ?? 1;

        await interaction.deferReply();
        const { skipped, next } = await session.skip(count);

        const first = `⏭️ Skipped **${truncate(skipped[0].title, 100)}**`;
        const extra = skipped.length > 1 ? ` and ${skipped.length - 1} more` : '';
        const tail = next ? `. Now playing **${truncate(next.title, 100)}**.` : '. The queue is now empty.';
        await respond(interaction, `${first}${extra}${tail}`);
    },
};
