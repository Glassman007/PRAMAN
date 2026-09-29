const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const LAYER4_DATA_BASE = `${import.meta.env.BASE_URL}layer4-data`;

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

async function requestStaticJson(path) {
  const response = await fetch(`${LAYER4_DATA_BASE}${path}`);
  if (!response.ok) {
    const error = new Error(response.status === 404 ? 'PARCEL_NOT_FOUND' : 'STATIC_DATA_ERROR');
    error.code = response.status === 404 ? 'PARCEL_NOT_FOUND' : 'STATIC_DATA_ERROR';
    throw error;
  }
  return response.json();
}


const geometryCache = new Map();

export async function fetchGeometryVersion(geometryId) {
  if (!geometryId || typeof geometryId !== 'string') {
    const error = new Error('GEOMETRY_NOT_FOUND');
    error.code = 'GEOMETRY_NOT_FOUND';
    throw error;
  }

  if (!geometryCache.has(geometryId)) {
    geometryCache.set(geometryId, requestStaticJson(`/geometries/${encodeURIComponent(geometryId)}.json`).then((payload) => {
      if (
        !payload
        || payload.schemaVersion !== 'layer4-geometry-v1'
        || payload.geometryId !== geometryId
        || typeof payload.geometryWkt !== 'string'
      ) {
        const error = new Error('INVALID_LAYER4_GEOMETRY');
        error.code = 'INVALID_LAYER4_GEOMETRY';
        throw error;
      }
      return payload;
    }).catch((error) => {
      geometryCache.delete(geometryId);
      throw error;
    }));
  }

  return geometryCache.get(geometryId);
}

let parcelIndexPromise = null;

export async function fetchParcelHistoryIndex() {
  if (!parcelIndexPromise) {
    parcelIndexPromise = requestStaticJson('/index.json').then((payload) => {
      if (!payload || !Array.isArray(payload.parcels) || !payload.facets || !payload.counts) {
        throw new Error('INVALID_LAYER4_INDEX');
      }
      return payload;
    });
  }
  return parcelIndexPromise;
}


export async function fetchParcelHistoryDetail(parcelId) {
  if (!parcelId || typeof parcelId !== 'string') {
    const error = new Error(TIMELINE_MESSAGES.notFound);
    error.code = 'PARCEL_NOT_FOUND';
    throw error;
  }

  const payload = await requestStaticJson(`/parcels/${encodeURIComponent(parcelId)}.json`);
  if (
    !payload
    || payload.schemaVersion !== 'layer4-history-v3'
    || !payload.parcel
    || payload.parcel.parcelId !== parcelId
    || !Array.isArray(payload.events)
  ) {
    const error = new Error(TIMELINE_MESSAGES.error);
    error.code = 'INVALID_LAYER4_PARCEL';
    throw error;
  }
  return payload;
}

export async function fetchTimelineParcels() {
  try {
    const payload = await fetchParcelHistoryIndex();
    return payload.parcels.map((parcel) => ({
      parcelId: parcel.parcelId,
      displayName: `${parcel.parcelId} — ${parcel.primaryStatus || 'Status unavailable'}`,
      owner: null
    }));
  } catch {
    const payload = await requestJson('/timeline/parcels');
    if (!Array.isArray(payload)) throw new TimelineApiError('API_ERROR');
    return payload.filter((parcel) => parcel && typeof parcel.parcelId === 'string');
  }
}

export async function fetchParcelTimeline(parcelId) {
  try {
    const payload = await requestStaticJson(`/parcels/${encodeURIComponent(parcelId)}.json`);
    if (!payload || typeof payload !== 'object') throw new Error('INVALID_LAYER4_PARCEL');
    return {
      parcel: payload.parcel && typeof payload.parcel === 'object' ? payload.parcel : {},
      lineage: payload.lineage && typeof payload.lineage === 'object' ? payload.lineage : null,
      events: Array.isArray(payload.events) ? payload.events.filter((event) => event && typeof event === 'object') : []
    };
  } catch (error) {
    if (error?.code === 'PARCEL_NOT_FOUND') {
      try {
        const payload = await requestJson(`/parcels/${encodeURIComponent(parcelId)}/timeline`);
        return {
          parcel: payload.parcel && typeof payload.parcel === 'object' ? payload.parcel : {},
          lineage: payload.lineage && typeof payload.lineage === 'object' ? payload.lineage : null,
          events: Array.isArray(payload.events) ? payload.events.filter((event) => event && typeof event === 'object') : []
        };
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    throw new TimelineApiError('API_ERROR');
  }
}
