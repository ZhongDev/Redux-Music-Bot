import { UserError } from '../utils/errors.js';

/**
 * Builds the "requested by" record stored on tracks.
 * @param {import('discord.js').BaseInteraction<'cached'>} interaction
 */
export function requesterOf(interaction) {
    return {
        id: interaction.user.id,
        name: interaction.member?.displayName ?? interaction.user.displayName ?? interaction.user.username,
    };
}

/**
 * Shared tail of /play and /search: queue the tracks, make sure we are in voice, and start playing if idle.
 * @param {object} params
 * @param {import('discord.js').BaseInteraction<'cached'>} params.interaction
 * @param {{ sessions: import('./QueueManager.js').QueueManager }} params.ctx
 * @param {import('./Track.js').Track[]} params.tracks
 * @param {import('discord.js').VoiceBasedChannel} params.voiceChannel
 * @param {boolean} [params.next]
 */
export async function enqueueAndPlay({ interaction, ctx, tracks, voiceChannel, next = false }) {
    const session = ctx.sessions.getOrCreate(interaction.guild);
    session.textChannel = interaction.channel;

    const { added, rejected, position } = session.queue.add(tracks, { next });
    if (!added.length) {
        throw new UserError(`The queue is full (${session.queue.maxSize} tracks). Remove something first.`);
    }

    await session.connect(voiceChannel);
    const started = await session.play({ silent: true });

    return { session, added, rejected, position, next, started };
}
