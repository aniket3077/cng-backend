# Vercel Deployment Guide for CNG Bharat Backend

## Prerequisites
1. GitHub repository with backend code
2. Vercel account (vercel.com)
3. PostgreSQL database (Neon/Vercel Postgres recommended)

## Step 1: Create PostgreSQL Database

### Option A: Neon (Recommended - Free Tier)
1. Go to https://neon.tech
2. Sign up and create a new project: "cng-bharat"
3. Copy connection strings:
   - **Pooled connection** (for DATABASE_URL)
   - **Direct connection** (for DIRECT_URL)

### Option B: Vercel Postgres
1. Go to Vercel Dashboard → Storage → Create → Postgres
2. Create database: "cng-bharat-db"
3. Copy connection strings from environment variables section

## Step 2: Configure Vercel Environment Variables

In your Vercel project settings → Environment Variables, add:

```
DATABASE_URL=postgresql://user:password@host.region.neon.tech:5432/cng_bharat?sslmode=require
DIRECT_URL=postgresql://user:password@host.region.neon.tech:5432/cng_bharat?sslmode=require
JWT_SECRET=cng-bharat-2025-secure-jwt-k9m8n7o6p5q4r3s2t1u0v9w8x7y6z5a4b3c2d1e0f9g8h7i6j5
ALLOWED_ORIGINS=https://your-admin-web.vercel.app,http://localhost:3001
GOOGLE_MAPS_API_KEY=your_key_here
NODE_ENV=production
```

## Step 3: Deploy to Vercel

### Via GitHub (Automatic)
1. Push code to GitHub:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. Go to Vercel Dashboard → Add New Project
3. Import your GitHub repository
4. Vercel will auto-detect Next.js and deploy

### Via CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

## Step 4: Run Database Migrations

After first successful deployment:

```bash
# Pull environment variables locally
vercel env pull .env.production

# Run migrations on production database
DATABASE_URL="your-production-url" npx prisma migrate deploy

# Seed initial data (admin user)
DATABASE_URL="your-production-url" npx prisma db seed
```

Or use Vercel CLI:
```bash
vercel exec -- npx prisma migrate deploy
vercel exec -- npx prisma db seed
```

## Step 5: Create Admin User

Run this locally with production DATABASE_URL:
```bash
DATABASE_URL="your-production-url" npx tsx scripts/create-admin.ts
```

Or manually in Prisma Studio:
```bash
DATABASE_URL="your-production-url" npx prisma studio
```

## Step 6: Update Frontend URLs

### Admin Web (.env)
```
VITE_API_URL=https://your-backend.vercel.app
```

### Mobile App (.env)
```
EXPO_PUBLIC_API_URL=https://your-backend.vercel.app
```

## Troubleshooting

### Build fails with Prisma error
- Ensure `postinstall` script is in package.json: `"postinstall": "prisma generate"`
- Check DATABASE_URL and DIRECT_URL are set in Vercel environment variables

### Database connection fails
- Verify connection strings are correct
- Ensure `sslmode=require` is in DATABASE_URL
- Check database is accessible from Vercel's region

### CORS errors
- Add your frontend URLs to ALLOWED_ORIGINS
- Ensure corsHeaders in api-utils.ts has `'Access-Control-Allow-Origin': '*'`

## Monitoring

- **Logs**: Vercel Dashboard → Your Project → Logs
- **Database**: Neon Dashboard → Monitoring
- **Errors**: Check Vercel Function Logs for API errors

## Local Development with Production Database

```bash
# Pull production env vars
vercel env pull .env.production

# Use production database locally
DATABASE_URL="your-production-url" npm run dev
```

## Production Checklist

- [ ] Database created and accessible
- [ ] All environment variables set in Vercel
- [ ] Migrations run successfully
- [ ] Admin user created
- [ ] Frontend updated with production API URL
- [ ] CORS configured for frontend domains
- [ ] Test API endpoints work
- [ ] Monitor logs for errors
