# Vercel Deployment Guide

This backend deploys cleanly to Vercel once the runtime and database settings match the serverless Prisma/Supabase setup.

## What changed in this repo

- Vercel now resolves Node.js from `package.json`, pinned to `20.x`.
- Login routes return a `503` instead of a generic `500` when Prisma cannot reach the database or the auth tables are missing.
- `.env.example` now includes a serverless-safe Supabase connection string template.

## Required Vercel settings

Set these environment variables in the Vercel project before deploying:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&connect_timeout=30
DIRECT_URL=postgresql://postgres.PROJECT_REF:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?connect_timeout=30
JWT_SECRET=use-a-long-random-secret-at-least-32-characters
NODE_ENV=production
ALLOWED_ORIGINS=https://cngmain.netlify.app,https://cngbharat.com,https://www.cngbharat.com
NEXT_PUBLIC_API_URL=https://cng-backend.vercel.app
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-razorpay-webhook-secret
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=noreply@your-domain.example
```

## First production deploy

1. Push the backend to the branch connected to Vercel.
2. Confirm the Vercel deployment is using Node.js `20.x`.
3. After the deployment is live, apply the Prisma schema to production:

```bash
npx prisma db push
```

4. Create the admin record used by `/api/auth/admin/login`:

```bash
npx tsx scripts/create-admin.ts
```

5. If you use Supabase RLS in production, run:

```bash
npx tsx scripts/enable-rls.ts
```

## If admin login still fails

- A `503` response means Prisma could not reach the database or the expected tables are not ready yet.
- A `401` response means the admin user does not exist yet or the password is wrong.
- For Supabase pooler issues, keep `pgbouncer=true` and start with `connection_limit=1`.
- If Prisma reports that the `Admin` table does not exist, run `npx prisma db push` against the production database and redeploy once.
