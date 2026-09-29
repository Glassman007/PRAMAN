import { useEffect, useState } from 'react';
import ParcelHistoryLanding from './ParcelHistoryLanding';
import ParcelTimeline from './ParcelTimeline';
import ParcelLineage from './ParcelLineage';
import './app.css';

function requestedParcelId() {
  return new URLSearchParams(window.location.search).get('parcel');
}

function requestedView() {
  return new URLSearchParams(window.location.search).get('view');
}

export default function App() {
  const [locationVersion, setLocationVersion] = useState(0);

  useEffect(() => {
    const handlePopState = () => setLocationVersion((version) => version + 1);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const parcelId = requestedParcelId();
  const view = requestedView();

  const openParcel = (nextParcelId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('parcel', nextParcelId);
    url.searchParams.delete('view');
    url.searchParams.delete('event');
    window.history.pushState({ parcelId: nextParcelId }, '', url);
    setLocationVersion((version) => version + 1);
  };

  const openLineage = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'lineage');
    window.history.pushState({ parcelId, view: 'lineage' }, '', url);
    setLocationVersion((version) => version + 1);
  };

  const backToHistory = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    window.history.pushState({ parcelId }, '', url);
    setLocationVersion((version) => version + 1);
  };

  const openHistoryForParcel = (nextParcelId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('parcel', nextParcelId);
    url.searchParams.delete('view');
    url.searchParams.delete('event');
    window.history.pushState({ parcelId: nextParcelId }, '', url);
    setLocationVersion((version) => version + 1);
  };

  const backToParcels = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('parcel');
    url.searchParams.delete('view');
    url.searchParams.delete('event');
    window.history.pushState({}, '', url);
    setLocationVersion((version) => version + 1);
  };

  if (!parcelId) {
    return <ParcelHistoryLanding key={`landing-${locationVersion}`} onOpenParcel={openParcel} />;
  }

  if (view === 'lineage') {
    return (
      <div className="layer5-shell" key={`lineage-${parcelId}-${locationVersion}`}>
        <ParcelLineage
          parcelId={parcelId}
          onBackToHistory={backToHistory}
          onBackToParcels={backToParcels}
          onOpenHistory={openHistoryForParcel}
        />
      </div>
    );
  }

  return (
    <div className="layer5-shell" key={`detail-${parcelId}-${locationVersion}`}>
      <ParcelTimeline parcelId={parcelId} onBack={backToParcels} onOpenLineage={openLineage} />
    </div>
  );
}
