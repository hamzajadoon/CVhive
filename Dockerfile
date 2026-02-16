# ============================================================
# CVhive API — Dockerfile
# Node.js 18 LTS on Alpine Linux
# ============================================================

FROM node:18-alpine AS base

# Install OS-level deps (needed by bcrypt native module)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Production stage ─────────────────────────────────────
FROM node:18-alpine AS production

WORKDIR /app

# Create unprivileged user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodejs -u 1001 -G nodejs

# Copy node_modules from build stage
COPY --from=base --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs server.js    ./
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs database/    ./database/

# Create uploads directory
RUN mkdir -p ./uploads && chown nodejs:nodejs ./uploads

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
