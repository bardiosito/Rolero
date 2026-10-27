const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');

const fresh = () => structuredClone(defaults);
const person = (name, grade = 2) => ({ name, grade });
const key = (name, grade = 2) => R.personKey(person(name, grade));
const members = text => R.parseGuardMembers(text);

function configured() {
  const state = fresh();
  R.setGuardGroupMembers(state, 'A', members('Andrade R2, Chávez R1'));
  R.setGuardGroupMembers(state, 'B', members('Ibarra R2, Corral R1'));
  R.setGuardGroupMembers(state, 'C', members('Pérez R2, García R1'));
  R.setGuardGroupMembers(state, 'D', members('Márquez R2, Paredes R1'));
  return state;
}

test('la configuración inicial tiene cuatro guardias vacías y selección sin calendario', () => {
  assert.equal(defaults.schemaVersion, 3);
  assert.deepEqual(defaults.guardGroups.map(group => group.id), ['A', 'B', 'C', 'D']);
  assert.ok(defaults.guardGroups.every(group => Array.isArray(group.members) && group.members.length === 0));
  assert.equal(defaults.dutySelection.guardGroupId, 'A');
  assert.equal(defaults.settings.postGuardMode, 'previous');
  assert.equal(R.postGuard(fresh(), '2026-10-26').status, 'pending');
});

test('se admiten de tres a seis guardias y A toma como postguardia el último grupo', () => {
  for (let count = 3; count <= 6; count++) {
    const state = fresh();
    R.setGuardGroupCount(state, count);
    state.guardGroups.forEach((group, index) => R.setGuardGroupMembers(state, group.id, [person('Integrante ' + index, 1)]));
    state.dutySelection.guardGroupId = 'A';
    assert.equal(state.guardGroups.length, count);
    assert.equal(R.postGuard(state, '2026-10-26').group, state.guardGroups[count - 1].id);
    assert.equal(R.postGuard(state, '2026-10-26').status, 'group');
    for (let index = 1; index < count; index++) {
      state.dutySelection.guardGroupId = state.guardGroups[index].id;
      assert.equal(R.postGuard(state, '2026-10-26').group, state.guardGroups[index - 1].id);
    }
  }
});

test('los límites de cantidad rechazan decimales, valores fuera de rango y no modifican datos', () => {
  const state = configured();
  for (const count of [0, 2, 7, 3.5, NaN]) {
    const before = structuredClone(state);
    assert.throws(() => R.setGuardGroupCount(state, count));
    assert.deepEqual(state, before);
  }
});

test('cada guardia admite hasta diez R1/R2 y rechaza seniors, duplicados y exceso', () => {
  assert.deepEqual(members('López R2; García R1\nPérez R2'), [person('López'), person('García', 1), person('Pérez')]);
  assert.equal(members(Array.from({ length: 10 }, (_, index) => 'Residente ' + index + ' R1').join(', ')).length, 10);
  for (const input of ['Mayor R3', 'Mayor R4', 'Sin grado', 'Pérez R2, Perez R2', Array.from({ length: 11 }, (_, index) => 'Residente ' + index + ' R1').join(', ')]) {
    assert.throws(() => members(input));
  }
  assert.equal(members('García R1, García R2').length, 2, 'apellido y grado identifican al residente');
});

test('un residente no puede pertenecer a dos guardias y el rechazo es atómico', () => {
  const state = configured();
  const before = structuredClone(state);
  assert.throws(() => R.setGuardGroupMembers(state, 'B', members('Andrade R2, Nuevo R1')));
  assert.deepEqual(state, before);
  assert.throws(() => R.setGuardGroupMembers(state, 'Z', members('Nuevo R1')));
  assert.deepEqual(state, before);
});

test('guardRoster devuelve únicamente los R1/R2 configurados, sin incorporar rotantes', () => {
  const state = configured();
  const roster = R.guardRoster(state);
  assert.equal(roster.length, 8);
  assert.ok(roster.every(resident => resident.grade === 1 || resident.grade === 2));
  assert.ok(roster.some(resident => R.personKey(resident) === key('Andrade')));
  assert.ok(!roster.some(resident => resident.name === 'Tapia'));
});

test('reducir guardias con integrantes exige confirmación antes de retirar grupos y pareos', () => {
  const state = fresh();
  R.setGuardGroupCount(state, 6);
  R.setGuardGroupMembers(state, 'A', members('Uno R1'));
  R.setGuardGroupMembers(state, 'F', members('Reserva R2'));
  R.setMobileAssignment(state, 'matutino', { residentKey: key('Reserva'), fixedResidentKey: key('Hernández') });
  state.dutySelection.guardGroupId = 'F';
  const doctors = structuredClone(state.doctors);
  const before = structuredClone(state);
  assert.throws(() => R.setGuardGroupCount(state, 3));
  assert.deepEqual(state, before);
  R.setGuardGroupCount(state, 3, { confirmRemoval: true });
  assert.deepEqual(state.guardGroups.map(group => group.id), ['A', 'B', 'C']);
  assert.equal(state.dutySelection.guardGroupId, 'A');
  assert.ok(!state.mobileAssignments.matutino.some(pair => pair.residentKey === key('Reserva')));
  assert.deepEqual(state.doctors, doctors);
});

test('la guardia elegida filtra ausencias actuales y no depende del mes ni del día anterior', () => {
  const state = configured();
  state.dutySelection.guardGroupId = 'C';
  const first = R.postGuard(state, '2026-10-26');
  const later = R.postGuard(state, '2028-03-01');
  assert.equal(first.group, 'B');
  assert.equal(later.group, 'B');
  assert.equal(first.date, '');
  assert.deepEqual(first.residents.map(R.personKey).sort(), later.residents.map(R.personKey).sort());
  state.absences.push({ id: 'ausencia-perez', personType: 'resident', personId: key('Pérez'), start: '2026-10-26', end: '2026-10-26' });
  const current = R.resolveGuards(state, '2026-10-26');
  assert.equal(current.guardStatus, 'group');
  assert.ok(!current.guards.some(resident => R.personKey(resident) === key('Pérez')));
  assert.ok(R.resolveGuards(state, '2026-10-27').guards.some(resident => R.personKey(resident) === key('Pérez')));
});

test('migrar un respaldo v1 conserva médicos, vacaciones, ajustes e historial sin mutar el original', () => {
  const legacy = fresh();
  legacy.schemaVersion = 1;
  delete legacy.guardGroups;
  delete legacy.mobileAssignments;
  delete legacy.dutySelection;
  legacy.guards = {
    '2026-10': {
      confirmed: true,
      days: { 1: [person('Chávez', 1), person('Mayor', 4)], 2: [person('López')], 3: [person('Pérez')], 4: [person('Palencia', 1)] },
      groups: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }
    }
  };
  legacy.manualGuards = {};
  legacy.absences = [{ id: 'legacy-vacation', personType: 'doctor', personId: 'flores', start: '2026-10-26', end: '2026-10-27', note: 'Conservar' }];
  legacy.dailyOverrides = { '2026-10-26': { cerda: { room: 'Q5' } } };
  legacy.history = [{ id: 'legacy-text', date: '2026-10-26', shift: 'matutino', text: 'Rol anterior confirmado' }];
  legacy.settings.floorNotes = { matutino: '', vespertino: 'Nota original' };
  legacy.settings.showDoctors = false;
  legacy.settings.excludePostGuard = false;
  legacy.settings.includeDate = true;
  legacy.settings.includeGuards = true;
  legacy.settings.floorR1Reminder = true;
  const original = structuredClone(legacy);
  const migrated = R.migrateState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.doctors, original.doctors);
  assert.deepEqual(migrated.absences, original.absences);
  assert.deepEqual(migrated.dailyOverrides, original.dailyOverrides);
  assert.deepEqual(migrated.history, original.history);
  assert.deepEqual(migrated.legacyGuardData, { guards: original.guards, manualGuards: original.manualGuards });
  assert.equal(migrated.settings.floorNotes.vespertino, 'Nota original');
  assert.equal(migrated.settings.showDoctors, true);
  assert.equal(migrated.settings.excludePostGuard, true);
  assert.equal(migrated.settings.includeDate, false);
  assert.equal(migrated.settings.includeGuards, false);
  assert.equal(migrated.settings.floorR1Reminder, false);
  assert.ok(migrated.guardGroups.every(group => group.members.every(resident => resident.grade <= 2)));
  assert.deepEqual(legacy, original);
  R.validateState(migrated);
});

test('una unión antigua de once integrantes exige reconfiguración sin recortar el respaldo', () => {
  const legacy = fresh();
  legacy.schemaVersion = 1;
  delete legacy.guardGroups;
  delete legacy.mobileAssignments;
  delete legacy.dutySelection;
  legacy.guards = {
    '2026-10': {
      confirmed: true,
      days: {
        1: Array.from({ length: 6 }, (_, index) => person('Persona ' + index, 1)),
        5: Array.from({ length: 5 }, (_, index) => person('Persona ' + (index + 6), 1)),
        2: [person('Otro'), person('Mayor', 4)]
      },
      groups: { 1: 'A', 5: 'A', 2: 'B' }
    }
  };
  legacy.manualGuards = { '2026-10-26': [person('Manual')] };
  legacy.absences = [{ id: 'vacation', personType: 'doctor', personId: 'flores', start: '2026-10-26', end: '2026-10-27' }];
  legacy.history = [{ text: 'Texto confirmado que se conserva' }];
  const original = structuredClone(legacy);
  const migrated = R.migrateState(legacy);
  assert.equal(migrated.guardGroups.length, 4);
  assert.ok(migrated.guardGroups.every(group => group.members.length === 0));
  assert.ok(typeof migrated.migrationNotice === 'string' && migrated.migrationNotice.trim().length > 0);
  assert.deepEqual(migrated.legacyGuardData, { guards: original.guards, manualGuards: original.manualGuards });
  assert.deepEqual(migrated.doctors, original.doctors);
  assert.deepEqual(migrated.absences, original.absences);
  assert.deepEqual(migrated.history, original.history);
  assert.deepEqual(legacy, original);
  R.validateState(migrated);
});

test('una persona repetida entre guardias antiguas no se asigna arbitrariamente al migrar', () => {
  const legacy = fresh();
  legacy.schemaVersion = 1;
  delete legacy.guardGroups;
  delete legacy.mobileAssignments;
  delete legacy.dutySelection;
  legacy.guards = {
    '2026-10': {
      confirmed: true,
      days: { 1: [person('Pérez')], 2: [person('Perez')], 3: [person('Único', 1)] },
      groups: { 1: 'A', 2: 'B', 3: 'C' }
    }
  };
  legacy.manualGuards = {};
  legacy.absences = [{ id: 'resident-vacation', personType: 'resident', personId: key('Pérez'), start: '2026-10-26', end: '2026-10-27' }];
  legacy.history = [{ text: 'Historial original' }];
  const original = structuredClone(legacy);
  const migrated = R.migrateState(legacy);
  assert.ok(migrated.guardGroups.every(group => group.members.length === 0));
  assert.ok(typeof migrated.migrationNotice === 'string' && migrated.migrationNotice.trim().length > 0);
  assert.deepEqual(migrated.legacyGuardData, { guards: original.guards, manualGuards: original.manualGuards });
  assert.deepEqual(migrated.doctors, original.doctors);
  assert.deepEqual(migrated.absences, original.absences);
  assert.deepEqual(migrated.history, original.history);
  assert.deepEqual(legacy, original);
  R.validateState(migrated);
});

test('los respaldos v2 conservan grupos y selección y rechazan estructuras o integrantes inválidos', () => {
  const state = configured();
  state.schemaVersion = 2;
  state.dutySelection.guardGroupId = 'C';
  const restored = R.validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.dutySelection.guardGroupId, 'C');
  assert.deepEqual(restored.guardGroups, state.guardGroups);
  const bad = [
    data => { data.guardGroups = data.guardGroups.slice(0, 2); },
    data => { data.guardGroups[0].members = [person('Mayor', 3)]; },
    data => { data.guardGroups[0].members = Array.from({ length: 11 }, (_, index) => person('Persona ' + index, 1)); },
    data => { data.guardGroups[1].members.push(person('Andrade')); },
    data => { data.guardGroups[1].id = data.guardGroups[0].id; },
    data => { data.dutySelection.guardGroupId = 'Z'; }
  ];
  for (const change of bad) { const invalid = structuredClone(state); change(invalid); assert.throws(() => R.validateState(invalid)); }
});
