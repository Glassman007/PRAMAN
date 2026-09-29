import {Box3,Box3Helper,Vector3,Group,GridHelper} from 'three';
import {ASSET_LIST,getAsset} from './asset-registry.js';
export const COMPARISONS=Object.freeze({
 residential:['buildings-building-10','apartments-app-5','trees-tree-3','props-bench'],
 civic:['commercial-com-1','government-gov-1','props-parking_lot','props-lantern-3']
});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class CalibrationViewer {
 constructor({scene,groups,assets,camera,controls,interaction,index,host,invalidate,status}){
  Object.assign(this,{scene,groups,assets,camera,controls,interaction,index,host,invalidate,status});
  this.items=[];this.generation=0;this.disposed=false;this.currentIds=[];
  this.panel=host.querySelector('.calibration-controls');this.select=this.panel.querySelector('select');
  this.select.innerHTML=ASSET_LIST.map(a=>`<option value="${a.id}">${escape(a.category+' / '+a.path.split('/').at(-1))}</option>`).join('');
  this.abort=new AbortController();const options={signal:this.abort.signal};
  this.select.addEventListener('change',()=>this.show([this.select.value]).catch(console.error),options);
  this.panel.querySelector('[data-calibration="previous"]').addEventListener('click',()=>this.step(-1).catch(console.error),options);
  this.panel.querySelector('[data-calibration="next"]').addEventListener('click',()=>this.step(1).catch(console.error),options);
  for(const name of Object.keys(COMPARISONS))this.panel.querySelector(`[data-calibration="${name}"]`).addEventListener('click',()=>this.show(COMPARISONS[name]).catch(console.error),options);
  this.panel.querySelector('[data-calibration="bounds"]').addEventListener('change',e=>{this.items.forEach(i=>i.helper.visible=e.target.checked);this.invalidate();},options);
 }
 step(direction){let i=ASSET_LIST.findIndex(a=>a.id===this.select.value);if(i<0)i=direction>0?-1:0;this.select.value=ASSET_LIST[(i+direction+ASSET_LIST.length)%ASSET_LIST.length].id;return this.show([this.select.value]);}
 clear(){
  this.items.forEach(i=>{i.unregister();this.index.remove(i.spec.id);i.object.removeFromParent();i.helper.removeFromParent();i.helper.geometry.dispose();i.helper.material.dispose();i.label.remove();});this.items=[];
  if(this.grid){this.grid.removeFromParent();this.grid.geometry.dispose();this.grid.material.dispose();this.grid=null;}
 }
 async show(ids){
  const generation=++this.generation;
  this.status('loading','Loading asset calibration…');
  try{
   const results=await Promise.all(ids.map(async id=>({spec:getAsset(id),object:await this.assets.clone(id)})));
   if(this.disposed||generation!==this.generation)return;
   this.clear();this.currentIds=[...ids];if(ids.length===1)this.select.value=ids[0];else this.select.selectedIndex=-1;
   const gap=4;const total=results.reduce((sum,r)=>sum+r.spec.footprintWidth,0)+gap*(results.length-1);let cursor=-total/2;
   const sceneBounds=new Box3();
   results.forEach(({spec,object})=>{
    // This row is a temporary comparison layout, never a parcel/city layout.
    object.position.x=cursor+spec.footprintWidth/2;cursor+=spec.footprintWidth+gap;
    object.userData.selection={kind:['apartments','buildings','commercial','government'].includes(spec.category)?'building':'asset',id:spec.id,testOnly:true};
    const group=({apartments:'buildings',buildings:'buildings',commercial:'buildings',government:'buildings',parks:'parks',trees:'trees',props:'props'})[spec.category];
    this.groups[group].add(object);object.updateMatrixWorld(true);
    const box=new Box3().setFromObject(object,true),size=box.getSize(new Vector3());sceneBounds.union(box);
    const helper=new Box3Helper(box,0x3878b5);helper.visible=this.panel.querySelector('[data-calibration="bounds"]').checked;this.groups.temporaryAnimations.add(helper);
    const label=document.createElement('div');label.className='calibration-label';label.textContent=spec.path.split('/').at(-1);this.host.append(label);
    this.items.push({spec,object,box,size,helper,label,unregister:this.interaction.register(object)});this.index.register(spec.id,box,object);
   });
   const extent=sceneBounds.getSize(new Vector3());const gridSize=Math.ceil(Math.max(extent.x,extent.z,30)*1.3/10)*10;
   this.grid=new GridHelper(gridSize,gridSize,0xaebcc9,0xdce3e9);this.grid.position.y=-0.015;this.scene.add(this.grid);
   const center=sceneBounds.getCenter(new Vector3());
   const radius=extent.length()/2;const vertical=this.camera.fov*Math.PI/180,horizontal=2*Math.atan(Math.tan(vertical/2)*this.camera.aspect);
   const distance=Math.max(12,radius/Math.sin(Math.min(vertical,horizontal)/2)*1.18);
   this.controls.target.copy(center);this.camera.position.copy(center).add(new Vector3(0.4,0.65,1).normalize().multiplyScalar(distance));this.controls.update();this.controls.saveState();
   this.host.querySelector('.calibration-measurements').innerHTML=`<strong>${ids.length===1?'Measured calibrated dimensions':'Side-by-side comparison'} · metres</strong><table><thead><tr><th>Asset</th><th>W</th><th>D</th><th>H</th></tr></thead><tbody>${this.items.map(i=>`<tr><td>${escape(i.spec.path.split('/').at(-1))}</td><td>${i.size.x.toFixed(2)}</td><td>${i.size.z.toFixed(2)}</td><td>${i.size.y.toFixed(2)}</td></tr>`).join('')}</tbody></table><div class="calibration-note">${ids.length===1?escape(results[0].spec.visualForm+' · '+results[0].spec.calibrationBasis+(results[0].spec.manualPlacementOnly?' Manual placement only.':'')+' '+results[0].spec.notes.join(' ')):'Uniform display calibration, not surveyed dimensions. All objects share the same metre scale.'}</div>`;
   this.status('ready',`Asset calibration · ${ids.length} of ${ASSET_LIST.length} assets · 1 unit = 1 m`);this.invalidate();
  }catch(error){if(generation===this.generation&&!this.disposed)this.status('error',`Calibration load failed: ${error.message}`);throw error;}
 }
 updateLabels(){
  this.items.forEach(item=>{const p=item.box.getCenter(new Vector3());p.y=item.box.max.y+1;p.project(this.camera);item.label.hidden=!item.object.visible||p.z< -1||p.z>1;item.label.style.left=`${(p.x+1)*this.host.clientWidth/2}px`;item.label.style.top=`${(1-p.y)*this.host.clientHeight/2}px`;});
 }
 dispose(){this.disposed=true;++this.generation;this.abort.abort();this.clear();}
}
