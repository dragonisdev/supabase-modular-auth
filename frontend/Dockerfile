# syntax=docker/dockerfile:1.7

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY types/package.json ./types/package.json

RUN pnpm install --frozen-lockfile --filter @supabase-modular-auth/frontend...

COPY frontend ./frontend
COPY types ./types

RUN pnpm --filter @supabase-modular-auth/types build

FROM base AS development

ENV NODE_ENV=development

RUN chown -R node:node /workspace

USER node

CMD ["pnpm", "--filter", "@supabase-modular-auth/frontend", "dev"]

FROM base AS build

ARG FRONTEND_PROXY_TARGET=http://backend:3000
ARG NEXT_PUBLIC_API_BASE_URL=""

ENV FRONTEND_PROXY_TARGET=$FRONTEND_PROXY_TARGET
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm --filter @supabase-modular-auth/frontend build

FROM build AS production

ENV NODE_ENV=production
ENV PORT=3001

RUN chown -R node:node /workspace

USER node

EXPOSE 3001

CMD ["pnpm", "--filter", "@supabase-modular-auth/frontend", "start"]
