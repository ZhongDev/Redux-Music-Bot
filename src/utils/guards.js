import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { UserError } from './errors.js';

/**
 * @param {import('discord.js').ChatInputCommandInteraction<'cached'> | import('discord.js').MessageComponentInteraction<'cached'>} interaction
 * @returns {import('discord.js').VoiceBasedChannel | null}
 */
export function getMemberVoiceChannel(interaction) {
    return interaction.member?.voice?.channel ?? null;
}

/**
 * Ensures the invoking user is in a voice channel and, if the bot is already connected,
 * that it is the same channel. Returns the channel.
 * @param {import('discord.js').ChatInputCommandInteraction<'cached'> | import('discord.js').MessageComponentInteraction<'cached'>} interaction
 * @param {import('../music/GuildSession.js').GuildSession | undefined | null} session
 */
export function assertUserInVoice(interaction, session) {
    const channel = getMemberVoiceChannel(interaction);
    if (!channel) {
        throw new UserError('You need to be in a voice channel to use this command.');
    }
    if (session?.isConnected && session.voiceChannelId && session.voiceChannelId !== channel.id) {
        throw new UserError(`You need to be in <#${session.voiceChannelId}> to control playback.`);
    }
    return channel;
}

/**
 * Ensures the bot can join and speak in the given voice channel.
 * @param {import('discord.js').VoiceBasedChannel} channel
 */
export function assertBotCanJoin(channel) {
    const me = channel.guild.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
        throw new UserError(`I don't have permission to join ${channel}.`);
    }
    if (!permissions.has(PermissionFlagsBits.Speak)) {
        throw new UserError(`I don't have permission to speak in ${channel}.`);
    }
    const alreadyInside = me?.voice?.channelId === channel.id;
    if (
        !alreadyInside
        && channel.type === ChannelType.GuildVoice
        && channel.userLimit > 0
        && channel.members.size >= channel.userLimit
        && !permissions.has(PermissionFlagsBits.MoveMembers)
    ) {
        throw new UserError(`${channel} is full.`);
    }
}

/**
 * Returns the connected session for this guild, verifying the user shares its voice channel.
 * @param {import('discord.js').ChatInputCommandInteraction<'cached'> | import('discord.js').MessageComponentInteraction<'cached'>} interaction
 * @param {{ sessions: import('../music/QueueManager.js').QueueManager }} ctx
 */
export function requireActiveSession(interaction, ctx) {
    const session = ctx.sessions.get(interaction.guildId);
    if (!session?.isConnected) {
        throw new UserError("I'm not connected to a voice channel right now.");
    }
    assertUserInVoice(interaction, session);
    return session;
}

/**
 * Returns the session for this guild without any voice-channel checks (read-only commands).
 * @param {import('discord.js').ChatInputCommandInteraction<'cached'>} interaction
 * @param {{ sessions: import('../music/QueueManager.js').QueueManager }} ctx
 */
export function requireSession(interaction, ctx) {
    const session = ctx.sessions.get(interaction.guildId);
    if (!session?.isConnected) {
        throw new UserError("I'm not connected to a voice channel right now.");
    }
    return session;
}

/** Number of non-bot members in a voice channel. */
export function countListeners(channel) {
    if (!channel) return 0;
    return channel.members.filter((member) => !member.user.bot).size;
}
