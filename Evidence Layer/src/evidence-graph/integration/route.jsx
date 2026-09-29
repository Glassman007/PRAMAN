import EvidenceGraphPage from '../react/EvidenceGraphPage.jsx';

export const EVIDENCE_GRAPH_ROUTE = Object.freeze({
  path: '/evidence-graph',
  element: <EvidenceGraphPage datasetBaseUrl="/PRAMAN_DATA" />,
});

// React Router equivalent when routes are declared inline:
// <Route path="/evidence-graph" element={<EvidenceGraphPage datasetBaseUrl="/PRAMAN_DATA" />} />
