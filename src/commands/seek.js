import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { formatDuration, parseTimestamp } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Jump to a point in the current track')
        .addStringOption((option) =>
            option.setName('time').setDescription('Position, e.g. 1:30, 90, or 1m30s').setRequired(true).setMaxLength(20))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const input = interaction.options.getString('time', true);
        const seconds = parseTimestamp(input);
        if (seconds === null) throw new UserError('I could not understand that time. Try `1:30`, `90`, or `1m30s`.');

        await interaction.deferReply();
        await session.seek(seconds);
        await respond(interaction, `⏩ Seeked to **${formatDuration(seconds)}**.`);
    },
};
