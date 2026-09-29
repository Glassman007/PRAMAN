import assert from "node:assert/strict";
import fs from "node:fs";
import contract from "../data-contract.json" with { type: "json" };
import { createSourceSchemaMappingService } from "../src/sourceSchemaMappingService.js";

const jsx = fs.readFileSync(new URL("../src/dashboard/SourceSchemaMappingWorkspace.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/dashboard/sourceSchemaMapping.css", import.meta.url), "utf8");

// Three independent native scroll containers must exist.
for (const panel of ["source-schema", "praman-schema", "relationship-details"]) {
  assert.ok(jsx.includes(`data-scroll-panel="${panel}"`), `${panel} must expose its own scroll container`);
}
assert.match(jsx, /const sourceScrollRef = useRef\(null\)/);
assert.match(jsx, /const pramanScrollRef = useRef\(null\)/);
assert.match(jsx, /const detailsScrollRef = useRef\(null\)/);
assert.match(css, /\.ssm-schema-scroll\{[\s\S]*?flex:1 1 auto;[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto;/, "Schema panel body must be a shrinkable native vertical scroller");
assert.match(css, /scrollbar-gutter:stable/, "Scrollbar space must be reserved so it does not cover content");
assert.match(css, /scrollbar-width:thin/, "A visible unobtrusive native scrollbar must be styled for Firefox");
assert.match(css, /::-webkit-scrollbar/, "A visible unobtrusive native scrollbar must be styled for Chromium/WebKit");
assert.match(css, /touch-action:pan-y pinch-zoom/, "Touch/pointer vertical panning must remain native");
assert.match(css, /\.ssm-schema-scroll details\{[^}]*overflow:visible/, "Expanded field groups must contribute their full height to the panel scroller instead of clipping fields inside overflow:hidden");
assert.doesNotMatch(css, /\.ssm-schema-scroll details\{[^}]*overflow:hidden/, "Field groups must not hide content from the native panel scroller");

// Auto-reveal and connector maintenance must operate on the actual scrollers.
assert.match(jsx, /function revealNode\(scrollRef, nodeKey\)/);
assert.match(jsx, /scroller\.scrollTo\(\{ top: Math\.max\(0, scroller\.scrollTop \+ delta\), behavior: "smooth" \}\)/);
assert.match(jsx, /revealRelationshipTarget\(rels\[0\]\)/, "Source selection must auto-reveal a documented destination");
assert.match(jsx, /revealRelationshipSource\(rels\[0\]\)/, "PRAMAN destination selection must auto-reveal a documented source field");
assert.match(jsx, /scrollPanels\.forEach\(panel => panel\.addEventListener\("scroll", update, \{ passive: true \}\)\)/, "Connector geometry must update on schema panel scrolling");
assert.doesNotMatch(jsx, /onScroll=.*setSelectedRelationId/, "Scrolling must not mutate relationship selection state");
assert.doesNotMatch(jsx, /onScroll=.*setSelectedField/, "Scrolling must not mutate field selection state");

// Responsive rules must keep every panel scrollable rather than exposing clipped content.
assert.match(css, /@media\(max-width:1000px\)[\s\S]*?\.ssm-schema-scroll,\.ssm-schema-scroll--details\{overflow-y:auto!important;overflow-x:hidden!important\}/);
assert.match(css, /\.ssm-schema-node__name,[\s\S]*?overflow-wrap:anywhere/, "Long field names must wrap safely");
assert.match(css, /\.ssm-schema-node__type\{max-width:42%;overflow:hidden;text-overflow:ellipsis\}/, "Long datatype labels must not force horizontal overflow");

// Common laptop widths keep the three-column minimums accessible; narrower layouts stack before they can clip.
const threeColumnMinimum = 280 + 8 + 300 + 8 + 320;
for (const width of [1024, 1366, 1440]) {
  const conservativeInnerWidth = width - 48 - 32 - 2; // workspace padding + schema-shell padding + borders
  assert.ok(conservativeInnerWidth >= threeColumnMinimum, `${width}px viewport must fit the declared three-column minima`);
}
assert.match(css, /@media\(max-width:1000px\)[\s\S]*?\.ssm-schema-grid\{display:flex!important;flex-direction:column/, "Narrow layouts must stack before three-column minimum widths become inaccessible");

// Data-side interaction regression: first/middle/final displayed fields are stable for every source,
// and every documented relation resolves to a real center-panel target key.
const service = createSourceSchemaMappingService({ contract });
const sources = service.getSources();
assert.equal(sources.length, 7);

function targetKey(r) {
  if (r.mappingKind === "explicit_source_to_canonical_mapping") return `canonical:${r.normalizedField}`;
  if (r.mappingKind === "source_native_value_retained") return `retained_target:${r.id}`;
  if (r.mappingKind === "explicit_geometry_transformation") return `source_geometry:${r.normalizedField}`;
  return `normalized_target:${r.normalizedField}`;
}

for (const source of sources) {
  const model = service.getSchemaMappingModel(source.sourceId);
  const geometrySourceNames = new Set(model.relationships.filter(r => r.sourceLayer === "source_geometry").map(r => r.sourceField));
  const displayed = [
    ...model.sourceFields,
    ...model.geometryFields.filter(f => geometrySourceNames.has(f.field)),
  ];
  assert.ok(displayed.length >= 3, `${source.sourceId} must expose enough fields for first/middle/final interaction testing`);

  const centerKeys = new Set([
    ...model.normalizedFields.map(f => f.key),
    ...model.geometryNormalizedFields.map(f => f.key),
    ...model.canonicalFields.map(f => f.key),
    ...model.relationships.filter(r => r.mappingKind === "source_native_value_retained").map(r => `retained_target:${r.id}`),
  ]);

  for (const index of [0, Math.floor(displayed.length / 2), displayed.length - 1]) {
    const field = displayed[index];
    const rels = model.relationships.filter(r => r.sourceField === field.field && r.sourceLayer === field.layer);
    for (const rel of rels) {
      assert.ok(centerKeys.has(targetKey(rel)), `${source.sourceId} ${field.key} must resolve to an existing PRAMAN destination`);
      const audit = service.getMappingAudit(source.sourceId).representedRelationships.find(x => x.relationId === rel.id);
      assert.ok(audit, `${source.sourceId} ${rel.id} must keep its audited inspector entry`);
    }
  }
}

// Source switching must not mutate the underlying schema model.
const first = sources[0].sourceId;
const second = sources[1].sourceId;
const before = service.getSchemaMappingModel(first).sourceFields.map(f => f.key);
service.getSchemaMappingModel(second);
const after = service.getSchemaMappingModel(first).sourceFields.map(f => f.key);
assert.deepEqual(after, before, "Returning to a source must produce the same field model");

console.log("schema mapping scroll/selection interaction regression test passed");
