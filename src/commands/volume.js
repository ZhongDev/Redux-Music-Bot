import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { requireActiveSession, requireSession } from '../utils/guards.js';
import { UserError } from '../utils/errors.js';
import { respond } from '../utils/respond.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set or show the playback volume')
        .addIntegerOption((option) =>
            option.setName('percent').setDescription('Volume from 0 to the configured maximum (100 = normal)').setMinValue(0).setMaxValue(500))
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, ctx) {
        const percent = interaction.options.getInteger('percent');

        if (percent === null) {
            const session = requireSession(interaction, ctx);
            await respond(interaction, `🔊 Volume is at **${session.volume}%**.`, { ephemeral: true });
            return;
        }

        const max = ctx.config.player.maxVolume;
        if (percent > max) throw new UserError(`The maximum volume is ${max}%.`);

        const session = requireActiveSession(interaction, ctx);
        await interaction.deferReply();
        const restarted = await session.setVolume(percent);
        await respond(interaction, `🔊 Volume set to **${percent}%**${restarted ? '' : ' (applies to the next track)'}.`);
    },
};
