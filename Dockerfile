# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python FastAPI runner
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy backend and frontend build
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY start.py ./

ENV PORT=8000
ENV HOST=0.0.0.0

EXPOSE 8000

CMD ["python", "start.py"]
