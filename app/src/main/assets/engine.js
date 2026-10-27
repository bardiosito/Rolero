(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.Rolero=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const SERVICES=[['qx','Quirófano'],['consulta','Consulta'],['urgencias','Urg'],['piso','Piso'],['residencia','Actividad de residencia']];
const SHIFTS=['matutino','vespertino'],IDS=['A','B','C','D','E','F'];
const R1_SERVICES=['qx','consulta','piso','urgencias'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k),object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),clone=v=>JSON.parse(JSON.stringify(v));
const normalize=v=>String(v||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ');
function dateParts(date){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));if(!m)throw Error('Elige una fecha válida.');const year=+m[1],month=+m[2],day=+m[3],utc=new Date(Date.UTC(year,month-1,day,12));if(year<1900||year>2200||utc.getUTCFullYear()!==year||utc.getUTCMonth()!==month-1||utc.getUTCDate()!==day)throw Error('La fecha no existe.');return{year,month,day,utc};}
function validDateRange(a,b){try{dateParts(a);dateParts(b);return a<=b;}catch(_){return false;}}
function weekdayIndex(date){const d=dateParts(date).utc.getUTCDay();return d===0||d===6?-1:d-1;}
function personKey(p){return normalize(p.name)+'|R'+Number(p.grade);}
function cleanResidents(list){const seen=new Set();return(Array.isArray(list)?list:[]).filter(p=>{if(!p||typeof p.name!=='string'||!p.name.trim()||![1,2,3,4].includes(Number(p.grade)))return false;const k=personKey(p);if(seen.has(k))return false;seen.add(k);return true;}).map(p=>({...p,name:p.name.trim(),grade:Number(p.grade)}));}
function parseRaw(text){if(!String(text||'').trim())return[];return String(text).split(/[,;\n]+/).filter(p=>p.trim()).map(p=>{const m=/^\s*(.+?)\s+R\s*([1-4])\s*$/i.exec(p);if(!m)throw Error('Escribe apellidos y grados, por ejemplo: Andrade R2, Chávez R1.');return{name:m[1].trim(),grade:+m[2]};});}
function parseResidents(text){return cleanResidents(parseRaw(text));}
function validateGuardMembers(list){if(!Array.isArray(list)||list.length>10)throw Error('Cada guardia admite hasta 10 personas.');const seen=new Set();list.forEach(p=>{if(!p||typeof p.name!=='string'||!p.name.trim()||![1,2].includes(p.grade))throw Error('Las guardias y los móviles sólo admiten R1 y R2.');const k=personKey(p);if(seen.has(k))throw Error('Hay un residente repetido en la guardia.');seen.add(k);});return list.map(p=>({name:p.name.trim(),grade:p.grade}));}
function parseGuardMembers(text){return validateGuardMembers(parseRaw(text));}
function formatResidents(list){const p=cleanResidents(list),out=p.some(x=>x.grade>=3)?['Rotantes']:[];[2,1].forEach(g=>p.filter(x=>x.grade===g).forEach(x=>out.push(x.name+' R'+g+(x.mobile?' (móvil)':''))));return out.join(' / ');}
function isAbsent(s,type,id,date){return(s.absences||[]).some(a=>a.personType===type&&a.personId===id&&a.start<=date&&a.end>=date);}
function activeOnDate(list,date){const day=dateParts(date).day;return cleanResidents(list).filter(p=>(!p.startDay||day>=p.startDay)&&(!p.endDay||day<=p.endDay));}
function availableResidents(s,list,date){return activeOnDate(list,date).filter(p=>!isAbsent(s,'resident',personKey(p),date));}
function guardRoster(s){return cleanResidents((s.guardGroups||[]).reduce((out,g)=>out.concat(g.members||[]),[])).filter(p=>p.grade<=2);}
function fixedResidents(s,shift){const map=new Map();const add=(people,label)=>cleanResidents(people).filter(p=>p.grade<=2).forEach(p=>{const key=personKey(p);if(!map.has(key))map.set(key,{name:p.name,grade:p.grade,key,labels:[]});if(!map.get(key).labels.includes(label))map.get(key).labels.push(label);});(s.doctors||[]).filter(d=>d.shift===shift).forEach(d=>add(d.residents,(d.title||'Dr.')+' '+d.name));(s.serviceRules||[]).filter(r=>r.shift===shift).forEach(r=>add(r.residents,(SERVICES.find(x=>x[0]===r.service)||[null,r.service])[1]));return Array.from(map.values());}
function selectedGroup(s){return(s.guardGroups||[]).find(g=>g.id===(s.dutySelection||{}).guardGroupId);}
function guardIndexForDate(state,date){
 const target=dateParts(date),groups=state.guardGroups||[],selection=state.dutySelection||{},index=groups.findIndex(group=>group.id===selection.guardGroupId);
 if(index<0||!groups.length)return-1;
 if(!selection.referenceDate)return index;
 const days=Math.round((target.utc-dateParts(selection.referenceDate).utc)/86400000);
 return((index+days)%groups.length+groups.length)%groups.length;
}
function setDutyReference(state,guardGroupId,date){
 if(!(state.guardGroups||[]).some(group=>group.id===guardGroupId)||typeof date!=='string'||!validDateRange(date,date))throw Error('Elige una guardia y una fecha válidas.');
 state.dutySelection={...(state.dutySelection||{}),guardGroupId,referenceDate:date};return state.dutySelection;
}
function resolveGuards(s,date){const i=guardIndexForDate(s,date),g=(s.guardGroups||[])[i];if(!g)return{guards:[],guardStatus:'pending',group:'',warning:'Elige la guardia actual.'};if(!g.members.length)return{guards:[],guardStatus:'pending',group:g.id,warning:'Configura los integrantes de la guardia '+g.id+'.'};return{guards:availableResidents(s,g.members,date),guardStatus:'group',group:g.id,warning:''};}
function postGuard(s,date){const parts=dateParts(date),groups=s.guardGroups||[],i=guardIndexForDate(s,date);if(i<0||!groups.length)return{date:'',status:'pending',group:'',residents:[]};const g=groups[(i+groups.length-1)%groups.length],previousDate=(s.dutySelection||{}).referenceDate?new Date(parts.utc.getTime()-86400000).toISOString().slice(0,10):'';return{date:previousDate,status:g.members.length?'group':'pending',group:g.id,residents:cleanResidents(g.members).filter(p=>p.grade<=2)};}
function pruneMobiles(s,removed){SHIFTS.forEach(shift=>{s.mobileAssignments[shift]=(s.mobileAssignments[shift]||[]).filter(p=>!removed.has(p.residentKey));});}
function setGuardGroupCount(s,count,options){if(!Number.isInteger(count)||count<3||count>6)throw Error('Elige entre 3 y 6 guardias.');const removed=(s.guardGroups||[]).slice(count);if(removed.some(g=>g.members.length)&&!(options&&options.confirmRemoval))throw Error('Las guardias que vas a quitar tienen integrantes. Confirma la reducción antes de continuar.');const keys=new Set(removed.reduce((out,g)=>out.concat(g.members.map(personKey)),[]));s.guardGroups=s.guardGroups.slice(0,count);while(s.guardGroups.length<count){const id=IDS[s.guardGroups.length];s.guardGroups.push({id,name:'Guardia '+id,members:[]});}s.mobileAssignments=s.mobileAssignments||{matutino:[],vespertino:[]};pruneMobiles(s,keys);if(!selectedGroup(s))s.dutySelection={...(s.dutySelection||{}),guardGroupId:s.guardGroups[0].id};pruneR1Priorities(s);return s.guardGroups;}
function setGuardGroupMembers(s,id,members){const clean=validateGuardMembers(members),g=(s.guardGroups||[]).find(x=>x.id===id);if(!g)throw Error('No existe esa guardia.');const others=new Set(s.guardGroups.filter(x=>x.id!==id).reduce((out,x)=>out.concat(x.members.map(personKey)),[]));if(clean.some(p=>others.has(personKey(p))))throw Error('Ese residente ya pertenece a otra guardia.');const retained=new Set(clean.map(personKey)),removed=new Set(g.members.map(personKey).filter(k=>!retained.has(k)));g.members=clean;s.mobileAssignments=s.mobileAssignments||{matutino:[],vespertino:[]};pruneMobiles(s,removed);pruneR1Priorities(s);return g;}
function setMobileAssignment(s,shift,pair){if(!SHIFTS.includes(shift))throw Error('Elige un turno válido.');const roster=new Set(guardRoster(s).map(personKey));if(!pair||!roster.has(pair.residentKey))throw Error('El móvil debe ser un R1 o R2 de una guardia configurada.');if(!fixedResidents(s,shift).some(p=>p.key===pair.fixedResidentKey))throw Error('Elige un R1 o R2 con rol fijo en este turno.');if(pair.residentKey===pair.fixedResidentKey)throw Error('El móvil y el fijo deben ser personas diferentes.');s.mobileAssignments=s.mobileAssignments||{matutino:[],vespertino:[]};const list=s.mobileAssignments[shift]||[];if(list.some(p=>p.residentKey===pair.fixedResidentKey||p.fixedResidentKey===pair.residentKey))throw Error('Un móvil no puede ser el fijo de otro relevo en el mismo turno.');const item={residentKey:pair.residentKey,fixedResidentKey:pair.fixedResidentKey},i=list.findIndex(p=>p.residentKey===pair.residentKey);if(i>=0)list[i]=item;else list.push(item);s.mobileAssignments[shift]=list;return item;}
function removeMobileAssignment(s,shift,key){if(!SHIFTS.includes(shift))throw Error('Elige un turno válido.');s.mobileAssignments[shift]=(s.mobileAssignments[shift]||[]).filter(p=>p.residentKey!==key);}
function residentLists(state){
 const lists=[];
 const add=owner=>{if(Array.isArray(owner.residents))lists.push({owner,field:'residents'});};
 (state.doctors||[]).forEach(add);(state.serviceRules||[]).forEach(add);
 Object.values(state.dailyOverrides||{}).forEach(overrides=>Object.values(overrides).forEach(add));
 (state.guardGroups||[]).forEach(group=>{if(Array.isArray(group.members))lists.push({owner:group,field:'members'});});
 return lists;
}
function residentRoster(state){
 const roster=new Map();
 const ensure=person=>{
  const key=personKey(person);
  if(!roster.has(key))roster.set(key,{key,name:person.name,grade:person.grade,guardGroupId:'',doctorIds:{matutino:[],vespertino:[]},serviceRuleIds:[]});
  return roster.get(key);
 };
 const juniors=list=>cleanResidents(list).filter(person=>person.grade<=2);
 (state.doctors||[]).forEach(doctor=>juniors(doctor.residents).forEach(person=>{const entry=ensure(person);if(SHIFTS.includes(doctor.shift)&&!entry.doctorIds[doctor.shift].includes(doctor.id))entry.doctorIds[doctor.shift].push(doctor.id);}));
 (state.serviceRules||[]).forEach(rule=>juniors(rule.residents).forEach(person=>{const entry=ensure(person);if(typeof rule.id==='string'&&!entry.serviceRuleIds.includes(rule.id))entry.serviceRuleIds.push(rule.id);}));
 Object.values(state.dailyOverrides||{}).forEach(overrides=>Object.values(overrides).forEach(override=>juniors(override.residents).forEach(ensure)));
 (state.guardGroups||[]).forEach(group=>juniors(group.members).forEach(person=>{ensure(person).guardGroupId=group.id;}));
 return Array.from(roster.values()).sort((a,b)=>a.name.localeCompare(b.name,'es')||a.grade-b.grade);
}
function validateResidentIdentity(name,grade){
 if(typeof name!=='string'||!name.trim()||name.trim().length>90||!Number.isInteger(grade)||![1,2].includes(grade))throw Error('Escribe un apellido y elige R1 o R2.');
 return{name:name.trim(),grade};
}
function validateResidentDoctors(state,doctorIds){
 if(!object(doctorIds)||Object.keys(doctorIds).some(shift=>!SHIFTS.includes(shift)))throw Error('Elige médicos de un turno válido.');
 Object.entries(doctorIds).forEach(([shift,ids])=>{
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!(state.doctors||[]).some(doctor=>doctor.id===id&&doctor.shift===shift)))throw Error('Elige médicos válidos para cada turno.');
 });
}
function assignResidentDoctors(state,person,doctorIds){
 const key=personKey(person);
 Object.entries(doctorIds||{}).forEach(([shift,ids])=>(state.doctors||[]).filter(doctor=>doctor.shift===shift).forEach(doctor=>{
  if(!ids.includes(doctor.id))doctor.residents=(doctor.residents||[]).filter(resident=>personKey(resident)!==key);
  else if(!(doctor.residents||[]).some(resident=>personKey(resident)===key))doctor.residents=(doctor.residents||[]).concat({...person});
 }));
}
function commitResidentChange(state,changed){validateState(changed);Object.assign(state,changed);}
function removeResidentData(state,key){
 residentLists(state).forEach(({owner,field})=>{owner[field]=owner[field].filter(person=>personKey(person)!==key);});
 state.absences=(state.absences||[]).filter(absence=>!(absence.personType==='resident'&&absence.personId===key));
 state.mobileAssignments=state.mobileAssignments||{matutino:[],vespertino:[]};
 SHIFTS.forEach(shift=>{state.mobileAssignments[shift]=(state.mobileAssignments[shift]||[]).filter(pair=>pair.residentKey!==key&&pair.fixedResidentKey!==key);});
 if(state.r1Priorities)delete state.r1Priorities[key];
}
function removeResident(state,key){
 if(!residentRoster(state).some(person=>person.key===key))return false;
 const changed=clone(state);removeResidentData(changed,key);commitResidentChange(state,changed);return true;
}
function updateResident(state,key,patch){
 const before=residentRoster(state).find(person=>person.key===key);
 if(!before)throw Error('No se encontró al residente.');
 if(!object(patch))throw Error('Revisa los datos del residente.');
 if(patch.grade===3){removeResident(state,key);return null;}
 const person=validateResidentIdentity(own(patch,'name')?patch.name:before.name,own(patch,'grade')?patch.grade:before.grade),nextKey=personKey(person);
 if(nextKey!==key&&residentRoster(state).some(entry=>entry.key===nextKey))throw Error('Ya existe un residente con ese apellido y grado.');
 const groupId=own(patch,'guardGroupId')?patch.guardGroupId:before.guardGroupId;
 if(typeof groupId!=='string'||groupId&&!(state.guardGroups||[]).some(group=>group.id===groupId))throw Error('Elige una guardia válida.');
 if(!groupId&&SHIFTS.some(shift=>((state.mobileAssignments||{})[shift]||[]).some(pair=>pair.residentKey===key)))throw Error('Este residente tiene sustituciones configuradas. Elige otra guardia para conservarlas, o retíralo del rol.');
 const target=(state.guardGroups||[]).find(group=>group.id===groupId);
 if(target&&target.members.filter(member=>personKey(member)!==key).length>=10)throw Error('Cada guardia admite hasta 10 personas.');
 if(own(patch,'doctorIds'))validateResidentDoctors(state,patch.doctorIds);
 const changed=clone(state);
 residentLists(changed).forEach(({owner,field})=>{owner[field]=owner[field].map(resident=>personKey(resident)===key?{...resident,...person}:resident);});
 if(groupId!==before.guardGroupId){
  (changed.guardGroups||[]).forEach(group=>{group.members=group.members.filter(member=>personKey(member)!==nextKey);});
  if(groupId)changed.guardGroups.find(group=>group.id===groupId).members.push({...person});
 }
 (changed.absences||[]).forEach(absence=>{if(absence.personType==='resident'&&absence.personId===key)absence.personId=nextKey;});
 changed.mobileAssignments=changed.mobileAssignments||{matutino:[],vespertino:[]};
 SHIFTS.forEach(shift=>{changed.mobileAssignments[shift]=(changed.mobileAssignments[shift]||[]).map(pair=>({...pair,residentKey:pair.residentKey===key?nextKey:pair.residentKey,fixedResidentKey:pair.fixedResidentKey===key?nextKey:pair.fixedResidentKey}));});
 if(own(patch,'doctorIds'))assignResidentDoctors(changed,person,patch.doctorIds);
 if(changed.r1Priorities&&own(changed.r1Priorities,key)){
  const priorities=changed.r1Priorities[key];delete changed.r1Priorities[key];
  if(before.grade===1&&person.grade===2)SHIFTS.forEach(shift=>{
   const targets=priorities[shift]||[],requested=patch.doctorIds&&patch.doctorIds[shift],doctorChanged=requested&&JSON.stringify(requested.slice().sort())!==JSON.stringify(before.doctorIds[shift].slice().sort());
   if(!doctorChanged&&targets.length===1&&targets[0].startsWith('doctor:'))assignResidentDoctors(changed,person,{[shift]:[targets[0].slice(7)]});
  });
  if(person.grade===1)changed.r1Priorities[nextKey]=priorities;
 }
 commitResidentChange(state,changed);return residentRoster(state).find(entry=>entry.key===nextKey);
}
function addResident(state,input){
 if(!object(input)||typeof input.guardGroupId!=='string'||!(state.guardGroups||[]).some(group=>group.id===input.guardGroupId))throw Error('Elige la guardia del residente.');
 if(input.existingKey){
  const existing=residentRoster(state).find(person=>person.key===input.existingKey);
  if(!existing)throw Error('No se encontró al residente.');
  if(existing.guardGroupId)throw Error('Ese residente ya pertenece a una guardia.');
  return updateResident(state,input.existingKey,{guardGroupId:input.guardGroupId,...(own(input,'doctorIds')?{doctorIds:input.doctorIds}:{})});
 }
 const person=validateResidentIdentity(input.name,input.grade),key=personKey(person);
 if(residentRoster(state).some(entry=>entry.key===key))throw Error('El residente ya existe. Elígelo de la lista para agregarlo.');
 const group=state.guardGroups.find(entry=>entry.id===input.guardGroupId);
 if(group.members.length>=10)throw Error('Cada guardia admite hasta 10 personas.');
 if(own(input,'doctorIds'))validateResidentDoctors(state,input.doctorIds);
 const changed=clone(state);changed.guardGroups.find(entry=>entry.id===input.guardGroupId).members.push({...person});
 if(own(input,'doctorIds'))assignResidentDoctors(changed,person,input.doctorIds);
 commitResidentChange(state,changed);return residentRoster(state).find(entry=>entry.key===key);
}
function personFromKey(key){const m=/^(.*)\|R([12])$/.exec(String(key));return m?{name:m[1],grade:+m[2]}:{name:'Residente no disponible',grade:1};}
function resolveDoctorAssignment(state,id,date){
 dateParts(date);
 const sourceDoctor=(state.doctors||[]).find(doctor=>doctor.id===(typeof id==='string'?id:id&&id.id));
 if(!sourceDoctor)return null;
 const seen=new Set();let doctor=sourceDoctor,originalAbsence=null;
 while(doctor){
  if(seen.has(doctor.id))return null;seen.add(doctor.id);
  const records=(state.absences||[]).filter(item=>item.personType==='doctor'&&item.personId===doctor.id&&item.start<=date&&item.end>=date);
  const absence=records[records.length-1];
  if(!absence)return{doctor,sourceDoctor,covering:doctor.id!==sourceDoctor.id,absence:originalAbsence};
  if(!originalAbsence)originalAbsence=absence;
  if(!absence.coverDoctorId)return null;
  doctor=(state.doctors||[]).find(item=>item.id===absence.coverDoctorId);
 }
 return null;
}
function registerAbsence(state,input){
 if(!input||!['doctor','resident'].includes(input.personType)||typeof input.personId!=='string'||!validDateRange(input.start,input.end))throw Error('Elige una persona y un intervalo de fechas válido.');
 const entry={...input,id:input.id||'absence-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),note:String(input.note||'').trim()};
 if((state.absences||[]).some(item=>item.id===entry.id))throw Error('Ya existe ese registro de ausencia.');
 if(entry.personType==='doctor'){
  if(!(state.doctors||[]).some(doctor=>doctor.id===entry.personId))throw Error('Elige el médico que sale.');
  entry.coverDoctorId=input.coverDoctorId||'';
  if(typeof entry.coverDoctorId!=='string'||entry.coverDoctorId===entry.personId)throw Error('El médico que cubre debe ser diferente al que sale.');
  if(entry.coverDoctorId&&!(state.doctors||[]).some(doctor=>doctor.id===entry.coverDoctorId))throw Error('Elige un médico de cobertura válido.');
 }else{
  const dailyResidents=Object.values(state.dailyOverrides||{}).reduce((list,overrides)=>list.concat(...Object.values(overrides).map(override=>override.residents||[])),[]);
  const known=cleanResidents((state.doctors||[]).reduce((list,doctor)=>list.concat(doctor.residents||[]),[]).concat((state.serviceRules||[]).reduce((list,rule)=>list.concat(rule.residents||[]),[]),guardRoster(state),dailyResidents));
  if(!known.some(person=>personKey(person)===entry.personId))throw Error('Elige un residente válido.');
  delete entry.coverDoctorId;
 }
 state.absences=state.absences||[];state.absences.push(entry);return entry;
}
function removeDoctor(state,id){
 if(!(state.doctors||[]).some(doctor=>doctor.id===id))return false;
 state.doctors=state.doctors.filter(doctor=>doctor.id!==id);
 state.absences=(state.absences||[]).filter(item=>!(item.personType==='doctor'&&item.personId===id)).map(item=>item.coverDoctorId===id?{...item,coverDoctorId:''}:item);
 Object.values(state.dailyOverrides||{}).forEach(overrides=>{delete overrides[id];});
 pruneR1Priorities(state,id);
 return true;
}
function derivedR1Targets(state,key,shift,date){
 const targets=[],add=target=>{if(!targets.includes(target))targets.push(target);},overrides=date?(state.dailyOverrides||{})[date]||{}:{};
 const matches=list=>(date?activeOnDate(list,date):cleanResidents(list)).some(person=>person.grade===1&&personKey(person)===key);
 (state.doctors||[]).filter(doctor=>doctor.shift===shift).forEach(doctor=>{const override=overrides[doctor.id]||{},people=own(override,'residents')?override.residents:doctor.residents;if(date&&weekdayIndex(date)<0&&!SERVICES.some(service=>service[0]===override.service))return;if(matches(people))add('doctor:'+doctor.id);});
 if(!date)Object.values(state.dailyOverrides||{}).forEach(day=>Object.entries(day).forEach(([id,override])=>{if((state.doctors||[]).some(doctor=>doctor.id===id&&doctor.shift===shift)&&matches(override.residents))add('doctor:'+id);}));
 if((state.settings||{}).includeServiceSupport!==false&&(!date||weekdayIndex(date)>=0))(state.serviceRules||[]).filter(rule=>rule.shift===shift).forEach(rule=>{if(matches(rule.residents)&&R1_SERVICES.includes(rule.service))add('service:'+rule.service);});
 return targets;
}
function r1PriorityRoster(state){
 return residentRoster(state).filter(person=>person.grade===1).map(person=>{
  const saved=(state.r1Priorities||{})[person.key]||{},priorities={},configured={};
  SHIFTS.forEach(shift=>{configured[shift]=own(saved,shift);priorities[shift]=configured[shift]?saved[shift].slice():derivedR1Targets(state,person.key,shift);});
  return{key:person.key,name:person.name,grade:1,priorities,configured};
 });
}
function validateR1Targets(state,shift,targets){
 if(!SHIFTS.includes(shift)||!Array.isArray(targets)||targets.length>32||new Set(targets).size!==targets.length)throw Error('Elige un destino válido para el R1 en este turno.');
 targets.forEach(target=>{if(typeof target!=='string'||!(target.startsWith('service:')&&R1_SERVICES.includes(target.slice(8))||target.startsWith('doctor:')&&(state.doctors||[]).some(doctor=>doctor.id===target.slice(7)&&doctor.shift===shift)))throw Error('Elige un servicio o un médico de este turno.');});
}
function setR1Priorities(state,key,shift,targets){
 if(!residentRoster(state).some(person=>person.key===key&&person.grade===1))throw Error('Elige un residente R1.');validateR1Targets(state,shift,targets);
 const changed=clone(state);changed.r1Priorities=changed.r1Priorities||{};changed.r1Priorities[key]={...(changed.r1Priorities[key]||{}),[shift]:targets.slice()};validateState(changed);Object.assign(state,changed);return r1PriorityRoster(state).find(person=>person.key===key);
}
function resetR1Priorities(state,key,shift){
 if(!SHIFTS.includes(shift)||!residentRoster(state).some(person=>person.key===key&&person.grade===1))throw Error('Elige un R1 y un turno válidos.');
 if(!own((state.r1Priorities||{})[key],shift))return false;
 const changed=clone(state);delete changed.r1Priorities[key][shift];if(!Object.keys(changed.r1Priorities[key]).length)delete changed.r1Priorities[key];validateState(changed);Object.assign(state,changed);return true;
}
function pruneR1Priorities(state,doctorId){
 if(!object(state.r1Priorities))return;
 const known=new Set(residentRoster(state).filter(person=>person.grade===1).map(person=>person.key));
 Object.entries(state.r1Priorities).forEach(([key,config])=>{if(!known.has(key)){delete state.r1Priorities[key];return;}if(doctorId)SHIFTS.forEach(shift=>{if(Array.isArray(config[shift]))config[shift]=config[shift].filter(target=>target!=='doctor:'+doctorId);});});
}
function normalizeOperatingRoom(value){
 if(typeof value==='number')return Number.isInteger(value)&&value>=1&&value<=6?value:null;
 if(typeof value!=='string')return null;
 const match=/^(?:QX?\s*)?([1-6])$/i.exec(value.trim());return match?Number(match[1]):null;
}
function compareOperatingDoctors(first,second){
 const a=normalizeOperatingRoom(first.room),b=normalizeOperatingRoom(second.room);
 if(a!==null||b!==null){if(a===null)return 1;if(b===null)return-1;if(a!==b)return a-b;return(first.roomOrder||0)-(second.roomOrder||0);}
 return!first.room&&second.room?1:first.room&&!second.room?-1:first.room.localeCompare(second.room,'es',{numeric:true});
}
function operatingRoomDoctor(state,options){
 if(!options||!validDateRange(options.date,options.date)||!SHIFTS.includes(options.shift))throw Error('Elige una fecha y un turno válidos.');
 const doctor=(state.doctors||[]).find(item=>item.id===options.doctorId&&item.shift===options.shift);
 if(!doctor)throw Error('Elige un médico de este turno.');return doctor;
}
function setOperatingRoom(state,options){
 const doctor=operatingRoomDoctor(state,options),number=normalizeOperatingRoom(options.room);
 if(!number)throw Error('Elige una sala de QX 1 a QX 6.');
 const original=((state.dailyOverrides||{})[options.date]||{})[doctor.id]||{};
 if(original.excluded||!resolveDoctorAssignment(state,doctor.id,options.date))throw Error('El médico no está disponible para este rol. Revisa su actividad o ausencia.');
 const changed=clone(state);changed.dailyOverrides=changed.dailyOverrides||{};
 const overrides=changed.dailyOverrides[options.date]=changed.dailyOverrides[options.date]||{},override=overrides[doctor.id]=overrides[doctor.id]||{};
 if(!own(override,'operatingRoomPrevious')){
  override.operatingRoomPrevious={};['service','room','roomOrder'].forEach(field=>{if(own(override,field))override.operatingRoomPrevious[field]=override[field];});
 }
 const weekday=weekdayIndex(options.date),sameRoom=(original.service||(weekday>=0?doctor.schedule[weekday]:'manual'))==='qx'&&normalizeOperatingRoom(original.room)===number;
 if(!sameRoom){const ids=new Set(changed.doctors.filter(item=>item.shift===options.shift).map(item=>item.id)),orders=Object.entries(overrides).filter(([id])=>ids.has(id)).map(([,item])=>item.roomOrder||0);override.roomOrder=Math.max(0,...orders)+1;}
 override.service='qx';override.room='QX '+number;validateState(changed);Object.assign(state,changed);return state.dailyOverrides[options.date][doctor.id];
}
function clearOperatingRoom(state,options){
 const doctor=operatingRoomDoctor(state,options),original=((state.dailyOverrides||{})[options.date]||{})[doctor.id];
 if(!original||!own(original,'room')&&!own(original,'operatingRoomPrevious'))return false;
 const changed=clone(state),override=changed.dailyOverrides[options.date][doctor.id];
 if(own(override,'operatingRoomPrevious')){
  const previous=override.operatingRoomPrevious;['service','room','roomOrder'].forEach(field=>{if(own(previous,field))override[field]=previous[field];else delete override[field];});delete override.operatingRoomPrevious;
 }else{delete override.room;delete override.roomOrder;}
 if(!Object.keys(override).length)delete changed.dailyOverrides[options.date][doctor.id];
 if(!Object.keys(changed.dailyOverrides[options.date]).length)delete changed.dailyOverrides[options.date];
 validateState(changed);Object.assign(state,changed);return true;
}
function operatingRooms(state,options){
 const result=generate(state,options),qx=result.groups.find(group=>group.service==='qx'),day=weekdayIndex(options.date),overrides=(state.dailyOverrides||{})[options.date]||{};
 const rooms=Array.from({length:6},(_,index)=>({number:index+1,label:'QX '+(index+1),doctors:qx?qx.doctors.filter(doctor=>normalizeOperatingRoom(doctor.room)===index+1):[]}));
 const candidates=(state.doctors||[]).filter(doctor=>doctor.shift===options.shift).map(doctor=>{
  const override=overrides[doctor.id]||{},coverage=resolveDoctorAssignment(state,doctor.id,options.date);if(override.excluded||!coverage)return null;
  const service=override.service||(day>=0?doctor.schedule[day]:'manual');
  return{id:doctor.id,sourceDoctorId:doctor.id,name:coverage.doctor.name,title:coverage.doctor.title||'Dr.',originalName:doctor.name,covering:coverage.covering,service,currentRoom:service==='qx'?normalizeOperatingRoom(override.room):null};
 }).filter(Boolean);
 return{rooms,unassigned:qx?qx.doctors.filter(doctor=>normalizeOperatingRoom(doctor.room)===null):[],candidates};
}
function r1Destination(groups,targets){
 const entries=groups.reduce((all,group)=>all.concat(group.doctors),[]);
 for(const target of targets){
  if(target.startsWith('doctor:')){const doctor=entries.find(item=>item.id===target.slice(7));if(doctor)return{doctor,service:doctor.service};}
  else{const service=target.slice(8),group=groups.find(item=>item.service===service);if(service==='piso'||group&&group.doctors.length)return{doctor:null,service};}
 }
 return{doctor:null,service:'piso'};
}
function leastR1Doctor(group,grade=1){
 return group.doctors.slice().sort(group.service==='qx'?compareOperatingDoctors:()=>0).reduce((chosen,doctor)=>{const count=doctor.residents.filter(person=>grade===1?person.grade===1:true).length,previous=chosen?chosen.residents.filter(person=>grade===1?person.grade===1:true).length:Infinity;return count<previous?doctor:chosen;},null);
}
function allocateR1Residents(state,date,shift,groups,postKeys,mobileKeys){
 const plans=[],overrides=(state.dailyOverrides||{})[date]||{};
 const allRaw=(state.doctors||[]).filter(doctor=>doctor.shift===shift).reduce((all,doctor)=>{const override=overrides[doctor.id]||{};return all.concat(activeOnDate(own(override,'residents')?override.residents:doctor.residents,date));},[]).concat((state.serviceRules||[]).filter(rule=>rule.shift===shift).reduce((all,rule)=>all.concat(activeOnDate(rule.residents,date)),[]));
 r1PriorityRoster(state).forEach(resident=>{
  if(mobileKeys.has(resident.key)||postKeys.has(resident.key)||isAbsent(state,'resident',resident.key,date))return;
  const inherited=derivedR1Targets(state,resident.key,shift,date);if(!resident.configured[shift]&&!inherited.length)return;
  const targets=resident.configured[shift]?resident.priorities[shift]:inherited,person=allRaw.find(item=>personKey(item)===resident.key)||{name:resident.name,grade:1};
  const{doctor,service}=r1Destination(groups,targets);
  plans.push({key:resident.key,person,doctor,service});
 });
 const managed=new Set(plans.map(plan=>plan.key));
 groups.forEach(group=>{group.doctors.forEach(doctor=>{doctor.residents=doctor.residents.filter(person=>!managed.has(personKey(person)));});group.support=group.support.filter(person=>!managed.has(personKey(person)));});
 plans.filter(plan=>plan.doctor).forEach(plan=>plan.doctor.residents.push({...plan.person}));
 plans.filter(plan=>!plan.doctor).forEach(plan=>{const group=groups.find(item=>item.service===plan.service),doctor=plan.service==='piso'?null:leastR1Doctor(group);if(doctor)doctor.residents.push({...plan.person});else group.support.push({...plan.person});});
 groups.filter(group=>group.service!=='piso'&&group.doctors.length).forEach(group=>{const people=group.support;group.support=[];people.forEach(person=>{if(group.doctors.some(doctor=>doctor.residents.some(item=>personKey(item)===personKey(person))))return;leastR1Doctor(group,person.grade).residents.push(person);});});
}
function generate(state,options){
 if(state&&state.schemaVersion<3)state=migrateState(state);
 if(!state||!Array.isArray(state.doctors))throw Error('No hay un equipo configurado.');
 const{date,shift}=options,{utc}=dateParts(date);if(!SHIFTS.includes(shift))throw Error('Elige turno matutino o vespertino.');
 const settings=state.settings||{},weekday=weekdayIndex(date),warnings=[];
 const showDoctors=true,includeGuards=false,excludePostGuard=true;
 const floorReminder=options.floorR1Reminder===undefined?!!settings.floorR1Reminder:!!options.floorR1Reminder;
 const previous=postGuard(state,date),guard=resolveGuards(state,date),excluded=excludePostGuard?previous.residents:[],postKeys=new Set(excluded.map(personKey));
 const assignments=(state.mobileAssignments||{})[shift]||[],mobileKeys=new Set(assignments.map(p=>p.residentKey)),groups=SERVICES.map(([service,label])=>({service,label,doctors:[],support:[]})),slots=[];
 if(guard.warning)warnings.push(guard.warning);
 if(excludePostGuard&&previous.status==='pending')warnings.push('Configura la guardia '+(previous.group||'anterior')+' para excluir a quienes están de postguardia.');
 if(weekday===-1)warnings.push('El rol fijo sólo cubre lunes a viernes. Asigna manualmente las actividades de este día.');
 const assigned=list=>activeOnDate(list,date).filter(p=>!mobileKeys.has(personKey(p))&&!postKeys.has(personKey(p))&&!isAbsent(state,'resident',personKey(p),date));
 const overrides=(state.dailyOverrides||{})[date]||{};
 state.doctors.filter(d=>d.shift===shift).forEach(d=>{
  const o=overrides[d.id]||{};if(o.excluded)return;
  const coverage=resolveDoctorAssignment(state,d.id,date);if(!coverage)return;
  const physician=coverage.doctor,service=o.service||(weekday>=0?(d.schedule||[])[weekday]:'manual'),g=groups.find(x=>x.service===service);if(!g)return;
  const raw=activeOnDate(own(o,'residents')?o.residents:d.residents,date);
  const entry={id:d.id,sourceDoctorId:d.id,coverDoctorId:coverage.covering?physician.id:null,covering:coverage.covering,originalName:d.name,name:physician.name,title:physician.title||'Dr.',service,room:String(o.room||'').trim(),roomOrder:o.roomOrder||0,residents:assigned(raw),formattedResidents:''};
  g.doctors.push(entry);slots.push({raw,list:entry.residents,label:entry.title+' '+entry.name,group:g,doctor:entry});
 });
 if(settings.includeServiceSupport!==false&&weekday>=0)(state.serviceRules||[]).filter(r=>r.shift===shift).forEach(r=>{const g=groups.find(x=>x.service===r.service);if(!g)return;const raw=activeOnDate(r.residents,date);g.support.push(...assigned(raw));slots.push({raw,list:g.support,label:g.label,group:g});});
 const roster=new Map(guardRoster(state).map(p=>[personKey(p),p])),fixed=new Map(fixedResidents(state,shift).map(p=>[p.key,p])),covered=new Set(),used=new Set(),mobileResults=[];
 r1PriorityRoster(state).filter(person=>person.configured[shift]).forEach(person=>{if(!fixed.has(person.key))fixed.set(person.key,{key:person.key,name:person.name,grade:1});});
 assignments.forEach(pair=>{const resident=roster.get(pair.residentKey),fijo=fixed.get(pair.fixedResidentKey),result={...pair,resident:resident||personFromKey(pair.residentKey),fixedResident:fijo||personFromKey(pair.fixedResidentKey),status:'standby',reason:'El fijo está disponible; el móvil queda en reserva.',targetLabel:fijo?fijo.name+' R'+fijo.grade:'Fijo no disponible en el rol'};mobileResults.push(result);
 if(!resident||!fijo){result.status='unavailable';result.reason='Revisa el integrante o el fijo de este relevo.';return;}
 if(postKeys.has(pair.residentKey)){result.status='postguard';result.reason='El móvil está de postguardia.';return;}
 if(isAbsent(state,'resident',pair.residentKey,date)){result.status='absent';result.reason='El móvil tiene una ausencia registrada.';return;}
 let slot=slots.find(x=>x.raw.some(p=>personKey(p)===pair.fixedResidentKey)&&!mobileKeys.has(pair.fixedResidentKey));
 const r1Config=(state.r1Priorities||{})[pair.fixedResidentKey];
 if(fijo.grade===1&&r1Config&&own(r1Config,shift)){
  const destination=r1Destination(groups,r1Config[shift]),group=groups.find(item=>item.service===destination.service),doctor=destination.doctor||(destination.service==='piso'?null:leastR1Doctor(group));
  slot=doctor?slots.find(item=>item.doctor===doctor):slots.find(item=>item.group===group&&!item.doctor);
  if(!slot&&!doctor){slot={raw:[],list:group.support,label:group.label,group};slots.push(slot);}
 }
 if(!slot){result.status='unavailable';result.reason='El fijo no tiene asignación activa en este turno y día.';return;}result.targetLabel=slot.label;
 if(!postKeys.has(pair.fixedResidentKey)&&!isAbsent(state,'resident',pair.fixedResidentKey,date))return;
 if(covered.has(pair.fixedResidentKey)||used.has(pair.residentKey)){result.reason='Otro móvil disponible ya cubre este relevo.';return;}
 slot.list.push({...resident,mobile:true,replaces:pair.fixedResidentKey});covered.add(pair.fixedResidentKey);used.add(pair.residentKey);result.status='assigned';result.reason=postKeys.has(pair.fixedResidentKey)?'Sustituye al fijo de postguardia.':'Sustituye al fijo ausente.';
 });
 allocateR1Residents(state,date,shift,groups,postKeys,mobileKeys);
 groups.forEach(g=>{g.doctors.forEach(d=>{d.residents=cleanResidents(d.residents);d.formattedResidents=formatResidents(d.residents);if(!d.residents.length)warnings.push(d.title+' '+d.name+': sin residentes asignados en '+g.label.toLocaleLowerCase('es')+'.');});const keys=new Set(g.doctors.reduce((out,d)=>out.concat(d.residents.map(personKey)),[]));g.support=cleanResidents(g.support).filter(p=>!keys.has(personKey(p)));});
 if(floorReminder)groups.find(group=>group.service==='piso').floorReminder=true;
 const active=groups.filter(g=>g.doctors.length||g.support.length||g.floorReminder),qx=active.find(g=>g.service==='qx');
 if(qx){
  qx.doctors.sort(compareOperatingDoctors);
  qx.rooms=Array.from({length:6},(_,index)=>({number:index+1,room:'QX '+(index+1),doctors:qx.doctors.filter(doctor=>normalizeOperatingRoom(doctor.room)===index+1)})).filter(room=>room.doctors.length);
  qx.rooms.forEach(room=>{room.residents=cleanResidents(room.doctors.reduce((people,doctor)=>people.concat(doctor.residents),[]));});
 }
 if(!active.length)warnings.push('No hay actividades para este turno y fecha.');
 const lines=['Rol '+(shift==='matutino'?'TM':'TV')];
 active.forEach(g=>{
  lines.push('',g.label);
  if(g.service==='qx'){
   g.doctors.forEach(d=>{const number=normalizeOperatingRoom(d.room),room=number?'QX '+number:d.room,residents=formatResidents(d.residents);lines.push((room?room+' ':'')+d.title+' '+d.name+(residents?' / '+residents:''));});
  }else g.doctors.forEach(d=>{const residents=formatResidents(d.residents);lines.push((d.room?d.room+' ':'')+d.title+' '+d.name+(residents?' / '+residents:''));});
  if(g.support.length)lines.push(formatResidents(g.support));
  if(g.service==='piso'&&floorReminder){const note='(Resto de r1 al terminar actividades)';if(lines[lines.length-1]===g.label)lines.push(note);else lines[lines.length-1]+=' '+note;}
 });
 if(includeGuards)lines.push('','Guardia'+(guard.group?' '+guard.group:''),formatResidents(guard.guards)||'Sin integrantes asignados');
 return{text:lines.join('\n'),groups:active,warnings,guards:guard.guards,guardStatus:guard.guardStatus,guardGroup:guard.group,postGuardDate:previous.date,postGuardStatus:previous.status,postGuardGroup:previous.group,postGuardResidents:previous.residents,postGuardExcluded:excluded,mobileAssignments:mobileResults};
}
function validateBase(s){
 const validServices=SERVICES.map(x=>x[0]).concat(['cobertura','manual']),people=list=>Array.isArray(list)&&cleanResidents(list).length===list.length&&list.every(p=>(!own(p,'startDay')||Number.isInteger(p.startDay)&&p.startDay>=1&&p.startDay<=31)&&(!own(p,'endDay')||Number.isInteger(p.endDay)&&p.endDay>=1&&p.endDay<=31)&&(!p.startDay||!p.endDay||p.startDay<=p.endDay));
 if(!object(s)||!Array.isArray(s.doctors)||(!s.doctors.length&&s.schemaVersion!==3))throw Error('El respaldo no contiene un equipo válido.');
 const ids=new Set();s.doctors.forEach(d=>{if(!d||typeof d.id!=='string'||ids.has(d.id)||typeof d.name!=='string'||!d.name.trim()||!SHIFTS.includes(d.shift)||!Array.isArray(d.schedule)||d.schedule.length!==5||d.schedule.some(x=>!validServices.includes(x))||!people(d.residents))throw Error('El respaldo contiene un médico o un horario inválido.');ids.add(d.id);});
 if(s.absences&&(!Array.isArray(s.absences)||s.absences.some(a=>!a||!['doctor','resident'].includes(a.personType)||typeof a.personId!=='string'||!validDateRange(a.start,a.end)||own(a,'coverDoctorId')&&(typeof a.coverDoctorId!=='string'||a.coverDoctorId===a.personId))))throw Error('El respaldo contiene una ausencia inválida.');
 if(s.serviceRules&&(!Array.isArray(s.serviceRules)||s.serviceRules.some(r=>!object(r)||!SHIFTS.includes(r.shift)||!SERVICES.some(x=>x[0]===r.service)||!people(r.residents))))throw Error('El respaldo contiene apoyos inválidos.');
 if(s.dailyOverrides!==undefined&&!object(s.dailyOverrides))throw Error('El respaldo contiene ajustes diarios inválidos.');
 Object.entries(s.dailyOverrides||{}).forEach(([date,overrides])=>{
  if(!validDateRange(date,date)||!object(overrides))throw Error('El respaldo contiene una fecha inválida.');
  Object.entries(overrides).forEach(([id,o])=>{
   if(!ids.has(id)||!object(o)||own(o,'service')&&!validServices.includes(o.service)||own(o,'room')&&typeof o.room!=='string'||own(o,'excluded')&&typeof o.excluded!=='boolean'||own(o,'residents')&&!people(o.residents)||own(o,'roomOrder')&&(!Number.isSafeInteger(o.roomOrder)||o.roomOrder<1))throw Error('El respaldo contiene una asignación diaria inválida.');
   if(own(o,'operatingRoomPrevious')){const previous=o.operatingRoomPrevious;if(!object(previous)||Object.keys(previous).some(key=>!['service','room','roomOrder'].includes(key))||own(previous,'service')&&!validServices.includes(previous.service)||own(previous,'room')&&typeof previous.room!=='string'||own(previous,'roomOrder')&&(!Number.isSafeInteger(previous.roomOrder)||previous.roomOrder<1))throw Error('El respaldo contiene una asignación anterior de sala inválida.');}
  });
 });
 if(s.settings!==undefined&&!object(s.settings))throw Error('El respaldo contiene preferencias inválidas.');['showDoctors','includeGuards','includeServiceSupport','includeDate','excludePostGuard','floorR1Reminder'].forEach(k=>{if(own(s.settings,k)&&typeof s.settings[k]!=='boolean')throw Error('El respaldo contiene una preferencia inválida.');});
 if(s.settings&&own(s.settings,'floorNotes')&&(!object(s.settings.floorNotes)||Object.values(s.settings.floorNotes).some(n=>typeof n!=='string')))throw Error('El respaldo contiene una nota de piso inválida.');
 if(s.history&&(!Array.isArray(s.history)||s.history.some(h=>!object(h)||typeof h.text!=='string')))throw Error('El respaldo contiene un historial inválido.');
 if(s.schemaVersion===1){if(s.guards!==undefined&&!object(s.guards)||s.manualGuards!==undefined&&!object(s.manualGuards))throw Error('El respaldo anterior contiene guardias inválidas.');Object.entries(s.manualGuards||{}).forEach(([d,p])=>{if(!validDateRange(d,d)||!people(p))throw Error('El respaldo anterior contiene una guardia manual inválida.');});Object.entries(s.guards||{}).forEach(([m,g])=>{if(!/^\d{4}-\d{2}$/.test(m)||!validDateRange(m+'-01',m+'-01')||!object(g)||typeof g.confirmed!=='boolean'||!object(g.days))throw Error('El respaldo anterior contiene un mes inválido.');Object.entries(g.days).forEach(([d,p])=>{const date=m+'-'+String(Number(d)).padStart(2,'0');if(!/^\d{1,2}$/.test(d)||!validDateRange(date,date)||!people(p))throw Error('El respaldo anterior contiene una guardia inválida.');});});}
 return s;
}
function validateState(s){
 if(!s||![2,3].includes(s.schemaVersion))throw Error('El archivo no es un respaldo de Rolero compatible.');validateBase(s);
 if(!Array.isArray(s.guardGroups)||s.guardGroups.length<3||s.guardGroups.length>6)throw Error('Configura entre 3 y 6 guardias.');
 const seen=new Set();s.guardGroups.forEach((g,i)=>{if(!object(g)||g.id!==IDS[i]||typeof g.name!=='string'||!g.name.trim())throw Error('El respaldo contiene una guardia inválida.');validateGuardMembers(g.members).forEach(p=>{const k=personKey(p);if(seen.has(k))throw Error('Un residente está repetido entre guardias.');seen.add(k);});});
 if(!object(s.dutySelection)||!s.guardGroups.some(g=>g.id===s.dutySelection.guardGroupId))throw Error('Elige una guardia actual válida.');
 if(own(s.dutySelection,'referenceDate')&&(typeof s.dutySelection.referenceDate!=='string'||!validDateRange(s.dutySelection.referenceDate,s.dutySelection.referenceDate)))throw Error('La fecha de la guardia registrada no es válida.');
 if(own(s,'r1Priorities')){
  if(!object(s.r1Priorities))throw Error('El respaldo contiene un rol de R1 inválido.');
  const known=new Set(residentRoster(s).filter(person=>person.grade===1).map(person=>person.key));
  Object.entries(s.r1Priorities).forEach(([key,config])=>{if(!known.has(key)||!object(config)||Object.keys(config).some(shift=>!SHIFTS.includes(shift)))throw Error('El respaldo contiene un rol de R1 inválido.');Object.entries(config).forEach(([shift,targets])=>validateR1Targets(s,shift,targets));});
 }
 if(!object(s.mobileAssignments))throw Error('El respaldo contiene móviles inválidos.');
 SHIFTS.forEach(shift=>{const list=s.mobileAssignments[shift];if(!Array.isArray(list))throw Error('El respaldo contiene móviles inválidos.');const keys=new Set();list.forEach(p=>{if(!object(p)||typeof p.residentKey!=='string'||!seen.has(p.residentKey)||typeof p.fixedResidentKey!=='string'||!/^.+\|R[12]$/.test(p.fixedResidentKey)||p.residentKey===p.fixedResidentKey||keys.has(p.residentKey))throw Error('El respaldo contiene un relevo móvil inválido.');keys.add(p.residentKey);});if(list.some(p=>keys.has(p.fixedResidentKey)))throw Error('El respaldo contiene una cadena de móviles inválida.');});
 return s;
}
function migrateState(input,options){
 if(options&&own(options,'referenceDate')&&(typeof options.referenceDate!=='string'||!validDateRange(options.referenceDate,options.referenceDate)))throw Error('Elige una fecha válida para la guardia registrada.');
 if(!input||![1,2,3].includes(input.schemaVersion))throw Error('El archivo no es un respaldo de Rolero compatible.');
 if(input.schemaVersion===2||input.schemaVersion===3){
  const s=clone(input);s.mobileAssignments=s.mobileAssignments||{matutino:[],vespertino:[]};s.dutySelection=s.dutySelection||{guardGroupId:'A'};
  if(input.schemaVersion===2)validateState(s);
  if(!own(s.dutySelection,'referenceDate')&&options&&options.referenceDate)s.dutySelection.referenceDate=options.referenceDate;
  s.schemaVersion=3;s.settings={...(s.settings||{}),showDoctors:true,includeGuards:false,includeDate:false,excludePostGuard:true,floorR1Reminder:input.schemaVersion===3?!!(input.settings||{}).floorR1Reminder:false};
  return validateState(s);
 }
 validateBase(input);const s=clone(input),legacy={guards:s.guards||{},manualGuards:s.manualGuards||{}};
 s.schemaVersion=2;s.guardGroups=IDS.slice(0,4).map(id=>({id,name:'Guardia '+id,members:[]}));
 const months=Object.keys(legacy.guards).sort().reverse(),month=months.map(k=>legacy.guards[k]).find(g=>g&&g.confirmed&&object(g.groups)&&object(g.days));
 if(month){
  const owners=new Map();let review=false;
  Object.keys(month.days).sort((a,b)=>Number(a)-Number(b)).forEach(day=>{
   const g=s.guardGroups.find(x=>x.id===month.groups[day]);if(!g)return;
   cleanResidents(month.days[day]).filter(p=>p.grade<=2).forEach(p=>{
    const key=personKey(p);
    if(owners.has(key)){if(owners.get(key)!==g.id)review=true;return;}
    owners.set(key,g.id);
    if(g.members.length>=10){review=true;return;}
    g.members.push({name:p.name,grade:p.grade});
   });
  });
  if(review){s.guardGroups.forEach(g=>{g.members=[];});s.migrationNotice='Los grupos anteriores tenían más de 10 integrantes o personas repetidas entre guardias. Configura los nuevos grupos; tu equipo, ausencias e historial se conservaron.';}
 }
 if(months.length||Object.keys(legacy.manualGuards).length)s.legacyGuardData=legacy;delete s.guards;delete s.manualGuards;
 s.dutySelection={guardGroupId:'A'};s.mobileAssignments={matutino:[],vespertino:[]};s.settings={...(s.settings||{}),postGuardMode:'previous'};
 s.sourceNotes=(s.sourceNotes||[]).filter(n=>!/calendario|mes ni año|guardias varían|Carlos R1 figura en la guardia|rangos de González/i.test(n));
 return migrateState(s,options);
}
return{SERVICES,weekdayIndex,personKey,parseResidents,parseGuardMembers,formatResidents,isAbsent,availableResidents,guardRoster,fixedResidents,resolveGuards,postGuard,setDutyReference,setGuardGroupCount,setGuardGroupMembers,setMobileAssignment,removeMobileAssignment,residentRoster,addResident,updateResident,removeResident,r1PriorityRoster,setR1Priorities,resetR1Priorities,resolveDoctorAssignment,registerAbsence,removeDoctor,normalizeOperatingRoom,operatingRooms,setOperatingRoom,clearOperatingRoom,generate,migrateState,validateState,validDateRange};
});
