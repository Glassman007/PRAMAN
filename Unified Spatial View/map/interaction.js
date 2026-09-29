import {Raycaster,Vector2} from 'three';
export class Interaction {
 constructor(camera,canvas,onSelect){
  this.camera=camera;this.canvas=canvas;this.onSelect=onSelect;this.roots=new Set();this.raycaster=new Raycaster();this.raycaster.params.Line.threshold=.7;
  this.down=e=>{this.leave?.();this.start={x:e.clientX,y:e.clientY,button:e.button};};
  this.up=e=>{if(!this.start||this.start.button!==0||Math.hypot(e.clientX-this.start.x,e.clientY-this.start.y)>5)return;this.start=null;this.onSelect(this.pick(e.clientX,e.clientY,e.altKey?'parcel':null));};
  this.cancel=()=>{this.start=null;};
  this.hoverHandler=null;this.hoverTimer=0;this.hoverPicks=0;
  this.move=e=>{if(!this.hoverHandler||e.buttons)return;this.hoverPoint=[e.clientX,e.clientY];if(this.hoverTimer)return;this.hoverTimer=setTimeout(()=>{this.hoverTimer=0;if(this.hoverHandler&&this.hoverPoint){this.hoverPicks++;this.hoverHandler(this.pick(...this.hoverPoint));}},120);};
  this.leave=()=>{clearTimeout(this.hoverTimer);this.hoverTimer=0;this.hoverPoint=null;this.hoverHandler?.(null);};
  canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerleave',this.leave);
  canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.cancel);
 }
 setHoverHandler(handler){this.hoverHandler=handler;if(!handler)this.leave();}
 register(root){this.roots.add(root);return ()=>this.roots.delete(root);}
 pick(clientX,clientY,kind=null){
  const rect=this.canvas.getBoundingClientRect();
  this.camera.updateMatrixWorld();const visibleRoots=[...this.roots].filter(root=>{for(let p=root;p;p=p.parent)if(!p.visible)return false;return true;});visibleRoots.forEach(root=>root.updateWorldMatrix(true,true));
  this.raycaster.setFromCamera(new Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),this.camera);
  for(const hit of this.raycaster.intersectObjects(visibleRoots,true)){
   let object=hit.object,selection=hit.object.userData.selectionForFace?.(hit.faceIndex)||hit.object.userData.selectionForIndex?.(hit.index)||null,visible=true;
   if(hit.instanceId!==undefined)selection=object.userData.selectionByInstance?.[hit.instanceId];
   for(let p=object;p;p=p.parent){if(!p.visible)visible=false;if(!selection&&p.userData.selection)selection=p.userData.selection;}
   if(visible&&selection&&(!kind||selection.kind===kind))return {...selection,point:hit.point.toArray(),instanceId:hit.instanceId};
  }
  return null;
 }
 dispose(){this.leave();this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerleave',this.leave);this.roots.clear();this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.cancel);}
}
