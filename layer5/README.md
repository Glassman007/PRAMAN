# Layer 5 — Parcel Timeline

React + Express implementation of the dataset-backed Parcel Timeline, integrated
with Layer 1 through the `/timeline/` route.

## Requirements

- Node.js 18+
- npm 9+

## Run in development

From the `layer5` folder:

```bash
npm install
npm run dev
```

Open Layer 1 at `http://localhost:3005/layer1/` and choose **Timeline**. The
backend redirects the timeline route to Vite while the development frontend is
running. Vite proxies relative `/api` requests to Express.

## Production-style run

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3005/layer1/`. Express serves Layer 1, the compiled Layer
5 application at `/timeline/`, its refresh fallback, and the API on the same
origin.

## API

- `GET /api/timeline/parcels` — lightweight list of current Dataset parcels
- `GET /api/parcels/:parcelId/timeline` — current state, history and
  departmental events, and explicit merge lineage for a canonical ID
- `GET /api/health` — service health

See [DATA_CONTRACT.md](./DATA_CONTRACT.md) for field-level provenance and the
lineage rules.

## Structure

```text
layer5/
├── backend/
│   ├── dataset.repository.js
│   ├── server.js
│   ├── parcelTimeline.routes.js
│   └── parcelTimeline.service.js
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── ParcelTimeline.jsx
│   │   ├── parcelTimeline.css
│   │   └── app.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── DATA_CONTRACT.md
├── package.json
└── README.md
```
