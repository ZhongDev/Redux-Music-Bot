# Redux-Music-Bot

Discord Music Bot

## Redux Music Bot

Discord music bot that can be added to a server, listens for commands to add a YouTube video link to a queue, joins the message sender's voice call, plays through the queue, and disconnects when done.

License: GNU GPL v3 (see `LICENSE`).

### Features

- Slash commands: `/play <url>`, `/skip`, `/queue`, `/stop`
- Per-guild in-memory queue
- Auto-join the caller's voice channel and disconnect when finished

### Requirements

- Node.js 18+
- A Discord application and bot token

### Setup

1. Create a Discord application and bot, invite it to your server with the `bot` and `applications.commands` scopes, and the `Connect`, `Speak`, and `Use Voice Activity` permissions.
2. In the project root, create a `.env` file:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
# Optional: set for faster command updates for a single guild
DISCORD_GUILD_ID=your-guild-id
# Optional: for age/region-restricted videos
YOUTUBE_COOKIE=your-youtube-cookie-string
```

3. Install dependencies and deploy slash commands:

```
npm install
npm run deploy:commands
```

4. Start the bot:

```
npm start
```

### Usage

- Use `/play <YouTube URL>` while in a voice channel to enqueue a song and start playback
- `/skip` to skip current track
- `/queue` to view upcoming items
- `/stop` to clear queue and disconnect

### Notes

- Streams audio via `ytdl-core` and `@discordjs/voice`. Includes `ffmpeg-static` and `opusscript` for broad compatibility.
