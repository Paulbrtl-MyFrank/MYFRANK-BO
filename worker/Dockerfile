FROM node:20-slim

WORKDIR /app

# Dépendances (le CLI Claude Code est embarqué dans le SDK).
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
