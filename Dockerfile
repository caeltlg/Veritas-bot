FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy all files
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile 2>&1 || pnpm install

# Start bot
CMD ["node", "index.js"]
