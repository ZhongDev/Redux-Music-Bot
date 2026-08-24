import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { pluralize } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the upcoming tracks')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        if (session.queue.size < 2) throw new UserError('You need at least two upcoming tracks to shuffle.');
        const count = session.queue.shuffle();
        await respond(interaction, `🔀 Shuffled ${pluralize(count, 'track')}.`);
    },
};
