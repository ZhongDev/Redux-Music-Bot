import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { pluralize, truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a track (or a range of tracks) from the queue')
        .addIntegerOption((option) =>
            option.setName('position').setDescription('Queue position to remove (see /queue)').setRequired(true).setMinValue(1))
        .addIntegerOption((option) =>
            option.setName('to').setDescription('Remove everything from position up to and including this one').setMinValue(1))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const position = interaction.options.getInteger('position', true);
        const to = interaction.options.getInteger('to') ?? position;
        const size = session.queue.size;

        if (size === 0) throw new UserError('The queue is empty.');
        if (position > size) throw new UserError(`There ${size === 1 ? 'is only 1 track' : `are only ${size} tracks`} in the queue.`);
        if (to < position) throw new UserError('`to` must be greater than or equal to `position`.');
        if (to > size) throw new UserError(`The queue only goes up to #${size}.`);

        const removed = session.queue.remove(position - 1, to - position + 1);
        const text = removed.length === 1
            ? `🗑️ Removed **${truncate(removed[0].title, 100)}** (#${position}) from the queue.`
            : `🗑️ Removed ${pluralize(removed.length, 'track')} (#${position}–#${to}) from the queue.`;
        await respond(interaction, text);
    },
};
