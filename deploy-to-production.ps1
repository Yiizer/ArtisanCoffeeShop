# Deployment Script for Artisan Coffee Shop
# This script helps you deploy to Vercel after you've set up Supabase

Write-Host "🚀 Artisan Coffee Shop - Production Deployment Script" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is provided
$DATABASE_URL = $env:DATABASE_URL
if (-not $DATABASE_URL) {
    Write-Host "⚠️  DATABASE_URL not found in environment" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please set your Supabase DATABASE_URL:" -ForegroundColor White
    Write-Host "  `$env:DATABASE_URL = 'your-supabase-connection-string'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or pass it directly:" -ForegroundColor White
    Write-Host "  `$env:DATABASE_URL='your-url'; .\deploy-to-production.ps1" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✅ DATABASE_URL found" -ForegroundColor Green
Write-Host ""

# Step 1: Generate Prisma Client
Write-Host "📦 Step 1: Generating Prisma Client..." -ForegroundColor Cyan
npm run prisma:generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to generate Prisma client" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Prisma client generated" -ForegroundColor Green
Write-Host ""

# Step 2: Run Migrations
Write-Host "🗄️  Step 2: Running database migrations..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to run migrations" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Migrations completed" -ForegroundColor Green
Write-Host ""

# Step 3: Seed Database
Write-Host "🌱 Step 3: Seeding database with menu items..." -ForegroundColor Cyan
npm run prisma:seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to seed database" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database seeded" -ForegroundColor Green
Write-Host ""

# Step 4: Test Build
Write-Host "🏗️  Step 4: Testing production build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green
Write-Host ""

Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Push to GitHub: git push origin main" -ForegroundColor White
Write-Host "2. Go to https://vercel.com/new" -ForegroundColor White
Write-Host "3. Import your GitHub repository" -ForegroundColor White
Write-Host "4. Add environment variable: DATABASE_URL = $DATABASE_URL" -ForegroundColor White
Write-Host "5. Deploy!" -ForegroundColor White
Write-Host ""
