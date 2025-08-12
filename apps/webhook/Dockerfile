FROM node:20-alpine

RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app
COPY package.json ./
RUN npm install
COPY server.js ./
EXPOSE 3001
CMD ["node","server.js"]
