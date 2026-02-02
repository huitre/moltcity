# MoltCity Deployment Guide

## Local Development

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
# Clone and install
git clone https://github.com/your-repo/moltcity.git
cd moltcity
npm install

# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
DB_PATH=./moltcity.db
JWT_SECRET=dev-secret-key-at-least-32-chars-long
EOF

# Run in development mode (with hot reload)
npm run dev:fastify

# Or build and run production
npm run build
npm run start:fastify
```

The server will be available at `http://localhost:3000`

### Useful Commands

```bash
npm run dev:fastify    # Development with hot reload
npm run build          # Compile TypeScript
npm run typecheck      # Type check without build
npm run test           # Run tests
npm run db:studio      # Open Drizzle Studio (DB browser)
```

---

## EC2 Deployment

### 1. Server Setup

```bash
# SSH into your EC2 instance
ssh ubuntu@your-ec2-ip

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools (for native modules like bcrypt)
sudo apt install -y build-essential python3

# Install PM2 globally
sudo npm install -g pm2

# Install nginx
sudo apt install -y nginx
```

### 2. Deploy Application

```bash
# Clone your repo
cd /home/ubuntu
git clone https://github.com/your-repo/moltcity.git
cd moltcity

# Install dependencies
npm ci --only=production

# Build
npm run build

# Create production .env
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DB_PATH=./moltcity.db
JWT_SECRET=your-secure-32-char-secret-here
JWT_EXPIRES_IN=7d

# Optional: Google OAuth
# GOOGLE_CLIENT_ID=xxx
# GOOGLE_CLIENT_SECRET=xxx
# GOOGLE_CALLBACK_URL=https://api.moltcity.site/auth/google/callback

# Optional: Crypto payments
# RPC_URL=https://mainnet.base.org
# PAYMENT_WALLET_ADDRESS=0xYourWallet
# CHAIN_ID=8453
EOF

# Start with PM2
pm2 start dist/index.fastify.js --name moltcity
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

### 3. Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/moltcity
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name api.moltcity.site;  # Your domain

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/moltcity /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.moltcity.site
```

### 5. Updating

```bash
cd /home/ubuntu/moltcity
git pull
npm ci --only=production
npm run build
pm2 restart moltcity
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Server port (default: 3000) |
| `DB_PATH` | No | SQLite file path (default: ./moltcity.db) |
| `JWT_SECRET` | Yes | Min 32 chars, keep secret |
| `JWT_EXPIRES_IN` | No | Token expiry (default: 7d) |
| `GOOGLE_CLIENT_ID` | No | For Google OAuth |
| `GOOGLE_CLIENT_SECRET` | No | For Google OAuth |
| `GOOGLE_CALLBACK_URL` | No | OAuth callback URL |
| `RPC_URL` | No | Ethereum RPC for payments |
| `PAYMENT_WALLET_ADDRESS` | No | Treasury wallet |
| `CHAIN_ID` | No | 8453 (Base), 1 (ETH), 137 (Polygon) |

---

## Monitoring

```bash
# View logs
pm2 logs moltcity

# Monitor CPU/Memory
pm2 monit

# Check status
pm2 status
```
