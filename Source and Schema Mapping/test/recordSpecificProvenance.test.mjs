import assert from "node:assert/strict";
import fs from "node:fs";
import { createSourceSchemaMappingService, NOT_AVAILABLE } from "../src/sourceSchemaMappingService.js";

const contract = JSON.parse(fs.readFileSync(new URL("../data-contract.json", import.meta.url), "utf8"));
const service = createSourceSchemaMappingService({ contract });
let tested = 0;

for (const source of service.getSources()) {
  const subjects = service.getProvenanceSubjects(source.sourceId);
  for (const issue of service.getExceptionQueue(source.sourceId)) {
    if (!issue.observation_id) continue;
    const subject = subjects.find((item) => item.sourceField === issue.field || item.field === issue.field);
    if (!subject) continue;
    const comparison = service.getExceptionRecordComparison(source.sourceId, issue.issue_id);
    const provenance = service.getAttributeProvenance(source.sourceId, subject.key, {
      observationId: issue.observation_id,
      issueId: issue.issue_id,
    });
    assert.ok(provenance);
    assert.ok(provenance.stages.some((stage) => stage.label === "Source observation" && stage.value === issue.observation_id));

    const expected = comparison?.preservedSourceNativeAttributes?.[issue.field]
      ?? comparison?.normalizedSourceRecord?.[issue.field]
      ?? NOT_AVAILABLE;
    const valueStage = provenance.stages.find((stage) => ["Recorded value", "Normalized value", "Recorded normalized value"].includes(stage.label));
    if (valueStage) assert.equal(String(valueStage.value), String(expected));
    tested += 1;
  }
}

assert.ok(tested > 0, "expected at least one exception-bound provenance case");
console.log(`record-specific provenance regression test passed: ${tested} cases`);
