#!/bin/bash
# Stop the application

echo "Stopping application..."

# Stop PM2 process
pm2 stop petrolink-backend || true

exit 0
