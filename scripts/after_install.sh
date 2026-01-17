#!/bin/bash
# Install dependencies and build the application

echo "Installing dependencies..."

cd /home/ubuntu/cng-backend

# Install Node.js dependencies
npm install

# Generate Prisma client
npx prisma generate

# Build Next.js application
npm run build

# Run database migrations
npx prisma migrate deploy

exit 0
