// Loading lifecycle only: no city generation, parcel placement or layout.
export class CellManager {
 constructor(){this.definitions=new Map();this.loaded=new Map();this.pending=new Map();this.wanted=new Set();this.disposed=false;}
 register(id,load){if(this.definitions.has(id))throw new Error('Duplicate cell');this.definitions.set(id,load);}
 async sync(ids){
  if(this.disposed)return;
  this.wanted=new Set(ids);
  for(const [id,cell] of this.loaded)if(!this.wanted.has(id)){cell.dispose();this.loaded.delete(id);}
  const jobs=[];
  for(const id of this.wanted){
   if(this.loaded.has(id))continue;
   if(!this.definitions.has(id))throw new Error(`Unknown cell ${id}`);
   if(!this.pending.has(id)){
    const load=this.definitions.get(id);
    const job=Promise.resolve().then(()=>load()).then(cell=>{if(this.disposed||!this.wanted.has(id))cell.dispose();else {cell.attach?.();this.loaded.set(id,cell);}}).finally(()=>this.pending.delete(id));
    this.pending.set(id,job);
   }
   jobs.push(this.pending.get(id));
  }
  await Promise.all(jobs);
 }
 dispose(){this.disposed=true;this.wanted.clear();this.loaded.forEach(cell=>cell.dispose());this.loaded.clear();this.definitions.clear();}
}
