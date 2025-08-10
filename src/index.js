import 'dotenv/config';
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, AudioPlayerStatus, createAudioResource, entersState, VoiceConnectionStatus, demuxProbe } from '@discordjs/voice';
import ytdl from '@distube/ytdl-core';

const ytdlRequestOptions = process.env.YOUTUBE_COOKIE
    ? { requestOptions: { headers: { cookie: process.env.YOUTUBE_COOKIE } } }
    : {};

// Simple in-memory per-guild queue
const queues = new Map(); // guildId -> { connection, player, songs: [{ url, title, requestedBy }], textChannelId, voiceChannelId, playing }

function getOrCreateQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            connection: null,
            player: createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
            }),
            songs: [],
            textChannelId: null,
            voiceChannelId: null,
            playing: false,
        });
    }
    return queues.get(guildId);
}

async function playNext(guild, client) {
    const queue = queues.get(guild.id);
    if (!queue) return;
    const next = queue.songs.shift();

    if (!next) {
        queue.playing = false;
        // disconnect after short delay to allow quick next song
        setTimeout(() => {
            try {
                queue.connection?.destroy();
            } catch { }
            queue.connection = null;
            queue.voiceChannelId = null;
        }, 1500);
        return;
    }

    if (!next.url) {
        console.warn('Queue item without URL, skipping:', next);
        return playNext(guild, client);
    }

    try {
        const ytReadable = ytdl(next.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25,
            ...ytdlRequestOptions,
        });
        const { stream, type } = await demuxProbe(ytReadable);
        const resource = createAudioResource(stream, { inputType: type });
        queue.player.play(resource);
        queue.playing = true;
    } catch (err) {
        console.error('Failed to play:', err);
        return playNext(guild, client);
    }
}

async function ensureConnected(interaction, queue) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return null;

    if (queue.connection && queue.voiceChannelId === voiceChannel.id) return queue.connection;

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    connection.subscribe(queue.player);
    queue.connection = connection;
    queue.voiceChannelId = voiceChannel.id;

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
        try { connection.destroy(); } catch { }
        queue.connection = null;
        return null;
    }

    return connection;
}

function registerPlayerEvents(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue._eventsRegistered) return;

    queue.player.on(AudioPlayerStatus.Idle, () => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) playNext(guild, client);
    });

    queue.player.on('error', (error) => {
        console.error('Audio player error:', error);
        const guild = client.guilds.cache.get(guildId);
        if (guild) playNext(guild, client);
    });

    queue._eventsRegistered = true;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    if (commandName === 'play') {
        let url = interaction.options.getString('url', true);
        if (!ytdl.validateURL(url)) {
            await interaction.reply({ content: 'Please provide a valid YouTube video URL.', flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply();
        const queue = getOrCreateQueue(interaction.guild.id);
        registerPlayerEvents(interaction.guild.id);
        let info = null;
        let title = 'Unknown title';
        try {
            info = await ytdl.getBasicInfo(url, ytdlRequestOptions);
            title = info?.videoDetails?.title ?? title;
        } catch (e) {
            await interaction.editReply('Failed to fetch video info. Please try a different link.');
            return;
        }

        queue.songs.push({ url, title, requestedBy: interaction.user.id });
        queue.textChannelId = interaction.channel.id;

        const vc = await ensureConnected(interaction, queue);
        if (!vc) {
            await interaction.editReply('You need to be in a voice channel to use this.');
            return;
        }

        if (!queue.playing) {
            await interaction.editReply(`Now playing: ${title}`);
            await playNext(interaction.guild, client);
        } else {
            await interaction.editReply(`Queued: ${title}`);
        }
    } else if (commandName === 'skip') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const queue = queues.get(interaction.guild.id);
        if (!queue || !queue.playing) {
            await interaction.editReply('Nothing is playing.');
            return;
        }
        queue.player.stop(true);
        await interaction.editReply('Skipped.');
    } else if (commandName === 'queue') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const queue = queues.get(interaction.guild.id);
        if (!queue || (queue.songs.length === 0 && !queue.playing)) {
            await interaction.editReply('Queue is empty.');
            return;
        }
        const now = queue.playing ? 'Playing now' : 'Idle';
        const list = queue.songs.slice(0, 10).map((s, i) => `${i + 1}. ${s.title}`).join('\n');
        await interaction.editReply(`${now}. Upcoming:\n${list || 'No upcoming songs.'}`);
    } else if (commandName === 'stop') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const queue = queues.get(interaction.guild.id);
        if (!queue) {
            await interaction.editReply('Not connected.');
            return;
        }
        queue.songs = [];
        queue.player.stop(true);
        try { queue.connection?.destroy(); } catch { }
        queue.connection = null;
        queue.playing = false;
        await interaction.editReply('Stopped and disconnected.');
    }
});

client.login(process.env.DISCORD_TOKEN);


