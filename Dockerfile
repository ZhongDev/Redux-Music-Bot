# syntax=docker/dockerfile:1

# ---- Dependencies ------------------------------------------------------------
# Debian (glibc) rather than Alpine: ffmpeg-static ships a glibc-linked binary and
# @snazzah/davey (Discord's DAVE encryption) has prebuilt -gnu binaries for x64 and arm64.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# ffmpeg-static downloads a platform-specific ffmpeg during install, so this step needs network.
RUN npm ci --omit=dev --no-audit --no-fund

# ---- Runtime -----------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# youtubei.js caches its session/player data here; persisted via a volume in compose.yaml.
RUN mkdir -p /app/.cache && chown -R node:node /app
USER node
VOLUME ["/app/.cache"]

CMD ["node", "src/index.js"]
