import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { pluralize } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the upcoming queue (the current track keeps playing)')
        .addUserOption((option) =>
            option.setName('user').setDescription('Only remove tracks requested by this user'))
        .addBooleanOption((option) =>
            option.setName('duplicates').setDescription('Only remove duplicate tracks'))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const user = interaction.options.getUser('user');
        const duplicates = interaction.options.getBoolean('duplicates') ?? false;

        if (user && duplicates) throw new UserError('Choose either `user` or `duplicates`, not both.');
        if (session.queue.size === 0) throw new UserError('The queue is already empty.');

        let removed;
        let what;
        if (duplicates) {
            removed = session.queue.removeDuplicates();
            what = 'duplicate';
        } else if (user) {
            removed = session.queue.removeByUser(user.id);
            what = `track requested by ${user}`;
        } else {
            removed = session.queue.clear();
            what = 'track';
        }

        if (removed === 0) throw new UserError(`Nothing to remove — no ${what}s found in the queue.`);
        await respond(interaction, `🧹 Removed ${pluralize(removed, what)} from the queue.`);
    },
};
