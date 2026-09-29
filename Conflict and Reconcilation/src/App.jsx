import { useEffect, useState } from 'react';
import ConflictExplorer from './components/ConflictExplorer.jsx';
import ParcelConflictCaseDetail from './components/ParcelConflictCaseDetail.jsx';
import ReconciliationEntry from './components/ReconciliationEntry.jsx';
import { loadPramanDataset } from './data/pramanDataService.js';
import {
  navigateWorkspace,
  openConflictCase,
  openConflictExplorer,
  openReconciliation,
  readWorkspaceLocation,
  selectConflictInCase,
  selectConflictInReconciliation,
  updateExplorerRouteState,
} from './navigation/workspaceNavigation.js';

export default function App() {
  const [location, setLocation] = useState(() => readWorkspaceLocation());
  const [datasetState, setDatasetState] = useState({ status: 'loading', model: null, error: null });

  useEffect(() => {
    const onLocationChange = () => setLocation(readWorkspaceLocation());
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  useEffect(() => {
    let active = true;
    loadPramanDataset()
      .then((model) => active && setDatasetState({ status: 'ready', model, error: null }))
      .catch((error) => {
        console.error('[PRAMAN dataset runtime] Failed to initialize.', error);
        if (active) setDatasetState({ status: 'error', model: null, error });
      });
    return () => { active = false; };
  }, []);

  const model = datasetState.model;
  const isReconcile = location.view === 'reconcile';
  const isCaseDetail = location.view === 'conflicts' && Boolean(location.parcelId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand">P.R.A.M.A.N</div>
          <div className="subtitle">Parcel conflict intelligence</div>
        </div>
        <nav aria-label="PRAMAN conflict navigation">
          <button
            className={!isReconcile ? 'active' : ''}
            onClick={openConflictExplorer}
            type="button"
          >
            Conflict Explorer
          </button>
        </nav>
      </header>

      {datasetState.status === 'loading' && (
        <main className="app-main"><div className="loading-state">Loading and indexing the production parcel dataset…</div></main>
      )}

      {datasetState.status === 'error' && (
        <main className="app-main">
          <div className="load-error">
            <strong>Production dataset runtime could not be initialized.</strong>
            <span>{datasetState.error?.message ?? 'Unknown dataset error.'}</span>
          </div>
        </main>
      )}

      {datasetState.status === 'ready' && model && (
        <main className="app-main">
          {isReconcile ? (
            <ReconciliationEntry
              model={model}
              parcelId={location.parcelId}
              selectedConflictId={location.selectedConflictId}
              openConflictIds={location.openConflictIds}
              context={location.context}
              onBackToExplorer={openConflictExplorer}
              onOpenCase={(conflictId) => navigateWorkspace({
                view: 'conflicts',
                parcelId: location.parcelId,
                selectedConflictId: conflictId,
              })}
              onSelectConflict={(conflictId) => selectConflictInReconciliation(
                location.parcelId,
                conflictId,
                model.parcelConflictCaseByParcelId.get(location.parcelId)?.openConflicts.map((conflict) => conflict.conflict_id) ?? []
              )}
            />
          ) : isCaseDetail ? (
            <ParcelConflictCaseDetail
              model={model}
              parcelId={location.parcelId}
              selectedConflictId={location.selectedConflictId}
              onSelectConflict={(conflictId) => selectConflictInCase(location.parcelId, conflictId)}
              onBack={openConflictExplorer}
              onReconcile={(parcelCase, conflictId) => openReconciliation(
                parcelCase.parcelId,
                conflictId,
                parcelCase.openConflicts.map((conflict) => conflict.conflict_id)
              )}
            />
          ) : (
            <ConflictExplorer
              model={model}
              explorerState={location.explorerState}
              onExplorerStateChange={updateExplorerRouteState}
              onSelectCase={openConflictCase}
            />
          )}
        </main>
      )}
    </div>
  );
}
