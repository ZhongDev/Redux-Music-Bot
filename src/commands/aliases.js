import { EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { aliasMap } from './alias-map.js';
import { Colors } from '../music/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName('aliases')
        .setDescription('List all command shorthand aliases')
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        const byCommand = new Map();
        for (const [alias, target] of Object.entries(aliasMap)) {
            if (!byCommand.has(target)) byCommand.set(target, []);
            byCommand.get(target).push(alias);
        }

        const lines = [...byCommand.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([target, aliases]) => `\`/${aliases.join('`, `/')}\` → \`/${target}\``);

        const embed = new EmbedBuilder()
            .setColor(Colors.info)
            .setTitle('Command aliases')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'An alias works exactly like the command it points to.' });

        await interaction.reply({ embeds: [embed] });
    },
};
