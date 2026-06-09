# Use the official Node LTS image (Debian Bookworm)
FROM node:22-bookworm

# Install basic packages and tools needed for building native dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency configuration files
COPY package*.json ./
COPY client/package*.json ./client/

# Install server and client dependencies using clean install
RUN npm ci
RUN npm ci --prefix client

# Copy the rest of the application files
COPY . .

# Install Playwright Chromium and its Linux system dependencies
RUN npx playwright install --with-deps chromium

# Build both backend (TypeScript compilation) and frontend (React/Vite compilation)
RUN npm run build
RUN npm run frontend:build

# Expose the application port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["npm", "start"]
