# Initialize Production Database Script
# Run this AFTER deploying to Vercel

Write-Host "🗄️  Initializing Production Database" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for database URL if not set
$DATABASE_URL = $env:DATABASE_URL
if (-not $DATABASE_URL) {
    Write-Host "Please enter your Supabase DATABASE_URL:" -ForegroundColor Yellow
    $DATABASE_URL = Read-Host "DATABASE_URL"
}

# Validate URL
if (-not $DATABASE_URL) {
    Write-Host "❌ DATABASE_URL is required!" -ForegroundColor Red
    exit 1
}

# Set environment variable
$env:DATABASE_URL = $DATABASE_URL

Write-Host "✅ DATABASE_URL configured" -ForegroundColor Green
Write-Host ""

# Generate Prisma Client
Write-Host "📦 Generating Prisma Client..." -ForegroundColor Cyan
npm run prisma:generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to generate Prisma client" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Prisma client generated" -ForegroundColor Green
Write-Host ""

# Run Migrations
Write-Host "🗄️  Running database migrations..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to run migrations" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "- Check that your DATABASE_URL is correct" -ForegroundColor White
    Write-Host "- Ensure your Supabase project is running" -ForegroundColor White
    Write-Host "- Try using the 'Session pooler' connection string from Supabase" -ForegroundColor White
    exit 1
}
Write-Host "✅ Migrations completed successfully" -ForegroundColor Green
Write-Host ""

# Seed Database
Write-Host "🌱 Seeding database with menu items..." -ForegroundColor Cyan
Write-Host "(This will create sample coffee items, sizes, and add-ons)" -ForegroundColor Gray
npm run prisma:seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to seed database" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database seeded with menu items!" -ForegroundColor Green
Write-Host ""

Write-Host "🎉 Production Database Ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Visit your Vercel deployment URL" -ForegroundColor White
Write-Host "2. Test the order page (/order)" -ForegroundColor White
Write-Host "3. Test the admin page (/admin)" -ForegroundColor White
Write-Host "4. Start taking orders!" -ForegroundColor White
Write-Host ""
