#!/bin/bash

# PDF Generation Service Deployment Script for Ubuntu 22.04
# This script sets up the entire environment and deploys the service

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="pdf-service"
SERVICE_DIR="/opt/pdf-service"
SERVICE_PORT="3001"
NGINX_DOMAIN="localhost"  # Change this to your domain
GIT_REPO="https://github.com/malcolmquincy/pdf-generation.git"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Update system
update_system() {
    print_status "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    print_success "System updated successfully"
}

# Install Node.js
install_nodejs() {
    print_status "Installing Node.js LTS..."
    
    # Remove existing Node.js if any
    sudo apt remove -y nodejs npm 2>/dev/null || true
    
    # Install Node.js from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    print_success "Node.js $NODE_VERSION and npm $NPM_VERSION installed successfully"
}

# Install system dependencies for Puppeteer
install_puppeteer_deps() {
    print_status "Installing Puppeteer system dependencies..."
    
    sudo apt-get install -y \
        ca-certificates \
        fonts-liberation \
        libappindicator3-1 \
        libasound2 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        xdg-utils \
        libgbm1 \
        libxss1 \
        git \
        curl \
        wget
    
    print_success "Puppeteer dependencies installed successfully"
}

# Create application directory and deploy code
deploy_application() {
    print_status "Deploying application to $SERVICE_DIR..."
    
    # Create service directory
    sudo mkdir -p $SERVICE_DIR
    sudo chown $USER:$USER $SERVICE_DIR
    
    # Clone or copy application
    if [ -n "$GIT_REPO" ]; then
        print_status "Cloning application from Git repository..."
        git clone $GIT_REPO $SERVICE_DIR
    else
        print_warning "No Git repository specified. Please manually copy your files to $SERVICE_DIR"
        print_warning "Required files: package.json, pdf-server.js"
        read -p "Press Enter when files are copied..."
    fi
    
    # Install npm dependencies
    cd $SERVICE_DIR
    print_status "Installing npm dependencies..."
    npm install --production
    
    print_success "Application deployed successfully"
}

# Create systemd service
create_systemd_service() {
    print_status "Creating systemd service..."
    
    sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=PDF Generation Service
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$SERVICE_DIR
ExecStart=/usr/bin/node pdf-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$SERVICE_PORT
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$SERVICE_DIR

[Install]
WantedBy=multi-user.target
EOF

    # Set proper permissions for www-data
    sudo chown -R www-data:www-data $SERVICE_DIR
    
    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable $SERVICE_NAME
    
    print_success "Systemd service created and enabled"
}

# Install and configure Nginx
install_nginx() {
    print_status "Installing and configuring Nginx..."
    
    sudo apt install nginx -y
    
    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/$SERVICE_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name $NGINX_DOMAIN;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=pdf_limit:10m rate=10r/m;

    location / {
        limit_req zone=pdf_limit burst=5 nodelay;
        
        proxy_pass http://localhost:$SERVICE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout settings for PDF generation
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:$SERVICE_PORT/health;
        access_log off;
    }
}
EOF

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/
    
    # Remove default site if it exists
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    if sudo nginx -t; then
        sudo systemctl enable nginx
        sudo systemctl restart nginx
        print_success "Nginx configured and started successfully"
    else
        print_error "Nginx configuration test failed"
        return 1
    fi
}

# Setup firewall
setup_firewall() {
    print_status "Configuring UFW firewall..."
    
    sudo ufw --force enable
    sudo ufw allow ssh
    sudo ufw allow 'Nginx Full'
    sudo ufw --force reload
    
    print_success "Firewall configured successfully"
}

# Start services
start_services() {
    print_status "Starting services..."
    
    # Start the PDF service
    sudo systemctl start $SERVICE_NAME
    
    # Check service status
    if sudo systemctl is-active --quiet $SERVICE_NAME; then
        print_success "PDF service started successfully"
    else
        print_error "Failed to start PDF service"
        sudo systemctl status $SERVICE_NAME
        return 1
    fi
    
    # Check Nginx status
    if sudo systemctl is-active --quiet nginx; then
        print_success "Nginx is running successfully"
    else
        print_error "Nginx is not running"
        sudo systemctl status nginx
        return 1
    fi
}

# Test the deployment
test_deployment() {
    print_status "Testing deployment..."
    
    # Wait a moment for services to fully start
    sleep 5
    
    # Test health endpoint
    if curl -f -s "http://localhost/health" > /dev/null; then
        print_success "Health check passed - service is responding"
    else
        print_warning "Health check failed - service may not be fully ready yet"
    fi
}

# Create maintenance scripts
create_maintenance_scripts() {
    print_status "Creating maintenance scripts..."
    
    # Create logs viewer script
    sudo tee /usr/local/bin/pdf-service-logs > /dev/null <<'EOF'
#!/bin/bash
echo "PDF Service Logs (press Ctrl+C to exit):"
journalctl -u pdf-service -f
EOF
    
    # Create status check script
    sudo tee /usr/local/bin/pdf-service-status > /dev/null <<'EOF'
#!/bin/bash
echo "=== PDF Service Status ==="
systemctl status pdf-service --no-pager
echo ""
echo "=== Nginx Status ==="
systemctl status nginx --no-pager
echo ""
echo "=== Health Check ==="
curl -s http://localhost/health | jq . 2>/dev/null || curl -s http://localhost/health
EOF
    
    # Create restart script
    sudo tee /usr/local/bin/pdf-service-restart > /dev/null <<EOF
#!/bin/bash
echo "Restarting PDF service..."
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx
echo "Services restarted. Checking status..."
sleep 3
pdf-service-status
EOF

    # Make scripts executable
    sudo chmod +x /usr/local/bin/pdf-service-*
    
    print_success "Maintenance scripts created in /usr/local/bin/"
}

# Main deployment function
main() {
    echo -e "${GREEN}"
    echo "================================================================="
    echo "       PDF Generation Service Deployment Script"
    echo "                Ubuntu 22.04 LTS"
    echo "================================================================="
    echo -e "${NC}"
    
    check_root
    
    print_status "Starting deployment process..."
    
    # Deployment steps
    update_system
    install_nodejs
    install_puppeteer_deps
    deploy_application
    create_systemd_service
    install_nginx
    setup_firewall
    start_services
    test_deployment
    create_maintenance_scripts
    
    echo -e "${GREEN}"
    echo "================================================================="
    echo "                 DEPLOYMENT COMPLETED!"
    echo "================================================================="
    echo -e "${NC}"
    echo ""
    echo "Your PDF Generation Service is now running!"
    echo ""
    echo "Service Information:"
    echo "  • Service URL: http://$(hostname -I | awk '{print $1}')"
    echo "  • Health Check: http://$(hostname -I | awk '{print $1}')/health"
    echo "  • Service Port: $SERVICE_PORT (internal)"
    echo "  • Service Directory: $SERVICE_DIR"
    echo ""
    echo "Useful Commands:"
    echo "  • View logs: pdf-service-logs"
    echo "  • Check status: pdf-service-status"
    echo "  • Restart service: pdf-service-restart"
    echo "  • Manual restart: sudo systemctl restart $SERVICE_NAME"
    echo ""
    echo "Configuration Files:"
    echo "  • Systemd: /etc/systemd/system/$SERVICE_NAME.service"
    echo "  • Nginx: /etc/nginx/sites-available/$SERVICE_NAME"
    echo ""
    print_success "Deployment completed successfully!"
}

# Run main function
main "$@"