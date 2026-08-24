import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move a track to a different position in the queue')
        .addIntegerOption((option) =>
            option.setName('from').setDescription('Current position of the track').setRequired(true).setMinValue(1))
        .addIntegerOption((option) =>
            option.setName('to').setDescription('New position (1 = play next)').setRequired(true).setMinValue(1))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const from = interaction.options.getInteger('from', true);
        const to = interaction.options.getInteger('to', true);
        const size = session.queue.size;

        if (size < 2) throw new UserError('You need at least two tracks in the queue to move one.');
        if (from > size || to > size) throw new UserError(`The queue only goes up to #${size}.`);
        if (from === to) throw new UserError('That track is already at that position.');

        const track = session.queue.move(from - 1, to - 1);
        await respond(interaction, `↕️ Moved **${truncate(track.title, 100)}** from #${from} to #${to}.`);
    },
};
