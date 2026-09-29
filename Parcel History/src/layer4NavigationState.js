export function layer4EventSelectionKey(event) {
  return event?.adapter_event_key || event?.event_id || null;
}

export function readLayer4SelectedEvent(locationLike) {
  const search = locationLike?.search ?? window.location.search;
  return new URLSearchParams(search).get('event');
}

export function urlWithLayer4SelectedEvent(locationLike, event) {
  const location = locationLike || window.location;
  const url = new URL(location.href || `${location.origin}${location.pathname || '/'}${location.search || ''}${location.hash || ''}`);
  const key = typeof event === 'string' ? event : layer4EventSelectionKey(event);
  if (key) url.searchParams.set('event', key);
  else url.searchParams.delete('event');
  return url;
}
