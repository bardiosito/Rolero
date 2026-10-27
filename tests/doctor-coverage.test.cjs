const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');

const person = (name, grade = 2) => ({ name, grade });
const keys = people => people.map(R.personKey).sort();
const at = (state, date = '2026-10-26', shift = 'matutino', options = {}) => R.generate(state, { date, shift, ...options });
const doctors = result => result.groups.flatMap(group => group.doctors);
const assigned = result => result.groups.flatMap(group => [...group.doctors.flatMap(doctor => doctor.residents), ...group.support]);
const record = (personId = 'md-a', coverDoctorId = 'md-b', extra = {}) => ({
  id: 'ausencia-' + personId, personType: 'doctor', personId, coverDoctorId,
  start: '2026-10-26', end: '2026-10-26', note: 'Vacaciones', ...extra
});

function fresh() {
  const state = structuredClone(defaults);
  state.doctors = [
    { id: 'md-a', name: 'Alfa', title: 'Dr.', shift: 'matutino', schedule: Array(5).fill('qx'), residents: [person('Equipo Alfa'), person('Mayor Alfa', 4)] },
    { id: 'md-b', name: 'Beta', title: 'Dra.', shift: 'matutino', schedule: Array(5).fill('consulta'), residents: [person('Equipo Beta'), person('Mayor Beta', 3)] },
    { id: 'md-c', name: 'Gamma', title: 'Dr.', shift: 'vespertino', schedule: Array(5).fill('urgencias'), residents: [person('Equipo Gamma')] }
  ];
  state.serviceRules = [];
  state.absences = [];
  state.dailyOverrides = {};
  state.mobileAssignments = { matutino: [], vespertino: [] };
  return state;
}

test('una asignación sin ausencia conserva su identidad y no tiene metadatos de cobertura activos', () => {
  const state = fresh();
  const resolved = R.resolveDoctorAssignment(state, 'md-a', '2026-10-26');
  assert.equal(resolved.doctor.id, 'md-a');
  assert.equal(resolved.sourceDoctor.id, 'md-a');
  assert.equal(resolved.covering, false);
  assert.equal(resolved.absence, null);
  assert.equal(R.resolveDoctorAssignment(state, 'desconocido', '2026-10-26'), null);
  const entry = doctors(at(state)).find(doctor => doctor.id === 'md-a');
  assert.equal(entry.sourceDoctorId, 'md-a');
  assert.equal(entry.coverDoctorId, null);
  assert.equal(entry.covering, false);
});

test('la cobertura usa nombre y título del suplente con actividad, sala y residentes del ausente', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-26'] = { 'md-a': { service: 'qx', room: 'Q3', residents: [person('Cambio Alfa'), person('Mayor Alfa', 4)] } };
  R.registerAbsence(state, record());
  const result = at(state);
  const source = result.groups.find(group => group.service === 'qx').doctors[0];
  assert.equal(source.id, 'md-a');
  assert.equal(source.sourceDoctorId, 'md-a');
  assert.equal(source.coverDoctorId, 'md-b');
  assert.equal(source.covering, true);
  assert.equal(source.name, 'Beta');
  assert.equal(source.title, 'Dra.');
  assert.equal(source.room, 'Q3');
  assert.deepEqual(keys(source.residents), keys([person('Cambio Alfa'), person('Mayor Alfa', 4)]));
  assert.match(result.text, /QX 3 Dra\. Beta \/ Rotantes \/ Cambio Alfa R2/);
  assert.doesNotMatch(result.text, /Dr\. Alfa|Equipo Alfa R2/);
  const own = result.groups.find(group => group.service === 'consulta').doctors[0];
  assert.equal(own.id, 'md-b');
  assert.deepEqual(keys(own.residents), keys(state.doctors[1].residents));
  assert.equal((result.text.match(/Dra\. Beta/g) || []).length, 2);
});

test('los médicos con el mismo nombre siguen siendo personas distintas por su ID', () => {
  const state = fresh();
  state.doctors[0].name = 'Mismo Nombre';
  state.doctors[1].name = 'Mismo Nombre';
  assert.doesNotThrow(() => R.validateState(state));
  R.registerAbsence(state, record());
  const result = at(state);
  assert.equal(doctors(result).filter(doctor => doctor.name === 'Mismo Nombre').length, 2);
  assert.equal(doctors(result).find(doctor => doctor.id === 'md-a').coverDoctorId, 'md-b');
  const before = structuredClone(state);
  assert.throws(() => R.registerAbsence(state, record('md-a', 'md-a', { id: 'autocobertura' })));
  assert.deepEqual(state, before);
});

test('un médico de otro turno puede cubrir y conserva su rol propio en su turno', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', 'md-c'));
  const morning = at(state);
  assert.match(morning.text, /Dr\. Gamma \/ Rotantes \/ Equipo Alfa R2/);
  assert.doesNotMatch(morning.text, /Equipo Gamma R2/);
  const evening = at(state, '2026-10-26', 'vespertino');
  assert.equal(doctors(evening).length, 1);
  assert.equal(doctors(evening)[0].id, 'md-c');
  assert.match(evening.text, /Dr\. Gamma \/ Equipo Gamma R2/);
});

test('un médico sin actividad fija ese día puede cubrir una plaza activa', () => {
  const state = fresh();
  state.doctors[1].schedule = Array(5).fill('cobertura');
  R.registerAbsence(state, record());
  const result = at(state);
  assert.equal(doctors(result).length, 1);
  assert.equal(doctors(result)[0].id, 'md-a');
  assert.match(result.text, /Dra\. Beta \/ Rotantes \/ Equipo Alfa R2/);
});

test('la cobertura comienza y termina en fechas inclusivas y no cambia días fuera del intervalo', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', 'md-b', { end: '2026-10-27' }));
  for (const date of ['2026-10-26', '2026-10-27']) {
    const entry = doctors(at(state, date)).find(doctor => doctor.id === 'md-a');
    assert.equal(entry.name, 'Beta');
    assert.equal(entry.covering, true);
  }
  for (const date of ['2026-10-23', '2026-10-28']) {
    const entry = doctors(at(state, date)).find(doctor => doctor.id === 'md-a');
    assert.equal(entry.name, 'Alfa');
    assert.equal(entry.covering, false);
  }
});

test('una ausencia médica sin suplente omite su plaza y mantiene los demás médicos', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', ''));
  assert.equal(R.resolveDoctorAssignment(state, 'md-a', '2026-10-26'), null);
  const result = at(state);
  assert.doesNotMatch(result.text, /Alfa/);
  assert.deepEqual(doctors(result).map(doctor => doctor.id), ['md-b']);
  assert.match(result.text, /Dra\. Beta/);
});

test('la última ausencia registrada que cubre la fecha decide la cobertura sin conflicto', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', 'md-b', { id: 'primera', end: '2026-10-28' }));
  R.registerAbsence(state, record('md-a', 'md-c', { id: 'segunda', start: '2026-10-27', end: '2026-10-27' }));
  assert.equal(doctors(at(state)).find(doctor => doctor.id === 'md-a').name, 'Beta');
  assert.equal(doctors(at(state, '2026-10-27')).find(doctor => doctor.id === 'md-a').name, 'Gamma');
  assert.equal(doctors(at(state, '2026-10-28')).find(doctor => doctor.id === 'md-a').name, 'Beta');
  assert.equal(state.absences.length, 2);
});

test('una cadena de coberturas usa al último médico disponible con el equipo del origen', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', 'md-b'));
  R.registerAbsence(state, record('md-b', 'md-c'));
  const resolved = R.resolveDoctorAssignment(state, 'md-a', '2026-10-26');
  assert.equal(resolved.doctor.id, 'md-c');
  assert.equal(resolved.sourceDoctor.id, 'md-a');
  assert.equal(resolved.covering, true);
  const source = doctors(at(state)).find(doctor => doctor.id === 'md-a');
  assert.equal(source.coverDoctorId, 'md-c');
  assert.match(at(state).text, /Dr\. Gamma \/ Rotantes \/ Equipo Alfa R2/);
  assert.deepEqual(keys(source.residents), keys(state.doctors[0].residents));
});

test('un ciclo de coberturas no produce plazas ni impide generar el resto del rol', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', 'md-b'));
  R.registerAbsence(state, record('md-b', 'md-a'));
  assert.equal(R.resolveDoctorAssignment(state, 'md-a', '2026-10-26'), null);
  assert.equal(R.resolveDoctorAssignment(state, 'md-b', '2026-10-26'), null);
  assert.deepEqual(doctors(at(state)), []);
  assert.match(at(state, '2026-10-26', 'vespertino').text, /Dr\. Gamma/);
});

test('un suplente ausente sin cobertura deja sin asignación la plaza que iba a cubrir', () => {
  const state = fresh();
  R.registerAbsence(state, record('md-a', 'md-b'));
  R.registerAbsence(state, record('md-b', ''));
  assert.equal(R.resolveDoctorAssignment(state, 'md-a', '2026-10-26'), null);
  assert.deepEqual(doctors(at(state)), []);
});

test('generar una cobertura conserva las ausencias, combinaciones, ajustes e historial guardados', () => {
  const state = fresh();
  R.registerAbsence(state, record());
  state.history = [{ text: 'Rol confirmado anterior' }];
  state.dailyOverrides['2026-10-26'] = { 'md-a': { room: 'Q2' } };
  const before = structuredClone(state);
  at(state);
  at(state, '2026-10-27', 'vespertino');
  assert.deepEqual(state, before);
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.absences, before.absences);
  assert.equal(doctors(at(restored)).find(doctor => doctor.id === 'md-a').coverDoctorId, 'md-b');
});

test('el registro acepta ausencia de residente y la guarda sin asignar cobertura médica', () => {
  const state = fresh();
  const absence = { id: 'vacaciones-residente', personType: 'resident', personId: R.personKey(person('Equipo Alfa')), start: '2026-10-26', end: '2026-10-27', note: 'Curso' };
  R.registerAbsence(state, absence);
  assert.equal(state.absences[0].personId, absence.personId);
  assert.equal(state.absences[0].note, 'Curso');
  assert.doesNotMatch(at(state).text, /Equipo Alfa R2/);
  assert.match(at(state, '2026-10-28').text, /Equipo Alfa R2/);
});

test('un residente agregado sólo en ajustes del día admite una ausencia y se retira del reporte', () => {
  const state = fresh();
  const resident = person('Residente del Día', 1);
  state.dailyOverrides['2026-10-26'] = { 'md-a': { residents: [resident] } };
  assert.match(at(state).text, /Residente del Día R1/);
  R.registerAbsence(state, { id: 'ajuste-ausente', personType: 'resident', personId: R.personKey(resident), start: '2026-10-26', end: '2026-10-26', note: 'Ausencia del día' });
  const result = at(state);
  assert.doesNotMatch(result.text, /Residente del Día/);
  assert.ok(!keys(assigned(result)).includes(R.personKey(resident)));
  assert.deepEqual(state.dailyOverrides['2026-10-26']['md-a'].residents, [resident]);
  assert.equal(state.absences[0].personId, R.personKey(resident));
});

test('el registro rechaza identidades, tipos, coberturas y fechas inválidas sin cambiar datos', () => {
  const invalid = [
    { personType: 'otro' }, { personId: '' }, { personId: 'desconocido' },
    { coverDoctorId: 'desconocido' }, { coverDoctorId: 4 }, { coverDoctorId: 'md-a' },
    { start: '2026-02-30' }, { end: '2026-10-25' }, { start: '' }, { end: 'ayer' },
    { personType: 'resident', personId: 'desconocido|R2', coverDoctorId: '' }
  ];
  for (const change of invalid) {
    const state = fresh();
    const before = structuredClone(state);
    assert.throws(() => R.registerAbsence(state, record('md-a', 'md-b', change)), JSON.stringify(change));
    assert.deepEqual(state, before);
  }
  const state = fresh();
  R.registerAbsence(state, record());
  const before = structuredClone(state);
  assert.throws(() => R.registerAbsence(state, record()));
  assert.deepEqual(state, before);
});

test('quitar un médico limpia sus ajustes y ausencias y libera las referencias de cobertura', () => {
  const state = fresh();
  state.dailyOverrides = { '2026-10-26': { 'md-a': { room: 'Q1' }, 'md-b': { room: 'Q4' } }, '2026-10-27': { 'md-a': { service: 'piso' } } };
  R.registerAbsence(state, record('md-a', 'md-b'));
  R.registerAbsence(state, record('md-b', 'md-a'));
  R.registerAbsence(state, { id: 'residente', personType: 'resident', personId: R.personKey(person('Equipo Gamma')), start: '2026-10-26', end: '2026-10-26' });
  R.removeDoctor(state, 'md-a');
  assert.deepEqual(state.doctors.map(doctor => doctor.id), ['md-b', 'md-c']);
  assert.ok(Object.values(state.dailyOverrides).every(overrides => !Object.hasOwn(overrides, 'md-a')));
  assert.equal(state.dailyOverrides['2026-10-26']['md-b'].room, 'Q4');
  assert.ok(!state.absences.some(absence => absence.personType === 'doctor' && absence.personId === 'md-a'));
  assert.equal(state.absences.find(absence => absence.personId === 'md-b').coverDoctorId, '');
  assert.ok(state.absences.some(absence => absence.id === 'residente'));
  assert.doesNotThrow(() => R.validateState(state));
});

test('pueden eliminarse todos los médicos y restaurar el equipo vacío en un respaldo v3', () => {
  const state = fresh();
  for (const id of state.doctors.map(doctor => doctor.id)) R.removeDoctor(state, id);
  assert.deepEqual(state.doctors, []);
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.schemaVersion, 3);
  assert.deepEqual(restored.doctors, []);
  assert.doesNotThrow(() => R.validateState(restored));
  assert.deepEqual(at(restored).groups, []);
  assert.equal(at(restored).text, 'Rol TM');
});

test('el respaldo v3 admite cobertura opcional y rechaza coberturas corruptas o por el mismo ID', () => {
  const state = fresh();
  state.absences = [record('md-a', 'md-b')];
  assert.doesNotThrow(() => R.validateState(state));
  delete state.absences[0].coverDoctorId;
  assert.doesNotThrow(() => R.validateState(state));
  for (const coverDoctorId of [7, null, {}, 'md-a']) {
    state.absences[0].coverDoctorId = coverDoctorId;
    assert.throws(() => R.validateState(state));
  }
});

test('los respaldos v2 mantienen validación estricta de estructura y equipo no vacío', () => {
  const legacy = fresh();
  legacy.schemaVersion = 2;
  assert.doesNotThrow(() => R.validateState(legacy));
  const empty = structuredClone(legacy);
  empty.doctors = [];
  assert.throws(() => R.validateState(empty));
  legacy.absences = [record('md-a', 7)];
  assert.throws(() => R.validateState(legacy));
});

test('una ausencia de residente lo retira de médicos, apoyos y guardia en ambos turnos y en los dos extremos', () => {
  const state = fresh();
  const shared = person('Compartido', 1);
  state.doctors.forEach(doctor => doctor.residents.push(shared));
  state.serviceRules = [
    { id: 'apoyo-tm', shift: 'matutino', service: 'piso', residents: [shared] },
    { id: 'apoyo-tv', shift: 'vespertino', service: 'piso', residents: [shared] }
  ];
  R.setGuardGroupMembers(state, 'A', [shared]);
  R.registerAbsence(state, { id: 'r1-ausente', personType: 'resident', personId: R.personKey(shared), start: '2026-10-26', end: '2026-10-27', note: 'Vacaciones' });
  for (const date of ['2026-10-26', '2026-10-27']) {
    for (const shift of ['matutino', 'vespertino']) {
      const result = at(state, date, shift);
      assert.ok(!keys(assigned(result)).includes(R.personKey(shared)));
      assert.ok(!keys(result.guards).includes(R.personKey(shared)));
      assert.doesNotMatch(result.text, /Compartido/);
    }
  }
  for (const date of ['2026-10-23', '2026-10-28']) {
    for (const shift of ['matutino', 'vespertino']) {
      const result = at(state, date, shift);
      assert.ok(keys(assigned(result)).includes(R.personKey(shared)));
      assert.ok(keys(result.guards).includes(R.personKey(shared)));
    }
  }
});
