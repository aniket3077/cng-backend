# Fuel Bharat - CNG/Fuel Station Finder & CRM System

## Overview
Fuel Bharat is a comprehensive platform for managing fuel stations (CNG, Petrol, Diesel) with a complete CRM system for station owners and administrators.

## System Architecture

### User Types
1. **Customers** - Mobile app users who find and order from fuel stations
2. **Station Owners** - Business owners who register their stations
3. **Admins** - Platform administrators who manage the entire system

## Station Owner (Subscriber) Features

### 1. Registration & Authentication
- **Signup**: `/api/auth/subscriber/signup`
  - Register with name, email, phone, password
  - Optional: company name, GST number, PAN number
  - Automatic account creation with pending status
  
- **Login**: `/api/auth/subscriber/login`
  - JWT-based authentication (30-day validity)
  - Returns profile with station details
  - Tracks last login timestamp

### 2. Station Management
- **Register Station**: `POST /api/subscriber/stations`
  - Submit station details for admin approval
  - Required: name, address, city, state, lat/lng, fuel types
  - Optional: phone, opening hours, amenities
  - Status: pending → approved → published on map
  
- **List Stations**: `GET /api/subscriber/stations`
  - View all owned stations
  - Includes subscription status, document verification
  - Shows order count and support tickets
  
- **Update Station**: `PUT /api/subscriber/stations?id={id}`
  - Update station details
  - Requires re-approval for major changes

### 3. Profile Management
- **Get Profile**: `GET /api/subscriber/profile`
  - View complete profile information
  - KYC status and verification details
  
- **Update Profile**: `POST /api/subscriber/profile`
  - Update personal and company details
  - Track profile completion percentage
  - Onboarding step progression

### 4. Support System
- **Create Ticket**: `POST /api/subscriber/support`
  - Categories: technical, billing, station_issue, general
  - Priority levels: low, medium, high, urgent
  - Auto-generated ticket numbers: FBT-YYYYMMDD-XXXX
  
- **View Tickets**: `GET /api/subscriber/support`
  - Filter by status: open, in_progress, resolved, closed
  
- **Reply to Ticket**: `PUT /api/subscriber/support?id={id}`
  - Add messages to existing tickets
  - Real-time communication with support team

### 5. Notifications
- Welcome messages on signup
- Station approval/rejection notifications
- Support ticket updates
- Subscription reminders
- KYC verification status

## Admin CRM Features

### 1. Station Owner Management
- **List Owners**: `GET /api/admin/owners`
  - Pagination and filtering
  - Search by name, email, phone, company
  - Filter by status (pending, active, suspended)
  - Filter by KYC status
  
- **Update Owner**: `PUT /api/admin/owners?id={id}`
  - Approve/reject accounts
  - Verify KYC documents
  - Suspend accounts
  - Update verification status
  
- **Delete Owner**: `DELETE /api/admin/owners?id={id}`
  - Soft delete (suspend account)

### 2. Station Approval Workflow
Admins review and approve stations via existing station management APIs with new approval status field:
- `pending` - Awaiting admin review
- `approved` - Approved and visible on map
- `rejected` - Rejected with reason

### 3. Support Ticket Management
- View all support tickets
- Assign tickets to admins
- Update ticket status
- Add internal notes
- Resolve and close tickets

### 4. Analytics & Reporting
- Daily signup tracking
- Station registration metrics
- Active stations count
- Support ticket statistics
- Lead conversion rates

## Database Models

### Core Models
- **StationOwner** - Subscriber accounts
- **Station** - Fuel stations with owner relationship
- **Subscription** - Station subscription plans
- **StationDocument** - KYC and station documents
- **SupportTicket** - Customer support tickets
- **TicketReply** - Ticket conversation threads
- **Notification** - Push notifications
- **ActivityLog** - Audit trail for all actions
- **Lead** - Business leads and inquiries
- **Analytics** - Metrics and KPIs

## API Endpoints

### Station Owner (Subscriber) APIs
```
POST   /api/auth/subscriber/signup      - Register new station owner
POST   /api/auth/subscriber/login       - Login station owner
GET    /api/subscriber/profile          - Get profile
POST   /api/subscriber/profile          - Update profile
GET    /api/subscriber/stations         - List owned stations
POST   /api/subscriber/stations         - Register new station
PUT    /api/subscriber/stations?id=     - Update station
GET    /api/subscriber/support          - List support tickets
POST   /api/subscriber/support          - Create support ticket
PUT    /api/subscriber/support?id=      - Reply to ticket
```

### Admin CRM APIs
```
GET    /api/admin/owners                - List all station owners
PUT    /api/admin/owners?id=            - Update owner status/KYC
DELETE /api/admin/owners?id=            - Suspend owner account
GET    /api/admin/stations              - List all stations (existing)
PUT    /api/admin/stations              - Approve/reject stations (existing)
```

## Setup Instructions

### 1. Database Migration
```powershell
cd backend
.\setup-crm.ps1
```

Or manually:
```bash
npx prisma generate
npx prisma db push
```

### 2. Environment Variables
Add to `.env`:
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key-change-in-production"
```

### 3. Start Backend
```bash
cd backend
npm run dev
```

### 4. Create Admin User (if not exists)
```bash
npm run create-admin
```

## Testing the APIs

### 1. Register Station Owner
```bash
curl -X POST http://localhost:3000/api/auth/subscriber/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+919876543210",
    "password": "password123",
    "companyName": "ABC Fuels Pvt Ltd",
    "gstNumber": "29ABCDE1234F1Z5"
  }'
```

### 2. Login Station Owner
```bash
curl -X POST http://localhost:3000/api/auth/subscriber/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### 3. Register Station (requires auth token)
```bash
curl -X POST http://localhost:3000/api/subscriber/stations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "ABC Fuel Station",
    "address": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "postalCode": "400001",
    "lat": 19.0760,
    "lng": 72.8777,
    "fuelTypes": "Petrol,Diesel,CNG",
    "phone": "+912212345678",
    "openingHours": "24/7",
    "amenities": "Restroom,ATM,Air"
  }'
```

### 4. Create Support Ticket
```bash
curl -X POST http://localhost:3000/api/subscriber/support \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "subject": "Station Not Approved",
    "description": "My station has been pending approval for 3 days",
    "category": "general",
    "priority": "medium"
  }'
```

## Workflow

### Station Owner Journey
1. **Sign Up** → Account created (status: pending)
2. **Complete Profile** → Add company details, KYC documents
3. **Register Station** → Submit station for approval
4. **Admin Reviews** → Admin approves/rejects station
5. **Station Live** → Station appears on mobile app map
6. **Manage Operations** → Update station, handle support tickets
7. **Subscription** → Upgrade to premium plans for better visibility

### Admin Workflow
1. **Review New Owners** → Approve/reject registrations
2. **Verify KYC** → Check documents, verify identity
3. **Approve Stations** → Review and approve station listings
4. **Handle Support** → Respond to tickets, resolve issues
5. **Analytics** → Monitor growth, track metrics
6. **Lead Management** → Convert leads to station owners

## Key Features

### Security
- JWT-based authentication with 30-day expiry
- Password hashing with bcrypt
- Role-based access control (owner/admin)
- Activity logging for audit trail

### Notifications
- Real-time push notifications
- Email notifications (future)
- SMS alerts (future)

### Analytics
- Daily metrics tracking
- Conversion funnel analysis
- Support ticket SLA monitoring
- Revenue tracking per subscription tier

### CRM Capabilities
- Lead management and conversion
- Customer support ticketing
- Activity tracking and logging
- Automated notifications
- Profile completion tracking
- Document management
- Multi-stage approval workflow

## Future Enhancements
- [ ] Document upload and storage (AWS S3)
- [ ] Email verification
- [ ] SMS OTP verification
- [ ] Payment gateway integration
- [ ] Analytics dashboard
- [ ] Mobile app for station owners
- [ ] Bulk station import
- [ ] API rate limiting
- [ ] Advanced search and filters
- [ ] Reporting and exports

## Support
For technical support or questions, create a support ticket through the API or contact admin@fuelbharat.com

---
**Fuel Bharat** - Making fuel station management simple and efficient
