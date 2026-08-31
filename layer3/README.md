# Reconciliation Workspace — Screen 4

Standalone demo for SIH26013 showing an evidence-backed, human-in-the-loop parcel reconciliation workflow.

## What is included

- Three-column Revenue / Survey / Proposed comparison
- Parcel geometry mini-previews
- Owner, area, address and source-quality discrepancies
- Hard-coded resolution recommendation and evidence trail
- Explicit governance language: recommendation support, not automated ownership adjudication
- Accept / Modify / Reject / Escalate actions
- Decision Preview before reconciliation confirmation
- Audit log written by the backend
- Ownership evidence chronology

## Run backend

```bash
cd backend
npm install
npm run dev
```

Backend: `http://localhost:4000`

## Run frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local frontend URL, usually `http://localhost:5173`.

## API routes

- `GET /api/health`
- `GET /api/parcels/CP-00182/reconciliation`
- `GET /api/parcels/CP-00182/audit`
- `POST /api/parcels/CP-00182/decisions`

Example decision payload:

```json
{
  "decision": "ACCEPT",
  "reviewer": "Demo Officer",
  "note": "",
  "proposed": {
    "owner": "Priya Sharma",
    "area": 492
  }
}
```

## Connect it to Screen 3 later

From the Conflict Explorer, route a row click to something like:

```text
/reconciliation/CP-00182
```

Then replace the hard-coded `CP-00182` in the frontend API calls with the route parameter.

## Important design position

This demo intentionally does **not** say that AI determines legal ownership. The recommendation is framed as evidence-backed decision support for an authorised reviewer, with a recorded human action and audit trail.
