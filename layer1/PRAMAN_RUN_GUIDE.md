# PRAMAN — correct local run layout

Layer 1 now reads **live values directly from the sibling `PRAMAN_DATA` folder**. It no longer ships generated parcel/conflict/metric snapshots.

Your project root must look like this:

```text
Reconcile Logs/
├─ layer1/
├─ PRAMAN_DATA/
├─ Unified Spatial View/
├─ Conflict and Reconcilation/
├─ Source and Schema Mapping/
├─ Evidence Layer/
└─ Parcel History/
```

## 1. Layer 1 + Unified Spatial View

Open a PowerShell terminal in the **project root** (`Reconcile Logs`), NOT inside `layer1`.

```powershell
python -m http.server 8000
```

Open:

```text
http://localhost:8000/layer1/
```

The Unified Spatial View card uses the sibling path:

```text
http://localhost:8000/Unified%20Spatial%20View/index.html
```

No separate USV server is required.

## 2. Source & Schema Mapping — fixed port 5173

Open a second PowerShell terminal:

```powershell
cd "Source and Schema Mapping"
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Run `npm install` only the first time (or after dependencies change).

## 3. Conflict & Reconciliation — fixed port 5174

Open a third PowerShell terminal:

```powershell
cd "Conflict and Reconcilation"
npm install
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

`--strictPort` is important. It prevents Vite from silently moving this app to 5173/5175 and causing the cards to open the wrong dashboard.

## 4. Evidence Graph — fixed port 4173

Open a fourth PowerShell terminal:

```powershell
cd "Evidence Layer"
npm run serve
```

This package already defines its server as port 4173.

## 5. Parcel History — fixed port 5175

The complete Parcel History package is now runnable as a Vite frontend. Its Vite base path is `/timeline/`, so Layer 1 links directly to:

```text
http://localhost:5175/timeline/
```

Open a fifth PowerShell terminal:

```powershell
cd "Parcel History"
npm install
npm run generate:layer4 -- "../PRAMAN_DATA"
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

`npm install` is only required the first time (or after dependencies change).

`npm run generate:layer4 -- "../PRAMAN_DATA"` regenerates the Parcel History index, parcel histories, lineage and geometry payloads from the current sibling `PRAMAN_DATA` directory. Run it again whenever `PRAMAN_DATA` changes.

The Parcel History frontend reads the generated `public/layer4-data/` files directly, so the separate legacy Express server on port 3005 is **not required** for the normal Parcel History UI.

## Correct Layer 1 routes

| Card | Destination |
|---|---|
| Unified Spatial View | sibling `/Unified Spatial View/index.html` on port 8000 |
| Conflict View | `http://localhost:5174/` |
| Source and Schema Mapping | `http://localhost:5173/` |
| Evidence Graph | `http://localhost:4173/` |
| Parcel History | `http://localhost:5175/timeline/` |

All dashboard cards are now real `<a>` links, not informational modals. Browser Back returns to Layer 1 because navigation stays in the same tab.
