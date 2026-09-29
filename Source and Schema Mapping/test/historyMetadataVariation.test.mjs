import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'data-contract.json'), 'utf8'));
assert.ok(contract.sources.length >= 1, 'contract must contain at least one source');

const first = contract.sources[0];
const second = contract.sources[1] ?? null;
const syntheticContract = structuredClone(contract);
syntheticContract.source_schema_history = {
  available: true,
  events: [
    { source_id: first.source_id, event_type: 'TEST_EVENT', timestamp: '2099-01-01T00:00:00Z', changed_field: 'test-only' }
  ],
  schema_versions: [
    { source_id: first.source_id, version: 'test-schema-version', timestamp: '2099-01-01T00:00:00Z' }
  ],
  mapping_versions: [
    { source_id: first.source_id, version: 'test-mapping-version', timestamp: '2099-01-01T00:00:00Z' }
  ],
  templates: [
    { source_id: first.source_id, template_id: 'test-template' }
  ]
};

let source = fs.readFileSync(path.join(root, 'src/sourceSchemaMappingService.js'), 'utf8');
source = source.replace(/import contract from .*?;\n/, '');
source = source.replace('export function createSourceSchemaMappingService', 'function createSourceSchemaMappingService');
source = source.replace(/export \{[^}]+\};?/g, '');
source += '\n;globalThis.__serviceFactory = createSourceSchemaMappingService;';
const context = vm.createContext({ console, structuredClone });
context.contract = syntheticContract;
source = source.replace('export const sourceSchemaMappingService = createSourceSchemaMappingService(contract);', 'globalThis.__defaultService = createSourceSchemaMappingService(globalThis.contract);');
new vm.Script(source, { filename: 'sourceSchemaMappingService.js' }).runInContext(context);
const service = context.__serviceFactory({ contract: syntheticContract });

const firstHistory = service.getSourceSchemaHistory(first.source_id);
assert.equal(firstHistory.available, true);
assert.equal(firstHistory.events.length, 1);
assert.equal(firstHistory.schemaVersions.length, 1);
assert.equal(firstHistory.mappingVersions.length, 1);
assert.equal(firstHistory.templates.length, 1);

if (second) {
  const secondHistory = service.getSourceSchemaHistory(second.source_id);
  assert.equal(secondHistory.events.length, 0, 'history must not leak across sources');
  assert.equal(secondHistory.schemaVersions.length, 0, 'schema versions must not leak across sources');
  assert.equal(secondHistory.mappingVersions.length, 0, 'mapping versions must not leak across sources');
  assert.equal(secondHistory.templates.length, 0, 'templates must not leak across sources');
}

console.log('history metadata variation test passed');
