const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');
const key = (name, grade = 2) => R.personKey({ name, grade });
const keys = residents => residents.map(R.personKey).sort();
const at = (state, date = '2026-10-26', shift = 'matutino', options = {}) => R.generate(state, { date, shift, ...options });
const assigned = result => result.groups.flatMap(group => [...group.doctors.flatMap(doctor => doctor.residents), ...group.support]);

function fresh() {
  const state = structuredClone(defaults);
  R.setGuardGroupMembers(state, 'A', R.parseGuardMembers('Andrade R2, Chávez R1'));
  R.setGuardGroupMembers(state, 'B', R.parseGuardMembers('Hernández R2, Corral R1'));
  R.setGuardGroupMembers(state, 'C', R.parseGuardMembers('Pérez R2, García R1'));
  R.setGuardGroupMembers(state, 'D', R.parseGuardMembers('Márquez R2, Paredes R1'));
  return state;
}

test('la guardia A toma D como postguardia y sólo gestiona R1/R2', () => {
  const state = fresh();
  const result = R.postGuard(state, '2026-10-26');
  assert.equal(result.status, 'group');
  assert.equal(result.group, 'D');
  assert.equal(result.date, '');
  assert.deepEqual(keys(result.residents), [key('Márquez'), key('Paredes', 1)].sort());
  assert.ok(result.residents.every(resident => resident.grade === 1 || resident.grade === 2));
});

test('elegir B excluye a A de ambos turnos y conserva los rotantes con su médico', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'B';
  for (const shift of ['matutino', 'vespertino']) {
    const result = at(state, '2026-10-26', shift);
    const people = keys(assigned(result));
    assert.equal(result.postGuardGroup, 'A');
    assert.equal(result.postGuardStatus, 'group');
    assert.ok(!people.includes(key('Andrade')));
    assert.ok(!people.includes(key('Chávez', 1)));
    assert.ok(assigned(result).some(resident => resident.grade >= 3));
    assert.match(result.text, /Rotantes/);
  }
  assert.ok(keys(assigned(at(state))).includes(key('Urbalejo', 4)));
  assert.ok(keys(assigned(at(state, '2026-10-26', 'vespertino'))).includes(key('Robles', 3)));
});

test('el grupo de postguardia se excluye también de los apoyos por servicio', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'C';
  for (const shift of ['matutino', 'vespertino']) {
    const result = at(state, '2026-10-26', shift);
    assert.ok(!keys(assigned(result)).includes(key('Hernández')));
    assert.ok(!keys(assigned(result)).includes(key('Corral', 1)));
    assert.deepEqual(keys(result.postGuardExcluded), [key('Hernández'), key('Corral', 1)].sort());
  }
});

test('el apellido y grado son identidades distintas para postguardia', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'D';
  state.dailyOverrides['2026-10-26'] = { cerda: { residents: R.parseResidents('García R1, García R4, Pérez R2, Pérez R3, Otro R1') } };
  const result = at(state);
  const cerda = result.groups.flatMap(group => group.doctors).find(doctor => doctor.id === 'cerda');
  const relevant = cerda.residents.filter(person => ['García', 'Pérez', 'Otro'].includes(person.name));
  assert.deepEqual(keys(relevant), R.parseResidents('García R4, Pérez R3, Otro R1').map(R.personKey).sort());
});

test('los integrantes de la guardia actual siguen disponibles ese día y se resuelven por separado', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'B';
  const result = at(state, '2026-10-26', 'matutino', { includeGuards: true });
  assert.equal(result.guardStatus, 'group');
  assert.deepEqual(keys(result.guards), [key('Hernández'), key('Corral', 1)].sort());
  assert.ok(keys(assigned(result)).includes(key('Hernández')));
  assert.ok(keys(assigned(result)).includes(key('Corral', 1)));
});

test('las ausencias actuales se respetan además de la exclusión de postguardia', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'B';
  state.absences.push({ id: 'vacaciones-hdez', personType: 'resident', personId: key('Hernández'), start: '2026-10-26', end: '2026-10-26' });
  const result = at(state, '2026-10-26', 'matutino', { includeGuards: true });
  assert.ok(!keys(assigned(result)).includes(key('Hernández')));
  assert.ok(!keys(assigned(result)).includes(key('Andrade')));
  assert.deepEqual(keys(result.guards), [key('Corral', 1)]);
});

test('una guardia aún sin configurar no inventa quién está de postguardia', () => {
  const state = structuredClone(defaults);
  const result = at(state);
  assert.equal(result.postGuardStatus, 'pending');
  assert.deepEqual(result.postGuardExcluded, []);
  assert.ok(keys(assigned(result)).includes(key('Andrade')));
  assert.ok(result.warnings.length > 0);
});

test('cambiar la guardia seleccionada recalcula los excluidos sin alterar el rol fijo', () => {
  const state = fresh();
  const doctors = structuredClone(state.doctors);
  state.dutySelection.guardGroupId = 'B';
  assert.ok(!keys(assigned(at(state))).includes(key('Andrade')));
  assert.ok(keys(assigned(at(state))).includes(key('Hernández')));
  state.dutySelection.guardGroupId = 'C';
  assert.ok(keys(assigned(at(state))).includes(key('Andrade')));
  assert.ok(!keys(assigned(at(state))).includes(key('Hernández')));
  assert.deepEqual(state.doctors, doctors);
});

test('el primero de mes, cambio de año y fin de semana usan el grupo elegido sin calendario', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'C';
  for (const date of ['2026-11-01', '2027-01-01', '2028-03-01', '2026-10-25']) {
    const result = R.postGuard(state, date);
    assert.equal(result.group, 'B');
    assert.equal(result.status, 'group');
    assert.equal(result.date, '');
    assert.deepEqual(keys(result.residents), [key('Hernández'), key('Corral', 1)].sort());
  }
});

test('generar no cambia integrantes, selección ni combinaciones guardadas', () => {
  const state = fresh();
  const before = structuredClone(state);
  at(state, '2026-10-26', 'matutino');
  at(state, '2026-10-26', 'vespertino');
  assert.deepEqual(state, before);
});

test('el respaldo conserva la guardia actual y la postguardia cíclica después de restaurar', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'D';
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.schemaVersion, 3);
  assert.equal(restored.dutySelection.guardGroupId, 'D');
  assert.equal(R.postGuard(restored, '2026-10-26').group, 'C');
  assert.deepEqual(restored.guardGroups, state.guardGroups);
});
