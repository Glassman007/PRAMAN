# Prompt 6 — Conflict → Reconcile → Conflict Integration

## Integrated flow

The conflict-review workflow now behaves as one application process:

`Conflict Explorer → Parcel Conflict Case → Open Reconciliation → Return to Conflict Explorer`

There is no home-page Reconciliation card and no permanent Reconciliation navigation tab.

## Restorable explorer context

Conflict Explorer search, filters, sort direction, sort field, and pagination are represented in the same URL-backed workspace state used by parcel and reconciliation navigation. Opening a case or Reconciliation preserves that explorer context. Returning after a reviewer action restores the selected parcel/conflict and the available explorer context rather than starting from an unrelated queue state.

## Robust route reconstruction

Reconciliation reconstructs its case from stable dataset identifiers. A valid parcel ID and selected conflict ID are required. Missing, invalid, or foreign conflict IDs produce an explicit error state with a route back to Conflict Explorer; they do not silently select another conflict or an arbitrary parcel.

URL-provided open-conflict IDs remain navigation context only. Dataset indexes remain authoritative when the workspace reconstructs unresolved/open conflict information.

## Reviewer activity isolation

Prototype reviewer actions are stored in a dedicated local reviewer-state namespace. Storage is keyed by parcel ID and conflict ID, and each action receives a stable action ID. Actions, notes, and modified-proposal drafts never mutate `CONFLICTS`, `RECONCILED_PARCELS`, or another CSV-derived object.

When the reviewer returns to the parcel investigation, the latest reviewer/session action for that parcel/conflict can be shown separately from the dataset status.

## Evaluation isolation

The runtime public-data tree contains only the required production tables. Evaluation-only answer keys and benchmark material are neither exposed through the runtime manifest nor read by Conflict Explorer or Reconciliation.
