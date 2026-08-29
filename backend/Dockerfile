# syntax=docker/dockerfile:1.7

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY types/package.json ./types/package.json

RUN pnpm install --frozen-lockfile --filter @supabase-modular-auth/backend...

COPY backend ./backend
COPY types ./types

RUN pnpm --filter @supabase-modular-auth/types build

FROM base AS development

ENV NODE_ENV=development

RUN chown -R node:node /workspace

USER node

CMD ["pnpm", "--filter", "@supabase-modular-auth/backend", "dev"]

FROM base AS build

RUN pnpm --filter @supabase-modular-auth/backend build

FROM build AS production

ENV NODE_ENV=production
ENV PORT=3000

RUN chown -R node:node /workspace

USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "@supabase-modular-auth/backend", "start"]
