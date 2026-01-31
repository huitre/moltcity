#!/bin/bash
# EC2 Setup Script for MoltCity
# Run this on a fresh Amazon Linux 2023 or Ubuntu instance

set -e

echo "=== MoltCity EC2 Setup ==="

# Update system
sudo yum update -y 2>/dev/null || sudo apt update -y

# Install Node.js 20.x
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - 2>/dev/null || \
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo yum install -y nodejs 2>/dev/null || sudo apt install -y nodejs
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Install git if needed
if ! command -v git &> /dev/null; then
    sudo yum install -y git 2>/dev/null || sudo apt install -y git
fi

# Create app directory
sudo mkdir -p /var/www/moltcity
sudo chown $USER:$USER /var/www/moltcity

echo "=== Setup complete ==="
echo "Next steps:"
echo "1. Clone your repo to /var/www/moltcity"
echo "2. Run: cd /var/www/moltcity && npm install"
echo "3. Run: pm2 start ecosystem.config.js"
echo "4. Run: pm2 save && pm2 startup"
