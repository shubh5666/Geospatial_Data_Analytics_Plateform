# Darukaa.Earth — Geospatial MRV & Ecological Analytics Platform

[![CI Pipeline](https://github.com/shubh5666/Geospatial_Data_Analytics_Plateform/actions/workflows/ci.yml/badge.svg)](https://github.com/shubh5666/Geospatial_Data_Analytics_Plateform/actions/workflows/ci.yml)
[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://geospatial-data-analytics-plateform.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render)](https://geospatial-data-analytics-plateform.onrender.com)
[![Database](https://img.shields.io/badge/PostgreSQL-PostGIS%2017-336791?logo=postgresql)](https://postgis.net/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.3-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript)](https://www.typescriptlang.org)

**Darukaa.Earth** is a full-stack, enterprise-grade geospatial analytics and MRV (Measurement, Reporting & Verification) platform built for tracking, managing, and visualizing carbon sequestration and biodiversity restoration projects across real-world geographical boundaries.

---

## 🌐 Live Deployments & Endpoints

| Service | Environment | URL | Details |
| :--- | :--- | :--- | :--- |
| **Web Application** | Production (Vercel) | [https://geospatial-data-analytics-plateform.vercel.app](https://geospatial-data-analytics-plateform.vercel.app) | Responsive React SPA with Mapbox GL JS & Chart.js |
| **REST API Engine** | Production (Render) | [https://geospatial-data-analytics-plateform.onrender.com](https://geospatial-data-analytics-plateform.onrender.com) | Python FastAPI with async PostGIS query execution |
| **Interactive API Docs** | Swagger UI | [https://geospatial-data-analytics-plateform.onrender.com/docs](https://geospatial-data-analytics-plateform.onrender.com/docs) | Complete OpenAPI 3.1 specification & test harness |
| **API Healthcheck** | Production Status | [https://geospatial-data-analytics-plateform.onrender.com/](https://geospatial-data-analytics-plateform.onrender.com/) | Live service heartbeat & telemetry |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER (BROWSER)                          │
│                                                                             │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────┐   │
│   │   Auth & Session    │   │    Mapbox GL JS     │   │    Chart.js     │   │
│   │   (JWT in Storage)  │   │  (Polygon Drawing)  │   │ (MRV Analytics) │   │
│   └──────────┬──────────┘   └──────────┬──────────┘   └────────┬────────┘   │
└──────────────┼─────────────────────────┼───────────────────────┼────────────┘
               │                         │                       │
               ▼                         ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EDGE & PROXY LAYER (VERCEL)                        │
│                                                                             │
│   - SPA Routing & Asset Minification (Brotli/Gzip)                          │
│   - Same-Origin Reverse Proxy (`/api/*` ➔ Render Backend)                   │
│   - Strict Security Headers & Automated Global CDN Distribution             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / TLS 1.3
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND API ENGINE (RENDER)                        │
│                                                                             │
│   - FastAPI (Python 3.12, Uvicorn ASGI Server)                              │
│   - Stateless JWT Verification (HS256 with Algorithm & Claim Whitelisting)  │
│   - Pydantic v2 Strict Payload Validation (Input Sanitization & Constraints)│
│   - PostGIS Geometry Parser (WGS 84, Self-Intersection & Coordinate Checks) │
│   - Constant-Time Dummy Password Verification (Mitigating Timing Attacks)  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ SSL / TLS (Encrypted Pool)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SPATIAL PERSISTENCE LAYER (POSTGIS)                    │
│                                                                             │
│   - PostgreSQL 17 + PostGIS 3.6 Spatial Extension Engine                    │
│   - `geometry(POLYGON, 4326)` Column with GiST Spatial Indexes              │
│   - Ellipsoidal Area Computation (`ST_Area(geography)` in Hectares)         │
│   - Idempotent Version-Controlled SQL Schema Migrations                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛰 Core Capabilities & Features

### 1. Geospatial Boundary Engine (Mapbox GL JS + PostGIS)
- **Interactive Boundary Creation:** Draw custom geographical sites directly onto satellite imagery with real-time snap-to-grid and coordinate precision.
- **Topological Integrity:** Server validates coordinate winding orders, rejects self-intersecting polygons or degenerate rings, and enforces spatial size boundaries.
- **Hectare Calculation:** Automatically calculates true ground area in hectares using PostGIS ellipsoidal projections rather than flat Cartesian estimations.
- **GeoJSON Interoperability:** Import boundaries directly from standard GeoJSON `Polygon` features or export mapped sites for use in external GIS software (QGIS, ArcGIS).

### 2. Ecological MRV Analytics (Chart.js)
- **Multi-Metric Time-Series:** Tracks longitudinal ecological metrics including **Carbon Stock (tCO₂e)** and **Biodiversity Index (/100)** over time.
- **Site-by-Site Drilldown:** Selecting any site immediately filters historical measurements, providing granular insights into forest canopy regeneration and soil restoration.
- **Project-Level Aggregation:** The API calculates instantaneous rolling summaries using the latest measurement per site rather than historical duplicates.

### 3. Enterprise Security & Access Control
- **Stateless JWT Authentication:** Bearer tokens encoded with HS256, issued with expiry and cryptographic signatures.
- **Strict Data Ownership:** Every project and site query enforces ownership isolation; unauthorized requests receive uniform `404 Not Found` responses to prevent ID enumeration.
- **Timing-Attack Resistance:** Unknown user lookups run through constant-time dummy password verification to neutralize timing side-channel attacks.
- **Secrets Isolation:** Passwords and JWT secrets are encapsulated in custom secret types, preventing leakage in debug logs or exception tracebacks.

---

## 🗄 Database Schema Design

The spatial database uses PostgreSQL with the **PostGIS** extension. Schema migrations are version-controlled, atomic, and idempotent.

```
┌────────────────────────┐         ┌────────────────────────┐
│         users          │         │        projects        │
├────────────────────────┤         ├────────────────────────┤
│ id (UUID, PK)          │◄───┐     │ id (UUID, PK)          │◄───┐
│ full_name (VARCHAR)    │    └─────│ owner_id (UUID, FK)    │    │
│ email (CITEXT, UNIQUE) │          │ name (VARCHAR)         │    │
│ password_hash (VARCHAR)│          │ description (TEXT)     │    │
│ created_at (TIMESTAMPTZ│          │ created_at (TIMESTAMPTZ│    │
└────────────────────────┘          └────────────────────────┘    │
                                                                  │
┌────────────────────────┐         ┌────────────────────────┐     │
│   site_measurements    │         │         sites          │     │
├────────────────────────┤         ├────────────────────────┤     │
│ id (UUID, PK)          │         │ id (UUID, PK)          │     │
│ site_id (UUID, FK)     │─────┐   │ project_id (UUID, FK)  │─────┘
│ date (DATE)            │     └───│ name (VARCHAR)         │
│ carbon_tonnes_co2e     │         │ boundary (POLYGON,4326)│ (GiST Indexed)
│ biodiversity_score     │         │ area_hectares (FLOAT)  │
│ is_mock (BOOLEAN)      │         │ created_at (TIMESTAMPTZ│
└────────────────────────┘         └────────────────────────┘
```

### Key Schema Constraints:
* `sites.boundary`: Stored as `geometry(POLYGON, 4326)` with an associated `GIST` spatial index for sub-millisecond bounding box queries (`&&`) and intersection checks (`ST_Intersects`).
* `UNIQUE (site_id, date)`: Enforces that each site records at most one measurement reading per date.
* `ON DELETE CASCADE`: Deleting a project safely purges all associated sites and time-series measurement records within a single transaction.

---

## ⚖️ Engineering Decisions & Trade-Offs

| Decision | Choice Made | Alternative Considered | Engineering Rationale |
| :--- | :--- | :--- | :--- |
| **Backend Framework** | **FastAPI (Python)** | Flask / Django | FastAPI provides native async execution, automatic OpenAPI generation, and strict Pydantic v2 compile-time type safety with minimal memory footprint. |
| **Spatial Engine** | **PostGIS (EPSG:4326)** | Raw GeoJSON in JSONB | PostGIS executes native topological validation, spatial index lookups (GiST), and accurate ellipsoidal ground area computations directly inside the database engine. |
| **Mapping Engine** | **Mapbox GL JS** | Leaflet / OpenLayers | Mapbox GL provides hardware-accelerated WebGL vector tile rendering, crisp polygon styling, and a clean polygon drawing lifecycle via `@mapbox/mapbox-gl-draw`. |
| **Charting Engine** | **Chart.js** | Highcharts / Recharts | Chart.js provides high-performance canvas rendering with zero licensing overhead, smooth animations, and clean responsive resize observers. |
| **Network Architecture** | **Same-Origin Proxy** | Direct CORS API Calls | Routing frontend calls through `/api` reverse proxies eliminates cross-origin preflight latency and prevents CORS blocking across dynamic preview deployments. |
| **Password Hashing** | **Argon2id (via pwdlib)** | bcrypt / PBKDF2 | Argon2id is the current state-of-the-art password hashing standard, offering superior resistance against GPU/ASIC-based brute force cracking. |

---

## 🛠 Local Setup & Development

### Prerequisites
* **Node.js** >= 20.0.0
* **Python** >= 3.12
* **Git**

### 1. Clone Repository
```bash
git clone https://github.com/shubh5666/Geospatial_Data_Analytics_Plateform.git
cd Geospatial_Data_Analytics_Plateform
```

### 2. Frontend Setup (Quickstart)
The frontend automatically proxies `/api` requests to the live cloud backend by default, allowing local frontend development without local Python/PostGIS setup:
```bash
cd Frontend
npm install --legacy-peer-deps
npm run dev
```
Open **`http://127.0.0.1:5173/`** in your browser.

### 3. Backend Setup (Full Local Stack)
To run the local Python backend with local database migrations:
```bash
cd Backend
python -m venv venv
.\venv\Scripts\Activate.ps1          # On Linux/macOS: source venv/bin/activate
pip install -r requirements-dev.txt

# Run migrations against your local PostgreSQL instance
python -m app.init_db

# Start FastAPI server
npm run dev                          # Or: python -m uvicorn app.main:app --reload
```
The API is available at **`http://127.0.0.1:8000`** and Swagger docs at **`http://127.0.0.1:8000/docs`**.

---

## 🧪 Automated Testing & Code Quality

The project enforces automated test coverage across both frontend and backend suites:

```bash
# Run Frontend Tests (Vitest)
cd Frontend
npm run test

# Run Frontend Linter (ESLint)
npm run lint

# Run Backend Integration & Unit Tests (52 tests across Auth, PostGIS, Projects)
cd Backend
.\venv\Scripts\python.exe -m unittest discover -s tests -v

# Run Backend Linter (Ruff)
.\venv\Scripts\python.exe -m ruff check app tests
```

---

## 🚀 CI/CD Pipeline (GitHub Actions)

The repository includes a production-grade GitHub Actions workflow (`.github/workflows/ci.yml`) that validates every pull request and push to the `main` branch:

1. **Backend Matrix Job:**
   - Spawns a real **PostGIS 17** service container (`postgis/postgis:17-3.6`) with healthcheck verification.
   - Installs dependencies, runs Ruff linting, applies migrations, and executes all 52 unit/integration test suites.
2. **Frontend Matrix Job:**
   - Sets up Node.js 22, performs clean dependency installation, runs ESLint, executes Vitest unit tests, and validates production TypeScript compilation (`tsc -b && vite build`).
3. **Automated Deployment:**
   - Continuous deployment triggers automatically build and deploy to **Vercel** (Frontend) and **Render** (Backend) once all CI checks pass.

---

## 📩 Reviewer & Submission Access

* **GitHub Repository:** [https://github.com/shubh5666/Geospatial_Data_Analytics_Plateform](https://github.com/shubh5666/Geospatial_Data_Analytics_Plateform)
* **Live Demo URL:** [https://geospatial-data-analytics-plateform.vercel.app](https://geospatial-data-analytics-plateform.vercel.app)
* **API Documentation:** [https://geospatial-data-analytics-plateform.onrender.com/docs](https://geospatial-data-analytics-plateform.onrender.com/docs)
* **Word Submission Document:** Located at [`Backend/output/Darukaa_Earth_Submission.docx`](Backend/output/Darukaa_Earth_Submission.docx)
* **Reviewer Accounts Access:** Granted to:
  - `ankita.dasgupta@darukaa.com`
  - `harsh.kumar@darukaa.com`
  - `utkarsh.gauniyal@darukaa.com`
  - `guneet.mutreja@darukaa.com`
