FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
RUN npm ci && (cd packages/renderer && npm run build)
ENV HOME=/tmp npm_config_cache=/tmp/.npm AURORA_MODE=hosted AURORA_DATA_DIR=/data AURORA_PORT=4317 NODE_ENV=production
RUN useradd --system --uid 10001 --home-dir /app aurora && mkdir -p /data && chown aurora /data
USER aurora
VOLUME /data
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx","packages/server/src/cli.ts","serve"]
