# Ubuntu 22.04 Deployment Guide

## Quick Deployment

### Prerequisites
- Fresh Ubuntu 22.04 server
- User account with sudo privileges
- Internet connection

### One-Command Deployment
```bash
# Download and run the deployment script
curl -fsSL https://raw.githubusercontent.com/malcolmquincy/pdf-generation/main/deploy-ubuntu.sh | bash
```

### Manual Deployment
1. **Copy files to your Ubuntu server:**
   ```bash
   scp deploy-ubuntu.sh user@your-server:~/
   scp deploy-config.env user@your-server:~/  # Optional: for custom configuration
   ```

2. **Make the script executable:**
   ```bash
   chmod +x deploy-ubuntu.sh
   ```

3. **Run the deployment:**
   ```bash
   ./deploy-ubuntu.sh
   ```

## What the Script Does

The deployment script automatically:

1. **System Setup:**
   - Updates Ubuntu packages
   - Installs Node.js LTS
   - Installs Puppeteer system dependencies
   - Installs Git, curl, and other utilities

2. **Application Deployment:**
   - Creates service directory `/opt/pdf-service`
   - Clones your repository (or prompts for manual file copy)
   - Installs npm dependencies

3. **Service Configuration:**
   - Creates systemd service for auto-start
   - Configures proper permissions
   - Sets up logging

4. **Web Server Setup:**
   - Installs and configures Nginx
   - Sets up reverse proxy
   - Enables security headers
   - Configures rate limiting

5. **Security:**
   - Configures UFW firewall
   - Sets up proper service permissions
   - Enables security hardening

6. **Maintenance Tools:**
   - Creates helper scripts for logs, status, and restart

## After Deployment

### Service Management
```bash
# Check service status
pdf-service-status

# View real-time logs
pdf-service-logs

# Restart the service
pdf-service-restart

# Manual service control
sudo systemctl start pdf-service
sudo systemctl stop pdf-service
sudo systemctl restart pdf-service
```

### Testing Your Service
```bash
# Health check
curl http://your-server-ip/health

# Test PDF generation
curl -X POST http://your-server-ip/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "filename": "test.pdf"}' \
  --output test.pdf
```

### Configuration Files
- **Service:** `/etc/systemd/system/pdf-service.service`
- **Nginx:** `/etc/nginx/sites-available/pdf-service`
- **Application:** `/opt/pdf-service/`
- **Logs:** `journalctl -u pdf-service`

## Customization

### Change Domain/IP
Edit `/etc/nginx/sites-available/pdf-service` and update the `server_name` directive:
```nginx
server_name your-domain.com;
```

Then restart Nginx:
```bash
sudo systemctl restart nginx
```

### SSL/HTTPS Setup
To enable HTTPS with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### Port Changes
1. Edit `/etc/systemd/system/pdf-service.service`
2. Update the `Environment=PORT=3001` line
3. Edit `/etc/nginx/sites-available/pdf-service`
4. Update the `proxy_pass` URL
5. Restart both services

## Troubleshooting

### Service Won't Start
```bash
# Check detailed status
sudo systemctl status pdf-service -l

# Check logs
journalctl -u pdf-service -f

# Check file permissions
ls -la /opt/pdf-service/
```

### Nginx Issues
```bash
# Test Nginx configuration
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Puppeteer Issues
```bash
# Test Chrome installation
google-chrome --version
chromium-browser --version

# Check missing dependencies
ldd /opt/pdf-service/node_modules/puppeteer/.local-chromium/*/chrome-linux/chrome
```

### Firewall Issues
```bash
# Check UFW status
sudo ufw status verbose

# Allow specific ports
sudo ufw allow 80
sudo ufw allow 443
```

## Performance Tuning

### For High Load
1. **Increase worker processes** (if you modify to use clusters)
2. **Adjust Nginx worker connections:**
   ```bash
   sudo nano /etc/nginx/nginx.conf
   # worker_processes auto;
   # worker_connections 1024;
   ```
3. **Monitor resource usage:**
   ```bash
   htop
   iostat -x 1
   ```

### Memory Management
The service is configured to restart automatically if it crashes. Monitor memory usage:
```bash
watch 'ps aux | grep node'
```

## Security Notes

- The service runs as `www-data` user (not root)
- Firewall is enabled with minimal open ports
- Rate limiting is configured (10 requests per minute per IP)
- Security headers are enabled in Nginx
- Service is sandboxed with systemd security settings

## Support

If you encounter issues:
1. Check the logs: `pdf-service-logs`
2. Verify service status: `pdf-service-status`
3. Test connectivity: `curl http://localhost/health`
4. Check system resources: `htop` and `df -h`