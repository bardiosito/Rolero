const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');

const reminder = '(Resto de r1 al terminar actividades)';
const fresh = () => structuredClone(defaults);
const at = (state, date = '2026-10-26', shift = 'matutino', options = {}) => require('./planned-role.cjs')(state, { date, shift, ...options });
const allResidents = result => result.groups.flatMap(group => [...group.doctors.flatMap(doctor => doctor.residents), ...group.support]);

test('el estado inicial v3 publica médicos, excluye postguardia y deja apagado el aviso de Piso', () => {
  assert.equal(defaults.schemaVersion, 3);
  assert.equal(defaults.settings.showDoctors, true);
  assert.equal(defaults.settings.excludePostGuard, true);
  assert.equal(defaults.settings.includeGuards, false);
  assert.equal(defaults.settings.includeDate, false);
  assert.equal(defaults.settings.floorR1Reminder, false);
  assert.doesNotMatch(at(fresh()).text, /Resto de r1|todos los R1/);
});

test('las preferencias antiguas y opciones de publicación no ocultan médicos ni reincorporan postguardia', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'A', R.parseGuardMembers('Guardia Nueva R1'));
  R.setGuardGroupMembers(state, 'D', R.parseGuardMembers('Ibarra R2, Chávez R1'));
  const expected = at(state);
  state.settings.showDoctors = false;
  state.settings.excludePostGuard = false;
  state.settings.includeGuards = true;
  state.settings.includeDate = true;
  const result = at(state, '2026-10-26', 'matutino', { showDoctors: false, excludePostGuard: false, includeGuards: true, includeDate: true });
  assert.equal(result.text, expected.text);
  assert.match(result.text, /Dra\. Cerda/);
  assert.doesNotMatch(result.text, /Ibarra R2|Chávez R1|\nGuardia A\n|2026|octubre|Lunes/i);
  assert.match(result.text,/Piso\n[^\n]*Guardia Nueva R1/);
  assert.ok(!allResidents(result).some(person => ['ibarra|R2', 'chavez|R1'].includes(R.personKey(person))));
  assert.deepEqual(result.postGuardExcluded.map(R.personKey).sort(), ['chavez|R1', 'ibarra|R2']);
});

test('los avisos y la fecha de trabajo nunca se agregan al texto compartido del rol', () => {
  const state = fresh();
  state.settings.includeDate = true;
  state.settings.includeGuards = true;
  const result = at(state);
  assert.ok(result.warnings.length > 0);
  assert.match(result.text, /^Rol TM\n\nQuirófano/);
  assert.doesNotMatch(result.text, /2026-10-26|26 de octubre|lunes|Configura|Elige la guardia|Advertencia|Aviso|Guardia A/i);
  for (const warning of result.warnings) assert.ok(!result.text.includes(warning));
});

test('activar el aviso añade la frase exacta una sola vez en Piso en ambos turnos', () => {
  const state = fresh();
  state.settings.floorR1Reminder = true;
  for (const shift of ['matutino', 'vespertino']) {
    const result = at(state, '2026-10-26', shift);
    const floor = result.text.split('\n\nPiso\n')[1];
    assert.ok(floor, shift);
    assert.ok(floor.includes(reminder), shift);
    assert.equal(result.text.split(reminder).length - 1, 1);
    assert.doesNotMatch(result.text, /todos los R1 al terminar actividades/);
  }
});

test('apagar el aviso retira únicamente la frase y conserva las personas asignadas en Piso', () => {
  const state = fresh();
  state.settings.floorR1Reminder = true;
  const enabled = at(state);
  state.settings.floorR1Reminder = false;
  const disabled = at(state);
  assert.doesNotMatch(disabled.text, /Resto de r1|todos los R1/);
  const roster = result => result.groups.map(group => ({ service: group.service, doctorIds: group.doctors.map(doctor => doctor.id), people: allResidents({ groups: [group] }).map(R.personKey) }));
  assert.deepEqual(roster(disabled), roster(enabled));
  assert.match(disabled.text, /Piso\n.*Palencia R1/);
});

test('el aviso crea Piso sin personas asignadas y apagarlo retira esa sección vacía', () => {
  const state = fresh();
  state.doctors = [];
  state.serviceRules = [];
  state.settings.floorR1Reminder = true;
  const enabled = at(state);
  assert.ok(enabled.text.includes('\n\nPiso\n'));
  assert.ok(enabled.text.includes(reminder));
  const floor = enabled.groups.find(group => group.service === 'piso');
  assert.ok(floor);
  assert.deepEqual(floor.doctors, []);
  assert.deepEqual(floor.support, []);
  state.settings.floorR1Reminder = false;
  const disabled = at(state);
  assert.equal(disabled.text, 'Rol TM');
  assert.deepEqual(disabled.groups, []);
});

test('Piso con un médico y residentes recibe el aviso sin reemplazar su equipo', () => {
  const state = fresh();
  state.settings.floorR1Reminder = true;
  state.dailyOverrides['2026-10-26'] = { cerda: { service: 'piso' } };
  const result = at(state);
  const floor = result.groups.find(group => group.service === 'piso');
  assert.equal(floor.doctors[0].id, 'cerda');
  assert.match(result.text.split('\n\nPiso\n')[1], /Dra\. Cerda \/ Rotantes \/ Chávez R1/);
  assert.ok(!allResidents({groups:[floor]}).some(person => person.grade === 2));
  assert.ok(allResidents(result).some(person => person.name === 'Ibarra' && person.grade === 2));
  assert.equal(result.text.split(reminder).length - 1, 1);
});

test('las notas de Piso de versiones anteriores no se publican con el aviso encendido o apagado', () => {
  const state = fresh();
  state.settings.floorNotes = { matutino: 'Nota antigua matutina', vespertino: '(todos los R1 al terminar actividades)' };
  for (const enabled of [false, true, false]) {
    state.settings.floorR1Reminder = enabled;
    for (const shift of ['matutino', 'vespertino']) {
      const result = at(state, '2026-10-26', shift);
      assert.doesNotMatch(result.text, /Nota antigua matutina|todos los R1 al terminar actividades/);
      assert.equal(result.text.includes(reminder), enabled);
    }
  }
});

test('migrar v2 conserva grupos, móviles, equipo, ausencias, ajustes e historial y reinicia publicación', () => {
  const legacy = fresh();
  legacy.schemaVersion = 2;
  R.setGuardGroupMembers(legacy, 'A', R.parseGuardMembers('Reserva R2'));
  R.setGuardGroupMembers(legacy, 'D', R.parseGuardMembers('Otro R1'));
  R.setMobileAssignment(legacy, 'matutino', { residentKey: R.personKey({ name: 'Reserva', grade: 2 }), fixedResidentKey: R.personKey({ name: 'Hernández', grade: 2 }) });
  legacy.dutySelection.guardGroupId = 'C';
  legacy.absences = [{ id: 'v2-ausencia', personType: 'doctor', personId: 'cerda', start: '2026-10-26', end: '2026-10-27', note: 'Conservar' }];
  legacy.dailyOverrides = { '2026-10-26': { flores: { room: 'Q6' } } };
  legacy.history = [{ id: 'v2-historia', text: 'Texto ya confirmado', date: '2026-10-23', shift: 'matutino' }];
  legacy.settings = { ...legacy.settings, showDoctors: false, excludePostGuard: false, includeDate: true, includeGuards: true, floorR1Reminder: true };
  const original = structuredClone(legacy);
  const migrated = R.migrateState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  for (const field of ['doctors', 'guardGroups', 'mobileAssignments', 'dutySelection', 'absences', 'dailyOverrides', 'history']) assert.deepEqual(migrated[field], original[field], field);
  assert.equal(migrated.settings.showDoctors, true);
  assert.equal(migrated.settings.excludePostGuard, true);
  assert.equal(migrated.settings.includeDate, false);
  assert.equal(migrated.settings.includeGuards, false);
  assert.equal(migrated.settings.floorR1Reminder, false);
  assert.deepEqual(legacy, original);
});

test('restaurar v3 conserva el interruptor de Piso y normaliza las preferencias antiguas', () => {
  for (const enabled of [false, true]) {
    const state = fresh();
    state.settings.floorR1Reminder = enabled;
    state.settings.showDoctors = false;
    state.settings.excludePostGuard = false;
    state.settings.includeDate = true;
    state.settings.includeGuards = true;
    const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.schemaVersion, 3);
    assert.equal(restored.settings.floorR1Reminder, enabled);
    assert.equal(restored.settings.showDoctors, true);
    assert.equal(restored.settings.excludePostGuard, true);
    assert.equal(restored.settings.includeDate, false);
    assert.equal(restored.settings.includeGuards, false);
    assert.equal(at(restored).text.includes(reminder), enabled);
  }
});

test('el respaldo rechaza valores no booleanos del interruptor de Piso', () => {
  for (const value of ['true', 1, null, {}]) {
    const state = fresh();
    state.settings.floorR1Reminder = value;
    assert.throws(() => R.validateState(state));
  }
});

test('generar no reescribe preferencias antiguas ni las notas conservadas del respaldo', () => {
  const state = fresh();
  state.settings.showDoctors = false;
  state.settings.excludePostGuard = false;
  state.settings.includeDate = true;
  state.settings.includeGuards = true;
  state.settings.floorNotes = { matutino: 'Conservar internamente', vespertino: 'Otra nota' };
  state.settings.floorR1Reminder = true;
  const before = structuredClone(state);
  at(state);
  at(state, '2026-10-27', 'vespertino');
  assert.deepEqual(state, before);
});
