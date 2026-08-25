# Redux Music Bot

A self-hosted Discord music bot that plays YouTube audio in voice channels with full queue management: search, playlists, play-next, loops, seeking, shuffling, moving/removing tracks, history and more.

Built on [discord.js](https://discord.js.org) v14, [@discordjs/voice](https://github.com/discordjs/discord.js/tree/main/packages/voice) and [youtubei.js](https://github.com/LuanRT/YouTube.js). Audio is streamed directly as Opus whenever YouTube offers it, and transcoded with a bundled ffmpeg only when needed (seeking, volume, AAC-only streams, live streams).

License: GNU GPL v3 (see `LICENSE`).

## Commands

| Command | What it does |
| --- | --- |
| `/play <query> [next] [shuffle]` | Play a YouTube video/playlist link or search by name (with autocomplete). `next` puts it at the front of the queue; `shuffle` shuffles a playlist before adding it. |
| `/search <query>` | Search YouTube and pick one of the top results from a menu. |
| `/queue [page]` | Show the current track and upcoming tracks, with page buttons. |
| `/nowplaying` | Current track with progress bar, volume, loop mode and what's next. |
| `/history` | Recently played tracks. |
| `/skip [count]` | Skip the current track (and optionally more). |
| `/previous` | Go back to the previously played track. |
| `/jump <position>` | Jump straight to a track in the queue. |
| `/seek <time>` | Seek within the current track (`1:30`, `90`, `1m30s`). |
| `/pause`, `/resume` | Pause / resume playback. |
| `/stop` | Stop playback and clear the queue (stays connected until the idle timeout). |
| `/leave` | Disconnect from voice and clear the queue. |
| `/join` | Join your voice channel without playing anything. |
| `/remove <position> [to]` | Remove one track or a range of tracks. |
| `/move <from> <to>` | Move a track to another position. |
| `/swap <first> <second>` | Swap two tracks. |
| `/shuffle` | Shuffle the upcoming tracks. |
| `/clear [user] [duplicates]` | Clear the queue, or only one user's requests, or only duplicates. |
| `/loop [off\|track\|queue]` | Set (or show) the loop mode. |
| `/volume [percent]` | Set (or show) the volume. Applied to the live audio instantly — no skip or restart. |
| `/aliases` | List all command shorthand aliases. |

### Aliases

Common commands have short aliases that behave exactly like the full command — run `/aliases` in Discord to see them:

| Alias | Command | Alias | Command |
| --- | --- | --- | --- |
| `/p` | `/play` | `/sh` | `/shuffle` |
| `/s` | `/skip` | `/prev` | `/previous` |
| `/q` | `/queue` | `/rm` | `/remove` |
| `/np` | `/nowplaying` | `/dc` | `/leave` |
| `/vol` | `/volume` | `/l` | `/loop` |

Other behaviour:

- Only people in the bot's voice channel can control playback.
- Volume changes are applied to the live stream in real time — no crackle, skip or restart.
- `/seek` buffers the track in memory so it can seek accurately anywhere, including near the very end.
- A "Now playing" message is posted when each track starts (`ANNOUNCE_NOW_PLAYING`).
- The bot leaves on its own after the queue has been empty for a while (`IDLE_TIMEOUT_SECONDS`) or when everyone else leaves the channel (`EMPTY_CHANNEL_TIMEOUT_SECONDS`).
- Live streams, YouTube Shorts links, `youtu.be` links and `watch?v=…&list=…` links (which load the playlist starting from that video) are all supported. Auto-generated "mix" playlists are not, because YouTube generates them per viewer.

## Requirements

- **Node.js 22.12 or newer** (`@discordjs/voice` 0.19 requires it).
- A Discord application with a bot user.
- Nothing else: ffmpeg and the Opus codec are installed automatically with `npm install`.

## Setup

1. Create an application at <https://discord.com/developers/applications>, add a bot, and copy the bot token and the application id.
2. Invite the bot with the `bot` and `applications.commands` scopes and these permissions: **View Channels, Send Messages, Embed Links, Connect, Speak** (plus **Request to Speak** if you use stage channels).
3. Clone the repository and install dependencies:

   ```sh
   npm install
   ```

4. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Set `DISCORD_GUILD_ID` to your server id while testing so command changes show up instantly.
5. Register the slash commands, then start the bot:

   ```sh
   npm run deploy:commands
   npm start
   ```

   `npm run deploy:commands -- --global` registers commands globally regardless of `DISCORD_GUILD_ID`; `-- --clear` removes them.

## Running with Docker

The repo ships a `Dockerfile` and `compose.yaml` for running the bot as a single container (e.g. on a homelab Docker host). Nothing needs to be installed on the host besides Docker: ffmpeg and the Opus/DAVE libraries are bundled into the image at build time.

1. Copy the repository to the host and create your `.env` from `.env.example` (only `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are required).
2. Build and register the slash commands (one-off):

   ```sh
   docker compose build
   docker compose run --rm redux-music-bot node src/deploy-commands.js
   ```

3. Start it:

   ```sh
   docker compose up -d
   docker compose logs -f     # prints the invite link on startup
   ```

Notes:

- Configuration is read from `.env` via `env_file`; edit it and `docker compose up -d` again to apply changes.
- The youtubei.js session cache is kept in a named volume (`youtubei-cache`) so restarts are fast.
- `init: true` runs the process under tini so ffmpeg child processes are reaped and shutdown is clean.
- The image works on x64 and arm64 hosts (e.g. a Raspberry Pi 4/5); build it on the target architecture, since `ffmpeg-static` downloads the matching binary during `npm ci`.
- To update: `git pull && docker compose build && docker compose up -d`. Re-run the deploy command whenever slash commands change.

### Prebuilt image (GHCR)

Every push to `main` (and `rewrite/v2`) runs the tests and publishes a multi-arch image to GitHub Container Registry via `.github/workflows/docker.yml`:

```
ghcr.io/zhongdev/redux-music-bot:latest      # main
ghcr.io/zhongdev/redux-music-bot:rewrite-v2  # rewrite/v2 branch
ghcr.io/zhongdev/redux-music-bot:2.0.0       # git tag v2.0.0
```

`compose.yaml` already points at `:latest`, so `docker compose pull && docker compose up -d` updates without building. The first publish creates the package as **private**: open the package on GitHub (Profile → Packages → redux-music-bot → Package settings) and set it to **Public**, or run `docker login ghcr.io` on the host with a personal access token that has `read:packages`.

### Dockge

Dockge manages compose stacks, so use the prebuilt image (no build step on the host):

1. In Dockge click **+ Compose**, name the stack `redux-music-bot`, and paste:

   ```yaml
   services:
     redux-music-bot:
       image: ghcr.io/zhongdev/redux-music-bot:latest
       container_name: redux-music-bot
       restart: unless-stopped
       init: true
       env_file: .env
       environment:
         YOUTUBE_CACHE_DIR: /app/.cache/youtubei
       volumes:
         - youtubei-cache:/app/.cache

   volumes:
     youtubei-cache:
   ```

2. In the **.env** panel on the right, paste the contents of `.env.example` and fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and (optionally) `DISCORD_GUILD_ID`. Dockge writes this to the stack's `.env` file, which `env_file: .env` passes into the container.
3. Click **Deploy**. Open the stack's **Terminal** (or the logs) — the invite link is printed on startup.
4. Register the slash commands once, from the stack's terminal in Dockge:

   ```sh
   docker compose run --rm redux-music-bot node src/deploy-commands.js
   ```

5. To upgrade later, click **Update** (pull) and then **Restart**. Re-run step 4 if slash commands changed.

Use the `:rewrite-v2` tag instead of `:latest` if you want to run this branch before it is merged to `main`.

## Configuration

Every setting is an environment variable; see `.env.example` for the full list with defaults. The ones you are most likely to touch:

| Variable | Default | Purpose |
| --- | --- | --- |
| `IDLE_TIMEOUT_SECONDS` | `300` | Leave after the queue has been empty this long (0 = stay forever). |
| `EMPTY_CHANNEL_TIMEOUT_SECONDS` | `60` | Leave after being alone in the voice channel this long (0 = stay). |
| `MAX_QUEUE_SIZE` / `MAX_PLAYLIST_SIZE` | `500` / `200` | Queue capacity and how many videos are loaded from a playlist. |
| `DEFAULT_VOLUME` / `MAX_VOLUME` | `100` / `200` | Volume in percent. Anything other than 100 routes audio through ffmpeg. |
| `ANNOUNCE_NOW_PLAYING` | `true` | Post a message when each track starts. |
| `YOUTUBE_CLIENTS` | `VISIONOS,IOS,MWEB,ANDROID_VR` | InnerTube clients to try, in order, for audio streams. The bot automatically falls back to the next one on an HTTP 403, even mid-track. |
| `YOUTUBE_COOKIE` | | Browser cookie for age-restricted content. |
| `LOG_LEVEL` | `info` | `debug` also prints the youtubei.js and voice dependency reports. |

### If YouTube stops working

YouTube serves stream URLs that some InnerTube clients aren't allowed to use, returning **HTTP 403 Forbidden**. Which clients work varies by video, by server IP and over time. The bot already tries each client in `YOUTUBE_CLIENTS` in turn and, if a stream is rejected part-way through a track, transparently retries the same track from where it left off with a different client — so occasional 403s recover on their own. Set `LOG_LEVEL=debug` to see each attempt (client, itag and HTTP status).

If **every** track fails:

1. Update the extractor: `npm update youtubei.js`.
2. Try a different client order via `YOUTUBE_CLIENTS` (e.g. put `IOS` or `MWEB` first, or add `WEB`/`ANDROID` if you have a `YOUTUBE_PO_TOKEN`).
3. If your server IP is being blocked ("Sign in to confirm you're not a bot"), provide `YOUTUBE_COOKIE`, or a `YOUTUBE_PO_TOKEN` + `YOUTUBE_VISITOR_DATA` pair generated with a tool such as [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider).

## Development

```sh
npm test        # unit tests for the queue, input parsing and formatting helpers
```

Project layout:

```
src/
  index.js              # entrypoint: Discord client, interaction routing, shutdown
  deploy-commands.js    # registers slash commands
  config.js             # environment parsing/validation
  logger.js
  commands/             # one module per slash command ({ data, execute, autocomplete? })
  music/
    youtube.js          # youtubei.js wrapper: resolve links/searches, create audio streams
    parse-input.js      # link vs. playlist vs. search classification
    Track.js            # track model
    TrackQueue.js       # pure queue logic (add/remove/move/loop/history)
    GuildSession.js     # per-guild voice connection + audio player + transitions
    QueueManager.js     # session registry and chat announcements
    embeds.js           # message embeds
    enqueue.js          # shared /play + /search tail
  utils/                # formatting, guards, response helpers, errors
tests/                  # node:test suites
```
