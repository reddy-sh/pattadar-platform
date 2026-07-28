# syntax=docker/dockerfile:1
FROM oven/bun:1 AS builder
WORKDIR /repo
COPY package.json bun.lock tsconfig.base.json ./
# bun.lock encodes the FULL workspace graph (apps/mobile, apps/web,
# apps/web-next, packages/core, packages/tokens, tests/e2e-ux). Docker's
# build context only ships apps/web-next + packages/*, so --frozen-lockfile
# would see a partial workspace and refuse (lockfile mismatch). Copy just the
# other members' manifests (no source) so bun's workspace resolution matches
# the lockfile exactly, without dragging in unrelated app source.
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/web/package.json apps/web/package.json
COPY tests/e2e-ux/package.json tests/e2e-ux/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/tokens/package.json packages/tokens/package.json
COPY apps/web-next/package.json apps/web-next/package.json
RUN bun install --frozen-lockfile
# Now bring in the real source for the packages this image actually builds.
COPY packages/core packages/core
COPY packages/tokens packages/tokens
COPY apps/web-next apps/web-next
ARG NEXT_PUBLIC_COGNITO_AUTHORITY
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_DOMAIN
ARG NEXT_PUBLIC_COGNITO_REDIRECT_URI
ARG NEXT_PUBLIC_SOCIAL_PROVIDERS
RUN cd apps/web-next && bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=builder /repo/apps/web-next/.next/standalone ./
COPY --from=builder /repo/apps/web-next/.next/static ./apps/web-next/.next/static
COPY --from=builder /repo/apps/web-next/public ./apps/web-next/public
USER node
EXPOSE 3000
CMD ["node", "apps/web-next/server.js"]
