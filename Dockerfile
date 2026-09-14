FROM node:18-alpine

WORKDIR /app

# Enable corepack so we can use pnpm if the repo uses it
RUN corepack enable

# Copy package manifests and lockfiles (if present)
COPY package.json pnpm-lock.yaml package-lock.json* ./

# Install dependencies: prefer pnpm when pnpm-lock.yaml exists, otherwise fall back to npm
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack prepare pnpm@latest --activate && \
      pnpm install --prod; \
    else \
      npm ci --production || npm install --production; \
    fi

COPY . .
ENV NODE_ENV=production
CMD ["node", "index.js"]
