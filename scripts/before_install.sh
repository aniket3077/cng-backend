#!/bin/bash
# Prepare the environment before installation

echo "Preparing environment..."

# Create application directory if it doesn't exist
mkdir -p /home/ubuntu/cng-backend

# Clean old deployment files
rm -rf /home/ubuntu/cng-backend/.next
rm -rf /home/ubuntu/cng-backend/node_modules

exit 0
