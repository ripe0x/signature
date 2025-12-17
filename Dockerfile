FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY scripts/twitter-bot.js ./scripts/
COPY out/ ./out/

# Run the bot
# Use shorter polling interval for testing (15s instead of 60s)
CMD ["node", "scripts/twitter-bot.js", "--network=sepolia", "--dry-run", "--interval=15"]
