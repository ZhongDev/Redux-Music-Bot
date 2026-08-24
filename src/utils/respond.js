import { MessageFlags } from 'discord.js';

/**
 * Replies to an interaction regardless of whether it was already deferred or replied to.
 * @param {import('discord.js').RepliableInteraction} interaction
 * @param {string | import('discord.js').InteractionReplyOptions} payload
 * @param {{ ephemeral?: boolean }} [options]
 */
export async function respond(interaction, payload, { ephemeral = false } = {}) {
    const body = typeof payload === 'string' ? { content: payload } : { ...payload };
    if (interaction.deferred || interaction.replied) {
        return interaction.editReply(body);
    }
    if (ephemeral) body.flags = MessageFlags.Ephemeral;
    return interaction.reply(body);
}

/** Convenience wrapper for ephemeral one-liners. */
export function respondEphemeral(interaction, content) {
    return respond(interaction, content, { ephemeral: true });
}
