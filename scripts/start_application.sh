#!/bin/bash
# Start the application

echo "Starting application..."

cd /home/ubuntu/cng-backend

# Load environment variables
export $(cat .env | xargs)

# Start or restart with PM2
pm2 restart ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

exit 0
