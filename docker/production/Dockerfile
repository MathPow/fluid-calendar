# Build stage
FROM node:20-alpine3.19 AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm ci --legacy-peer-deps
RUN npx prisma generate

# Copy source
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine3.19 AS runner
# Install netcat (DB wait) and jq for JSON manipulation
RUN apk add --no-cache netcat-openbsd jq

# Create the runtime user up front so files land owned correctly via COPY --chown.
# This avoids a final `chown -R /app` over the multi-GB node_modules tree, which
# is slow and flaky on this host's overlayfs (it was the #1 cause of failed builds).
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

WORKDIR /app
RUN chown nextjs:nodejs /app
# npm/npx cache somewhere writable for the non-root user (runtime prisma generate too).
ENV npm_config_cache=/tmp/.npm
USER nextjs

# Install production dependencies (pure-JS deps only — no native build needed)
COPY --chown=nextjs:nodejs --from=builder /app/package*.json ./
RUN npm ci --only=production --legacy-peer-deps --ignore-scripts

# Copy built application (ownership set at copy time — no recursive chown needed)
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/prisma ./prisma
COPY --chown=nextjs:nodejs --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs --from=builder /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Start the application
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"] 