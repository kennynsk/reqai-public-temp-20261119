FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY mcp-gateway/package.json mcp-gateway/package.json
RUN npm ci --ignore-scripts --omit=dev -w mcp-gateway && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 10002 reqai-mcp && useradd --uid 10002 --gid reqai-mcp --no-create-home reqai-mcp
COPY --from=deps /app/node_modules node_modules
COPY mcp-gateway mcp-gateway
USER 10002:10002
EXPOSE 5180
CMD ["node", "mcp-gateway/src/index.js"]
