const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed;
  } catch {
    return fallback;
  }
}

class SurveyStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.file = path.join(baseDir, 'field-surveys.json');
    this.eventsFile = path.join(baseDir, 'integration-events.json');
    this.evidenceDir = path.join(baseDir, 'evidence');
    ensureDir(baseDir);
    ensureDir(this.evidenceDir);
  }

  readAll() {
    const value = safeReadJson(this.file, { surveys: {} });
    return value && typeof value === 'object' && value.surveys ? value : { surveys: {} };
  }

  writeAll(data) {
    ensureDir(this.baseDir);
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, this.file);
  }

  get(parcelId) {
    const data = this.readAll();
    return data.surveys[String(parcelId)] || null;
  }

  upsert(parcelId, patch) {
    const key = String(parcelId);
    const data = this.readAll();
    const previous = data.surveys[key] || { parcelId: key, status: 'NOT_REQUESTED', points: [], evidence: [] };
    const next = { ...previous, ...patch, parcelId: key };
    if (patch.points) next.points = patch.points;
    if (patch.evidence) next.evidence = patch.evidence;
    data.surveys[key] = next;
    this.writeAll(data);
    return next;
  }

  update(parcelId, updater) {
    const current = this.get(parcelId) || { parcelId: String(parcelId), status: 'NOT_REQUESTED', points: [], evidence: [] };
    return this.upsert(parcelId, updater({ ...current }));
  }

  addEvent(event) {
    const data = safeReadJson(this.eventsFile, { events: [] });
    const events = Array.isArray(data.events) ? data.events : [];
    events.push(event);
    fs.writeFileSync(this.eventsFile, JSON.stringify({ events }, null, 2));
    return event;
  }

  parcelEvidenceDir(parcelId) {
    const clean = String(parcelId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(this.evidenceDir, clean);
    ensureDir(dir);
    return dir;
  }
}

module.exports = { SurveyStore };
