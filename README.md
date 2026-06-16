# CNG Bharat Backend API

API backend for CNG Bharat - CNG Station Finder & Management System

## Tech Stack

- **Framework**: Next.js 14 (App Router - API Routes Only)
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Authentication**: JWT
- **Deployment**: Vercel

## Project Structure

```
backend/
├── app/
│   └── api/              # API Routes
│       ├── admin/        # Admin endpoints
│       │   ├── login/
│       │   ├── owners/   # Manage station owners
│       │   ├── stations/ # Manage stations
│       │   └── support/  # Support tickets
│       ├── auth/         # Authentication
│       │   ├── login/
│       │   ├── signup/
│       │   └── subscriber/
│       ├── places/       # Google Maps integration
│       ├── routes/       # Route planning
│       ├── stations/     # Public station data
│       ├── subscriber/   # Subscriber endpoints
│       │   ├── cng/      # CNG availability updates
│       │   ├── profile/  # Profile management
│       │   ├── stations/ # Station management
│       │   └── support/  # Support tickets
│       └── suggest-pumps/# Station recommendations
├── lib/
│   ├── api-utils.ts     # API utilities & CORS
│   ├── auth.ts          # JWT helpers
│   ├── env.ts           # Environment validation
│   ├── prisma.ts        # Prisma client
│   └── types.ts         # TypeScript types
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Database seeding
├── scripts/
│   ├── create-admin.ts  # Create admin user
│   ├── drop-unused-tables.ts
│   └── enable-rls.ts    # Enable Supabase RLS
├── .env.example         # Environment variables template
├── package.json
└── VERCEL_DEPLOYMENT.md # Deployment guide
```

## Database Models

- **Admin**: Admin users with role-based access
- **StationOwner**: Station owners/subscribers
- **Station**: CNG stations with location & availability
- **Subscription**: Subscription plans (free/basic/premium)
- **StationDocument**: KYC and verification documents
- **SupportTicket**: Customer support system
- **TicketReply**: Support ticket replies
- **Notification**: User notifications
- **ActivityLog**: Activity tracking

## API Endpoints

### Public Routes
- `GET /api/stations` - List all approved stations
- `POST /api/suggest-pumps` - Get station recommendations
- `GET /api/places/autocomplete` - Address autocomplete
- `POST /api/routes/plan` - Plan route with CNG stations

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User signup
- `POST /api/auth/subscriber/login` - Subscriber login
- `POST /api/auth/subscriber/signup` - Subscriber signup
- `POST /api/admin/login` - Admin login

### Subscriber Routes (Authenticated)
- `GET/PUT /api/subscriber/profile` - Profile management
- `GET/PUT /api/subscriber/cng` - Update CNG availability
- `GET/POST /api/subscriber/stations` - Manage stations
- `GET/POST /api/subscriber/support` - Support tickets

### Admin Routes (Authenticated)
- `GET /api/admin/owners` - List station owners
- `GET/POST/PUT/DELETE /api/admin/stations` - Manage stations
- `GET/PUT/POST /api/admin/support` - Manage support tickets

## Environment Variables

Required in production (`.env`):

```env
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1&connect_timeout=30"
DIRECT_URL="postgresql://...:5432/postgres?connect_timeout=30"
JWT_SECRET="your-strong-secret"
NODE_ENV="production"
ALLOWED_ORIGINS="https://your-frontend.com"
GOOGLE_MAPS_API_KEY="your-key"
```

## Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Push schema to database
npx prisma db push

# Create admin user
npx tsx scripts/create-admin.ts

# Enable RLS (for Supabase)
npx tsx scripts/enable-rls.ts

# Start development server
npm run dev
```

Server runs on http://localhost:5000

## Deployment to AWS EC2

This backend is configured for deployment on an AWS EC2 instance (Ubuntu) using **PM2** as the process manager.

### Steps to Deploy:

1. **Connect to your EC2 Instance**:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

2. **Install Node.js & PM2**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs && sudo npm install -g pm2
   ```

3. **Clone the repository & Install dependencies**:
   ```bash
   git clone <YOUR_GIT_REPO_URL> cng-backend
   cd cng-backend
   npm install
   ```

4. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```bash
   nano .env
   ```
   Add your database credentials and configurations:
   ```env
   DATABASE_URL="postgresql://cngbharat2025:99228761@cngbharat.covye08wayvz.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require"
   DIRECT_URL="postgresql://cngbharat2025:99228761@cngbharat.covye08wayvz.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require"
   JWT_SECRET="your-strong-secret"
   NODE_ENV="production"
   PORT=5000
   ```

5. **Build and Run with PM2**:
   ```bash
   npm run build
   pm2 start ecosystem.config.js --env production
   ```

6. **Open Port 5000 in Security Group**:
   Make sure to allow inbound TCP traffic on port `5000` from your frontend client origin in the AWS Security Group for your EC2 instance.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npx prisma studio` - Open Prisma Studio (database GUI)
- `npx tsx scripts/create-admin.ts` - Create admin user
- `npx tsx scripts/enable-rls.ts` - Enable Row Level Security

## Default Admin Credentials

After running `create-admin.ts`:
- **Email**: admin@cngbharat.com
- **Password**: Admin@123

⚠️ **Change password after first login!**

## Security Features

- ✅ JWT-based authentication
- ✅ Row Level Security (RLS) enabled
- ✅ CORS configured
- ✅ Password hashing with bcrypt
- ✅ Environment variable validation
- ✅ Production-ready JWT validation

## License

Proprietary - CNG Bharat
