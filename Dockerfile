# Dockerfile

FROM node:18-alpine

# Create app directory

WORKDIR /usr/src/app

# Install app dependencies

COPY package*.json ./
RUN npm ci –only=production && npm cache clean –force

# Bundle app source

COPY . .

# Create non-root user

RUN addgroup -g 1001 -S nodejs &&   
adduser -S nodejs -u 1001

# Change ownership of the app directory

RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Expose port

EXPOSE 3000

# Health check

HEALTHCHECK –interval=30s –timeout=3s –start-period=5s –retries=3   
CMD node healthcheck.js

# Start the application

CMD [“node”, “server.js”]