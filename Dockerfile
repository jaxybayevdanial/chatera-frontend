# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

ARG EXPO_PUBLIC_CHATERA_API_URL=/
ENV EXPO_PUBLIC_CHATERA_API_URL=$EXPO_PUBLIC_CHATERA_API_URL
ENV EXPO_NO_TELEMETRY=1

# Copy dependency manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY .npmrc ./

# Install dependencies from the lockfile.
RUN npm ci

# Copy application source and export the web build.
COPY . .
RUN npx expo export --platform web --output-dir build

# Runtime stage
FROM nginx:alpine

ENV BACKEND_ORIGIN=https://app.chatera.ai

# Copy the static web export.
COPY --from=builder /app/build /usr/share/nginx/html

# Let the official nginx entrypoint render the config from env vars.
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80
