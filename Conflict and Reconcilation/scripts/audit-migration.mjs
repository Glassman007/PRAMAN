import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const sourceRoots = ['src', 'index.html', 'package.json'];
const forbidden = [
  /localhost:5173/i,
  /localhost:5174/i,
  /VITE_RECONCILIATION_URL/,
  /VITE_CONFLICT_REVIEW_URL/,
  /parcel-grid\.png/i,
  /assignmentStage/,
  /ASSIGNMENT_OPTIONS/,
  /Queue age/i,
  /\bSuggested\b/,
  /\bIn Progress\b/,
  /\bEscalated\b/,
  /\bDesk Review\b/,
  /\bField Review\b/,
  /\bSenior Review\b/,
  /\bUnassigned\b/
];

async function collect(path) {
  const s = await stat(path);
  if (s.isFile()) return [path];
  const out = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    out.push(...await collect(join(path, entry.name)));
  }
  return out;
}

const files = [];
for (const item of sourceRoots) files.push(...await collect(join(root, item)));

const failures = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) failures.push(`${relative(root, file)} matches ${pattern}`);
  }
}

const publicRoot = join(root, 'public');
const publicFiles = await collect(publicRoot);
if (publicFiles.some((file) => file.includes('99 Eval only'))) {
  failures.push('Evaluation-only dataset material is present under public/.');
}

if (failures.length) {
  console.error('Migration audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Migration audit passed: no legacy cross-port, queue, static-map, or invented-workflow assumptions remain in application sources.');
