# PRAMAN Layer 4 — Visual Cleanup

## Scope

This pass changes presentation, responsive behavior, loading treatment, and accessibility only. It does not change Layer 4 adapters, generated parcel data, authoritative/historical/proposed state selection, event normalization, lineage relationships, cross-dashboard routing contracts, or geometry selection semantics.

## Progressive disclosure retained

The interaction remains:

1. Parcel directory
2. Parcel History
3. Event Inspector
4. Historical / geometry detail when explicitly requested
5. Evidence / Conflict / Unified Spatial View only through outbound links

Parcel Lineage remains an explicit Layer 4 sub-view and is not shown automatically.

## Visual hierarchy

- Parcel ID remains the strongest page identity.
- Current Authoritative State now uses a solid, quiet container with stronger text hierarchy rather than green fill.
- A selected timeline event gets a persistent inset marker and stronger border/background while the Event Inspector is open.
- Historical State remains muted/slate but retains readable text contrast, visible date/version information, and the existing Return to Current State action.
- Proposed Change remains a separate dashed container with NOT AUTHORITATIVE and review status semantics unchanged.
- Technical Provenance remains visually lowest and collapsed by default.

## Timeline accessibility

The established semantic colors are retained:

- Survey — blue
- Geometry change — purple
- Approval — green
- Mutation — orange
- Split — gold
- Merge — indigo
- Conflict — red
- Metadata — grey

Event types remain text-labelled and icon-labelled. Marker outlines now also differ independently of color:

- Geometry: squared/diamond-like outline treatment
- Mutation: dashed circular marker
- Split: asymmetric branching marker treatment
- Merge: double-ring marker
- Conflict: squared warning marker
- Metadata: dotted outline

All event accent colors used after cleanup exceed 4.5:1 contrast against the neutral Layer 4 background. The lowest checked event accent is Merge at approximately 5.63:1.

## Responsive behavior

Desktop remains Timeline left / State right.

At tablet/mobile widths the visual order becomes:

1. Parcel identity/header
2. Current/Historical state inspector and Proposed Change
3. Historical event timeline
4. Event Inspector as an explicit drawer/dialog

The Parcel Lineage graph retains scroll/pan. `Fit Graph` now has a 0.84 minimum scale so labels are not reduced to an unreadable size simply to force the entire graph into the viewport.

## Loading treatment

Text-only loading placeholders were replaced with restrained skeleton structures for:

- parcel directory rows
- parcel history header/timeline/state layout
- parcel lineage graph shell

Skeletons contain no fake IDs, values, dates, owners, parcel states, or geometry values. They use a low-key opacity pulse and respect reduced-motion preferences.

## Keyboard and focus behavior

- Existing buttons/links/selects retain keyboard navigation.
- Shared visible focus rings are applied to interactive controls.
- Event Inspector exposes dialog semantics, receives focus when opened, supports Escape, and restores prior focus when closed.
- Expanded geometry viewer receives/restores focus in the same way.
- Selected timeline events expose `aria-pressed` in addition to visual selection.
- Reduced-motion preferences suppress non-essential transition/animation duration.

## Files changed from the previous integrated Layer 4 build

Presentation/UI only:

- `src/ParcelHistoryLanding.jsx`
- `src/ParcelLineage.jsx`
- `src/ParcelTimeline.jsx`
- `src/SpatialHistory.jsx`
- `src/app.css`
- `src/parcelHistoryLanding.css`
- `src/parcelLineage.css`
- `src/parcelTimeline.css`
- `src/spatialHistory.css`

Added validation:

- `layer4.visualCleanup.test.mjs`
- `LAYER4_VISUAL_CLEANUP_IMPLEMENTATION.md`
- `LAYER4_VISUAL_CLEANUP_TEST_RESULTS.txt`

No adapter/data/model/routing-contract files were changed.
