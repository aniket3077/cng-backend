# PetroLink Backend Setup Script for Windows PowerShell

Write-Host "🚀 PetroLink Backend Setup" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check npm
$npmVersion = npm --version 2>$null
if ($npmVersion) {
    Write-Host "✓ npm installed: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "✗ npm not found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "Setting up environment..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✓ Created .env file" -ForegroundColor Green
    Write-Host "⚠️  IMPORTANT: Edit .env file with your DATABASE_URL and JWT_SECRET" -ForegroundColor Yellow
} else {
    Write-Host "✓ .env file already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
npm run db:generate

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to generate Prisma Client" -ForegroundColor Red
    Write-Host "⚠️  Make sure DATABASE_URL is set in .env" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Prisma Client generated" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Backend setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env file with your PostgreSQL DATABASE_URL and JWT_SECRET" -ForegroundColor White
Write-Host "2. Run: npm run db:push       # Push schema to database" -ForegroundColor White
Write-Host "3. Run: npm run db:seed       # Seed sample stations" -ForegroundColor White
Write-Host "4. Run: npm run dev           # Start development server" -ForegroundColor White
Write-Host ""
Write-Host "Backend will run at http://localhost:3000" -ForegroundColor Cyan
