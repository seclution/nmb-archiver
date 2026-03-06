# Dockerfile for the OSS version of Open Archiver

ARG BASE_IMAGE=node:22-alpine

# 0. Base Stage: Define all common dependencies and setup
FROM ${BASE_IMAGE} AS base
WORKDIR /app

# Install pnpm
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Copy manifests and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/types/package.json ./packages/types/
COPY apps/open-archiver/package.json ./apps/open-archiver/

# 1. Build Stage: Install all dependencies and build the project
FROM base AS build
RUN apk add --no-cache zip
COPY packages/frontend/svelte.config.js ./packages/frontend/

# Install all dependencies.
ENV PNPM_HOME="/pnpm"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --shamefully-hoist --frozen-lockfile --prod=false

# Copy the rest of the source code
COPY . .

# Build the OSS packages.
RUN pnpm build:oss

# Create a distributable source archive for AGPL network users.
RUN zip -r /tmp/nmb-archiver-source.zip . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x "packages/frontend/.svelte-kit/*" \
    -x "packages/frontend/build/*" \
    -x "**/dist/*"

# 2. Production Stage: Install only production dependencies and copy built artifacts
FROM base AS production

# Copy built application from build stage
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/drizzle.config.ts ./packages/backend/drizzle.config.ts
COPY --from=build /app/packages/backend/src/database/migrations ./packages/backend/src/database/migrations
COPY --from=build /app/packages/frontend/build ./packages/frontend/build
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/apps/open-archiver/dist ./apps/open-archiver/dist
COPY --from=build /tmp/nmb-archiver-source.zip ./public/nmb-archiver-source.zip

# Copy the entrypoint script and make it executable
COPY docker/docker-entrypoint.sh /usr/local/bin/

# Expose the port the app runs on
EXPOSE 4000
EXPOSE 3000

# Set the entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]

# Start the application
CMD ["pnpm", "docker-start:oss"]
