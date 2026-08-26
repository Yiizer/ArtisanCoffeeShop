# 🚀 Your Step-by-Step Deployment Guide

I've prepared everything for you! Follow these steps:

---

## ✅ STEP 1: Create Supabase Database (5 minutes)

1. **Go to:** https://supabase.com/
2. **Click:** "Start your project" → Sign up (free)
3. **Create new project:**
   - Name: `artisan-coffee-shop`
   - Database Password: (create a strong password - **SAVE THIS!**)
   - Region: Choose closest to your location
   - Click "Create new project"
4. **Wait ~2 minutes** for the database to be ready
5. **Get your connection string:**
   - Go to: **Project Settings** (⚙️ icon) → **Database** tab
   - Scroll to "Connection string" section
   - **Select:** "Session pooler" or "Transaction" mode
   - **Copy** the connection string (looks like):
     ```
     postgresql://postgres.[ref]:[YOUR-PASSWORD]@[host].pooler.supabase.com:6543/postgres
     ```
   - Replace `[YOUR-PASSWORD]` with your actual database password

---

## ✅ STEP 2: Initialize Your Database (2 minutes)

Open PowerShell in your project folder and run:

```powershell
# Set your database URL (paste the one from Supabase)
$env:DATABASE_URL = "postgresql://postgres.xxx:YOUR-PASSWORD@xxx.pooler.supabase.com:6543/postgres"

# Run the deployment script
.\deploy-to-production.ps1
```

This will:
- ✅ Generate Prisma client
- ✅ Run database migrations
- ✅ Seed menu items
- ✅ Test production build

**Expected output:**
```
🚀 Artisan Coffee Shop - Production Deployment Script
======================================================

✅ DATABASE_URL found
📦 Step 1: Generating Prisma Client...
✅ Prisma client generated
🗄️  Step 2: Running database migrations...
✅ Migrations completed
🌱 Step 3: Seeding database with menu items...
✅ Database seeded
🏗️  Step 4: Testing production build...
✅ Build successful
🎉 Setup Complete!
```

---

## ✅ STEP 3: Push to GitHub (2 minutes)

Your code is already committed! Now push it:

```powershell
# Create a new GitHub repository first at: https://github.com/new
# Name it: artisan-coffee-shop

# Then run these commands:
git remote add origin https://github.com/YOUR-USERNAME/artisan-coffee-shop.git
git branch -M main
git push -u origin main
```

---

## ✅ STEP 4: Deploy to Vercel (5 minutes)

1. **Go to:** https://vercel.com/
2. **Sign up** with GitHub (free)
3. **Click:** "Add New..." → "Project"
4. **Import** your `artisan-coffee-shop` repository
5. **Configure:**
   - Framework Preset: Next.js (auto-detected)
   - Build Command: `npm run build` (auto-detected)
   - Leave other settings as default
6. **Add Environment Variable:**
   - Click "Environment Variables"
   - Add:
     - Name: `DATABASE_URL`
     - Value: (paste your Supabase connection string)
   - Select all environments (Production, Preview, Development)
7. **Click:** "Deploy"
8. **Wait** ~2 minutes for deployment

---

## ✅ STEP 5: Verify Deployment (2 minutes)

Once deployed, Vercel will show you a URL like: `https://artisan-coffee-shop-xxx.vercel.app`

**Test these:**
- [ ] Visit the URL → Should redirect to /order
- [ ] Menu items are visible
- [ ] Can create a test order
- [ ] Switch to Admin → Menu Management works
- [ ] Order History displays

---

## 🎉 YOU'RE LIVE!

Your Artisan Coffee Shop is now deployed and accessible at:
```
https://your-project.vercel.app
```

### What's Next?

1. **Custom Domain (Optional):**
   - In Vercel: Project Settings → Domains
   - Add your custom domain

2. **Share with Team:**
   - Send them the Vercel URL
   - Train staff on order entry
   - Train admin on menu management

3. **Monitor:**
   - Vercel Dashboard shows analytics
   - Check logs if any issues arise

---

## 🆘 Troubleshooting

### "Database connection failed"
- Double-check your DATABASE_URL is correct
- Ensure you replaced `[YOUR-PASSWORD]` with actual password
- Try the "Session pooler" connection string instead of "Transaction"

### "Prisma migrate failed"
```powershell
# Reset and try again
npx prisma migrate reset
npx prisma migrate deploy
npm run prisma:seed
```

### "Build failed on Vercel"
- Check the build logs in Vercel dashboard
- Ensure DATABASE_URL is set in Vercel environment variables
- Try redeploying: Click "Redeploy" in Vercel

### "Menu items not showing"
- Database might not be seeded
- Run locally with production DATABASE_URL:
```powershell
$env:DATABASE_URL = "your-url"
npm run prisma:seed
```

---

## 📞 Need Help?

- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Prisma Docs:** https://www.prisma.io/docs

---

**Ready to start? Begin with Step 1 above! 🚀**
