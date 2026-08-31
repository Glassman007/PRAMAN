import { useEffect, useState } from 'react';
import ParcelTimeline from './ParcelTimeline';
import { fetchTimelineParcels, TIMELINE_MESSAGES } from './api';
import './app.css';

function requestedParcelId() {
  return new URLSearchParams(window.location.search).get('parcel');
}

export default function App() {
  const [parcels, setParcels] = useState([]);
  const [parcelId, setParcelId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadParcels() {
      try {
        const available = await fetchTimelineParcels();
        if (ignore) return;

        const requested = requestedParcelId();
        setParcels(available);
        if (requested && !available.some((parcel) => parcel.parcelId === requested)) {
          setParcelId(null);
          setError(TIMELINE_MESSAGES.notFound);
          return;
        }

        const selected = requested || available[0]?.parcelId || null;
        if (!selected) {
          setError(TIMELINE_MESSAGES.error);
          return;
        }
        setParcelId(selected);

        if (selected && selected !== requested) {
          const url = new URL(window.location.href);
          url.searchParams.set('parcel', selected);
          window.history.replaceState({}, '', url);
        }
      } catch {
        if (!ignore) setError(TIMELINE_MESSAGES.error);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadParcels();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!parcels.length) return undefined;

    const handlePopState = () => {
      const requested = requestedParcelId();
      if (parcels.some((parcel) => parcel.parcelId === requested)) {
        setError('');
        setParcelId(requested);
      } else if (requested) {
        setParcelId(null);
        setError(TIMELINE_MESSAGES.notFound);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [parcels]);

  const selectParcel = (nextParcelId) => {
    if (!parcels.some((parcel) => parcel.parcelId === nextParcelId)) {
      setError(TIMELINE_MESSAGES.notFound);
      return;
    }
    if (nextParcelId === parcelId) return;

    const url = new URL(window.location.href);
    url.searchParams.set('parcel', nextParcelId);
    window.history.pushState({}, '', url);
    setError('');
    setParcelId(nextParcelId);
  };

  if (loading) {
    return <main className="parcel-timeline-page"><div className="state-card">{TIMELINE_MESSAGES.loading}</div></main>;
  }

  if (error) {
    return <main className="parcel-timeline-page"><div className="state-card state-card--error">{error}</div></main>;
  }

  if (!parcelId) {
    return <main className="parcel-timeline-page"><div className="state-card state-card--error">{TIMELINE_MESSAGES.error}</div></main>;
  }

  return (
    <div className="layer5-shell">
      <ParcelTimeline
        parcels={parcels}
        parcelId={parcelId}
        onSelectParcel={selectParcel}
      />
    </div>
  );
}
