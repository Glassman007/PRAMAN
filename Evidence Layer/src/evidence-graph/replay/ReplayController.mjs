import { createReplayProjector } from './projection.mjs';
import { DEFAULT_STAGE_DURATION_MS, REPLAY_STAGES, getReplayStage } from './stages.mjs';
import { applyEvidenceExplorationFilters, buildExplorationFilterCatalog, normalizeExplorationFilters } from './explorationFilters.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function progressivelyReveal(structural, currentStageIndex, progress) {
  const nodes = structural.visibleNodes ?? [];
  const edges = structural.visibleEdges ?? [];
  const priorNodes = nodes.filter((node) => Number(node.stageIndex ?? 0) < currentStageIndex);
  const currentNodes = nodes.filter((node) => Number(node.stageIndex ?? 0) === currentStageIndex);
  const normalizedProgress = clamp(Number(progress) || 0, 0, 1);
  const revealCount = normalizedProgress >= 1
    ? currentNodes.length
    : normalizedProgress <= 0
      ? 0
      : Math.max(1, Math.ceil(currentNodes.length * normalizedProgress));
  const visibleNodes = [...priorNodes, ...currentNodes.slice(0, revealCount)];
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  return { visibleNodes, visibleEdges };
}

export class EvidenceReplayController {
  constructor({
    dataLayer,
    mode = 'run',
    parcelId = null,
    stageDurationMs = DEFAULT_STAGE_DURATION_MS,
    playbackSpeed = 1,
    autoSchedule = true,
    tickIntervalMs = 50,
    now = () => Date.now(),
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = (id) => clearInterval(id),
    filters = null,
  } = {}) {
    if (!dataLayer) throw new Error('EvidenceReplayController requires dataLayer');
    if (!(stageDurationMs > 0)) throw new Error('stageDurationMs must be > 0');
    if (!(playbackSpeed > 0)) throw new Error('playbackSpeed must be > 0');
    this.dataLayer = dataLayer;
    this.mode = mode;
    this.parcelId = mode === 'parcel' ? parcelId : null;
    this.stageDurationMs = stageDurationMs;
    this.playbackSpeed = playbackSpeed;
    this.currentStageIndex = 0;
    this.stageProgress = 0;
    this.isPlaying = false;
    this.playbackState = 'idle';
    this.hasStarted = false;
    this.selectedNodeId = null;
    this.listeners = new Set();
    this.projector = createReplayProjector(dataLayer, { mode, parcelId });
    this.filterCatalog = buildExplorationFilterCatalog(dataLayer);
    this.filters = normalizeExplorationFilters(filters || {});
    // Structural graph output changes only when the current internal operation
    // or filters change. Fine-grained reveal happens after this cached projection.
    this.structuralCache = new Map();
    this.autoSchedule = autoSchedule;
    this.tickIntervalMs = tickIntervalMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.lastTickAt = null;
  }

  subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') throw new Error('listener must be a function');
    this.listeners.add(listener);
    if (emitCurrent) listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }

  getStructuralSnapshot() {
    const filterKey = JSON.stringify(this.filters);
    const key = `${this.currentStageIndex}|${filterKey}`;
    let structural = this.structuralCache.get(key);
    if (structural) return structural;

    const projection = this.projector.project(this.currentStageIndex);
    const baseSnapshot = {
      mode: this.mode,
      parcelId: this.parcelId,
      currentStage: getReplayStage(this.currentStageIndex),
      currentStageIndex: this.currentStageIndex,
      stageCount: REPLAY_STAGES.length,
      visibleNodes: projection.nodes,
      visibleEdges: projection.edges,
      selectedNode: null,
      selectedNodeId: null,
      stageProgress: 0,
      timelinePosition: this.currentStageIndex,
      isPlaying: false,
      playbackState: 'idle',
      playbackSpeed: this.playbackSpeed,
      notes: projection.notes,
      metrics: projection.metrics,
      stages: REPLAY_STAGES
    };
    const filtered = applyEvidenceExplorationFilters(baseSnapshot, this.dataLayer, this.filters, this.filterCatalog);
    structural = {
      visibleNodes: filtered.visibleNodes,
      visibleEdges: filtered.visibleEdges,
      notes: filtered.notes,
      metrics: filtered.metrics,
      filters: filtered.filters,
      filterSummary: filtered.filterSummary,
      filterCatalog: this.filterCatalog,
    };
    this.structuralCache.set(key, structural);
    return structural;
  }

  getSnapshot() {
    const structural = this.getStructuralSnapshot();
    const progressive = this.hasStarted && ['running', 'paused'].includes(this.playbackState)
      ? progressivelyReveal(structural, this.currentStageIndex, this.stageProgress)
      : { visibleNodes: structural.visibleNodes, visibleEdges: structural.visibleEdges };
    const selectedNode = this.selectedNodeId ? progressive.visibleNodes.find((n) => n.id === this.selectedNodeId) ?? null : null;
    if (this.selectedNodeId && !selectedNode) this.selectedNodeId = null;
    return {
      mode: this.mode,
      parcelId: this.parcelId,
      currentStage: getReplayStage(this.currentStageIndex),
      currentStageIndex: this.currentStageIndex,
      stageCount: REPLAY_STAGES.length,
      visibleNodes: progressive.visibleNodes,
      visibleEdges: progressive.visibleEdges,
      selectedNode,
      selectedNodeId: selectedNode?.id ?? null,
      stageProgress: this.stageProgress,
      timelinePosition: this.currentStageIndex + this.stageProgress,
      isPlaying: this.isPlaying,
      playbackState: this.playbackState,
      playbackSpeed: this.playbackSpeed,
      notes: structural.notes,
      metrics: structural.metrics,
      stages: REPLAY_STAGES,
      filters: structural.filters,
      filterSummary: structural.filterSummary,
      filterCatalog: structural.filterCatalog,
    };
  }

  setFilters(filters = {}) {
    this.filters = normalizeExplorationFilters(filters);
    this.structuralCache.clear();
    this.selectedNodeId = null;
    return this.emit();
  }

  clearFilters() {
    this.filters = normalizeExplorationFilters({});
    this.structuralCache.clear();
    this.selectedNodeId = null;
    return this.emit();
  }

  startTimer() {
    if (!this.autoSchedule || this.timer) return;
    this.lastTickAt = this.now();
    this.timer = this.setTimer(() => {
      const current = this.now();
      const elapsed = Math.max(0, current - this.lastTickAt);
      this.lastTickAt = current;
      this.advance(elapsed);
    }, this.tickIntervalMs);
  }

  stopTimer() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.lastTickAt = null;
  }

  play() {
    if (this.playbackState === 'completed' || (this.currentStageIndex === REPLAY_STAGES.length - 1 && this.stageProgress >= 1)) {
      this.currentStageIndex = 0;
      this.stageProgress = 0;
      this.selectedNodeId = null;
    }
    if (!this.isPlaying) {
      this.hasStarted = true;
      this.isPlaying = true;
      this.playbackState = 'running';
      this.startTimer();
      this.emit();
    }
    return this.getSnapshot();
  }

  pause() {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.playbackState = 'paused';
      this.stopTimer();
      this.emit();
    }
    return this.getSnapshot();
  }

  advance(elapsedMs) {
    if (!this.isPlaying || !(elapsedMs > 0)) return this.getSnapshot();
    let remaining = (elapsedMs * this.playbackSpeed) / this.stageDurationMs;
    while (remaining > 0) {
      const available = 1 - this.stageProgress;
      if (remaining < available) {
        this.stageProgress += remaining;
        remaining = 0;
      } else {
        remaining -= available;
        if (this.currentStageIndex >= REPLAY_STAGES.length - 1) {
          this.stageProgress = 1;
          this.isPlaying = false;
          this.playbackState = 'completed';
          this.stopTimer();
          remaining = 0;
        } else {
          this.currentStageIndex += 1;
          this.stageProgress = 0;
          this.selectedNodeId = null;
        }
      }
    }
    return this.emit();
  }

  replay() {
    this.stopTimer();
    this.currentStageIndex = 0;
    this.stageProgress = 0;
    this.selectedNodeId = null;
    this.hasStarted = true;
    this.isPlaying = true;
    this.playbackState = 'running';
    this.startTimer();
    return this.emit();
  }

  // Positioning helpers are retained only for URL/deep-link restoration and tests.
  // They are not exposed as user-facing lifecycle navigation controls.
  jumpToStage(indexOrId, { progress = 0 } = {}) {
    this.stopTimer();
    const stage = getReplayStage(indexOrId);
    if (!stage) throw new Error(`Unknown stage ${indexOrId}`);
    this.currentStageIndex = stage.index;
    this.stageProgress = clamp(Number(progress) || 0, 0, 1);
    this.selectedNodeId = null;
    this.isPlaying = false;
    this.playbackState = this.currentStageIndex === REPLAY_STAGES.length - 1 && this.stageProgress >= 1 ? 'completed' : 'paused';
    this.hasStarted = false;
    return this.emit();
  }

  seekTimeline(position) {
    this.stopTimer();
    const max = REPLAY_STAGES.length;
    const value = clamp(Number(position) || 0, 0, max);
    if (value >= max) {
      this.currentStageIndex = REPLAY_STAGES.length - 1;
      this.stageProgress = 1;
    } else {
      this.currentStageIndex = Math.min(REPLAY_STAGES.length - 1, Math.floor(value));
      this.stageProgress = value - this.currentStageIndex;
    }
    this.selectedNodeId = null;
    this.isPlaying = false;
    this.playbackState = this.currentStageIndex === REPLAY_STAGES.length - 1 && this.stageProgress >= 1 ? 'completed' : 'paused';
    this.hasStarted = false;
    return this.emit();
  }

  setPlaybackSpeed(speed) {
    const value = Number(speed);
    if (!(value > 0)) throw new Error('Playback speed must be > 0');
    this.playbackSpeed = value;
    this.lastTickAt = this.isPlaying ? this.now() : null;
    return this.emit();
  }

  selectNode(nodeId) {
    if (!nodeId) {
      this.selectedNodeId = null;
      return this.emit();
    }
    const snapshot = this.getSnapshot();
    if (!snapshot.visibleNodes.some((n) => n.id === nodeId)) throw new Error(`Node ${nodeId} is not visible in the current lifecycle view`);
    this.selectedNodeId = nodeId;
    return this.emit();
  }

  destroy() {
    this.stopTimer();
    this.isPlaying = false;
    this.playbackState = 'idle';
    this.listeners.clear();
    this.structuralCache.clear();
  }
}

export function createEvidenceReplayController(options) { return new EvidenceReplayController(options); }
