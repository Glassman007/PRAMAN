const STORAGE_PREFIX = 'praman.reconciliation.review.v2:';

export const REVIEW_ACTIONS = Object.freeze([
  Object.freeze({ value: 'ACCEPT_PROPOSAL', label: 'Accept proposal' }),
  Object.freeze({ value: 'MODIFY_PROPOSAL', label: 'Modify proposal' }),
  Object.freeze({ value: 'REQUEST_ADDITIONAL_EVIDENCE', label: 'Request additional evidence' }),
  Object.freeze({ value: 'REJECT_PROPOSAL', label: 'Reject proposal' }),
  Object.freeze({ value: 'ESCALATE_AUTHORITY_REVIEW', label: 'Escalate for authority review' }),
]);

function storageAvailable() {
  try {
    return typeof window !== 'undefined' && window.localStorage;
  } catch {
    return false;
  }
}

function encoded(value) {
  return encodeURIComponent(String(value ?? ''));
}

function keyFor(parcelId, conflictId) {
  return `${STORAGE_PREFIX}${encoded(parcelId)}:${encoded(conflictId)}`;
}

function parcelKeyPrefix(parcelId) {
  return `${STORAGE_PREFIX}${encoded(parcelId)}:`;
}

function readBucket(parcelId, conflictId) {
  if (!parcelId || !conflictId || !storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(parcelId, conflictId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[PRAMAN reviewer state] Could not read local reviewer state.', error);
    return null;
  }
}

function createActionId(parcelId, conflictId) {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${globalThis.performance?.now?.().toFixed?.(3) ?? '0'}`;
  return `${parcelId}::${conflictId}::${suffix}`;
}

export function getReviewActionLabel(action) {
  return REVIEW_ACTIONS.find((item) => item.value === action)?.label ?? action ?? '';
}

export function loadReviewerActivity(parcelId, conflictId = null) {
  if (!parcelId || !storageAvailable()) return [];
  const buckets = [];
  if (conflictId) {
    const bucket = readBucket(parcelId, conflictId);
    if (bucket) buckets.push(bucket);
  } else {
    const prefix = parcelKeyPrefix(parcelId);
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const raw = window.localStorage.getItem(key);
        if (raw) buckets.push(JSON.parse(raw));
      }
    } catch (error) {
      console.warn('[PRAMAN reviewer state] Could not enumerate local reviewer activity.', error);
    }
  }

  return buckets
    .flatMap((bucket) => Object.values(bucket.actionsById ?? {}))
    .filter((entry) => entry?.parcelId === parcelId && (!conflictId || entry.conflictId === conflictId))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export function loadReviewerState(parcelId, conflictId) {
  const activity = loadReviewerActivity(parcelId, conflictId);
  return activity[0] ?? null;
}

export function saveReviewerState(parcelId, conflictId, state) {
  if (!parcelId || !conflictId) {
    throw new Error('Reviewer state requires stable parcel and conflict identifiers.');
  }

  const actionId = state.actionId || createActionId(parcelId, conflictId);
  const nextAction = {
    ...state,
    actionId,
    parcelId,
    conflictId,
    storageScope: 'reviewer-local-state',
    updatedAt: new Date().toISOString(),
  };

  if (!storageAvailable()) return nextAction;

  const current = readBucket(parcelId, conflictId) ?? {
    parcelId,
    conflictId,
    storageScope: 'reviewer-local-state',
    actionsById: {},
    latestActionId: null,
  };
  const nextBucket = {
    ...current,
    parcelId,
    conflictId,
    actionsById: {
      ...(current.actionsById ?? {}),
      [actionId]: nextAction,
    },
    latestActionId: actionId,
  };

  try {
    window.localStorage.setItem(keyFor(parcelId, conflictId), JSON.stringify(nextBucket));
    window.dispatchEvent(new CustomEvent('praman-reviewer-state-changed', {
      detail: { parcelId, conflictId, actionId },
    }));
  } catch (error) {
    console.warn('[PRAMAN reviewer state] Could not persist local reviewer state.', error);
  }
  return nextAction;
}

export function clearReviewerState(parcelId, conflictId = null) {
  if (!parcelId || !storageAvailable()) return;
  try {
    if (conflictId) {
      window.localStorage.removeItem(keyFor(parcelId, conflictId));
      return;
    }
    const prefix = parcelKeyPrefix(parcelId);
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch (error) {
    console.warn('[PRAMAN reviewer state] Could not clear local reviewer state.', error);
  }
}
