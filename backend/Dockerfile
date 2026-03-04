# ============================================
# WalkNav Backend — Multi-Stage Dockerfile
# ============================================

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Development (used by docker-compose.yml)
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# Stage 3: Production
FROM node:20-alpine AS prod
WORKDIR /app

# Create non-root user
RUN addgroup -S walknav && adduser -S walknav -G walknav

# Copy production deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY seed/ ./seed/

# Set environment
ENV NODE_ENV=production
EXPOSE 3001

# Run as non-root
USER walknav

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "src/server.js"]
