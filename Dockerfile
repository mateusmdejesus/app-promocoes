# Servidor do keropromo (API + monitor de preços). Usado pelo Railway.
FROM node:22-slim
WORKDIR /app

# Só as dependências da API (o app mobile não entra na imagem).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci -w @keropromo/api --omit=dev --no-audit --no-fund

COPY packages/core packages/core
COPY apps/api apps/api

ENV NODE_ENV=production \
    PORT=3333 \
    DATABASE_PATH=/data/keropromo.db
EXPOSE 3333
CMD ["npm", "run", "start", "-w", "@keropromo/api"]
