# RITHI CRM — Field Service Module (POC)

An end-to-end **Field Service** module for a medical-equipment service department,
built as a self-contained, runnable proof-of-concept. It covers the full service
lifecycle and ships with reusable **design systems** (Table, Form, KPI cards,
Dashboard, Theming) used consistently across every screen.

> **POC scope:** runs entirely in the browser (React + Vite + TypeScript) with a
> reactive `localStorage` data layer — no backend to set up. Auth, roles and
> user-specific data are simulated client-side and clearly POC-grade.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

**Demo logins** (also one-click on the sign-in screen):

| Role            | Username   | Password      | Access |
|-----------------|------------|---------------|--------|
| Administrator   | `admin`    | `admin123`    | Full + user management |
| Service Manager | `manager`  | `manager123`  | Create / edit / delete |
| Field Engineer  | `engineer` | `engineer123` | Create / edit |

The app seeds realistic medical-domain demo data on first login.

## Modules (service department, end-to-end)

- **Masters** — Party Master · Product Master · Part (spare) Master
- **Contracts & Warranty** — Warranty Register · Contract Register (AMC/CMC)
- **Service Calls** — Installation · Preventive (PM) · Breakdown/Field (with **call closure**)
- **Spares** — Spare Requests · Spare Consumption
- **Billing** — Quotations · Invoices (line items for **products & spares**, GST, totals, print)
- **Quality & Analytics** — Customer Feedback · Daily Call Review · Field Failure Report · KPI & Failure-rate Analysis (product-wise)
- **Administration** — User Access · Settings (themes, design-system defaults, templates)

## Reusable design systems

Built once and reused across all modules:

- **Table System** (`src/components/table`) — defaults per spec: text-wrap every cell,
  **drag-to-rearrange columns**, **per-column width adjuster** (drag header edge),
  **sticky header**, configurable **rows-before-scroll**, adjustable table width,
  sort, CSV export, and persisted per-table layout.
- **Form System** (`src/components/form`) — schema-driven, responsive grid,
  section grouping, required markers, inline validation, currency/date/select types.
- **KPI Cards** (`src/components/kpi`) — tone-coded metric cards with trend & sparkline.
- **Dashboard / Charts** (`src/components/charts`) — dependency-free bar / column / donut.
- **Color Themes** (`src/theme`) — 7 light & dark themes; switch instantly from the
  header or Settings. Everything reads CSS variables, so a switch re-skins the app.

## Templates

Each printable document mounts a **Template Placeholder**
(`src/modules/TemplatePlaceholder.tsx`) where your official template can be slotted
in later — the underlying data is already wired. Manage them under
**Settings → Document Templates**.

## Architecture

```
src/
  theme/         color themes + provider (CSS variables)
  lib/           db (reactive localStorage), auth, hooks, formatters, seed data
  components/    table · form · kpi · charts · ui · layout   (the design systems)
  modules/       CrudModule (generic), BillingModule, schemas, dashboards, analytics, auth
```

Most entity modules are a thin **config** over the generic `CrudModule`, which wires
the Table + Form + Drawer systems together. Analytics screens (Dashboard, Daily Call
Review, Field Failure Report, KPI) are bespoke but reuse the same primitives.

## Next steps for production

- Replace the client-side store & auth with a real backend + proper password hashing.
- Bind the official print templates into the placeholders.
- Add stock decrement on spare consumption and contract-driven PM auto-scheduling.
