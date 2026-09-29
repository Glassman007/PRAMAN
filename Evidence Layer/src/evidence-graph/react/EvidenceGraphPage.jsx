import { useEffect, useRef } from 'react';
import { mountEvidenceGraphDashboard } from '../dashboard/EvidenceGraphDashboard.mjs';
import '../dashboard/evidenceGraph.css';

export default function EvidenceGraphPage({ datasetBaseUrl = '/PRAMAN_DATA', onReplayRequested, onParcelSelected, onParcelReplayRequested, onReplayStateChange, onOpenConflictExplorer, onNavigateDashboard, dashboardPaths }) {
  const rootRef = useRef(null);

  useEffect(() => {
    let mounted;
    let cancelled = false;
    mountEvidenceGraphDashboard({
      container: rootRef.current,
      datasetBaseUrl,
      stylesheetUrl: null,
      onReplayRequested,
      onParcelSelected,
      onParcelReplayRequested,
      onReplayStateChange,
      onOpenConflictExplorer,
      onNavigateDashboard,
      dashboardPaths,
    }).then((instance) => {
      if (cancelled) instance?.destroy?.();
      else mounted = instance;
    });
    return () => { cancelled = true; mounted?.destroy?.(); };
  }, [datasetBaseUrl, onReplayRequested, onParcelSelected, onParcelReplayRequested, onReplayStateChange, onOpenConflictExplorer, onNavigateDashboard, dashboardPaths]);

  return <div ref={rootRef} style={{ minHeight: 'calc(100vh - var(--praman-nav-height, 0px))', height: '100%' }} />;
}
