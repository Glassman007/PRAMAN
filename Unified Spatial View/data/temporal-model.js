// Single temporal domain model. No Three.js, DOM, confidence gates or inferred approvals.
export const day = value => /^\d{4}-\d{2}-\d{2}/.test(value||'') ? value.slice(0,10) : null;
const unique = values => [...new Set(values)];
const indexBy = (rows,key) => {const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;};
export const isCurrentAuthority=(p,g)=>!!(p?.is_active&&p.recordStatus==='ACTIVE'&&p.authority_status==='AUTHORITATIVE'&&g?.parcelId===p.id&&g.status==='AUTHORITATIVE'&&g.acceptedStatus==='ACCEPTED');
export async function loadTemporalDetails(){const [details,audit]=await Promise.all(['./data/temporal-details.json','./data/temporal-geometry-audit.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Temporal metadata unavailable: '+url);return r.json();}));return {...details,lineageGeometryAudit:audit};}
export function createTemporalModel(data,details={geometryDetails:[]}) {
 const parcels=new Map([...data.parcels,...data.historicalParcels].map(p=>[p.id,p]));
 const extra=new Map(details.geometryDetails.map(g=>[g.id,g]));
 const geometries=new Map(data.geometryVersions.map(g=>[g.id,{...g,...extra.get(g.id),geometry:g.geometry?.geometry||null}]));
 const versions=indexBy([...geometries.values()],g=>g.parcelId),historyBy=indexBy(data.history,h=>h.parcel_id),reconciled=new Map(data.reconciliation.map(r=>[r.parcelId,r]));
 const issues=[];const lineageAudit=new Map((details.lineageGeometryAudit||[]).map(r=>[r.id,r]));
 function geometryCategory(g){if(!g)return 'UNKNOWN';if(g.status==='REJECTED'||g.acceptedStatus==='REJECTED')return 'REJECTED';if(g.status==='PROPOSED'||g.acceptedStatus==='PENDING_HUMAN_APPROVAL')return reconciled.get(g.parcelId)?.requiresHumanReview==='True'?'UNDER REVIEW':'PROPOSED';if(['SUPERSEDED','HISTORICAL'].includes(g.status))return 'HISTORICAL / SUPERSEDED';if(g.status==='AUTHORITATIVE'&&g.acceptedStatus==='ACCEPTED')return 'CURRENT / AUTHORITATIVE';return 'UNKNOWN';}
 function currentAuthority(p){return isCurrentAuthority(p,geometries.get(p?.geometryId));}
 // Group connected lineage rows only; a date is not sufficient to identify a transaction.
 const pending=[...data.lineage],transactions=[];
 while(pending.length){const first=pending.shift(),rows=[first],ids=new Set([first.parentParcelId,first.childParcelId]);let grew=true;while(grew){grew=false;for(let i=pending.length-1;i>=0;i--){const r=pending[i];if(r.date===first.date&&r.type===first.type&&r.source===first.source&&r.acceptedStatus===first.acceptedStatus&&(ids.has(r.parentParcelId)||ids.has(r.childParcelId))){rows.push(r);ids.add(r.parentParcelId);ids.add(r.childParcelId);pending.splice(i,1);grew=true;}}}
  rows.sort((a,b)=>a.id.localeCompare(b.id));const parents=unique(rows.map(r=>r.parentParcelId)),children=unique(rows.map(r=>r.childParcelId));
  transactions.push({id:rows[0].id,geometryComparison:lineageAudit.get(rows[0].id)||null,recordIds:rows.map(r=>r.id),table:'PARCEL_LINEAGE',type:first.type,date:first.date,day:day(first.date),parents,children,parcelIds:unique([...parents,...children]),reason:first.reason,source:first.source,authority:first.acceptedStatus,accepted:rows.every(r=>r.acceptedStatus==='ACCEPTED'),kind:'lineage'});
 }
 const incoming=indexBy(data.lineage.filter(r=>r.acceptedStatus==='ACCEPTED'),r=>r.childParcelId),outgoing=indexBy(data.lineage.filter(r=>r.acceptedStatus==='ACCEPTED'),r=>r.parentParcelId);
 const life=new Map();
 for(const p of parcels.values()){
  const births=unique((incoming.get(p.id)||[]).map(r=>day(r.date))),created=unique((historyBy.get(p.id)||[]).filter(h=>h.event_type==='PARCEL_CREATED').map(h=>day(h.date)));
  const deaths=unique([...(outgoing.get(p.id)||[]).map(r=>day(r.date)),day(p.retiredDate)].filter(Boolean));
  const birth=births.length===1?births[0]:created.length===1?created[0]:null,retired=deaths.length===1?deaths[0]:null;
  const ambiguous=births.length>1||created.length>1||deaths.length>1||(births.length&&created.length&&births[0]!==created[0]);
  if(ambiguous)issues.push({parcelId:p.id,type:'AMBIGUOUS_LIFECYCLE',births,created,deaths});
  if(p.is_active&&!currentAuthority(p))issues.push({parcelId:p.id,type:'CURRENT_AUTHORITY_UNVERIFIED'});
  life.set(p.id,{birth,retired,ambiguous});
 }
 // Accepted chains require explicit source supersedes links; no G1/G2 name inference.
 function acceptedGeometry(g){return !!g&&(g.acceptedStatus==='ACCEPTED'&&['AUTHORITATIVE','HISTORICAL'].includes(g.status)||g.status==='SUPERSEDED'&&g.acceptedStatus==='SUPERSEDED'&&[...geometries.values()].some(n=>n.supersedesGeometryId===g.id&&n.acceptedStatus==='ACCEPTED'));}
 const acceptedBy=indexBy([...geometries.values()].filter(acceptedGeometry),g=>g.parcelId);
 const events=[...data.history.map(h=>({id:h.id,recordIds:[h.id],table:'GEOGIT_EVENTS',kind:'record',type:h.event_type,date:h.date,day:day(h.date),parcelIds:unique([h.parcel_id,...h.relatedParcelIds]),primaryParcelId:h.parcel_id,previousVersion:h.previousVersion,resultingVersion:h.resultingVersion,reason:h.event_note,source:h.source,actor:h.actorType,authority:['PROPOSAL_ACCEPTED','MUTATION_RECORDED','ROLLBACK','SPLIT','MERGE'].includes(h.event_type)&&h.actorType==='AUTHORITY'?'Authority event (recorded)':'No geometry authority conferred by this event',geoGitReference:data.geoGitReferences.find(g=>g.eventId===h.id)||null})),...transactions,
 ...[...geometries.values()].map(g=>({id:g.id,recordIds:[g.id],table:'GEOMETRY_VERSIONS',kind:'geometry',type:g.supersedesGeometryId?'BOUNDARY_CORRECTION':'GEOMETRY_VERSION',date:g.date,day:day(g.date),parcelIds:[g.parcelId],geometryId:g.id,previousGeometryId:g.supersedesGeometryId,previousVersion:geometries.get(g.supersedesGeometryId)?.version,resultingVersion:g.version,reason:g.reason,source:g.source,authority:g.acceptedStatus,category:geometryCategory(g)}))].sort((a,b)=>(a.day||'9999').localeCompare(b.day||'9999')||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const eventById=new Map(events.map(e=>[e.id,e]));
 const byParcel=new Map();for(const e of events)for(const id of e.parcelIds){if(!byParcel.has(id))byParcel.set(id,[]);byParcel.get(id).push(e);}
 function geometryAt(id,date){const eligible=(acceptedBy.get(id)||[]).filter(g=>day(g.date)&&day(g.date)<=date).sort((a,b)=>b.date.localeCompare(a.date));if(eligible.length>1&&eligible[0].date===eligible[1].date){return null;}return eligible[0]||null;}
 function versionAt(id,date){let value=null;for(const h of (historyBy.get(id)||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){if(day(h.date)>date)continue;if(h.event_type==='PARCEL_CREATED'||h.actorType==='AUTHORITY'&&['PROPOSAL_ACCEPTED','MUTATION_RECORDED','ROLLBACK'].includes(h.event_type))value=h.resultingVersion||value;}return value;}
 function reconstruct(point){const date=point==='before'?'0000-01-01':day(point);if(!date)throw new Error('Expected a recorded date');const rows=[],counts={active:0,superseded:0,notYet:0,unknown:0,missingGeometry:0};
  for(const p of parcels.values()){const l=life.get(p.id);let state=l.ambiguous||!l.birth?'UNKNOWN':date<l.birth?'NOT YET EXISTENT':l.retired&&date>=l.retired?'SUPERSEDED':'ACTIVE AT DATE';const geometry=state==='ACTIVE AT DATE'?geometryAt(p.id,date):null;counts[state==='ACTIVE AT DATE'?'active':state==='SUPERSEDED'?'superseded':state==='NOT YET EXISTENT'?'notYet':'unknown']++;if(state==='ACTIVE AT DATE'&&!geometry)counts.missingGeometry++;rows.push({id:p.id,cellId:p.cellId,state,geometryId:geometry?.id||null,geometry:geometry?.geometry||null,recordVersion:versionAt(p.id,date),authority:'Historical reconstruction from accepted records; not current authority',birth:l.birth,retired:l.retired});}
  return {date,precision:'End of recorded calendar day; source timezone unspecified',rows,counts};
 }
 function localLineage(id){return {parents:unique((incoming.get(id)||[]).map(r=>r.parentParcelId)),selected:id,children:unique((outgoing.get(id)||[]).map(r=>r.childParcelId)),relations:data.lineage.filter(r=>r.parentParcelId===id||r.childParcelId===id)};}
 function selected(id){const p=parcels.get(id);if(!p)return null;const l=localLineage(id),r=reconciled.get(id);return {parcel:p,category:currentAuthority(p)?'CURRENT / AUTHORITATIVE':p.authority_status==='HISTORICAL'?'HISTORICAL / SUPERSEDED':'UNKNOWN',lifecycle:life.get(id),lineage:l,events:byParcel.get(id)||[],versions:versions.get(id)||[],review:r?.requiresHumanReview==='True'?'UNDER REVIEW':r?.matchStatus,authoritativeVersion:p.authoritativeVersion,stateVersion:p.stateVersion,successors:l.children};}
 function playback(eventId){let e=eventById.get(eventId);if(!e)return null;
  // GeoGit split/merge records resolve to their exact accepted lineage transaction.
  if(e.kind==='record'&&['SPLIT','MERGE'].includes(e.type)){const t=transactions.find(t=>t.day===e.day&&t.parcelIds.includes(e.primaryParcelId)&&((e.type==='SPLIT'&&t.type.includes('SPLIT'))||(e.type==='MERGE'&&!t.type.includes('SPLIT'))));if(t)e=t;}
  if(e.kind==='lineage'){
   const before=e.parents.map(id=>({id,g:geometryAt(id,e.day)})),after=e.children.map(id=>({id,g:geometryAt(id,e.day)}));
   if(!e.accepted||[...before,...after].some(r=>!r.g?.geometry))return {event:e,type:'unavailable',reason:'Accepted lineage or event-date geometry is unavailable.'};
   return {event:e,type:e.type.includes('SPLIT')?'split':'merge',before,after,steps:e.type.includes('SPLIT')?['Historical parent before split','Recorded child boundaries','Child parcels emerge','Parent superseded; children active at event']:['Parent parcels before merge','Shared/internal edges, where present','Internal boundaries retire','Recorded result active; parents superseded']};
  }
  if(e.kind==='geometry'&&e.previousGeometryId){const old=geometries.get(e.previousGeometryId),next=geometries.get(e.geometryId);if(!old?.geometry||!next?.geometry)return {event:e,type:'unavailable',reason:'Missing old/new geometry'};return {event:e,type:'boundary',before:[{id:old.parcelId,g:old}],after:[{id:next.parcelId,g:next}],steps:['Previous recorded boundary',`${geometryCategory(next)} boundary comparison`,next.acceptedStatus==='ACCEPTED'?'Accepted geometry (source effective date)':'No acceptance recorded — current boundary retained']};}
  return {event:e,type:'record',steps:['Previous record version: '+(e.previousVersion||'not supplied'),'Recorded event: '+e.type,'Resulting record version: '+(e.resultingVersion||'not supplied')],reason:e.type==='ROLLBACK'?'Record rollback only: no linked building or geometry snapshot supplied.':'No spatial transition is asserted by this record.'};
 }
 const points=unique(events.map(e=>e.day).filter(Boolean)).sort();
 function historyURL(id,eventId,version){const q=new URLSearchParams({parcelId:id});if(eventId)q.set('eventId',eventId);if(version)q.set('versionId',version);return './parcel-history.html?'+q;}
 return {parcels,geometries,events,eventById,transactions,life,points,issues,currentAuthority,geometryCategory,acceptedGeometry,geometryAt,versionAt,reconstruct,localLineage,selected,playback,historyURL};
}
