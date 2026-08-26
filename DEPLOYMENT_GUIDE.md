# 🚀 Quick Deployment Guide - Artisan Coffee Shop

## Prerequisites Checklist

Before deploying, ensure you have:
- ✅ A production PostgreSQL database (see options below)
- ✅ A hosting platform account (Vercel, Railway, etc.)
- ✅ Git repository connected to your hosting platform

---

## 🎯 Recommended: Vercel + Supabase (Easiest)

### Step 1: Set Up Database (5 minutes)

1. **Create Supabase Account**
   - Visit https://supabase.com/
   - Click "Start your project"
   - Create a new project

2. **Get Database URL**
   - Go to Project Settings → Database
   - Copy the "Connection String" (Transaction mode recommended)
   - It looks like: `postgresql://postgres.[ref]:[password]@[host]/postgres`

### Step 2: Deploy to Vercel (5 minutes)

1. **Import Project**
   ```bash
   # Visit https://vercel.com/
   # Click "Add New" → "Project"
   # Import your Git repository
   ```

2. **Configure Environment Variables**
   - In project settings, add:
     - Name: `DATABASE_URL`
     - Value: (paste your Supabase connection string)

3. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (~2 minutes)

### Step 3: Initialize Database (2 minutes)

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your project
vercel link

# Run migrations in production
vercel env pull .env.production
npm run prisma:generate
DATABASE_URL="$(grep DATABASE_URL .env.production | cut -d '=' -f2)" npx prisma migrate deploy

# Seed menu data
DATABASE_URL="$(grep DATABASE_URL .env.production | cut -d '=' -f2)" npm run prisma:seed
```

**Done!** Your app is live at `https://your-project.vercel.app`

---

## 🚂 Alternative: Railway (All-in-One)

### Step 1: Deploy on Railway (3 minutes)

1. **Create Railway Account**
   - Visit https://railway.app/
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Add PostgreSQL**
   - In your project, click "New"
   - Select "Database" → "Add PostgreSQL"
   - Railway automatically connects DATABASE_URL

### Step 2: Configure Build Settings

Railway auto-detects Next.js, but verify:
- **Build Command:** `npm run build`
- **Start Command:** `npm start`

### Step 3: Initialize Database

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway link

# Run migrations
railway run npm run prisma:generate
railway run npx prisma migrate deploy

# Seed data
railway run npm run prisma:seed
```

**Done!** Your app is live at `https://your-project.up.railway.app`

---

## 🐳 Docker Deployment (Advanced)

### Create Dockerfile

```dockerfile
FROM node:24-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
```

### Update next.config.mjs

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

### Build and Run

```bash
# Build image
docker build -t artisan-coffee-shop .

# Run with database URL
docker run -p 3000:3000 -e DATABASE_URL="your-db-url" artisan-coffee-shop

# Or use docker-compose
```

---

## 🔧 Post-Deployment Steps

### 1. Verify Deployment

Visit your deployed URL and check:
- [ ] Home page redirects to `/order`
- [ ] Can view menu items
- [ ] Can create an order
- [ ] Admin menu management works
- [ ] Order history displays

### 2. Monitor Application

Set up monitoring (optional but recommended):
```bash
# Add Sentry for error tracking
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

### 3. Set Up Custom Domain (Optional)

**Vercel:**
- Project Settings → Domains → Add Domain

**Railway:**
- Project Settings → Domains → Add Custom Domain

### 4. Enable HTTPS

Both Vercel and Railway provide automatic HTTPS.
For custom domains, SSL certificates are provisioned automatically.

---

## 🔥 Troubleshooting

### Build Fails

**Error:** "Prisma Client not generated"
```bash
# Add to package.json scripts
"postinstall": "prisma generate"
```

**Error:** "Cannot find module @prisma/client"
```bash
# Ensure prisma generate runs before build
npm run prisma:generate
npm run build
```

### Database Connection Issues

**Error:** "Can't reach database server"
- Verify DATABASE_URL is correct
- Check database allows connections from your hosting IP
- For Supabase, use "Connection Pooling" mode URL

**Error:** "Connection pool timeout"
- Use connection pooling URL (pgbouncer)
- Reduce connection pool size in Prisma schema

### Runtime Errors

**Error:** "NEXT_RUNTIME is not defined"
- Ensure Node.js version is 18+
- Clear `.next` folder and rebuild

**Orders not showing:**
- Check time zone (app uses Asia/Manila)
- Verify data exists in database
- Check browser console for API errors

### Performance Issues

**Slow page loads:**
- Enable Vercel Analytics
- Check database query performance
- Consider adding Redis cache
- Review Next.js Image optimization

---

## 📊 Production Checklist

Before going live with real users:

### Security
- [ ] Database backups configured
- [ ] Access restricted to internal network or VPN
- [ ] Environment variables properly set
- [ ] No sensitive data in logs

### Performance
- [ ] Tested with realistic data volumes
- [ ] Database indexes verified
- [ ] API response times acceptable
- [ ] Mobile performance tested

### Reliability
- [ ] Error tracking enabled
- [ ] Monitoring/alerting configured
- [ ] Backup/restore procedure documented
- [ ] Rollback plan prepared

### Training
- [ ] Staff trained on order entry
- [ ] Admin trained on menu management
- [ ] Support contact documented
- [ ] Common issues documented

---

## 🆘 Getting Help

1. **Check the logs:**
   - Vercel: Project → Deployments → View Function Logs
   - Railway: Project → Deployments → View Logs

2. **Database issues:**
   - Check Prisma Studio: `npx prisma studio`
   - Review migrations: `npx prisma migrate status`

3. **Application errors:**
   - Check browser console (F12)
   - Review Network tab for failed API calls

---

## 🎉 Success!

Once deployed, your Artisan Coffee Shop app will be:
- ✅ Accessible 24/7
- ✅ Mobile-responsive
- ✅ Backed by reliable database
- ✅ Ready for production use

**Next Steps:**
- Train your staff
- Monitor initial usage
- Gather feedback
- Plan future enhancements

---

**Questions?** Review the main README.md or DEPLOYMENT_CHECKLIST.md for more details.
