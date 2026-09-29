import {Frustum,Matrix4,Vector3} from 'three';
// Cell/bounds registry, not a parcel-identity matcher. Replace linear cell query
// with a tree if profiling warrants it; no array-position placement occurs.
export class SpatialIndex {
 constructor(){this.cells=new Map();this.frustum=new Frustum();this.matrix=new Matrix4();}
 register(id,bounds,value){this.cells.set(id,{bounds:bounds.clone(),value});}
 remove(id){this.cells.delete(id);}
 query(camera,maxDistance=Infinity){
  camera.updateMatrixWorld();this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.matrix);
  const position=camera.getWorldPosition(new Vector3());
  return [...this.cells].filter(([,cell])=>cell.bounds.distanceToPoint(position)<=maxDistance&&this.frustum.intersectsBox(cell.bounds)).map(([id])=>id);
 }
 applyVisibility(camera,maxDistance){const active=new Set(this.query(camera,maxDistance));this.cells.forEach((cell,id)=>{if(cell.value)cell.value.visible=active.has(id);});return active;}
 clear(){this.cells.clear();}
}
