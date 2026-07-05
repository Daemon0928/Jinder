# ---------- Build stage: compile server + client, install all deps ----------
FROM node:22-bookworm-slim AS build

# Toolchain for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci && npm ci --prefix client

COPY . .
# Builds server to dist/ and client to dist/frontend
RUN npm run build

# ---------- Prune stage: drop dev deps (keeps compiled native modules) ----------
# Separate stage so the `build` target keeps tsx/tests for the compose tests service.
FROM build AS prod-deps
RUN npm prune --omit=dev

# ---------- Runtime stage: prod deps + dist only, non-root ----------
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=5000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Chromium + its system libraries for the Playwright scraping fallbacks.
# Uses the playwright version from node_modules so browser revisions match.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user; /app/data holds the SQLite volume
RUN useradd --create-home jinder \
    && mkdir -p /app/data \
    && chown -R jinder:jinder /app /ms-playwright
USER jinder

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
