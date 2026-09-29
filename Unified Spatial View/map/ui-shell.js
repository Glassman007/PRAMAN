// Build the production shell before asynchronous map/data work, then attach the
// existing controls when their owning modules create them. Business logic stays
// in those modules; this file only owns layout composition.
let shell;

export function prepareUIShell(){
 if(shell)return shell;
 const $=s=>document.querySelector(s),body=document.body,toolbar=$('.map-toolbar'),mapSection=$('.map-section'),sidebar=$('.layer-sidebar'),rail=$('.utility-rail');
 if(!toolbar||!mapSection||!sidebar||!rail)return null;
 body.classList.add('final-ui','ui-shell-booting');
 toolbar.hidden=true;rail.hidden=true;

 const actions=document.createElement('div');actions.className='workspace-actions workspace-actions--loading';actions.setAttribute('aria-busy','true');
 const loading=document.createElement('span');loading.className='workspace-loading';loading.textContent='Loading map controls…';actions.append(loading);toolbar.after(actions);

 const selection=document.createElement('div');selection.className='selection-strip';selection.innerHTML='<span id="selectionHint">Select a parcel on the map or search an identifier.</span>';actions.after(selection);

 let empty=$('#filterEmptyState');if(!empty){empty=document.createElement('div');empty.id='filterEmptyState';empty.className='inspection-empty';empty.hidden=true;empty.setAttribute('role','status');$('.map-frame')?.append(empty);}

 let finalized=false,sync,closeMenus,hbutton,modePlaceholder;
 const onRendererStatus=event=>{if(!finalized&&event.detail?.state==='error'){loading.textContent='Map controls unavailable';actions.removeAttribute('aria-busy');}};
 window.addEventListener('praman-renderer-status',onRendererStatus);
 function finalize(){
  if(finalized)return shell;
  const search=$('.city-search-bar'),temporal=$('.temporal-bar'),evidence=$('.evidence-toolbar');
  const mode=$('#temporalMode')?.closest('label'),cellLabel=$('label[for="cityCell"]'),cityCell=$('#cityCell');
  const required=[search,temporal,evidence,mode,cellLabel,cityCell,$('#issuesOnly'),$('#showConflictMarkers'),$('#issueType'),$('#issueStatus'),$('#sharedEdges'),$('#sourceScope'),$('#fitButton'),$('#zoomIn'),$('#zoomOut')];
  if(required.some(node=>!node))return shell;

  finalized=true;window.removeEventListener('praman-renderer-status',onRendererStatus);actions.replaceChildren();actions.classList.remove('workspace-actions--loading');actions.removeAttribute('aria-busy');
  const menu=(id,title)=>{const d=document.createElement('details');d.id=id;d.className='workspace-menu';d.innerHTML=`<summary>${title}</summary><div class="workspace-menu-content"></div>`;actions.append(d);d.addEventListener('toggle',()=>{if(d.open)for(const other of actions.querySelectorAll('details.workspace-menu'))if(other!==d)other.open=false;});return d.lastElementChild;};

  mode.firstChild.textContent='View state ';actions.append(mode);
  const layers=menu('layersMenu','Layers');layers.append(sidebar);sidebar.querySelector('.sidebar-section--legend')?.remove();
  const key=document.createElement('details');key.className='state-key';key.innerHTML='<summary>Map state key</summary><p>Solid boundary · CURRENT AUTHORITATIVE</p><p>Purple dashed / ghosted · HISTORICAL</p><p>Dashed source-family outline · SOURCE OBSERVATION</p><p>Amber dashed · PROPOSED</p><p>Orange short dashes · UNDER REVIEW</p><p>Pink record dot · CONFLICTED parcel record</p><p>Red dashed · REJECTED comparison</p><p>Blue selection highlight does not change authority.</p>';layers.append(key);
  const filters=menu('filtersMenu','Filters');filters.append(cellLabel,cityCell);
  const issues=menu('issuesMenu','Issues');for(const id of ['issuesOnly','showConflictMarkers','issueType','issueStatus'])issues.append($('#'+id).closest('label'));issues.append($('#issueSummary'));
  const compare=menu('compareMenu','Compare');compare.append($('#sharedEdges').closest('label'),$('#sourceScope').closest('label'),$('#boundaryModeButton'));
  const history=menu('historyMenu','History');history.append(temporal);modePlaceholder=document.createElement('p');modePlaceholder.textContent='Select a parcel for its recorded history, lineage and event playback.';history.append(modePlaceholder);hbutton=document.createElement('button');hbutton.type='button';hbutton.textContent='Selected parcel history & lineage';hbutton.onclick=()=>{window.PRAMAN_SPATIAL_VIEW.openTab('lineage');$('#historyMenu').open=false;};history.append(hbutton);
  actions.append($('#fitButton'));const zoom=document.createElement('div');zoom.className='zoom-controls';zoom.append($('#zoomIn'),$('#zoomOut'));actions.append(zoom);

  search.append($('#conflictCounter'));evidence.hidden=true;actions.before(search);
  selection.replaceChildren();const hint=document.createElement('span');hint.id='selectionHint';hint.textContent='Select a parcel on the map or search an identifier.';selection.append(hint,$('#railSelectedParcel'),$('#railSelectedConflict'),$('#openSelectedButton'));

  sync=()=>{const s=window.PRAMAN_SPATIAL_VIEW.getState(),selected=!!s.selectedParcel;selection.classList.toggle('has-selection',selected);hint.hidden=selected;for(const id of ['railSelectedParcel','railSelectedConflict','openSelectedButton'])$('#'+id).hidden=!selected;$('#boundaryModeButton').hidden=!selected;hbutton.hidden=!selected;modePlaceholder.hidden=selected;};
  window.addEventListener('praman-spatial-state',sync);sync();
  closeMenus=e=>{if(e.key==='Escape')actions.querySelectorAll('details.workspace-menu').forEach(d=>d.open=false);};document.addEventListener('keydown',closeMenus);
  body.classList.remove('ui-shell-booting');body.classList.add('ui-shell-ready');
  return shell;
 }
 shell={finalize,get ready(){return finalized;},dispose(){window.removeEventListener('praman-renderer-status',onRendererStatus);if(sync)window.removeEventListener('praman-spatial-state',sync);if(closeMenus)document.removeEventListener('keydown',closeMenus);}};
 return shell;
}

export function createUIShell(){
 const prepared=prepareUIShell();
 prepared?.finalize();
 return prepared;
}
