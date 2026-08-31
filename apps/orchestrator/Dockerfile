FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/orchestrator/package.json apps/orchestrator/package.json
RUN npm ci
COPY apps/orchestrator apps/orchestrator
RUN npm run build --workspace @btf/orchestrator

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY --from=build /app/apps/orchestrator/dist ./apps/orchestrator/dist
USER node
CMD ["node", "apps/orchestrator/dist/index.js"]
