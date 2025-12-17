FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (browsers already included in base image)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create cache directory
RUN mkdir -p /data/cache

ENV PORT=3001
ENV CACHE_DIR=/data/cache

EXPOSE 3001

CMD ["npm", "start"]
