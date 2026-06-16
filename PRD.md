# Product Requirements Document

## CNG Bharat Backend API

### 1. Overview
CNG Bharat is a backend API for a CNG station discovery, station-owner onboarding, customer account management, and subscription-led station visibility platform. The service powers public search, route planning, station updates, owner workflows, admin operations, payments, support, and notification flows.

### 2. Problem Statement
Drivers need a reliable way to find nearby CNG stations, check availability, and plan routes with CNG stops. Station owners need a way to manage station listings, update availability, handle subscriptions, and complete onboarding. Administrators need tools to verify listings, manage users, handle support, and enforce platform rules.

### 3. Goals
- Help customers find approved and relevant CNG stations quickly.
- Help station owners maintain accurate station, crowd, and subscription data.
- Give admins clear control over moderation, support, and account management.
- Support paid subscription workflows for owners and associated station services.
- Provide secure authentication, authorization, and operational logging.

### 4. Non-Goals
- Native mobile or web frontend implementation.
- Real-time navigation turn-by-turn guidance.
- Fleet management beyond the current customer, owner, and admin workflows.
- Full CRM or external ticketing replacement.

### 5. Target Users
#### Customer / Driver
Finds stations, saves vehicles, raises support requests, and uses referral and payout features where applicable.

#### Station Owner
Creates and manages station listings, updates CNG and crowd status, manages profile and subscription flows, and handles support.

#### Admin
Approves or manages owners and stations, resolves support issues, and monitors platform health and usage.

### 6. Core User Journeys
#### Customer Discovery
1. Customer signs up or logs in.
2. Customer searches nearby stations or plans a route.
3. Customer views station details, availability, and crowd signals.
4. Customer contacts support or manages profile and vehicles.

#### Owner Onboarding and Management
1. Owner signs up and verifies account details.
2. Owner completes profile and KYC fields.
3. Owner adds or manages station records.
4. Owner updates CNG and crowd status.
5. Owner initiates or completes subscription payment.

#### Admin Operations
1. Admin logs in.
2. Admin reviews owners, stations, and support tickets.
3. Admin approves, updates, or removes records as needed.
4. Admin monitors activity and resolves escalations.

### 7. Functional Requirements
#### Authentication
- Support login, signup, logout, token refresh, verification, and password reset.
- Support separate flows for customer, owner, and admin roles.
- Enforce password hashing and JWT-based session handling.

#### Station Discovery
- Return approved station listings.
- Support station search, nearby search, route planning, and map-related place lookup.
- Expose station details including location, fuel types, amenities, verification state, and CNG availability.

#### Station Status Updates
- Allow owners to update CNG availability.
- Allow owners to update crowd level and estimated wait time.
- Persist timestamps for status freshness.

#### Owner Management
- Store owner profile, business identity, KYC status, subscription status, and onboarding state.
- Allow admin management of owner records.
- Support station ownership and station-document attachments.

#### Customer Management
- Store customer profile and vehicles.
- Support referral tracking and earnings-related data.
- Support payout request workflows and OTP verification.

#### Subscriptions and Payments
- Support subscription initiation and completion for owners or stations.
- Support order creation and payment verification.
- Track subscription duration, status, and plan features.

#### Support
- Allow customers, owners, and admins to create and manage support tickets.
- Track ticket status, replies, assignments, priorities, and resolution metadata.

#### Notifications and Auditability
- Store notifications for owners.
- Track activity logs for administrative and operational actions.

### 8. Data Model Requirements
- Users must have unique email identifiers and role-based access.
- Stations must support geo-search, approval status, verification, and crowd/CNG status.
- Owners must support verification and onboarding lifecycle fields.
- Support tickets must support a unique ticket number and threaded replies.
- Subscription and payment history must be retained for billing and account lifecycle visibility.

### 9. Key API Capabilities
#### Public
- Station listing and search.
- Route planning.
- Place autocomplete and place details.
- Recommendation endpoint for suitable stations.

#### Authenticated Customer
- Profile management.
- Vehicle management.
- Referral and payout workflows.
- Customer support.

#### Authenticated Owner
- Station management.
- CNG and crowd status updates.
- Profile management.
- Subscription flows.
- Support and payment history.

#### Authenticated Admin
- Owner management.
- Station moderation.
- Support management.
- User oversight.

### 10. Non-Functional Requirements
- Security: JWT validation, password hashing, CORS controls, and environment validation.
- Reliability: API should degrade gracefully when external services such as maps or payments are unavailable.
- Performance: Station search and route planning should respond fast enough for interactive mobile usage.
- Scalability: Support growth in stations, owners, and customer queries without schema redesign.
- Observability: Log key operational and security events.

### 11. Success Metrics
- Station search success rate.
- Route planning completion rate.
- Owner onboarding completion rate.
- Subscription payment conversion rate.
- Support ticket resolution time.
- Percentage of approved stations with fresh availability updates.

### 12. Assumptions
- The backend is the system of record for station availability and owner operational data.
- External providers handle payment processing, email delivery, and map lookup.
- Frontend clients consume the API over authenticated HTTP requests.

### 13. Risks
- Stale station availability data can reduce trust.
- Incomplete owner onboarding can block station growth.
- External API failures may affect route and place lookup features.
- Poor verification or moderation workflows can allow low-quality station data.

### 14. Release Scope
#### MVP
- Authentication for customer, owner, and admin users.
- Public station listing and search.
- Route planning and place lookup.
- Owner station updates for CNG and crowd status.
- Admin station and owner management.
- Support tickets.

#### Phase 2
- Expanded notifications.
- Improved referral and payout workflows.
- Subscription automation and renewal handling.
- Operational analytics and richer audit trails.

### 15. Acceptance Criteria
- A customer can sign up, log in, search stations, and access route planning.
- An owner can create or manage station data and update availability.
- An admin can review and manage owners, stations, and support tickets.
- Subscription and payment flows can be initiated and verified.
- The platform remains secure and role-restricted across public and authenticated routes.