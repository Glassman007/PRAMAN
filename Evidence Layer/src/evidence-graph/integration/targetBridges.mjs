/**
 * Cross-dashboard target-side helpers. These contain no dashboard UI and can be
 * called by the shared PRAMAN shell after a target route mounts.
 */
const clean = (value) => value === null || value === undefined || value === '' ? null : String(value);

function toUrl(locationLike, origin = 'http://praman.local') {
  if (typeof locationLike === 'string') return new URL(locationLike, origin);
  const pathname = locationLike?.pathname || '/';
  const search = locationLike?.search || '';
  const hash = locationLike?.hash || '';
  return new URL(`${pathname}${search}${hash}`, origin);
}

export function readPramanNavigationContext(locationLike, { origin = 'http://praman.local' } = {}) {
  const url = toUrl(locationLike, origin);
  const p = url.searchParams;
  return {
    parcelId: clean(p.get('parcel')),
    conflictId: clean(p.get('conflict')),
    sourceId: clean(p.get('source') || p.get('ssm_source')),
    geometryId: clean(p.get('geometry')),
    versionId: clean(p.get('version')),
    eventId: clean(p.get('event')),
    returnTo: clean(p.get('returnTo')),
  };
}

/**
 * Current Unified Spatial View exposes window.PRAMAN_SPATIAL_VIEW.selectParcel.
 * This bridge applies the Evidence Graph parcel handoff without modifying the map.
 */
export function applyUnifiedSpatialViewContext({
  locationLike = globalThis.location ?? null,
  spatialApi = globalThis.PRAMAN_SPATIAL_VIEW ?? null,
  openPanel = true,
} = {}) {
  const context = readPramanNavigationContext(locationLike || '/unified-spatial-view');
  if (!context.parcelId) return { applied: false, reason: 'NO_PARCEL_CONTEXT', context };
  if (!spatialApi || typeof spatialApi.selectParcel !== 'function') {
    return { applied: false, reason: 'SPATIAL_API_UNAVAILABLE', context };
  }
  const selected = spatialApi.selectParcel(context.parcelId, Boolean(openPanel));
  return { applied: Boolean(selected), reason: selected ? null : 'PARCEL_NOT_FOUND', context };
}

export function getEvidenceGraphReturnHref(locationLike = globalThis.location ?? null, options = {}) {
  return readPramanNavigationContext(locationLike || '/', options).returnTo;
}
