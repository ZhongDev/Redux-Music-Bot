import { EmbedBuilder, escapeMarkdown, hyperlink, userMention } from 'discord.js';
import { LoopMode } from './TrackQueue.js';
import { clamp, formatDuration, pluralize, progressBar, truncate } from '../utils/format.js';

export const Colors = Object.freeze({
    primary: 0xff0033,
    success: 0x57f287,
    info: 0x5865f2,
    warning: 0xfee75c,
});

const LOOP_LABELS = {
    [LoopMode.Off]: 'Off',
    [LoopMode.Track]: '🔂 Track',
    [LoopMode.Queue]: '🔁 Queue',
};

export function loopLabel(mode) {
    return LOOP_LABELS[mode] ?? mode;
}

/** Markdown link to the track with a title that cannot break out of the link syntax. */
export function trackLink(track, maxLength = 70) {
    const title = escapeMarkdown(truncate(track.title, maxLength)).replace(/\[/g, '(').replace(/\]/g, ')');
    return hyperlink(title, track.url);
}

function requesterMention(track) {
    return track.requestedBy?.id ? userMention(track.requestedBy.id) : 'unknown';
}

function requesterName(track) {
    return track.requestedBy?.name ?? 'unknown';
}

function trackLine(track, position) {
    return `\`${position}.\` ${trackLink(track, 60)} \`${track.durationText}\` · ${requesterMention(track)}`;
}

/**
 * @param {import('./GuildSession.js').GuildSession} session
 * @param {{ compact?: boolean }} [options] compact omits the progress bar and player state
 */
export function nowPlayingEmbed(session, { compact = false } = {}) {
    const track = session.current;
    const queue = session.queue;
    const embed = new EmbedBuilder()
        .setColor(Colors.primary)
        .setAuthor({ name: session.isPaused ? '⏸️ Paused' : '🎶 Now playing' })
        .setTitle(truncate(track.title, 256))
        .setURL(track.url);
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    if (!compact) {
        const position = session.position;
        embed.setDescription(
            track.isLive
                ? '🔴 **LIVE**'
                : `${progressBar(position, track.durationSeconds)}\n\`${formatDuration(position)} / ${track.durationText}\``,
        );
    }

    embed.addFields(
        { name: 'Channel', value: truncate(track.author || 'Unknown', 100), inline: true },
        { name: 'Duration', value: track.durationText, inline: true },
        { name: 'Requested by', value: requesterMention(track), inline: true },
    );

    if (!compact) {
        const next = queue.at(0);
        embed.addFields(
            { name: 'Volume', value: `${session.volume}%`, inline: true },
            { name: 'Loop', value: loopLabel(queue.loop), inline: true },
            { name: 'Up next', value: next ? trackLink(next, 60) : 'Nothing — add more with /play', inline: true },
        );
    } else if (queue.size > 0) {
        embed.setFooter({ text: `${pluralize(queue.size, 'track')} left in the queue` });
    }

    return embed;
}

/**
 * @param {import('./Track.js').Track} track
 * @param {{ position: number, next?: boolean, started?: boolean }} outcome
 */
export function trackAddedEmbed(track, { position, next = false, started = false }) {
    let heading = '✅ Added to queue';
    if (started) heading = '🎶 Now playing';
    else if (next) heading = '⏭️ Playing next';

    const embed = new EmbedBuilder()
        .setColor(started ? Colors.primary : Colors.success)
        .setAuthor({ name: heading })
        .setTitle(truncate(track.title, 256))
        .setURL(track.url)
        .addFields(
            { name: 'Channel', value: truncate(track.author || 'Unknown', 100), inline: true },
            { name: 'Duration', value: track.durationText, inline: true },
        )
        .setFooter({ text: `Requested by ${requesterName(track)}` });
    if (!started) embed.addFields({ name: 'Position', value: `#${position}`, inline: true });
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);
    return embed;
}

/**
 * @param {import('./youtube.js').PlaylistSummary} playlist
 * @param {{ added: import('./Track.js').Track[], rejected: number, position: number, next?: boolean, started?: boolean }} outcome
 */
export function playlistAddedEmbed(playlist, { added, rejected, position, next = false, started = false }) {
    const totalSeconds = added.reduce((sum, track) => sum + (track.isLive ? 0 : track.durationSeconds), 0);
    const notes = [];
    notes.push(`Added **${pluralize(added.length, 'track')}**${next ? ' to the front of the queue' : ''}${started ? ' and started playing' : ''}.`);
    if (rejected > 0) notes.push(`⚠️ ${pluralize(rejected, 'track')} could not be added because the queue is full.`);
    if (playlist.truncated) notes.push(`ℹ️ Only the first ${playlist.tracks.length} videos were loaded (MAX_PLAYLIST_SIZE).`);

    const embed = new EmbedBuilder()
        .setColor(Colors.success)
        .setAuthor({ name: '📜 Playlist added' })
        .setTitle(truncate(playlist.title, 256))
        .setURL(playlist.url)
        .setDescription(notes.join('\n'))
        .addFields(
            { name: 'Total length', value: formatDuration(totalSeconds), inline: true },
            { name: 'Starts at', value: `#${position}`, inline: true },
        );
    if (added[0]) embed.setFooter({ text: `Requested by ${requesterName(added[0])}` });
    if (playlist.thumbnail) embed.setThumbnail(playlist.thumbnail);
    return embed;
}

/**
 * Renders one page of the queue.
 * @param {import('./GuildSession.js').GuildSession} session
 * @param {number} page 1-based
 * @param {number} [perPage]
 */
export function queueEmbed(session, page, perPage = 10) {
    const queue = session.queue;
    const tracks = queue.tracks;
    const totalPages = Math.max(1, Math.ceil(tracks.length / perPage));
    const currentPage = clamp(Number.isFinite(page) ? page : 1, 1, totalPages);

    const sections = [];
    const current = session.current;
    if (current) {
        const state = session.isPaused ? '⏸️ Paused' : '▶️ Now playing';
        const progress = current.isLive ? 'LIVE' : `${formatDuration(session.position)} / ${current.durationText}`;
        sections.push(`**${state}**\n${trackLink(current)} \`${progress}\` · ${requesterMention(current)}`);
    } else {
        sections.push('**Nothing is playing.**');
    }

    if (tracks.length) {
        const start = (currentPage - 1) * perPage;
        const lines = tracks.slice(start, start + perPage).map((track, index) => trackLine(track, start + index + 1));
        sections.push(`**Up next**\n${lines.join('\n')}`);
    } else {
        sections.push('_The queue is empty. Add something with /play._');
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.info)
        .setTitle(`Queue · ${truncate(session.guild.name, 200)}`)
        .setDescription(sections.join('\n\n'))
        .setFooter({
            text: [
                `Page ${currentPage}/${totalPages}`,
                pluralize(tracks.length, 'track'),
                `${formatDuration(queue.totalDuration)} total`,
                `Loop: ${loopLabel(queue.loop).replace(/^\S+\s/, '')}`,
                `Volume: ${session.volume}%`,
            ].join(' • '),
        });

    return { embed, page: currentPage, totalPages };
}

/**
 * @param {import('./GuildSession.js').GuildSession} session
 * @param {number} [limit]
 */
export function historyEmbed(session, limit = 15) {
    const history = session.queue.history.reverse().slice(0, limit);
    const embed = new EmbedBuilder().setColor(Colors.info).setTitle('Recently played');
    if (!history.length) {
        embed.setDescription('_Nothing has been played yet._');
    } else {
        embed.setDescription(history.map((track, index) => trackLine(track, index + 1)).join('\n'));
        embed.setFooter({ text: 'Most recent first · use /previous to go back' });
    }
    return embed;
}

/**
 * @param {string} query
 * @param {import('./Track.js').Track[]} tracks
 */
export function searchResultsEmbed(query, tracks) {
    return new EmbedBuilder()
        .setColor(Colors.info)
        .setTitle(`Results for "${truncate(query, 100)}"`)
        .setDescription(tracks.map((track, index) => `\`${index + 1}.\` ${trackLink(track, 60)} \`${track.durationText}\` · ${escapeMarkdown(truncate(track.author, 40))}`).join('\n'))
        .setFooter({ text: 'Pick a result from the menu below' });
}
