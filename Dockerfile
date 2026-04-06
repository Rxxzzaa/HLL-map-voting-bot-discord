FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the source
COPY . .

# The bot writes logs to ./logs — make sure the volume can mount here
VOLUME ["/app/logs", "/app/data"]

CMD ["node", "src/index.js"]
