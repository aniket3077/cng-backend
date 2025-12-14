# Fuel Bharat - Complete System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FUEL BHARAT PLATFORM                        │
│                  CNG/Fuel Station Finder & CRM System               │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Mobile App     │     │  Admin Web Panel │     │  Subscriber Web  │
│   (React Native) │     │   (React+Vite)   │     │   (Future)       │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   Next.js Backend API     │
                    │   (Port 3000)             │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   SQLite Database         │
                    │   (Prisma ORM)            │
                    └───────────────────────────┘
```

## User Types & Permissions

### 1. Customers (Mobile App Users)
- Find nearby fuel stations
- Filter by fuel type (CNG, Petrol, Diesel)
- View station details
- Create fuel orders
- Rate stations

### 2. Station Owners (Subscribers)
**Registration Required**
- Self-register via API
- Complete profile with KYC
- Register multiple stations
- Track station status
- Manage subscription plans
- Create support tickets
- Receive notifications

**Access:**
- `/api/auth/subscriber/*` - Authentication
- `/api/subscriber/*` - Owner operations

### 3. Admins (Platform Managers)
**Admin Panel Access**
- Manage all station owners
- Approve/reject stations
- Verify KYC documents
- Handle support tickets
- View analytics
- Manage subscriptions

**Access:**
- `/api/admin/*` - Admin operations
- Admin Web Panel (localhost:3001)

## Data Flow Diagrams

### Station Registration Workflow
```
Station Owner          Backend API           Admin              Database
     │                     │                   │                    │
     │─── Register ───────>│                   │                    │
     │                     │─── Create ───────>│                    │
     │<── Pending ─────────│                   │                    │
     │                     │                   │                    │
     │                     │<─── Review ───────│                    │
     │                     │─── Approve ──────>│                    │
     │<── Notification ────│                   │                    │
     │                     │─── Update ───────>│                    │
     │                     │                   │                    │
    Map shows station      │                   │                    │
```

### Support Ticket Flow
```
Owner                 Backend              Admin               Notification
  │                      │                   │                      │
  │─── Create Ticket ───>│                   │                      │
  │                      │─── Save ─────────>│                      │
  │                      │─── Notify ───────>│────── Email ────────>│
  │                      │                   │                      │
  │                      │<─── Reply ────────│                      │
  │<─── Notification ────│                   │                      │
  │                      │                   │                      │
  │─── Reply ───────────>│                   │                      │
  │                      │─── Update ───────>│                      │
```

## Database Schema

### Core Entities
```
User                 Admin               StationOwner
├── id               ├── id              ├── id
├── email            ├── email           ├── email
├── passwordHash     ├── passwordHash    ├── passwordHash
├── name             ├── name            ├── name
├── phone            ├── role            ├── phone
├── role             └── createdAt       ├── companyName
└── createdAt                            ├── gstNumber
                                         ├── panNumber
                                         ├── status
                                         ├── kycStatus
                                         └── stations[]

Station              Subscription        StationDocument
├── id               ├── id              ├── id
├── name             ├── stationId       ├── stationId
├── address          ├── planType        ├── documentType
├── city             ├── startDate       ├── fileUrl
├── lat/lng          ├── endDate         ├── status
├── fuelTypes        ├── amount          └── verifiedAt
├── ownerId          └── status
├── approvalStatus
└── isVerified

SupportTicket        TicketReply         Notification
├── id               ├── id              ├── id
├── ticketNumber     ├── ticketId        ├── ownerId
├── subject          ├── message         ├── title
├── category         ├── createdBy       ├── message
├── priority         └── createdAt       ├── type
├── status                               ├── isRead
├── ownerId                              └── createdAt
└── stationId

ActivityLog          Analytics           Lead
├── id               ├── id              ├── id
├── ownerId          ├── date            ├── companyName
├── action           ├── metric          ├── email
├── description      ├── value           ├── status
├── ipAddress        └── metadata        ├── leadSource
└── createdAt                            └── assignedTo
```

## API Endpoints Map

### Public APIs (No Auth Required)
```
POST /api/auth/signup              - Customer signup
POST /api/auth/login               - Customer login
POST /api/auth/subscriber/signup   - Station owner signup
POST /api/auth/subscriber/login    - Station owner login
GET  /api/stations                 - List public stations
GET  /api/stations/search          - Search stations
```

### Subscriber APIs (Owner Auth Required)
```
GET    /api/subscriber/profile       - Get profile
POST   /api/subscriber/profile       - Update profile
GET    /api/subscriber/stations      - List owned stations
POST   /api/subscriber/stations      - Register new station
PUT    /api/subscriber/stations?id=  - Update station
GET    /api/subscriber/support       - List support tickets
POST   /api/subscriber/support       - Create ticket
PUT    /api/subscriber/support?id=   - Reply to ticket
```

### Admin APIs (Admin Auth Required)
```
POST   /api/admin/login              - Admin login
GET    /api/admin/owners             - List station owners
PUT    /api/admin/owners?id=         - Update owner status
DELETE /api/admin/owners?id=         - Suspend owner
GET    /api/admin/stations           - List all stations
POST   /api/admin/stations           - Create station
PUT    /api/admin/stations           - Update/approve station
DELETE /api/admin/stations?id=       - Delete station
```

## Status Management

### Station Owner Status
- `pending` → Awaiting admin approval
- `active` → Can add stations
- `suspended` → Account suspended
- `rejected` → Registration rejected

### Station Approval Status
- `pending` → Awaiting review
- `approved` → Live on map
- `rejected` → Rejected with reason

### KYC Status
- `pending` → Documents not verified
- `verified` → KYC approved
- `rejected` → KYC rejected with reason

### Support Ticket Status
- `open` → New ticket
- `in_progress` → Being handled
- `resolved` → Issue fixed
- `closed` → Ticket closed

## Notification Types

### Station Owners Receive:
- Welcome message on signup
- Station submitted confirmation
- Station approval/rejection
- Support ticket responses
- Subscription expiry alerts
- KYC verification updates

### Admins Receive:
- New station registration
- New support ticket
- Owner signup alerts
- System alerts

## Integration Points

### Mobile App (React Native)
- View stations on map
- Filter by fuel type
- Create orders
- View station details
- Sign up as customer

### Admin Web Panel (React + Vite)
- Dashboard with metrics
- Station management
- Owner management
- Support ticket handling
- Analytics views

### Subscriber Portal (Future)
- Self-service registration
- Station management UI
- Document upload
- Support ticket creation
- Analytics dashboard

## Security Architecture

### Authentication
- JWT tokens (30-day expiry)
- Separate tokens for admins/owners
- bcrypt password hashing (10 rounds)

### Authorization
- Role-based access control
- Token verification middleware
- Owner can only access own data
- Admin has full access

### Audit Trail
- All actions logged to ActivityLog
- IP address tracking
- User agent logging
- Timestamp recording

## Scalability Considerations

### Current Setup (Phase 1)
- SQLite database (development)
- Single server deployment
- File-based document storage

### Future Enhancements (Phase 2)
- PostgreSQL/MySQL (production)
- Redis caching
- S3 for document storage
- Load balancing
- Microservices architecture

## Deployment Architecture

```
Production Environment:

┌────────────────────────────────────────────┐
│           Load Balancer (Nginx)            │
└──────────────┬─────────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼──────┐ ┌─────▼──────┐
│  Next.js    │ │  Next.js   │
│  Instance 1 │ │  Instance 2│
└──────┬──────┘ └─────┬──────┘
       │               │
       └───────┬───────┘
               │
      ┌────────▼────────┐
      │   PostgreSQL    │
      │   (RDS/Cloud)   │
      └─────────────────┘

      ┌─────────────────┐
      │   Redis Cache   │
      └─────────────────┘

      ┌─────────────────┐
      │   AWS S3        │
      │   (Documents)   │
      └─────────────────┘
```

## Key Features Summary

✅ **Station Owner Self-Service**
  - Registration and onboarding
  - Station management
  - Support system
  - Notifications

✅ **Admin CRM Dashboard**
  - Owner management
  - Station approval workflow
  - Support ticket handling
  - Analytics and reporting

✅ **Security & Compliance**
  - JWT authentication
  - Role-based access
  - Activity logging
  - KYC verification

✅ **Scalable Architecture**
  - RESTful APIs
  - Database normalization
  - Modular design
  - Well-documented

---

**Fuel Bharat** - Complete CNG/Fuel Station Management Platform
