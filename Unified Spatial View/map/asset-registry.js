// One authoritative metadata file; no per-asset scale values in placement code.
const response=await fetch(new URL('../data/asset-registry.json',import.meta.url));
if(!response.ok)throw new Error(`Asset registry unavailable: HTTP ${response.status}`);
const rows=await response.json();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ASSETS=freeze(Object.fromEntries(rows.map(row=>[row.id,{...row,url:new URL('../'+row.path,import.meta.url).href}])));
if(Object.keys(ASSETS).length!==rows.length)throw new Error('Duplicate asset IDs');
export const ASSET_LIST=Object.freeze(Object.values(ASSETS));
export function getAsset(id){const asset=ASSETS[id];if(!asset)throw new Error(`Unknown asset: ${id}`);return asset;}
