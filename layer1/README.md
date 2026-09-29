# PRAMAN Layer 1

This is the Layer 1 main dashboard only.

## Important change

Dataset-derived values are no longer bundled inside Layer 1. At runtime the page reads the sibling `PRAMAN_DATA` directory and calculates the visible dashboard metrics, source coverage, filters and dataset map marker from those files.

Start the server from the parent project folder:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/layer1/
```

See `PRAMAN_RUN_GUIDE.md` for the exact fixed ports for the other dashboards.
