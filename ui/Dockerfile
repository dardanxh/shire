# Shire UI — static Vite build served by nginx, which also proxies /api to the backend.
# VITE_API_BASE_URL stays "" (same-origin), so nothing is baked in at build time.
FROM node:22-alpine AS build
WORKDIR /app
# tsc + vite need more than Node's default old-space heap on some machines.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm install -g pnpm@9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
