const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');

const person = id => ({ name: 'Integrante ' + id, grade: 1 });
const at = (state, date, shift = 'matutino') => require('./planned-role.cjs')(state, { date, shift });
const assigned = result => result.groups.flatMap(group => [...group.doctors.flatMap(doctor => doctor.residents), ...group.support]);
const dateAt = offset => new Date(Date.UTC(2026, 9, 26 + offset, 12)).toISOString().slice(0, 10);

function fresh(count = 4) {
  const state = structuredClone(defaults);
  R.setGuardGroupCount(state, count);
  state.guardGroups.forEach(group => R.setGuardGroupMembers(state, group.id, [person(group.id)]));
  const people = state.guardGroups.map(group => person(group.id));
  state.doctors = ['matutino', 'vespertino'].map((shift, index) => ({ id: 'md-' + index, name: 'Equipo ' + index, title: 'Dr.', shift, schedule: Array(5).fill('qx'), residents: [...people, { name: 'Mayor', grade: 4 }] }));
  state.serviceRules = [];
  state.dailyOverrides = {};
  state.absences = [];
  state.mobileAssignments = { matutino: [], vespertino: [] };
  state.dutySelection = { guardGroupId: 'A' };
  return state;
}

test('la guardia seleccionada corresponde a su fecha de referencia y avanza junto con la postguardia', () => {
  const state = fresh();
  R.setDutyReference(state, 'A', '2026-10-26');
  assert.deepEqual(state.dutySelection, { guardGroupId: 'A', referenceDate: '2026-10-26' });
  assert.equal(R.resolveGuards(state, '2026-10-26').group, 'A');
  assert.equal(R.resolveGuards(state, '2026-10-27').group, 'B');
  assert.equal(R.postGuard(state, '2026-10-26').group, 'D');
  assert.equal(R.postGuard(state, '2026-10-26').date, '2026-10-25');
  assert.equal(R.postGuard(state, '2026-10-27').group, 'A');
  assert.equal(R.postGuard(state, '2026-10-27').date, '2026-10-26');
});

test('los ciclos de tres a seis guardias se repiten y retroceden sin perder el orden', () => {
  const examples = [
    { count: 3, forward: ['A', 'B', 'C', 'A', 'B'], backwards: [[-1, 'C'], [-2, 'B'], [-3, 'A'], [-4, 'C'], [-7, 'C']] },
    { count: 4, forward: ['A', 'B', 'C', 'D', 'A', 'B'], backwards: [[-1, 'D'], [-2, 'C'], [-4, 'A'], [-5, 'D'], [-9, 'D']] },
    { count: 5, forward: ['A', 'B', 'C', 'D', 'E', 'A', 'B'], backwards: [[-1, 'E'], [-2, 'D'], [-5, 'A'], [-6, 'E'], [-11, 'E']] },
    { count: 6, forward: ['A', 'B', 'C', 'D', 'E', 'F', 'A', 'B'], backwards: [[-1, 'F'], [-2, 'E'], [-6, 'A'], [-7, 'F'], [-13, 'F']] }
  ];
  for (const example of examples) {
    const state = fresh(example.count);
    R.setDutyReference(state, 'A', '2026-10-26');
    for (const [offset, expected] of [...example.forward.entries(), ...example.backwards]) assert.equal(R.resolveGuards(state, dateAt(offset)).group, expected, `${example.count} grupos, día ${offset}`);
  }
});

test('el ciclo incluye sábado y domingo y mantiene la continuidad al volver al lunes', () => {
  const state = fresh();
  R.setDutyReference(state, 'C', '2026-10-30');
  for (const [date, expected] of [['2026-10-30', 'C'], ['2026-10-31', 'D'], ['2026-11-01', 'A'], ['2026-11-02', 'B']]) assert.equal(R.resolveGuards(state, date).group, expected);
  assert.equal(R.postGuard(state, '2026-11-02').group, 'A');
  assert.equal(R.postGuard(state, '2026-11-02').date, '2026-11-01');
});

test('cambiar de mes o año no reinicia la guardia anclada', () => {
  const state = fresh();
  R.setDutyReference(state, 'C', '2026-12-31');
  for (const [date, expected] of [['2026-12-30', 'B'], ['2026-12-31', 'C'], ['2027-01-01', 'D'], ['2027-01-02', 'A']]) assert.equal(R.resolveGuards(state, date).group, expected);
  assert.equal(R.postGuard(state, '2027-01-01').date, '2026-12-31');
});

test('el 29 de febrero cuenta como un día completo del ciclo', () => {
  const state = fresh();
  R.setDutyReference(state, 'A', '2028-02-28');
  assert.equal(R.resolveGuards(state, '2028-02-29').group, 'B');
  assert.equal(R.resolveGuards(state, '2028-03-01').group, 'C');
  assert.equal(R.postGuard(state, '2028-03-01').date, '2028-02-29');
});

test('elegir otra guardia para una fecha vuelve a anclar el ciclo sin alterar equipos ni integrantes', () => {
  const state = fresh();
  R.setDutyReference(state, 'A', '2026-10-26');
  assert.equal(R.resolveGuards(state, '2026-10-29').group, 'D');
  const before = structuredClone(state);
  R.setDutyReference(state, 'B', '2026-10-29');
  assert.equal(R.resolveGuards(state, '2026-10-28').group, 'A');
  assert.equal(R.resolveGuards(state, '2026-10-29').group, 'B');
  assert.equal(R.resolveGuards(state, '2026-10-30').group, 'C');
  assert.deepEqual(state.doctors, before.doctors);
  assert.deepEqual(state.guardGroups, before.guardGroups);
});

test('una guardia vacía ocupa su día del ciclo y no se salta al grupo siguiente', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'B', []);
  R.setDutyReference(state, 'A', '2026-10-26');
  const empty = R.resolveGuards(state, '2026-10-27');
  assert.equal(empty.group, 'B');
  assert.equal(empty.guardStatus, 'pending');
  assert.deepEqual(empty.guards, []);
  assert.equal(R.resolveGuards(state, '2026-10-28').group, 'C');
  assert.equal(R.postGuard(state, '2026-10-28').group, 'B');
});

test('ambos turnos retiran de todos los equipos a la guardia anterior calculada para la fecha', () => {
  const state = fresh();
  R.setDutyReference(state, 'A', '2026-10-26');
  for (const shift of ['matutino', 'vespertino']) {
    const result = at(state, '2026-10-27', shift);
    assert.equal(result.guardGroup, 'B');
    assert.equal(result.postGuardGroup, 'A');
    assert.deepEqual(result.guards.map(R.personKey), [R.personKey(person('B'))]);
    assert.ok(!assigned(result).some(resident => R.personKey(resident) === R.personKey(person('A'))));
    assert.doesNotMatch(result.text, /Integrante A R1/);
    assert.match(result.text, /Integrante B R1/);
    assert.match(result.text, /Rotantes/);
  }
});

test('las ausencias del día filtran la guardia actual además de retirar al grupo de postguardia', () => {
  const state = fresh();
  R.setDutyReference(state, 'A', '2026-10-26');
  state.absences = [{ id: 'b-ausente', personType: 'resident', personId: R.personKey(person('B')), start: '2026-10-27', end: '2026-10-27' }];
  const result = at(state, '2026-10-27');
  assert.equal(result.guardGroup, 'B');
  assert.deepEqual(result.guards, []);
  assert.doesNotMatch(result.text, /Integrante A R1|Integrante B R1/);
  assert.match(at(state, '2026-10-28').text, /Integrante A R1/);
});

test('guardar y restaurar conserva la referencia y no vuelve a anclar un respaldo ya configurado', () => {
  const state = fresh();
  R.setDutyReference(state, 'C', '2026-10-26');
  const before = structuredClone(state);
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)), { referenceDate: '2027-01-01' });
  assert.deepEqual(restored.dutySelection, before.dutySelection);
  assert.equal(R.resolveGuards(restored, '2026-10-27').group, 'D');
  assert.deepEqual(restored.doctors, before.doctors);
  assert.deepEqual(restored.guardGroups, before.guardGroups);
  assert.deepEqual(state, before);
});

test('normalizar un respaldo sin referencia la añade una vez y conserva la guardia elegida', () => {
  const legacy = fresh();
  legacy.dutySelection.guardGroupId = 'C';
  const before = structuredClone(legacy);
  const first = R.migrateState(legacy, { referenceDate: '2026-10-26' });
  const second = R.migrateState(first, { referenceDate: '2026-10-27' });
  assert.deepEqual(first.dutySelection, { guardGroupId: 'C', referenceDate: '2026-10-26' });
  assert.deepEqual(second.dutySelection, first.dutySelection);
  assert.equal(R.resolveGuards(second, '2026-10-27').group, 'D');
  assert.deepEqual(legacy, before);
});

test('un estado antiguo sin referencia conserva la selección estática hasta normalizarlo', () => {
  const state = fresh();
  state.dutySelection.guardGroupId = 'C';
  for (const date of ['2026-10-26', '2026-11-01', '2027-01-01']) {
    assert.equal(R.resolveGuards(state, date).group, 'C');
    assert.equal(R.postGuard(state, date).group, 'B');
    assert.equal(R.postGuard(state, date).date, '');
  }
});

test('las referencias inválidas se rechazan sin cambiar selección ni equipo', () => {
  for (const [id, date] of [['Z', '2026-10-26'], ['A', '2026-02-30'], ['A', 'ayer'], ['A', '']]) {
    const state = fresh();
    const before = structuredClone(state);
    assert.throws(() => R.setDutyReference(state, id, date));
    assert.deepEqual(state, before);
  }
  for (const referenceDate of ['2026-02-30', 'ayer', '', null, 1]) {
    const state = fresh();
    state.dutySelection.referenceDate = referenceDate;
    assert.throws(() => R.validateState(state));
  }
});

test('consultar y generar fechas distintas no reescribe la referencia guardada', () => {
  const state = fresh();
  R.setDutyReference(state, 'B', '2026-10-26');
  const before = structuredClone(state);
  for (const date of ['2026-10-23', '2026-10-26', '2026-10-27', '2027-01-01']) {
    R.resolveGuards(state, date);
    R.postGuard(state, date);
    at(state, date);
  }
  assert.deepEqual(state, before);
});
