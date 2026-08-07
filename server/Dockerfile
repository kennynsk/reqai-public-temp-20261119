FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --ignore-scripts --omit=dev -w server && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 10001 reqai && useradd --uid 10001 --gid reqai --no-create-home reqai
COPY --from=deps /app/node_modules node_modules
COPY server server
USER 10001:10001
EXPOSE 5178
CMD ["node", "server/index.js"]
