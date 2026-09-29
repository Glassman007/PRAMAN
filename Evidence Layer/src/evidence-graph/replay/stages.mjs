export const DEFAULT_STAGE_DURATION_MS = 2600;

// Internal lifecycle operation registry used by the continuous waterfall.
// These entries are sequencing metadata, not user-facing slideshow stages.
export const REPLAY_STAGES = Object.freeze([
  Object.freeze({
    id: 'sources', label: 'Sources',
    description: 'SOURCE ARRIVAL — heterogeneous source datasets entering PRAMAN before matching or reconciliation. Counts refer to source observations, not canonical parcels.'
  }),
  Object.freeze({
    id: 'adapters', label: 'Adapters',
    description: 'ADAPTER PROCESSING — actual source datasets fan into the PRAMAN conceptual adapter families required by their data behaviour. Counts are derived from routed source observations and normalized-output coverage.',
    limitation: 'The dataset stores no adapter execution/run identities. Source→adapter routing follows the project adapter architecture; displayed counts are deterministic coverage over real source observations, not execution logs.'
  }),
  Object.freeze({
    id: 'normalization', label: 'Normalization',
    description: 'GLOBAL NORMALIZATION — adapter outputs converge into a comparable evidence space while source identifiers, original geometry and provenance remain preserved.'
  }),
  Object.freeze({
    id: 'matching', label: 'Matching',
    description: 'PARCEL MATCHING — normalized evidence forms recorded candidate relationships, recorded observation-level matching evidence, and parcel-level outcomes from RECONCILED_PARCELS. No pairwise classifier score, solver execution log, or structured distortion output is fabricated.',
    limitation: 'Candidate associations and parcel-level outcomes are recorded. Pairwise classifier probabilities, per-alternative scores, solver costs, vetoes, adjacency/topology feature vectors and pairwise accept/reject decisions are not stored.'
  }),
  Object.freeze({
    id: 'conflict-detection', label: 'Conflict Detection',
    description: 'CONFLICT DETECTION — parcel identity is already established; explicit conflict records show what the matched evidence disagrees about, grouped by recorded conflict category.'
  }),
  Object.freeze({
    id: 'reconciliation', label: 'Reconciliation',
    description: 'Dataset-backed reconciliation proposals over each parcel evidence set.'
  }),
  Object.freeze({
    id: 'authority-review', label: 'Authority / Review',
    description: 'AUTHORITY / REVIEW — AI CONFIDENCE ≠ LEGAL / AUTHORITATIVE STATUS. System inference and proposed state remain separate from recorded governance/review events and the recorded authoritative state.'
  }),
  Object.freeze({
    id: 'canonical-state', label: 'Canonical State',
    description: 'AUTHORITATIVE CANONICAL STATE — governed evidence converges into the current canonical parcel registry while every earlier evidence operation remains visible and traceable.'
  }),
  Object.freeze({
    id: 'history-lineage', label: 'History / Lineage',
    description: 'Historical parcels, geometry versions, split/merge lineage and GeoGit event history.'
  })
]);

const REPLAY_STAGE_BY_ID = new Map(REPLAY_STAGES.map((stage, index) => [stage.id, { ...stage, index }]));

export function getReplayStage(indexOrId) {
  if (typeof indexOrId === 'string') return REPLAY_STAGE_BY_ID.get(indexOrId) ?? null;
  const index = Math.max(0, Math.min(REPLAY_STAGES.length - 1, Number(indexOrId) || 0));
  return { ...REPLAY_STAGES[index], index };
}
