FROM python:3.10-slim

# Install Node.js and system dependencies for OpenCV
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y git libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend files
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY server.ts ./
COPY index.html ./
COPY config.json ./
COPY src/ ./src/

# Install Node.js dependencies
RUN npm install

# Build the frontend
RUN npm run build

# Expose port 7860 (Hugging Face Spaces default)
EXPOSE 7860

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PORT=7860

# Start the server
CMD ["node", "server.ts"]
