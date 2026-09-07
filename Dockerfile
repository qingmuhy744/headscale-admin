ARG ENDPOINT=/admin
ARG PORT=80

FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
ARG ENDPOINT
ENV ENDPOINT=$ENDPOINT

# Set up app directory
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./

# Install all dependencies
RUN npm ci

# Copy all required build files
COPY .eslintignore ./
COPY .eslintrc.cjs ./
COPY .npmrc ./
COPY .prettierignore ./
COPY .prettierrc ./
COPY postcss.config.cjs ./
COPY svelte.config.js ./
COPY tailwind.config.ts ./
COPY tsconfig.json ./
COPY vite.config.ts ./

# Copy source and static assets
COPY static/ ./static/
COPY src/ ./src/

# Build static application, endpoint is provided by $ENDPOINT
RUN npm run build 

FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

ARG ENDPOINT
ARG PORT
ENV PORT=${PORT}
LABEL org.opencontainers.image.source="https://github.com/qingmuhy744/headscale-admin" \
      org.opencontainers.image.title="Headscale Admin" \
      org.opencontainers.image.description="Headscale Admin compatible with Headscale v0.29.2" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      org.opencontainers.image.url="https://github.com/qingmuhy744/headscale-admin" \
      org.opencontainers.image.version="0.29.2-6"

WORKDIR /app

# Use the endpoint name as the directory so it can be served without URL stripping
COPY --from=build /app/build/ ./${ENDPOINT}

COPY Caddyfile /etc/caddy/Caddyfile
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
