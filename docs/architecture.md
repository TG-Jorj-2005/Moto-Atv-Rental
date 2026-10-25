# Architecture, ER and UML

## Layers

```mermaid
flowchart LR
  Browser --> Pages["Next.js pages and server actions (src/app)"]
  Browser --> API["API routes (/api/bookings, /api/vehicles, /uploads)"]
  Pages --> Services
  API --> Services
  subgraph Services["Services (src/lib)"]
    BS[booking-service]
    VS[vehicle-service]
    QS[quote-service]
    MS[maintenance-service]
    PS[photo-service]
    US[users / listings / profile]
  end
  Services --> Rules["Pure rules: booking-rules, vehicle-rules, commission, business-time, pricing"]
  Services --> Prisma["Prisma + raw SQL for locks"]
  Prisma --> PG[("PostgreSQL: exclusion constraint, partial unique index")]
  PS --> Disk[("UPLOAD_DIR")]
```

Business logic lives in the services and the pure rule modules; pages and routes only authenticate, parse input (Zod) and call a service. The database is the last line of defence: the overlap constraint and the "one ACTIVE booking per vehicle" index hold even if application code were bypassed.

## ER diagram

```mermaid
erDiagram
    USER ||--o{ VEHICLE : owns
    USER ||--o{ BOOKING : "books"
    USER ||--o{ QUOTE_REQUEST : requests
    USER ||--o{ PAYOUT : "is paid"
    USER ||--o{ BOOKING_STATUS_HISTORY : "changes status"
    LOCATION ||--o{ VEHICLE : hosts
    CUSTOMER ||--o{ BOOKING : "contact details of"
    VEHICLE ||--o{ BOOKING : "is booked in"
    VEHICLE ||--o{ MAINTENANCE : has
    VEHICLE ||--o{ VEHICLE_PHOTO : shows
    VEHICLE ||--o{ QUOTE_ITEM : "is offered in"
    BOOKING ||--o{ PAYMENT : "is paid by"
    BOOKING ||--o{ BOOKING_STATUS_HISTORY : "is recorded in"
    QUOTE_REQUEST ||--o{ QUOTE_ITEM : lists
    QUOTE_REQUEST ||--o{ BOOKING : "creates when accepted"

    USER { string id PK  string email UK  string password_hash  enum role "ADMIN CUSTOMER OWNER RENTAL_COMPANY"  string name  int commission_bps "company rate, null = default"  enum account_type "deprecated, unused" }
    CUSTOMER { string id PK  string full_name  string email UK  string phone }
    LOCATION { string id PK  string name UK  string city  string county  string address  string phone  string hours }
    VEHICLE { string id PK  string name  enum type "ATV MOTORCYCLE SCOOTER"  string plate UK  enum status "AVAILABLE IN_SERVICE RETIRED stored, RENTED derived"  enum listing_status "PENDING APPROVED REJECTED"  string owner_id FK "null = platform fleet"  string location_id FK  int hourly_rate  int daily_rate  int weekend_rate  int year  int engine_cc  int power_hp  int seats  string license_category }
    VEHICLE_PHOTO { string id PK  string vehicle_id FK  string path  int position }
    BOOKING { string id PK  string vehicle_id FK  string customer_id FK  string user_id FK  string quote_id FK  timestamptz start_at  timestamptz end_at  tstzrange period "generated, exclusion constraint"  enum status  int total_price "bani"  int commission_bps "snapshot"  int commission_amount "snapshot"  int owner_amount "snapshot"  timestamptz completed_at }
    BOOKING_STATUS_HISTORY { string id PK  string booking_id FK  enum from_status  enum to_status  string changed_by_id FK  string note  timestamptz changed_at }
    PAYMENT { string id PK  string booking_id FK  int amount "RON bani"  enum currency "RON EUR"  int paid_amount "in the paid currency"  decimal exchange_rate  enum method  timestamp paid_at }
    PAYOUT { string id PK  string owner_id FK  int amount  string note  timestamp paid_at }
    QUOTE_REQUEST { string id PK  string user_id FK  enum vehicle_type  int quantity  date start_date  date end_date  enum status "NEW QUOTED ACCEPTED DECLINED"  int revision  int offered_quantity  int discount_bps  int quoted_amount }
    QUOTE_ITEM { string id PK  string quote_id FK  string vehicle_id FK  int list_price  int price }
    MAINTENANCE { string id PK  string vehicle_id FK  enum type "SERVICE ITP RCA OTHER"  timestamp performed_at  timestamp next_due_at  string notes }
```

Money columns are integers in bani (1/100 RON), rates are basis points; only the exchange rate stored with an EUR payment is a decimal.

## Use cases

```mermaid
flowchart LR
  V([Visitor]) --- UC1(Browse catalog and vehicle pages)
  V --- UC2(Register / log in)
  C([Customer]) --- UC3(Book a vehicle)
  C --- UC4(See and cancel own bookings before start)
  C --- UC5(Edit profile and password)
  O([Owner]) --- UC6(List vehicles with photos and specs)
  O --- UC7(Manage maintenance records)
  O --- UC8(See own calendar, bookings and earnings)
  R([Rental company]) --- UC6
  R --- UC8
  R --- UC9(Request and accept bulk offers)
  A([Administrator]) --- UC10(Approve listings and set vehicle status)
  A --- UC11(Confirm, hand over, complete, cancel bookings)
  A --- UC12(Record payments and payouts)
  A --- UC13(Manage users, roles and company rates)
  A --- UC14(Reports, CSV export, locations)
```

CUSTOMER < OWNER < RENTAL_COMPANY: an owner or company can also do everything a customer does. ADMIN does not rent.

## Class view of the services

```mermaid
classDiagram
  class BookingService {
    createBooking(userId, input)
    transitionBooking(actorId, bookingId, to, opts)
    insertBooking(tx, ...)
    listHistory(bookingId)
  }
  class BookingRules {
    <<pure>>
    evaluateTransition()
    bookingFlags()
    isVehicleBookable()
  }
  class Commission {
    <<pure>>
    commissionBpsFor()
    snapshotFor()
    commissionOf()
  }
  class VehicleService {
    changeVehicleStatus()
    moderateListing()
    createPlatformVehicle()
    updateVehicleDetails()
    resubmitListing()
  }
  class QuoteService {
    createQuote()
    acceptQuote(userId, quoteId, revisionSeen)
    declineQuote()
  }
  class MaintenanceService
  class PhotoService
  class UserService {
    changeUserRole()
    previewRoleChange()
  }
  class Tx {
    runTransaction()
  }
  BookingService --> BookingRules
  BookingService --> Commission
  BookingService --> Tx
  QuoteService --> BookingService : insertBooking
  VehicleService --> BookingRules
  MaintenanceService --> VehicleService : access
  PhotoService --> VehicleService : access
```

## Sequence: creating a booking

```mermaid
sequenceDiagram
  actor U as Customer
  participant P as BookingPanel (browser)
  participant A as POST /api/bookings
  participant S as booking-service
  participant D as PostgreSQL
  U->>P: pick start and end (Bucharest time)
  P->>A: GET /api/vehicles/:id/price (estimate, availability)
  U->>P: Request booking
  P->>A: POST {vehicleId, startAt, endAt, customer}
  A->>A: session, Zod validation
  A->>S: createBooking(userId, input)
  S->>D: BEGIN; SELECT user FOR UPDATE
  S->>D: count PENDING (max 3)
  S->>D: SELECT vehicle FOR UPDATE
  S->>S: check bookable, start in future, email = account email
  S->>D: INSERT booking (commission snapshot) + history row
  D-->>S: ok or exclusion violation
  S->>D: COMMIT
  S-->>A: booking or failure code
  A-->>P: 201 / 400 / 401 / 403 / 404 / 409 / 429
```

## Sequence: accepting a bulk offer

```mermaid
sequenceDiagram
  actor C as Rental company
  participant S as quote-service
  participant D as PostgreSQL
  C->>S: acceptQuote(userId, quoteId, revisionSeen)
  S->>D: BEGIN; lock user, quote, vehicles (sorted)
  alt revision differs
    S-->>C: STALE_REVISION, nothing changes
  else every listed vehicle still free
    S->>D: INSERT one CONFIRMED booking per item + history
    S->>D: quote ACCEPTED; COMMIT
    S-->>C: accepted
  else something changed
    S->>D: recalculate items, revision + 1; COMMIT
    S-->>C: OFFER_CHANGED, nothing booked, accept the new version
  end
```

## State diagrams

Booking lifecycle: see [business-rules.md](business-rules.md#booking-lifecycle).

```mermaid
stateDiagram-v2
  direction LR
  state "Vehicle (stored status)" as V {
    [*] --> AVAILABLE
    AVAILABLE --> IN_SERVICE
    IN_SERVICE --> AVAILABLE
    AVAILABLE --> RETIRED
    IN_SERVICE --> RETIRED
    RETIRED --> IN_SERVICE
  }
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> PENDING: owner or company creates listing
  PENDING --> APPROVED: ADMIN
  PENDING --> REJECTED: ADMIN
  REJECTED --> PENDING: owner resubmits
  APPROVED --> PENDING: name or description edited
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> QUOTED: offer built from free vehicles
  QUOTED --> ACCEPTED: company accepts the revision it saw
  QUOTED --> QUOTED: something changed, revision + 1
  QUOTED --> DECLINED: company declines or nothing left
```
