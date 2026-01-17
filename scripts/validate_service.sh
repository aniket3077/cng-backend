#!/bin/bash
# Validate that the service is running

echo "Validating service..."

# Wait for application to start
sleep 10

# Check if PM2 process is running
pm2 list | grep petrolink-backend

if [ $? -eq 0 ]; then
    echo "Application is running"
    
    # Check health endpoint
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health)
    
    if [ $response -eq 200 ]; then
        echo "Health check passed"
        exit 0
    else
        echo "Health check failed with status: $response"
        exit 1
    fi
else
    echo "Application is not running"
    exit 1
fi
