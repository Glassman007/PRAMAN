const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const TIMELINE_MESSAGES = Object.freeze({
  loading: 'Loading parcel timeline…',
  empty: 'No recorded timeline events for this parcel.',
  error: 'Unable to load parcel timeline.',
  notFound: 'Parcel not found in dataset.'
});

class TimelineApiError extends Error {
  constructor(code) {
    super(code === 'PARCEL_NOT_FOUND' ? TIMELINE_MESSAGES.notFound : TIMELINE_MESSAGES.error);
    this.code = code;
  }
}

async function requestJson(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new TimelineApiError('API_ERROR');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new TimelineApiError(payload?.error === 'PARCEL_NOT_FOUND' ? 'PARCEL_NOT_FOUND' : 'API_ERROR');
  }
  return payload;
}

export async function fetchTimelineParcels() {
  const payload = await requestJson('/timeline/parcels');
  if (!Array.isArray(payload)) throw new TimelineApiError('API_ERROR');
  return payload.filter((parcel) => parcel && typeof parcel.parcelId === 'string');
}

export async function fetchParcelTimeline(parcelId) {
  const payload = await requestJson(`/parcels/${encodeURIComponent(parcelId)}/timeline`);
  if (!payload || typeof payload !== 'object') throw new TimelineApiError('API_ERROR');

  return {
    parcel: payload.parcel && typeof payload.parcel === 'object' ? payload.parcel : {},
    lineage: payload.lineage && typeof payload.lineage === 'object' ? payload.lineage : null,
    events: Array.isArray(payload.events) ? payload.events.filter((event) => event && typeof event === 'object') : []
  };
}
