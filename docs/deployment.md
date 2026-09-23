# Deployment Guide

## System Requirements

- Node.js 20+
- npm 10+
- Modern browser (Chrome, Firefox, Edge, Safari)
- For multi-user: additional devices on same network

## Installation

```bash
cd /home/mcwachira/Projects/GitHub/POS-Operating-System
npm install
```

## Development Mode

```bash
npm run dev
```

This starts:
- Backend API on port 3001
- Frontend dev server on port 5173

## Production Build

```bash
npm run build
npm run preview
```

## Server Deployment

### Standalone Server
```bash
node server/index.js
```

### With PM2 (recommended for production)
```bash
npm install -g pm2
pm2 start server/index.js --name "od-pos"
pm2 save
pm2 startup
```

### With Nginx (reverse proxy)
```nginx
server {
    listen 80;
    server_name pos.open-doors.co.ke;
    
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / {
        root /var/www/od-pos/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

## Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "server/index.js"]
```

## Initial Setup

1. Copy `.env.example` to `.env`
2. Set `JWT_SECRET` to a strong value
3. Configure M-Pesa credentials in `.env`
4. Set `MPESA_ENVIRONMENT=sandbox` for testing
5. Run `npm run db:migrate` to initialize database
6. Create initial admin user via API

## Backup Strategy

- Automatic: Configure `backup_interval_hours` in settings
- Manual: `POST /api/backup/export`
- Database: Copy `data/pos.db` regularly
- CSV export: Available from Orders screen

## Multi-Device Setup

1. Start server on one computer
2. Other devices connect to `http://<server-ip>:5173`
3. All users share the same database
4. Authentication required for all users
5. Real-time updates via API polling
