import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { LoopMode } from '../music/TrackQueue.js';
import { loopLabel } from '../music/embeds.js';
import { requireActiveSession, requireSession } from '../utils/guards.js';
import { respond } from '../utils/respond.js';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set or show the loop mode')
        .addStringOption((option) =>
            option
                .setName('mode')
                .setDescription('off = play through, track = repeat the current track, queue = repeat the whole queue')
                .addChoices(
                    { name: 'Off', value: LoopMode.Off },
                    { name: 'Track', value: LoopMode.Track },
                    { name: 'Queue', value: LoopMode.Queue },
                ))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const mode = interaction.options.getString('mode');

        if (!mode) {
            const session = requireSession(interaction, ctx);
            await respond(interaction, `Loop mode is currently **${loopLabel(session.queue.loop)}**.`, { ephemeral: true });
            return;
        }

        const session = requireActiveSession(interaction, ctx);
        session.queue.loop = mode;
        await respond(interaction, `Loop mode set to **${loopLabel(mode)}**.`);
    },
};
