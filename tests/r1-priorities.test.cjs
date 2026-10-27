const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../app/src/main/assets/engine');
const {defaults}=require('../app/src/main/assets/data');
const p=(name,grade=1)=>({name,grade});
const date='2026-10-27';
function fresh(){
 const s=structuredClone(defaults);
 s.doctors=[
  {id:'a',name:'Alfa',title:'Dr.',shift:'matutino',schedule:Array(5).fill('consulta'),residents:[p('Mayor A',4),p('Dos A',2),p('Uno')]},
  {id:'b',name:'Beta',title:'Dra.',shift:'matutino',schedule:Array(5).fill('consulta'),residents:[p('Mayor B',3),p('Dos B',2)]},
  {id:'c',name:'Gamma',title:'Dr.',shift:'vespertino',schedule:Array(5).fill('consulta'),residents:[p('Uno'),p('Dos C',2)]}
 ];
 s.serviceRules=[];s.dailyOverrides={};s.absences=[];s.r1Priorities={};s.mobileAssignments={matutino:[],vespertino:[]};s.guardGroups.forEach(g=>g.members=[]);
 R.setDutyReference(s,'A',date);return s;
}
const at=(s,shift='matutino',day=date)=>R.generate(s,{date:day,shift});
const doctor=(result,id)=>result.groups.flatMap(g=>g.doctors).find(d=>d.id===id);
const occurrences=(result,name)=>result.groups.flatMap(g=>[...g.doctors.flatMap(d=>d.residents),...g.support]).filter(p=>p.name===name);
test('QX repite sala en orden de alta y conserva cada equipo propio tras respaldo',()=>{
 const s=fresh();R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'b',room:2});R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'a',room:2});
 const restored=R.migrateState(JSON.parse(JSON.stringify(s))),lines=at(restored).text.split('\n').filter(l=>l.startsWith('QX 2'));
 assert.equal(lines.length,2);assert.match(lines[0],/Beta.*Dos B/);assert.doesNotMatch(lines[0],/Dos A|Uno/);assert.match(lines[1],/Alfa.*Dos A.*Uno R1/);
 assert.deepEqual(R.operatingRooms(restored,{date,shift:'matutino'}).rooms[1].doctors.map(d=>d.id),['b','a']);
});
test('mover añade al final, misma sala conserva posición y restablecer conserva otros campos',()=>{
 const s=fresh();s.dailyOverrides[date]={a:{service:'consulta',room:'Q3',roomOrder:7,residents:[p('Especial',2)]}};
 for(const id of ['b','a'])R.setOperatingRoom(s,{date,shift:'matutino',doctorId:id,room:1});
 const order=s.dailyOverrides[date].a.roomOrder;R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'a',room:1});assert.equal(s.dailyOverrides[date].a.roomOrder,order);
 R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'b',room:2});R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'b',room:1});assert.deepEqual(R.operatingRooms(s,{date,shift:'matutino'}).rooms[0].doctors.map(d=>d.id),['a','b']);
 R.clearOperatingRoom(s,{date,shift:'matutino',doctorId:'a'});assert.deepEqual(s.dailyOverrides[date].a,{service:'consulta',room:'Q3',roomOrder:7,residents:[p('Especial',2)]});
});
test('un destino por turno coloca al R1 con el médico elegido sin modificar sus combinaciones base',()=>{
 const s=fresh(),original=structuredClone(s.doctors);R.setR1Priorities(s,'uno|R1','matutino',['doctor:b']);
 const result=at(s);assert.ok(doctor(result,'b').residents.some(p=>p.name==='Uno'));assert.ok(!doctor(result,'a').residents.some(p=>p.name==='Uno'));assert.equal(occurrences(result,'Uno').length,1);assert.deepEqual(s.doctors,original);
 assert.ok(doctor(at(s,'vespertino'),'c').residents.some(p=>p.name==='Uno'));
 R.resetR1Priorities(s,'uno|R1','matutino');assert.ok(doctor(at(s),'a').residents.some(p=>p.name==='Uno'));
});
test('servicio elige al médico con menos R1 y Piso permanece separado sin Apoyo',()=>{
 const s=fresh();R.addResident(s,{name:'Libre',grade:1,guardGroupId:'A'});R.addResident(s,{name:'Piso',grade:1,guardGroupId:'A'});
 R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'a',room:1});R.setOperatingRoom(s,{date,shift:'matutino',doctorId:'b',room:1});
 R.setR1Priorities(s,'libre|R1','matutino',['service:qx']);R.setR1Priorities(s,'piso|R1','matutino',['service:piso']);
 const result=at(s);assert.ok(doctor(result,'b').residents.some(p=>p.name==='Libre'));assert.ok(result.groups.find(g=>g.service==='piso').support.some(p=>p.name==='Piso'));assert.doesNotMatch(result.text,/Apoyo/);assert.equal(occurrences(result,'Libre').length,1);
});
test('ausencia y postguardia excluyen al R1; cobertura conserva el destino de origen y falta de médico va a Piso',()=>{
 const s=fresh();R.setR1Priorities(s,'uno|R1','matutino',['doctor:a']);s.absences=[{id:'x',personType:'doctor',personId:'a',coverDoctorId:'b',start:date,end:date}];
 assert.equal(doctor(at(s),'a').name,'Beta');assert.ok(doctor(at(s),'a').residents.some(p=>p.name==='Uno'));
 s.absences[0].coverDoctorId='';assert.ok(at(s).groups.find(g=>g.service==='piso').support.some(p=>p.name==='Uno'));
 s.absences.push({id:'r',personType:'resident',personId:'uno|R1',start:date,end:date});assert.equal(occurrences(at(s),'Uno').length,0);
 s.absences=[];R.setGuardGroupMembers(s,'D',[p('Uno')]);assert.equal(occurrences(at(s),'Uno').length,0);
});
test('relevo de un R1 configurado cubre su nuevo médico y no su ubicación anterior',()=>{
 const s=fresh();R.setGuardGroupMembers(s,'D',[p('Uno')]);R.setGuardGroupMembers(s,'A',[p('Relevo',2)]);R.setMobileAssignment(s,'matutino',{residentKey:'relevo|R2',fixedResidentKey:'uno|R1'});R.setR1Priorities(s,'uno|R1','matutino',['doctor:b']);
 const result=at(s);assert.equal(occurrences(result,'Uno').length,0);assert.ok(doctor(result,'b').residents.some(p=>p.name==='Relevo'&&p.mobile));assert.ok(!doctor(result,'a').residents.some(p=>p.name==='Relevo'));
});
test('los R1 móviles mantienen reserva y sustituciones antes que el destino nuevo',()=>{
 const s=fresh();R.setGuardGroupMembers(s,'A',[p('Relevo')]);R.setMobileAssignment(s,'matutino',{residentKey:'relevo|R1',fixedResidentKey:'uno|R1'});R.setR1Priorities(s,'relevo|R1','matutino',['doctor:b']);assert.equal(occurrences(at(s),'Relevo').length,0);
 s.absences=[{id:'r',personType:'resident',personId:'uno|R1',start:date,end:date}];assert.ok(doctor(at(s),'a').residents.some(p=>p.name==='Relevo'&&p.mobile));
});
test('renombre, promoción y retiro mantienen identidad y limpian las reglas R1',()=>{
 const s=fresh();R.setR1Priorities(s,'uno|R1','matutino',['doctor:b']);R.updateResident(s,'uno|R1',{name:'Nuevo'});assert.ok(s.r1Priorities['nuevo|R1']);assert.ok(!s.r1Priorities['uno|R1']);
 R.updateResident(s,'nuevo|R1',{grade:2});assert.ok(!s.r1Priorities['nuevo|R1']);assert.ok(s.doctors.find(d=>d.id==='b').residents.some(p=>p.name==='Nuevo'&&p.grade===2));assert.ok(!s.doctors.find(d=>d.id==='a').residents.some(p=>p.name==='Nuevo'));
 const other=fresh();R.setR1Priorities(other,'uno|R1','matutino',['doctor:b']);R.updateResident(other,'uno|R1',{grade:2,doctorIds:{matutino:['a']}});assert.ok(other.doctors.find(d=>d.id==='b').residents.some(p=>p.name==='Uno'));
 const explicit=fresh();explicit.doctors.push({id:'d',name:'Delta',title:'Dr.',shift:'matutino',schedule:Array(5).fill('consulta'),residents:[]});R.setR1Priorities(explicit,'uno|R1','matutino',['doctor:b']);R.updateResident(explicit,'uno|R1',{grade:2,doctorIds:{matutino:['d']}});assert.ok(explicit.doctors.find(d=>d.id==='d').residents.some(p=>p.name==='Uno'));
});
test('borrar médico elimina su destino, baja de residente limpia reglas y entradas inválidas son atómicas',()=>{
 const s=fresh();R.setR1Priorities(s,'uno|R1','matutino',['doctor:b']);R.removeDoctor(s,'b');assert.deepEqual(s.r1Priorities['uno|R1'].matutino,[]);R.removeResident(s,'uno|R1');assert.ok(!s.r1Priorities['uno|R1']);
 for(const [key,shift,targets] of [['dos a|R2','matutino',['service:piso']],['uno|R1','matutino',['doctor:c']],['uno|R1','matutino',['service:qx','service:qx']],['uno|R1','x',['service:piso']]]){const state=fresh(),before=structuredClone(state);assert.throws(()=>R.setR1Priorities(state,key,shift,targets));assert.deepEqual(state,before);}
 const invalid=fresh();invalid.dailyOverrides[date]={a:{room:'QX 1',roomOrder:0}};assert.throws(()=>R.validateState(invalid));
});
test('fin de semana heredado no inventa actividades y los destinos explícitos persisten en respaldo',()=>{
 const s=fresh();assert.equal(at(s,'matutino','2026-10-31').text,'Rol TM');R.setR1Priorities(s,'uno|R1','matutino',['service:piso']);const restored=R.migrateState(JSON.parse(JSON.stringify(s)));assert.ok(at(restored,'matutino','2026-10-31').groups.find(g=>g.service==='piso').support.some(p=>p.name==='Uno'));
});
