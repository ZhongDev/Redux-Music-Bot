import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('swap')
        .setDescription('Swap the positions of two tracks in the queue')
        .addIntegerOption((option) =>
            option.setName('first').setDescription('Position of the first track').setRequired(true).setMinValue(1))
        .addIntegerOption((option) =>
            option.setName('second').setDescription('Position of the second track').setRequired(true).setMinValue(1))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const first = interaction.options.getInteger('first', true);
        const second = interaction.options.getInteger('second', true);
        const size = session.queue.size;

        if (size < 2) throw new UserError('You need at least two tracks in the queue to swap.');
        if (first > size || second > size) throw new UserError(`The queue only goes up to #${size}.`);
        if (first === second) throw new UserError('Pick two different positions.');

        const [a, b] = session.queue.swap(first - 1, second - 1);
        await respond(interaction, `🔀 Swapped #${first} **${truncate(a.title, 80)}** with #${second} **${truncate(b.title, 80)}**.`);
    },
};
