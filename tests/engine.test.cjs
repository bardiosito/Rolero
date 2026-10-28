const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');
const fresh = () => structuredClone(defaults);
const at = (state, date = '2026-10-26', shift = 'matutino', rest = {}) => require('./planned-role.cjs')(state, { date, shift, ...rest });

test('las imágenes se conservan: 18 médicos, apoyos y excepciones', () => {
  assert.equal(defaults.doctors.length, 18);
  assert.equal(defaults.serviceRules.length, 6);
  assert.deepEqual(defaults.doctors.find(d => d.id === 'quiroz').schedule, ['residencia', 'qx', 'consulta', 'consulta', 'residencia']);
  assert.equal(defaults.doctors.find(d => d.id === 'leyva').schedule[4], 'residencia');
});

test('rotantes se agrupan una vez antes de R2 y R1; deduplicación por apellido y grado', () => {
  assert.equal(R.formatResidents([{name:'Uno',grade:4},{name:'Dos',grade:3},{name:'García',grade:1},{name:'Perez',grade:2},{name:'Pérez',grade:2}]), 'Rotantes / Perez R2 / García R1');
  assert.equal(R.formatResidents([{name:'García',grade:4},{name:'García',grade:1}]), 'Rotantes / García R1');
  assert.equal(R.formatResidents([]), '');
});

test('entrada manual valida grado y apellido, y permite líneas y punto y coma', () => {
  assert.deepEqual(R.parseResidents('Perla M. R4\nPérez R2; García R1'), [{name:'Perla M.',grade:4},{name:'Pérez',grade:2},{name:'García',grade:1}]);
  for (const bad of ['Pérez', 'Pérez R5', 'R2']) assert.throws(() => R.parseResidents(bad));
});

test('lunes matutino sigue horario fuente y no incluye vespertinos ni coberturas sin asignar', () => {
  const result = at(fresh());
  assert.match(result.text, /^Rol TM\n\nQuirófano/);
  assert.match(result.text, /Dra\. Cerda \/ Rotantes \/ Ibarra R2 \/ Chávez R1/);
  assert.equal(result.groups.find(g => g.service === 'qx').doctors.length, 2);
  assert.equal(result.groups.find(g => g.service === 'consulta').doctors.length, 3);
  assert.equal(result.groups.find(g => g.service === 'urgencias').doctors[0].id, 'flores');
  assert.doesNotMatch(result.text, /Dórame|García M\.|Esquer|Tapia R4|Cruz R3/);
});

test('los dos turnos y los cinco días se resuelven sin perder médicos de actividad residencia', () => {
  for (const day of [26,27,28,29,30]) {
    for (const shift of ['matutino','vespertino']) {
      const r = at(fresh(), `2026-10-${day}`, shift);
      assert.equal(r.groups.reduce((n,g) => n + g.doctors.length, 0), shift === 'matutino' ? 7 : 8);
      assert.doesNotMatch(r.text, / R[34]/);
    }
  }
});

test('vacaciones excluyen médicos y residentes de combinaciones y apoyos sólo dentro del intervalo', () => {
  const state = fresh();
  state.absences = [
    {id:'a',personType:'doctor',personId:'cerda',start:'2026-10-26',end:'2026-10-26'},
    {id:'b',personType:'resident',personId:R.personKey({name:'Paredes',grade:1}),start:'2026-10-26',end:'2026-10-27'},
    {id:'c',personType:'resident',personId:R.personKey({name:'Andrade',grade:2}),start:'2026-10-26',end:'2026-10-26'}
  ];
  assert.doesNotMatch(at(state).text, /Cerda|Paredes R1|Andrade R2/);
  assert.match(at(state,'2026-10-28').text, /Paredes R1|Andrade R2/);
});

test('reemplazos del día no alteran rol fijo ni días futuros', () => {
  const state = fresh();
  const before = structuredClone(state.doctors);
  state.dailyOverrides['2026-10-26'] = {cerda:{excluded:true},garcia_m:{service:'qx',residents:R.parseResidents('Suplente R2, Mayor R4')}};
  const result = at(state);
  assert.doesNotMatch(result.text,/Cerda/);
  assert.match(result.text,/Dr\. García M\. \/ Rotantes \/ Suplente R2/);
  assert.deepEqual(state.doctors,before);
  assert.doesNotMatch(at(state,'2026-10-27').text,/Suplente/);
});

test('fin de semana sólo usa asignaciones manuales y no inventa horario de servicio', () => {
  const state = fresh();
  assert.equal(at(state,'2026-10-25').groups.length,0);
  state.dailyOverrides['2026-10-25'] = {cerda:{service:'qx'}};
  const result = at(state,'2026-10-25');
  assert.ok(result.groups.some(group => group.service === 'piso'));
  assert.deepEqual(result.groups.flatMap(group => group.doctors).map(doctor => doctor.id), ['cerda']);
  assert.match(result.text,/Cerda/);
  assert.ok(result.warnings.some(w => /lunes.*viernes|fin de semana/i.test(w)));
});

test('rangos de las fuentes se conservan y los R1 sin destino del día pasan a Piso', () => {
  const state = fresh();
  assert.match(at(state,'2026-10-16').text,/González R1/);
  const source = state.serviceRules.find(rule => rule.id === 'piso_matutino');
  assert.ok(!R.availableResidents(state,source.residents,'2026-10-19').some(person => person.name === 'González'));
  assert.match(at(state,'2026-10-19').text,/Piso\n[^\n]*González R1/);
  assert.match(at(state,'2026-10-19').text,/Carlos R1/);
  assert.match(at(state,'2026-12-31').text,/Piso\n[^\n]*Carlos R1/);
});

test('la guardia resuelta corresponde al grupo elegido y no se publica dentro del rol', () => {
  const state = fresh();
  assert.equal(at(state,'2026-10-26','matutino',{includeGuards:true}).guardStatus,'pending');
  R.setGuardGroupMembers(state,'A',R.parseGuardMembers('Nuevo R1, Otro R2'));
  R.setGuardGroupMembers(state,'D',R.parseGuardMembers('Anterior R1'));
  const result = at(state,'2026-10-26','matutino',{includeGuards:true});
  assert.equal(result.guardStatus,'group');
  assert.deepEqual(result.guards.map(R.personKey).sort(),R.parseGuardMembers('Nuevo R1, Otro R2').map(R.personKey).sort());
  assert.doesNotMatch(result.text,/Guardia/);
  assert.ok(result.groups.find(group => group.service === 'qx').support.some(person => person.name === 'Otro'));
  assert.match(result.text,/Piso\n[^\n]*Nuevo R1/);
  assert.doesNotMatch(result.text,/Senior R4/);
});

test('el rol siempre publica médicos aunque una preferencia antigua solicite sólo residentes', () => {
  const result = at(fresh(),'2026-10-26','matutino',{showDoctors:false});
  assert.match(result.text,/Dra\. Cerda/);
  const qx = result.text.split('Quirófano\n')[1].split('\n\n')[0];
  assert.equal((qx.match(/Rotantes/g)||[]).length,2);
  assert.match(qx,/Ibarra R2/);
});

test('fechas y respaldo inválidos se rechazan', () => {
  assert.equal(R.weekdayIndex('2026-10-26'),0);
  assert.equal(R.weekdayIndex('2026-10-25'),-1);
  assert.throws(() => at(fresh(),'2026-02-30'));
  assert.throws(() => at(fresh(),'2026-10-26','nocturno'));
  assert.throws(() => R.setGuardGroupCount(fresh(),7));
  assert.equal(R.validateState(fresh()).schemaVersion,3);
  assert.throws(() => R.validateState({schemaVersion:3}));
  const invalid = fresh(); invalid.doctors[0].schedule = ['qx'];
  assert.throws(() => R.validateState(invalid));
});

test('las salas y el formato final siguen los ejemplos entregados', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-28'] = {
    flores: {room:'Q1',residents:R.parseResidents('Mayor R3, Otro R4, Palencia R1')},
    torres: {room:'Q5',residents:R.parseResidents('Mendoza R4, Pérez R2, Paredes R1')}
  };
  const result = at(state,'2026-10-28');
  assert.match(result.text,/QX 1 Dra\. Flores \/ Rotantes \/ Hernández R2 \/ Palencia R1/);
  assert.match(result.text,/QX 5 Dr\. Torres \/ Rotantes \/ Pérez R2 \/ Paredes R1/);
  assert.ok(!result.groups.find(g => g.service === 'qx').support.some(person => person.name === 'Paredes'));
  assert.doesNotMatch(at(state,'2026-10-28','vespertino').text,/todos los R1 al terminar actividades/);
});

test('respaldos con colecciones anidadas inválidas no reemplazan datos válidos', () => {
  const mutations = [
    state => { state.serviceRules = [null]; },
    state => { state.guardGroups = [null]; },
    state => { state.mobileAssignments = {matutino:'Corral R1',vespertino:[]}; },
    state => { state.dailyOverrides = {'2026-10-26':{cerda:{residents:[{name:'Mal',grade:8}]}}}; },
    state => { state.settings.floorNotes = {matutino:{bad:true}}; }
  ];
  for (const change of mutations) { const state=fresh(); change(state); assert.throws(() => R.validateState(state)); }
});
