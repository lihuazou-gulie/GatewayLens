ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS application

WORKDIR /app
COPY package.json LICENSE ./
COPY index.html ./
COPY settings ./settings
COPY src ./src
COPY styles ./styles
COPY assets ./assets
COPY server ./server

FROM application AS tested
COPY tests ./tests
COPY scripts/capture-compose.mjs scripts/demo.mjs ./scripts/
RUN node --test tests/*.test.mjs

FROM application AS runtime
# The final image depends on the test stage, but contains no test fixtures.
COPY --from=tested /app/server ./server
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/lihuazou-gulie/GatewayLens" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="GatewayLens"
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production
ENV KANBAN_HOST=0.0.0.0
ENV KANBAN_PORT=8787
ENV KANBAN_DATA_DIR=/data

USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s CMD ["node", "server/healthcheck.mjs"]
CMD ["node", "server/index.mjs"]
