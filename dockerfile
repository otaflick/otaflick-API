# Use Node.js base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your backend source code
COPY . .

# Expose backend port
EXPOSE 5000

# Start the backend
CMD ["bash", "-c", "cd /app && npm run dev"]
