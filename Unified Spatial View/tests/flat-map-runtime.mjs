import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class FakeElement{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes=new Map();this.style={};this.parentNode=null;this.listeners=new Map();this.clientWidth=1200;this.clientHeight=800;this.hidden=false;this.dataset={};}
 setAttribute(k,v){this.attributes.set(k,String(v));if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
 getAttribute(k){return this.attributes.has(k)?this.attributes.get(k):null;}
 append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
 prepend(...nodes){for(const n of nodes.reverse()){n.parentNode=this;this.children.unshift(n);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){if(this.listeners.has(type))this.listeners.set(type,this.listeners.get(type).filter(x=>x!==fn));}
 getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
 setPointerCapture(){}
 closest(){return null;}
 querySelectorAll(){return [];}
}
class FakeDocument{createElementNS(_ns,tag){return new FakeElement(tag);}createElement(tag){return new FakeElement(tag);}}
class FakeCustomEvent extends Event{constructor(type,{detail}={}){super(type);this.detail=detail;}}
class FakeResizeObserver{constructor(cb){this.cb=cb;}observe(){this.cb();}disconnect(){}}

globalThis.document=new FakeDocument();globalThis.CustomEvent=FakeCustomEvent;globalThis.ResizeObserver=FakeResizeObserver;
const eventBus=new EventTarget();globalThis.window=eventBus;let selectedCalls=[];window.PRAMAN_SPATIAL_VIEW={getState:()=>({selectedParcel:selectedCalls.at(-1)||null}),selectParcel(id){selectedCalls.push(id);},clearSelection(){selectedCalls.push(null);}};window.PRAMAN_MAP={};
const {createFlatMap}=await import('../map/flat-svg.js');
const data=JSON.parse(fs.readFileSync(new URL('../data/normalized-map.json',import.meta.url),'utf8'));
const host=new FakeElement('div'),flat=createFlatMap({data,host});
const setLayers=ids=>window.dispatchEvent(new FakeCustomEvent('praman-spatial-state',{detail:{activeOrder:ids,selectedParcel:null}}));
const diag=()=>flat.city.diagnostics().layers;

test('canonical and building layers are independently visible',()=>{
 setLayers(['canonical']);assert.equal(diag().canonical.visible,true);assert.equal(diag().canonical.visibleFeatures,1000);assert.equal(diag().buildings.visible,false);
 setLayers(['buildings']);assert.equal(diag().canonical.visible,false);assert.equal(diag().buildings.visible,true);assert.equal(diag().buildings.visibleFeatures,765);
 setLayers(['canonical','buildings']);assert.equal(diag().canonical.visibleFeatures,1000);assert.equal(diag().buildings.visibleFeatures,765);
});

test('every real source layer renders with canonical off',()=>{
 const ids=['revenue','ulb','planning','building-gis','drone','survey','utilities'];for(const id of ids){setLayers([id]);const d=diag();assert.equal(d.canonical.visible,false,id);assert.equal(d[id].visible,true,id);assert(d[id].visibleFeatures>0,id);}
});

test('canonical/building/source combinations remain independent for every real source family',()=>{
 const ids=['revenue','ulb','planning','building-gis','drone','survey','utilities'];for(const id of ids){setLayers(['canonical',id]);let d=diag();assert.equal(d.canonical.visibleFeatures,1000,id);assert(d[id].visibleFeatures>0,id);assert.equal(d.buildings.visible,false,id);setLayers(['buildings',id]);d=diag();assert.equal(d.canonical.visible,false,id);assert.equal(d.buildings.visibleFeatures,765,id);assert(d[id].visibleFeatures>0,id);setLayers(['canonical','buildings',id]);d=diag();assert.equal(d.canonical.visibleFeatures,1000,id);assert.equal(d.buildings.visibleFeatures,765,id);assert(d[id].visibleFeatures>0,id);}
 setLayers(['canonical','buildings',...ids]);const d=diag();for(const id of ['canonical','buildings',...ids])assert(d[id].visibleFeatures>0,id);
});

test('source scope and viewport controls do not rebuild layer records',()=>{
 const before=Object.fromEntries(Object.entries(diag()).map(([k,v])=>[k,v.features]));flat.city.setSourceScope('selected');setLayers(['revenue']);assert.equal(diag().revenue.visibleFeatures,0);flat.city.setSourceScope('cells');assert(diag().revenue.visibleFeatures>0);const after=Object.fromEntries(Object.entries(diag()).map(([k,v])=>[k,v.features]));assert.deepEqual(after,before);
});

test('parcel focus preserves real identity and changes the fitted viewport',()=>{
 const id=data.parcels[37].id,before=flat.svg.getAttribute('viewBox');assert.equal(flat.city.focus(id),true);assert.equal(selectedCalls.at(-1),id);assert.notEqual(flat.svg.getAttribute('viewBox'),before);
});

test('fit and zoom operate on geometry-derived viewBox',()=>{
 flat.fit();const first=flat.svg.getAttribute('viewBox');assert(first&&first.split(' ').length===4);flat.zoom(.8);const second=flat.svg.getAttribute('viewBox');assert.notEqual(second,first);
});

process.on('exit',()=>flat.dispose());

test('semantic painter order preserves source/building visibility and keeps authoritative boundary above them',()=>{
 const order=flat.svg.children;
 const idx=x=>order.indexOf(x);
 assert(idx(flat.groups.canonicalGroup)<idx(flat.groups.sourceLayerRoot));
 assert(idx(flat.groups.sourceLayerRoot)<idx(flat.groups.buildingGroup));
 assert(idx(flat.groups.buildingGroup)<idx(flat.groups.canonicalBoundaryGroup));
 assert(idx(flat.groups.canonicalBoundaryGroup)<idx(flat.groups.issueGroup));
 assert(idx(flat.groups.issueGroup)<idx(flat.groups.selectionGroup));
});

test('historical/event semantic suspension hides only current source/building context and restores toggles',()=>{
 setLayers(['canonical','buildings','revenue']);let d=diag();assert.equal(d.canonical.visible,true);assert.equal(d.buildings.visible,true);assert.equal(d.revenue.visible,true);
 flat.city.setEvidenceContextVisible(false);d=diag();assert.equal(d.canonical.visible,true);assert.equal(d.buildings.requested,true);assert.equal(d.buildings.visible,false);assert.equal(d.buildings.suspended,true);assert.equal(d.revenue.requested,true);assert.equal(d.revenue.visible,false);assert.equal(d.revenue.suspended,true);
 flat.city.setEvidenceContextVisible(true);d=diag();assert.equal(d.buildings.visible,true);assert.equal(d.revenue.visible,true);
});
