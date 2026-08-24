import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { LoopMode } from '../music/TrackQueue.js';
import { requireActiveSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';
import { pluralize, truncate } from '../utils/format.js';

export default {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Jump straight to a track in the queue')
        .addIntegerOption((option) =>
            option.setName('position').setDescription('Queue position to jump to (see /queue)').setRequired(true).setMinValue(1))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const session = requireActiveSession(interaction, ctx);
        const position = interaction.options.getInteger('position', true);
        const size = session.queue.size;

        if (size === 0) throw new UserError('The queue is empty.');
        if (position > size) throw new UserError(`The queue only goes up to #${size}.`);

        await interaction.deferReply();
        const { track, skipped } = await session.jump(position - 1);

        const note = skipped.length
            ? session.queue.loop === LoopMode.Queue
                ? ` (${pluralize(skipped.length, 'track')} moved to the end of the queue)`
                : ` (${pluralize(skipped.length, 'track')} skipped)`
            : '';
        await respond(interaction, `⏩ Jumped to **${truncate(track.title, 100)}**${note}.`);
    },
};
