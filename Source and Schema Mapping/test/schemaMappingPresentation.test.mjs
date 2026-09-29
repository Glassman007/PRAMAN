import assert from "node:assert/strict";
import fs from "node:fs";

const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard/sourceSchemaMapping.css", import.meta.url), "utf8");

const sourcePos = jsx.indexOf('<h3>Source Schema</h3>');
const pramanPos = jsx.indexOf('<h3>PRAMAN Schema</h3>');
const detailsPos = jsx.indexOf('<h3>Relationship / Mapping Details</h3>');
assert.ok(sourcePos >= 0 && pramanPos > sourcePos && detailsPos > pramanPos, "Schema workspace must read Source Schema → PRAMAN Schema → Relationship / Mapping Details");
assert.doesNotMatch(jsx, /<h3>Mapping Relationships<\/h3>/, "Mapping relationship cards must no longer occupy the center panel");
assert.match(jsx, /<ConnectionOverlay gridRef=\{gridRef\} relationships=\{activeRelationships\}/, "Connector overlay must render only active relationships");
assert.match(jsx, /setActiveRelationIds\(requested \? \[requested\] : \[\]\)/, "Default state must not activate unrelated connectors");
assert.match(jsx, /service\.getMappingAudit\(selected\)/, "Right-side details must consume the audited mapping structure");
assert.match(jsx, /Undocumented derivation/, "Undocumented raw-field derivation must remain an explicit UI state");
assert.match(jsx, /Source-native retained/, "Source-native retention must have a human-readable state");
assert.match(jsx, /Geometry transformation/, "Geometry normalization must have a human-readable state");
assert.match(jsx, /Transformation rule/, "Details panel must show transformation rules");
assert.match(jsx, /Retention rule/, "Details panel must show retention rules");
assert.match(jsx, /Mapping evidence/, "Details panel must show mapping evidence");
assert.match(jsx, /Validation result/, "Details panel must show validation result");
assert.match(jsx, /Why this relationship exists/, "Details panel must include a plain-English explanation");
assert.match(jsx, /Does not establish cross-source parcel identity/, "Identifier interpretation warning must remain intact");
assert.match(jsx, /Export mapping/, "Mapping export must remain available");
assert.match(css, /\.ssm-schema-reading-order/, "Three-column reading order styling must exist");
assert.match(css, /\.ssm-details-panel/, "Persistent details panel styling must exist");
assert.match(css, /\.ssm-connection-overlay path\{opacity:0\}/, "Unselected connector paths must be hidden by default");

console.log("schema mapping presentation regression test passed");
