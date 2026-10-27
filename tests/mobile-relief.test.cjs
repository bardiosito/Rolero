const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');
const person = (name, grade = 2) => ({ name, grade });
const key = (name, grade = 2) => R.personKey(person(name, grade));
const keys = residents => residents.map(R.personKey);
const at = (state, date = '2026-10-26', shift = 'matutino') => R.generate(state, { date, shift });
const assigned = result => result.groups.flatMap(group => [...group.doctors.flatMap(doctor => doctor.residents), ...group.support]);
const relief = (state, mobile = 'Reserva Uno', fixed = 'Hernández', shift = 'matutino', mobileGrade = 2, fixedGrade = 2) =>
  R.setMobileAssignment(state, shift, { residentKey: key(mobile, mobileGrade), fixedResidentKey: key(fixed, fixedGrade) });

function fresh() {
  const state = structuredClone(defaults);
  R.setGuardGroupMembers(state, 'A', R.parseGuardMembers('Reserva Uno R2, Reserva R1'));
  R.setGuardGroupMembers(state, 'B', R.parseGuardMembers('Hernández R2, Corral R1'));
  R.setGuardGroupMembers(state, 'C', R.parseGuardMembers('Reserva Dos R2'));
  R.setGuardGroupMembers(state, 'D', R.parseGuardMembers('Otro R1'));
  state.dutySelection.guardGroupId = 'C';
  return state;
}

function absence(state, name, grade = 2, start = '2026-10-26', end = start) {
  state.absences.push({ id: 'absence-' + name, personType: 'resident', personId: key(name, grade), start, end });
}

test('un móvil sustituye al fijo de postguardia y conserva Rotantes y el rol base', () => {
  const state = fresh();
  relief(state);
  const fixedDoctors = structuredClone(state.doctors);
  const result = at(state);
  const doctor = result.groups.find(group => group.service === 'urgencias').doctors.find(doctor => doctor.id === 'flores');
  assert.ok(keys(doctor.residents).includes(key('Reserva Uno')));
  assert.ok(!keys(doctor.residents).includes(key('Hernández')));
  assert.ok(doctor.residents.some(resident => resident.grade >= 3));
  assert.equal(doctor.residents.find(resident => resident.name === 'Reserva Uno').mobile, true);
  assert.match(result.text, /Reserva Uno R2 \(móvil\)/);
  assert.equal(result.mobileAssignments.find(pair => pair.residentKey === key('Reserva Uno')).status, 'assigned');
  assert.deepEqual(state.doctors, fixedDoctors);
});

test('el móvil permanece en reserva y no se agrega como apoyo cuando el fijo está presente', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'A';
  relief(state);
  const result = at(state);
  assert.ok(keys(assigned(result)).includes(key('Hernández')));
  assert.ok(!keys(assigned(result)).includes(key('Reserva Uno')));
  assert.equal(result.mobileAssignments.find(pair => pair.residentKey === key('Reserva Uno')).status, 'standby');
});

test('una ausencia actual del fijo activa el relevo; una ausencia terminada no lo activa', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'A';
  relief(state);
  absence(state, 'Hernández');
  assert.ok(keys(assigned(at(state))).includes(key('Reserva Uno')));
  assert.ok(!keys(assigned(at(state))).includes(key('Hernández')));
  state.absences = [];
  absence(state, 'Hernández', 2, '2026-10-25');
  assert.ok(!keys(assigned(at(state))).includes(key('Reserva Uno')));
  assert.ok(keys(assigned(at(state))).includes(key('Hernández')));
});

test('un móvil de postguardia no cubre al fijo ausente', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'B';
  relief(state);
  absence(state, 'Hernández');
  const result = at(state);
  assert.ok(!keys(assigned(result)).includes(key('Reserva Uno')));
  assert.equal(result.mobileAssignments.find(pair => pair.residentKey === key('Reserva Uno')).status, 'postguard');
});

test('un móvil con ausencia no cubre al fijo de postguardia', () => {
  const state = fresh();
  relief(state);
  absence(state, 'Reserva Uno');
  const result = at(state);
  assert.ok(!keys(assigned(result)).includes(key('Reserva Uno')));
  assert.equal(result.mobileAssignments.find(pair => pair.residentKey === key('Reserva Uno')).status, 'absent');
});

test('el primer relevo disponible cubre una sola plaza y los demás quedan en reserva', () => {
  const state = fresh();
  relief(state);
  relief(state, 'Reserva Dos');
  let result = at(state);
  assert.equal(keys(assigned(result)).filter(value => value === key('Reserva Uno')).length, 1);
  assert.ok(!keys(assigned(result)).includes(key('Reserva Dos')));
  absence(state, 'Reserva Uno');
  result = at(state);
  assert.ok(!keys(assigned(result)).includes(key('Reserva Uno')));
  assert.equal(keys(assigned(result)).filter(value => value === key('Reserva Dos')).length, 1);
});

test('marcar un residente como móvil retira su ubicación fija y evita que aparezca dos veces', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'A', R.parseGuardMembers('Andrade R2, Reserva R1'));
  relief(state, 'Andrade');
  const result = at(state);
  const ramirez = result.groups.flatMap(group => group.doctors).find(doctor => doctor.id === 'ramirez');
  const flores = result.groups.flatMap(group => group.doctors).find(doctor => doctor.id === 'flores');
  assert.ok(!keys(ramirez.residents).includes(key('Andrade')));
  assert.ok(keys(flores.residents).includes(key('Andrade')));
  assert.equal(keys(assigned(result)).filter(value => value === key('Andrade')).length, 1);
  assert.ok(state.doctors.find(doctor => doctor.id === 'ramirez').residents.some(resident => R.personKey(resident) === key('Andrade')));
});

test('el relevo también cubre a un R1 fijo de apoyo por servicio', () => {
  const state = fresh();
  relief(state, 'Reserva', 'Corral', 'matutino', 1, 1);
  const result = at(state);
  assert.ok(!keys(assigned(result)).includes(key('Corral', 1)));
  assert.equal(keys(assigned(result)).filter(value => value === key('Reserva', 1)).length, 1);
  assert.ok(assigned(result).find(resident => R.personKey(resident) === key('Reserva', 1)).mobile);
});

test('los pareos matutino y vespertino son independientes', () => {
  const state = fresh();
  relief(state);
  relief(state, 'Reserva Uno', 'Márquez', 'vespertino');
  absence(state, 'Márquez');
  const morning = at(state);
  const evening = at(state, '2026-10-26', 'vespertino');
  assert.ok(morning.groups.flatMap(group => group.doctors).find(doctor => doctor.id === 'flores').residents.some(resident => R.personKey(resident) === key('Reserva Uno')));
  assert.ok(evening.groups.flatMap(group => group.doctors).find(doctor => doctor.id === 'cortina').residents.some(resident => R.personKey(resident) === key('Reserva Uno')));
  assert.equal(state.mobileAssignments.matutino[0].fixedResidentKey, key('Hernández'));
  assert.equal(state.mobileAssignments.vespertino[0].fixedResidentKey, key('Márquez'));
});

test('no se inventa una plaza cuando el médico del fijo no participa en ese turno', () => {
  const state = fresh();
  relief(state);
  state.dailyOverrides['2026-10-26'] = { flores: { excluded: true } };
  const result = at(state);
  assert.ok(!keys(assigned(result)).includes(key('Reserva Uno')));
  assert.notEqual(result.mobileAssignments.find(pair => pair.residentKey === key('Reserva Uno')).status, 'assigned');
});

test('quitar el médico del fijo conserva el pareo para corregirlo y no impide restaurar el respaldo', () => {
  const state = fresh();
  relief(state);
  state.doctors = state.doctors.filter(doctor => doctor.id !== 'flores');
  const restored = R.validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.mobileAssignments.matutino.length, 1);
  const result = at(restored);
  assert.ok(!keys(assigned(result)).includes(key('Reserva Uno')));
  assert.equal(result.mobileAssignments[0].status, 'unavailable');
});

test('un móvil no se duplica si el mismo fijo figura en dos actividades', () => {
  const state = fresh();
  relief(state);
  const cerda = state.doctors.find(doctor => doctor.id === 'cerda');
  state.dailyOverrides['2026-10-26'] = { cerda: { residents: [...cerda.residents, person('Hernández')] } };
  const result = at(state);
  assert.equal(keys(assigned(result)).filter(value => value === key('Reserva Uno')).length, 1);
});

test('reconfigurar o quitar un pareo modifica únicamente ese móvil y turno', () => {
  const state = fresh();
  relief(state);
  relief(state, 'Reserva Dos', 'Ibarra');
  relief(state, 'Reserva Uno', 'Márquez', 'vespertino');
  relief(state, 'Reserva Uno', 'Ibarra');
  assert.equal(state.mobileAssignments.matutino.filter(pair => pair.residentKey === key('Reserva Uno')).length, 1);
  assert.equal(state.mobileAssignments.matutino.find(pair => pair.residentKey === key('Reserva Uno')).fixedResidentKey, key('Ibarra'));
  R.removeMobileAssignment(state, 'matutino', key('Reserva Uno'));
  assert.ok(!state.mobileAssignments.matutino.some(pair => pair.residentKey === key('Reserva Uno')));
  assert.equal(state.mobileAssignments.matutino.length, 1);
  assert.equal(state.mobileAssignments.vespertino.length, 1);
});

test('se rechazan pareos inválidos, autorrelevos y cadenas de móviles sin mutar el estado', () => {
  const state = fresh();
  for (const pair of [
    { residentKey: key('Desconocido'), fixedResidentKey: key('Hernández') },
    { residentKey: key('Reserva Uno'), fixedResidentKey: key('Desconocido') },
    { residentKey: key('Hernández'), fixedResidentKey: key('Hernández') },
    { residentKey: key('Reserva Uno'), fixedResidentKey: key('Cruz', 3) }
  ]) {
    const before = structuredClone(state);
    assert.throws(() => R.setMobileAssignment(state, 'matutino', pair));
    assert.deepEqual(state, before);
  }
  R.setGuardGroupMembers(state, 'A', R.parseGuardMembers('Andrade R2, Reserva R1'));
  relief(state, 'Andrade');
  const before = structuredClone(state);
  assert.throws(() => relief(state, 'Hernández', 'Andrade'));
  assert.deepEqual(state, before);
});

test('generar y guardar/restaurar un respaldo mantiene los pareos y no altera el rol fijo', () => {
  const state = fresh();
  relief(state);
  const original = structuredClone(state);
  at(state);
  at(state, '2026-10-27', 'vespertino');
  assert.deepEqual(state, original);
  const restored = R.validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.mobileAssignments, state.mobileAssignments);
  assert.ok(keys(assigned(at(restored))).includes(key('Reserva Uno')));
});

test('un pareo móvil guardado sigue cubriendo la plaza original aunque otro médico la cubra', () => {
  const state = fresh();
  relief(state);
  R.registerAbsence(state, { id: 'flores-cubierta', personType: 'doctor', personId: 'flores', coverDoctorId: 'torres', start: '2026-10-26', end: '2026-10-26', note: 'Vacaciones' });
  const before = structuredClone(state.mobileAssignments);
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  const result = at(restored);
  const slot = result.groups.find(group => group.service === 'urgencias').doctors.find(doctor => doctor.id === 'flores');
  assert.equal(slot.name, 'Torres');
  assert.equal(slot.coverDoctorId, 'torres');
  assert.ok(keys(slot.residents).includes(key('Reserva Uno')));
  assert.ok(!keys(slot.residents).includes(key('Hernández')));
  assert.match(result.text, /Dr\. Torres \/ Rotantes \/ Reserva Uno R2 \(móvil\)/);
  assert.equal(result.mobileAssignments.find(pair => pair.residentKey === key('Reserva Uno')).status, 'assigned');
  assert.deepEqual(restored.mobileAssignments, before);
});
