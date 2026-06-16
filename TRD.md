# Technical Requirements Document

## CNG Bharat Backend API

### 1. Purpose
This document describes the technical design and implementation requirements for the CNG Bharat backend. The service is an API-only application that supports CNG station discovery, owner onboarding, customer accounts, subscriptions, payments, support, and administrative operations.

### 2. System Overview
- Runtime: Next.js 14 App Router used as an API server.
- API style: JSON over HTTP with route handlers under `app/api`.
- Database: PostgreSQL.
- ORM: Prisma.
- Authentication: JWT access tokens plus refresh tokens.
- Deployment target: Vercel or a comparable serverless Node.js host.
- External services: Razorpay, Google Maps APIs, Resend, Redis.

### 3. High-Level Architecture
The backend is organized into five layers:
- Request layer: route handlers in `app/api/*/route.ts`.
- Cross-cutting layer: middleware for CORS, auth helpers, rate limiting, and request security.
- Domain layer: station discovery, owner workflows, customer workflows, support, subscriptions, payments, and referrals.
- Persistence layer: Prisma models backed by PostgreSQL.
- Integration layer: payment gateway, email delivery, maps, and token blacklist storage.

### 4. Core Technical Constraints
- The application must behave as an API-only backend; no UI rendering is part of the system scope.
- All authenticated operations must be role-aware and reject unauthorized requests.
- Public routes must remain consumable from approved frontend origins only.
- The backend must support serverless-style execution without relying on in-process session state.
- Sensitive secrets must be injected through environment variables, never hardcoded.

### 5. Runtime and Deployment Requirements
- Node.js 20.x is the supported runtime.
- Prisma client generation must occur during install or build.
- Production deployment must use pooled PostgreSQL access for serverless execution and a direct database URL for maintenance tasks.
- The service must expose a health endpoint for readiness checks.
- The application must tolerate stateless horizontal scaling.

### 6. API Design Requirements
- API responses should follow a consistent JSON envelope with `success`, `data`, `error`, and optional `pagination` fields.
- Errors must return appropriate HTTP status codes and machine-readable failure text.
- Pagination should be standardized through page, limit, total, and totalPages metadata.
- Route handlers should enforce CORS at the middleware boundary.
- Route handlers should parse and validate request payloads before touching persistence or integrations.

### 7. Authentication and Authorization
- JWT access tokens are required for protected routes.
- Refresh tokens must support session renewal without re-entering credentials.
- Logout must invalidate tokens through a blacklist mechanism.
- Role-based access must distinguish at least customer, station owner, and admin flows.
- Admin routes must reject non-admin identities even if the request is otherwise authenticated.
- Tokens may be accepted from the Authorization header or secure cookie-based clients.

### 8. Security Requirements
- Passwords must be hashed before storage.
- Environment variables must be validated at startup.
- CORS must be restricted to configured allowed origins.
- Rate limiting must be available for sensitive endpoints such as login, OTP, and payment callbacks.
- Security logging should capture suspicious auth and operational events.
- Database access must use parameterized ORM queries only.

### 9. Data Model Requirements
#### User and Customer Data
- Store customer identity, credentials, phone, subscription state, referral metadata, earnings, and payout-related information.
- Store vehicles per customer with searchable plate data.
- Support payout methods and payout OTP records.

#### Station Data
- Store station identity, address, geographic coordinates, fuel types, amenities, verification status, approval status, and partner/subscription state.
- Store live-ish operational data such as CNG availability, quantity, crowd level, crowd count, and estimated wait time.
- Support ownership linkage to a station owner.

#### Owner Data
- Store owner identity, company details, KYC fields, verification state, onboarding step, subscription state, and last login timestamp.
- Support owner notifications, activity logs, payment history, and station ownership.

#### Support Data
- Store support tickets with unique ticket numbers, priority, status, assignee, resolution metadata, and replies.
- Support both internal and external replies.

#### Subscription and Payment Data
- Store subscription plans, effective dates, status, and feature metadata.
- Track payment history with Razorpay order/payment/signature fields and subscription lifecycle timestamps.

#### Referral and Payout Data
- Store referral relationships, rewards, earnings, payout requests, and risk flags.
- Support commission tracking, payout status, and fraud-related metadata.

### 10. Domain Modules
#### Public Discovery
- List approved stations.
- Search stations by location and text filters.
- Suggest stations or pumps based on user input.
- Plan routes that account for CNG stops.
- Integrate place autocomplete and place details lookup.

#### Customer Module
- Customer login, signup, logout, token refresh, password reset, and verification.
- Customer profile and vehicle management.
- Referral tracking and payout request workflows.

#### Owner Module
- Owner signup, login, profile management, and onboarding.
- Station creation and management.
- CNG and crowd status updates.
- Subscription initiation and completion.
- Payment history and support workflows.

#### Admin Module
- Admin login and logout.
- Review and manage owners.
- Review and manage stations.
- Manage support queues and moderation tasks.
- Access user oversight and administrative reporting endpoints.

#### Payment Module
- Create Razorpay orders for subscription or payout-related flows.
- Verify payment signatures and persist transaction outcomes.
- Handle webhook delivery from Razorpay.

### 11. External Integration Requirements
#### PostgreSQL / Prisma
- Prisma schema is the source of truth for persistence.
- Migrations and schema pushes must be supported for local and production workflows.

#### Razorpay
- Use Razorpay for payment order creation, verification, and webhook handling.
- Persist order IDs, payment IDs, signatures, failure reasons, and status transitions.

#### Google Maps
- Use Google Maps APIs for autocomplete, place details, and route-related assistance.
- The backend must degrade gracefully if the maps key is missing or external requests fail.

#### Email Delivery
- Use an email provider for verification, password reset, support, and operational notifications.

#### Redis
- Use Redis for token blacklisting and any short-lived security or rate-limit state that must survive stateless execution.

### 12. Data Access and Integrity Requirements
- Foreign keys must preserve referential integrity for stations, owners, support tickets, referrals, vehicles, and payouts.
- Deletes should cascade only where business rules allow it.
- Indexed columns must support common access patterns such as email lookup, station geospatial search, owner lookup, support filtering, and payment history lookup.
- Timestamps must be tracked for create/update freshness and status changes.

### 13. Observability Requirements
- Log important authentication, payment, moderation, and support events.
- Capture enough metadata to troubleshoot failed payments, invalid tokens, and suspicious referral or payout activity.
- Provide a health endpoint for deployment monitoring.

### 14. Non-Functional Requirements
- Performance: public discovery endpoints should stay responsive for mobile clients.
- Availability: the system should remain usable when non-critical integrations are degraded.
- Scalability: the architecture must support growth in stations, owners, and public lookups without redesign.
- Maintainability: route handlers and shared libraries should keep business logic separated from transport concerns.
- Security: secrets, auth, and payment handling must follow production-safe practices.

### 15. Environment Variables
Required at minimum:
- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `ALLOWED_ORIGINS`

Optional but supported:
- `GOOGLE_MAPS_API_KEY`
- `RAZORPAY_WEBHOOK_SECRET`
- `NODE_ENV`
- `PORT`

### 16. Build and Local Development Requirements
- Install dependencies with `npm install`.
- Generate Prisma client automatically during install or build.
- Push schema changes locally with Prisma before testing API routes.
- Start the development server on port 5000 by default.
- Provide scripts for database seed, admin bootstrap, and local Prisma Studio access.

### 17. Validation Requirements
- Startup must fail fast if required environment variables are missing.
- Protected routes must return authorization errors when no valid token is present.
- Admin-only routes must reject non-admin roles.
- Payment verification must reject invalid Razorpay signatures.
- CORS preflight must return the correct headers for approved origins and block unapproved origins.

### 18. Acceptance Criteria
- A stateless deployment can serve authenticated and public API traffic reliably.
- Customers, owners, and admins can use their respective route sets with proper authorization.
- Station discovery, route planning, payments, support, and profile workflows persist data correctly in PostgreSQL.
- External service failures do not crash the entire API surface.
- The backend can be rebuilt and redeployed from source with only environment configuration and database access.

### 19. Risks and Technical Debt
- External APIs can introduce latency or partial outages.
- Referral and payout fraud controls require ongoing tightening as usage grows.
- Station availability data can become stale if owner updates are infrequent.
- Serverless constraints require careful handling of database connections and shared state.

### 20. Open Implementation Notes
- Keep shared response and auth helpers reusable across route handlers.
- Prefer additive schema changes over destructive changes.
- Treat payment, payout, and token invalidation logic as high-risk paths that need extra test coverage.