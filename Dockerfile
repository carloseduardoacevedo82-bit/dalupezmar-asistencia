FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Inicializar base de datos con los datos de DALUPEZMAR
RUN node database/initDb.js && node database/importDalupezmarWorkers.js

EXPOSE 3050

ENV PORT=3050
ENV NODE_ENV=production

CMD ["node", "src/server.js"]
