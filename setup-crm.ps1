Write-Host "Running Prisma migrations for Fuel Bharat CRM..." -ForegroundColor Cyan

# Generate Prisma client
Write-Host "`nGenerating Prisma Client..." -ForegroundColor Yellow
npx prisma generate

# Push schema to database
Write-Host "`nPushing schema to database..." -ForegroundColor Yellow
npx prisma db push

# Seed database (if seed file exists)
if (Test-Path "prisma/seed.ts") {
    Write-Host "`nSeeding database..." -ForegroundColor Yellow
    npx prisma db seed
}

Write-Host "`n✅ Database setup complete!" -ForegroundColor Green
Write-Host "`nYou can now:" -ForegroundColor Cyan
Write-Host "  1. Start the backend: npm run dev" -ForegroundColor White
Write-Host "  2. Create admin user: npm run create-admin" -ForegroundColor White
Write-Host "  3. Access subscriber signup: POST /api/auth/subscriber/signup" -ForegroundColor White
Write-Host "  4. Access subscriber login: POST /api/auth/subscriber/login" -ForegroundColor White
