FROM node:22-alpine AS build
ARG TARGETARCH
WORKDIR /src
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --ignore-scripts -w client
RUN if [ "$TARGETARCH" = "arm64" ]; then npm install --ignore-scripts --no-save @rollup/rollup-linux-arm64-musl@4.55.1 @esbuild/linux-arm64@0.27.2; else npm install --ignore-scripts --no-save @rollup/rollup-linux-x64-musl@4.55.1 @esbuild/linux-x64@0.27.2; fi
COPY client client
ARG VITE_ASYNC_PLATFORM_ENABLED=true
ENV VITE_ASYNC_PLATFORM_ENABLED=$VITE_ASYNC_PLATFORM_ENABLED
RUN npm -w client run build

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/client/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
