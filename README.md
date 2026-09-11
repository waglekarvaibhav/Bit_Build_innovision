# CrewNest (JobHustle)

CrewNest is a local services marketplace MVP. Customers discover providers and packages, book services, and complete a full booking lifecycle. Providers manage profiles, packages (multitasking and team), incoming requests, and job history. The project is built with FastAPI, SQLAlchemy, and a vanilla-JavaScript SPA served from the same process.

## Quick start

```powershell
# 1. Clone the repository and enter it
git clone <new-repo-url> C:\JobHustle
cd C:\JobHustle

# 2. (Optional) create a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the dev server
python -m backend.run
# Server listens on http://127.0.0.1:8001
```

## Configuration

Copy `.env.example` to `.env` and edit values if needed. The defaults are safe for local development.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(empty)* | Leave empty to use `./crewneat.db` (SQLite). Set a PostgreSQL URL to target a real database. |
| `SECRET_KEY` | *(auto-generated)* | JWT signing key. Set this explicitly in production. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime. |
| `HOST` | `127.0.0.1` | Bind address. |
| `PORT` | `8001` | HTTP port. |
| `UPLOAD_DIR` | `./uploads` | Uploaded images directory. |
| `ALLOWED_ORIGINS` | `http://localhost:8001,http://127.0.0.1:8001` | CORS origins. |

## Demo accounts

After seeding the database (see below), these accounts are available. All passwords are `DemoPass123!`.

### Customers
| Name | Email |
|---|---|
| Aarav Desai | `aarav@crewneat.demo` |
| Nisha Correia | `nisha@crewneat.demo` |

### Providers
| Name | Email |
|---|---|
| Arjun Naik | `arjun@crewneat.demo` |
| Priya Kamat | `priya@crewneat.demo` |
| Rohit Phadte | `rohit@crewneat.demo` |
| Sneha Gaitonde | `sneha@crewneat.demo` |
| Vikas Sawant | `vikas@crewneat.demo` |
| Meera Dessai | `meera@crewneat.demo` |

## Seeding demo data

```powershell
# Reset and re-seed the SQLite database (WARNING: deletes all data)
python -m backend.reset_db --yes
python -m backend.seed_demo
```

The seed script refuses to run against a non-SQLite database, so it cannot accidentally touch a production database.

## Running tests

```powershell
python -m pytest tests -q
```

## Project structure

```
C:\JobHustle
├── backend/
│   ├── main.py            # FastAPI app entrypoint, SPA fallback, static mounts
│   ├── config.py          # Pydantic settings, env loading
│   ├── database.py        # SQLAlchemy engine/session
│   ├── models.py          # ORM models
│   ├── schemas.py         # Pydantic schemas
│   ├── security.py        # JWT + password hashing
│   ├── services.py        # Business logic (pricing, transitions, conflicts)
│   ├── dependencies.py    # FastAPI dependencies (auth, roles)
│   ├── routers/
│   │   ├── auth.py        # Register, login, availability
│   │   ├── profiles.py    # Provider profiles
│   │   ├── provider_packages.py  # Package CRUD
│   │   ├── bookings.py    # Booking lifecycle + photos + reviews
│   │   ├── catalogue.py   # Service categories, providers, packages
│   │   └── photos.py      # Booking photo uploads
│   ├── seed_demo.py       # Demo data seeder
│   └── run.py             # Dev server entrypoint
├── static/
│   ├── index.html         # SPA shell
│   ├── css/               # Styles
│   ├── js/                # Frontend logic (router, pages, API client)
│   └── pages/             # Page modules (auth, home, quickhire, packages, etc.)
├── tests/
│   ├── conftest.py        # Pytest fixtures (in-memory SQLite)
│   ├── test_auth.py
│   ├── test_bookings.py
│   ├── test_packages.py
│   ├── test_improvements.py
│   └── verify_browser.py  # Playwright browser verification
├── requirements.txt
├── .env.example
├── start-server.bat
└── README.md
```

## Key features

- **Individual bookings**: Customer selects a service + provider, books, provider accepts, requests completion, customer confirms, review.
- **Multitasking packages**: One provider bundles 2+ services at a package hourly rate. Booking snapshots preserve the agreement.
- **Team packages**: 2+ providers, one lead, one team hourly rate. All members can view; lead manages accept/reject/completion.
- **Server-side pricing**: `quoted_price` is always computed as `rate x hours` on the backend. The client never sets an amount.
- **Schedule conflict checks**: Double-booking the same provider at the same time is blocked.
- **Booking-time snapshots**: Package name, type, services, members, and lead are frozen at booking time so later edits do not alter existing agreements.
- **Reviews**: Customers can review completed bookings (1–5 stars + comment). One review per booking.

## Architecture overview

### Backend (FastAPI + SQLAlchemy)

- **Single-table users**: `users` stores both customers and providers with a `role` enum.
- **Provider profile**: One-to-one with `users` via `provider_profiles`.
- **Services**: `service_categories` → `services` (global catalog).
- **Provider services**: `provider_services` links a provider profile to services with hourly/daily/monthly rates.
- **Packages**: `packages` has two subtypes:
  - `multitasking`: one owner provider, 2+ services, no members.
  - `team`: one owner, 2+ members (one lead), 2+ services, team hourly rate.
- **Bookings**: `bookings` reference `customer_id`, `provider_id`, optional `package_id` / `service_id`.
  - Snapshots (`package_name_snapshot`, `package_type_snapshot`, `package_services_snapshot`, `package_members_snapshot`, `package_lead_snapshot`) are written at creation and never mutated.
  - `BookingParticipant` records who is involved. For team packages, all members are participants; the lead has `is_lead=true`.
- **State machine**: `BookingStatus` transitions are enforced in `routers/bookings.py`:
  - `pending` → `accepted` (provider) / `cancelled` (customer)
  - `accepted` → `completion_requested` (provider lead) / `rejected` (provider)
  - `completion_requested` → `completed` (customer) / `accepted` (customer rejects)
- **Pricing service**: `services.py` resolves the rate from `provider_services` (or package `hourly_rate`) and multiplies by `duration_hours`. Billing unit is stored but the MVP prices everything as `rate x hours`.
- **Security**: `python-jose` JWT tokens, `passlib` + `bcrypt` password hashing. `dependencies.py` provides `get_current_user` and `require_role`.

### Frontend (vanilla JS SPA)

- **Entry**: `static/index.html` loads `js/main.js`.
- **Router**: `js/router.js` maps `/login`, `/home`, `/quickhire`, `/packages`, `/provider-home`, etc. to page modules.
- **API client**: `js/api.js` wraps `fetch`, attaches Bearer tokens, handles 401 redirects, and surfaces errors.
- **Auth**: `js/pages/auth.js` handles login/register and stores the user object in `localStorage` (`crewneat.auth`).
- **Shell**: `js/layout.js` provides a sidebar + main content area for both customer and provider roles.
- **Pages**:
  - `customerHome.js` — search, categories, recent activity.
  - `find.js` — provider catalogue with ratings.
  - `providerPublic.js` — public provider profile page.
  - `quickhire.js` — guided 4-step booking wizard.
  - `packages.js` — package catalogue and detail.
  - `bookingDetail.js` — customer view of a booking with cancel/confirm/review actions.
  - `activity.js` — customer booking history.
  - `profile.js` — customer profile.
  - `providerHome.js` — provider dashboard (stats, availability, pending requests, ongoing jobs, packages).
  - `providerRequests.js` — incoming request list with accept/reject.
  - `providerJobs.js` — provider's accepted/ongoing/completed jobs.
  - `providerBookingDetail.js` — provider view with lead-only actions.
  - `providerPackages.js` — package CRUD and archive.
  - `goalguide.js` — onboarding / help content.

### Data flow for a booking

1. Customer authenticates → gets JWT.
2. Customer opens `/quickhire` or clicks a provider/package.
3. Frontend fetches `/api/service-categories`, `/api/providers`, `/api/packages`.
4. Customer submits booking → `POST /api/customers/bookings`.
5. Backend validates schedule conflicts, resolves rate, computes `quoted_price`, writes snapshots, returns booking.
6. Provider sees request in `/provider-requests` or dashboard.
7. Provider accepts/rejects → `PUT /api/bookings/{id}/accept|reject`.
8. Provider requests completion → `PUT /api/bookings/{id}/request-completion`.
9. Customer confirms or rejects completion.
10. Customer reviews → `POST /api/bookings/{id}/reviews`.

## Demo walkthrough

### Scenario A: Individual booking (service + provider)

1. Open `http://127.0.0.1:8001` and log in as **Aarav Desai** (`aarav@crewneat.demo` / `DemoPass123!`).
2. Click **Find** or **Quick Hire**.
3. Choose a service (e.g., "Home Cleaning").
4. Select **Arjun Naik** (Handyman & Home Repair, Margao).
5. Fill in job details, address, date, and duration. Submit.
6. Log out, log in as **Arjun Naik** (`arjun@crewneat.demo` / `DemoPass123!`).
7. On the provider home, see the incoming request. Click **Accept**.
8. After the job, click **Request completion**.
9. Log back in as Aarav. Open the booking. Click **Confirm completion**.
10. Click **Leave a review** (1–5 stars + comment).

### Scenario B: Multitasking package

1. Log in as a customer.
2. Go to **Packages**.
3. Select **Complete Move-In Care** (multitasking, by Arjun Naik).
4. Click **Book this package** → details pre-filled.
5. Submit booking. The server computes `320 INR/hr x hours`.
6. Provider accepts and completes as above.

### Scenario C: Team package

1. Log in as a customer.
2. Go to **Packages**.
3. Select **Full Home Makeover** (team, by Priya Kamat).
4. Book the package. The team hourly rate applies.
5. Log in as **Priya Kamat** (lead). Accept the request.
6. Priya requests completion.
7. Customer confirms.
8. Log in as **Rohit Phadte** (team member). He sees the booking in **My Jobs** but cannot accept/reject — only the lead can.

### Scenario D: Provider package management

1. Log in as a provider.
2. Go to **My Packages** (`/provider-packages`).
3. Create a new **Multitasking** package with 2+ services.
4. Create a new **Team** package with 2+ members, designate a lead.
5. Archive a package. Existing bookings remain accessible with their snapshots; new bookings against the archived package are blocked.

## Technical Q&A

**Q: Why two separate tables for `users` and `provider_profiles`?**
A: A one-to-one profile keeps provider-specific fields (profession, bio, locality, experience) out of the shared auth table. It also simplifies queries when listing providers.

**Q: How is pricing calculated?**
A: The backend resolves the applicable rate from `provider_services` (for individual bookings) or `packages.hourly_rate` (for packages), then multiplies by `duration_hours`. Billing unit is stored but the MVP always bills by hours. The client never sends an amount.

**Q: What prevents a provider from accepting a booking for a package they do not own?**
A: The team package booking flow records the package lead and all members as participants. Only the lead can accept/reject/completion actions. For individual bookings, the assigned provider is fixed at creation.

**Q: How do snapshots protect the agreement?**
A: When a booking is created, the current package name, type, services, members, and lead are copied into denormalized columns on the `bookings` row. Later edits to the package (name change, service swap, member change, archive) do not affect existing bookings.

**Q: Why SQLite by default?**
A: SQLite requires no external service, making the demo reproducible on any machine. The seed script explicitly refuses to run against a non-SQLite URL, preventing accidental writes to a production database.

**Q: How are uploads handled?**
A: Photos are uploaded via `multipart/form-data` to `/api/bookings/{id}/photos`. Files are stored under `./uploads/` and served read-only at `/uploads/{filename}`. The seed script does not create uploads; they appear only during live use.

**Q: What are the known limitations?**
A: Billing unit is stored but not fully implemented (always `hourly x hours`). There is no payment gateway. Push notifications are not implemented. The frontend is a minimal SPA without a build step — production deployment should add asset bundling, CSP headers, and a reverse proxy.

