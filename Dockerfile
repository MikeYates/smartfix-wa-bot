# Use official Node.js LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (copy package.json and package-lock.json)
COPY package*.json ./

RUN npm install --production

# Copy all app source code
COPY . .

# Expose port
EXPOSE 8080

# Start the app
CMD ["npm", "start"]