FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY scripts/twitter-bot.js ./scripts/
COPY out/ ./out/
COPY deployment-sepolia.json ./

# Run the bot
# --interval is how often viem's watchEvent polls eth_getLogs, in seconds.
# 600s = every 10 min; tweets fire up to 10 min after the on-chain event.
CMD ["node", "scripts/twitter-bot.js", "--network=mainnet", "--interval=600"]
