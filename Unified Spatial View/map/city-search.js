import {isCurrentAuthority} from '../data/temporal-model.js';
// Index only declared identifiers and reconciliation associations; never owner-name guessing.
export function buildCitySearchIndex(data){
 const rows=[],keys=new Set(),parcelById=new Map([...data.parcels,...data.historicalParcels].map(p=>[p.id,p])),geometryVersionById=new Map(data.geometryVersions.map(g=>[g.id,g]));
 function add(term,id,kind){if(term===null||term===undefined||term==='')return;term=String(term);const key=term+'|'+id+'|'+kind;if(keys.has(key))return;keys.add(key);rows.push({term,fold:term.toLowerCase(),id,kind,cellId:parcelById.get(id)?.cellId});}
 for(const p of parcelById.values())add(p.id,p.id,isCurrentAuthority(p,geometryVersionById.get(p.geometryId))?'Current authoritative parcel':p.is_active?'Active non-authoritative record':'Historical parcel');
 for(const c of data.cells)add(c.id,c.id,'Cell');
 for(const b of data.buildingRecords)add(b.id,b.parcelId,'Building record');
 const associations=new Map();for(const s of data.sources){if(!associations.has(s.id))associations.set(s.id,new Set());associations.get(s.id).add(s.parcel_id);}
 const sourceMeta=new Map(data.sourceMetadata.map(s=>[s.type,s])),supportedKeys=new Set();
 for(const o of data.observations){for(const id of associations.get(o.id)||[]){add(o.id,id,'Observation');add(o.sourceRecordId,id,'Source record');add(o.sourceParcelId,id,'Source parcel');add(sourceMeta.get(o.sourceType)?.id,id,'Source dataset');
  let details={};try{details=typeof o.sourceDetails==='string'?JSON.parse(o.sourceDetails):o.sourceDetails||{};}catch{}
  for(const [key,value] of Object.entries(details))if(/(?:khasra|khata|property.*(?:id|no)|holding.*(?:id|no)|building_id|plot_no|assessment.*(?:id|no))$/i.test(key)&&['string','number'].includes(typeof value)){supportedKeys.add(key);add(value,id,key);}
 }}
 function search(query,cellId=''){const q=String(query??'').trim().toLowerCase();if(!q)return [];return rows.filter(r=>(!cellId||r.cellId===cellId||r.kind==='Cell'&&r.id===cellId)&&r.fold.includes(q)).sort((a,b)=>(a.fold===q?0:a.fold.startsWith(q)?1:2)-(b.fold===q?0:b.fold.startsWith(q)?1:2)||a.term.localeCompare(b.term)||a.id.localeCompare(b.id));}
 return {rows,search,supportedKeys:[...supportedKeys]};
}

export function createCitySearch({data,city,controls,camera,invalidate=()=>{},reset,zoomIn=null,zoomOut=null}){
 const toolbar=document.querySelector('.map-toolbar'),bar=document.createElement('div');bar.className='city-search-bar';
 bar.innerHTML='<label class="search-label" for="citySearch">Find parcel or record</label><div class="search-input-wrap"><input id="citySearch" type="search" autocomplete="off" placeholder="Parcel, source, Khasra or cell ID" aria-controls="citySearchResults" aria-expanded="false"><div id="citySearchResults" class="city-search-results" hidden></div></div><label for="cityCell">Cell</label><select id="cityCell"><option value="">All cells</option></select><button type="button" id="zoomIn" aria-label="Zoom in">+</button><button type="button" id="zoomOut" aria-label="Zoom out">−</button>';
 toolbar.after(bar);const input=bar.querySelector('input'),results=bar.querySelector('.city-search-results'),select=bar.querySelector('select');
 const activeByCell=new Map(),geometryVersionById=new Map(data.geometryVersions.map(g=>[g.id,g]));for(const p of data.parcels)if(isCurrentAuthority(p,geometryVersionById.get(p.geometryId)))activeByCell.set(p.cellId,(activeByCell.get(p.cellId)||0)+1);for(const cell of data.cells){const option=document.createElement('option');option.value=cell.id;option.textContent=`${cell.id} · ${activeByCell.get(cell.id)||0} authoritative parcels`;select.append(option);}
 const index=buildCitySearchIndex(data),search=(query,cellId=select.value)=>index.search(query,cellId);
 let timer=0;const state={query:'',total:0,limit:30,shown:0};
 function choose(r){if(r.kind==='Cell'){city.setFilter(r.id);select.value=r.id;}else city.focus(r.id);input.value=r.term;results.hidden=true;input.setAttribute('aria-expanded','false');}
 function render(){const hits=search(input.value);state.query=input.value;state.total=hits.length;state.shown=Math.min(state.limit,hits.length);results.replaceChildren();if(!input.value.trim()){results.hidden=true;input.setAttribute('aria-expanded','false');return;}results.hidden=false;input.setAttribute('aria-expanded','true');const note=document.createElement('p');note.textContent=hits.length?`${hits.length} results${hits.length>state.limit?' · refine search or filter by cell':''}`:'No matching identifier';results.append(note);
  for(const r of hits.slice(0,state.limit)){const button=document.createElement('button');button.type='button';const strong=document.createElement('strong');strong.textContent=r.term;const detail=document.createElement('span');detail.textContent=`${r.kind} · ${r.id}`;button.append(strong,detail);button.onclick=()=>choose(r);results.append(button);}
 }
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,120);});input.addEventListener('keydown',e=>{if(e.key==='Escape'){results.hidden=true;input.setAttribute('aria-expanded','false');}if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}if(e.key==='Enter'){const r=search(input.value)[0];if(r)choose(r);}});
 results.addEventListener('keydown',e=>{const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();buttons[Math.min(i+1,buttons.length-1)]?.focus();}if(e.key==='ArrowUp'){e.preventDefault();if(i<=0)input.focus();else buttons[i-1].focus();}if(e.key==='Escape'){results.hidden=true;input.focus();}});
 select.onchange=()=>{city.setFilter(select.value||null);if(!select.value)reset();results.hidden=true;input.setAttribute('aria-expanded','false');};
 const onFilter=e=>{select.value=e.detail||'';};window.addEventListener('praman-cell-filter',onFilter);
 function zoom(factor){if(camera&&controls){camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();invalidate();}}
 bar.querySelector('#zoomIn').onclick=()=>zoomIn?zoomIn():zoom(.75);bar.querySelector('#zoomOut').onclick=()=>zoomOut?zoomOut():zoom(1.3333);
 return {search,choose,state,supportedKeys:index.supportedKeys,dispose(){clearTimeout(timer);window.removeEventListener('praman-cell-filter',onFilter);bar.remove();}};
}
