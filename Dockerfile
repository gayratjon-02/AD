# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --legacy-peer-deps --only=production

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 5032

# Start the application
CMD ["npm", "run", "start:prod"]
