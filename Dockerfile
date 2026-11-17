# Runs Oshi Push anywhere Docker runs (Fly.io, Railway, a VPS, ...).  See DEPLOY.md.
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8000

# Install everything, build the browser scripts, then drop the build-only tools.
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
