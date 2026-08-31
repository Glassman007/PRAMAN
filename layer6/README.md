# Layer 6 — Field Survey Console

A desktop/web simulation of the future field survey mobile workflow. It reads parcel evidence from the project's shared `dataset/` directory and never creates a second parcel dataset inside Layer 6.

## Expected project placement

```text
project-root/
├─ dataset/                 # existing shared parcel/source data
├─ layer1/
├─ layer3/
├─ layer4/
├─ layer6/                  # this folder
└─ SurveyData/              # created automatically on first write
   ├─ field-surveys.json
   ├─ integration-events.json
   └─ evidence/
```

Layer 6 recursively reads `.json`, `.geojson`, and `.csv` files from `dataset/`. The adapter detects common parcel-id, owner, address, confidence, verification, conflict, CRS, area, and geometry field names. It groups all records for the same parcel ID into a unified field-survey view.

## Run

```bash
cd layer6
npm install
npm start
```

Open `http://localhost:3606`.

If your shared dataset is elsewhere:

```bash
DATASET_DIR=/absolute/path/to/dataset npm start
```

Optional cross-layer navigation:

```bash
LAYER1_URL=http://localhost:3001 \
LAYER4_URL=http://localhost:3004 \
LAYER3_URL=http://localhost:3003 \
npm start
```

The UI appends `?parcelId=<selected parcel>` when navigating to Layer 4 so the receiving layer can open the same parcel.

## Four screens

1. Survey Queue
2. Field Survey Workspace
3. Evidence & Ground Verification + geometry comparison
4. Survey Completion Report

## Survey lifecycle

- `NOT_REQUESTED`
- `REQUESTED`
- `ASSIGNED`
- `IN_PROGRESS`
- `COMPLETED`
- `REQUIRES_RESURVEY`
- `ESCALATED`

## Main API

- `GET /api/surveys`
- `GET /api/surveys/:parcelId`
- `POST /api/surveys/:parcelId/request`
- `POST /api/surveys/:parcelId/assign`
- `POST /api/surveys/:parcelId/start`
- `POST /api/surveys/:parcelId/position`
- `POST /api/surveys/:parcelId/points`
- `POST /api/surveys/:parcelId/points/undo`
- `POST /api/surveys/:parcelId/close`
- `POST /api/surveys/:parcelId/reset`
- `POST /api/surveys/:parcelId/verification`
- `POST /api/surveys/:parcelId/evidence`
- `POST /api/surveys/:parcelId/complete`
- `POST /api/surveys/:parcelId/resurvey`
- `POST /api/surveys/:parcelId/escalate`

Integration endpoint for Layer 3/4:

- `POST /api/integration/request-field-verification`

Body:

```json
{
  "parcelId": "<parcel id already selected in Layer 3/4>",
  "context": {
    "sourceLayer": "<calling layer>",
    "reason": "<reason already derived by that layer>"
  }
}
```

The response returns `layer6Path`, which can be opened directly.

## Dataset-only rule

Parcel IDs, owners, addresses, source geometries, source areas, confidence, last-verification dates, source conflicts and source priority/assignment are read from `dataset/` only.

New survey observations are not written back into departmental records. They are stored in `SurveyData/` as a new field-evidence source.

The following values are calculated from dataset geometry or captured field evidence:

- field polygon and field area
- Survey ↔ Field and Revenue ↔ Field similarity (intersection-over-union)
- area deltas
- largest boundary deviation and direction
- queue priority when the dataset does not already provide priority (relative rank within the dataset; no parcel-specific constants)
- updated confidence (mean of available source confidence, geometry agreement and recorded field verification signals)
- geometry recommendation
- simulated GNSS accuracy indicator (derived from coordinate precision in source geometry)
- simulated signal profile (derived from source geometry vertex count + source count)

No parcel such as `P007`, owner name, area, confidence, comparison percentage, boundary distance, assignee, or report outcome is hardcoded in the app.

## Layer 3 / Layer 4 integration

From either layer, the "Request Field Verification" action should call Layer 6:

```js
await fetch('http://localhost:3606/api/integration/request-field-verification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parcelId: selectedParcelId,
    context: {
      sourceLayer: 'layer4',
      reason: selectedConflictReason
    }
  })
});
window.location.href = `http://localhost:3606/?parcelId=${encodeURIComponent(selectedParcelId)}`;
```

On Layer 6 completion, `SurveyData/integration-events.json` contains a `FIELD_SURVEY_COMPLETED` event with the parcel ID, updated confidence and recommendation. Layer 3/4 can read that evidence in their backend without modifying the original departmental dataset.


## Layer 1 return navigation

Open Layer 6 with `?returnTo=<encoded Layer 1 URL>`. Layer 6 uses that exact address for its **Layer 1 Dashboard** button; `LAYER1_URL` remains a fallback.
