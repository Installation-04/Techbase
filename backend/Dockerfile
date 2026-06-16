FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
RUN mkdir -p /app/uploads
CMD ["node", "src/index.js"]
