const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');

const person = (name, grade = 1, extra = {}) => ({ name, grade, ...extra });
const key = (name = 'Ana', grade = 1) => R.personKey(person(name, grade));
const at = (state, date = '2026-10-26', shift = 'matutino') => require('./planned-role.cjs')(state, { date, shift });
const entries = result => result.groups.flatMap(group => group.doctors);
const has = (people, personKey) => people.some(resident => R.personKey(resident) === personKey);
const residentLists = state => [
  ...state.doctors.map(doctor => doctor.residents),
  ...state.serviceRules.map(rule => rule.residents),
  ...Object.values(state.dailyOverrides).flatMap(overrides => Object.values(overrides).map(override => override.residents || [])),
  ...state.guardGroups.map(group => group.members)
];
const activePeople = state => residentLists(state).flat();
const seniors = state => activePeople(state).filter(resident => resident.grade >= 3);
const member = (state, groupId, personKey) => state.guardGroups.find(group => group.id === groupId).members.find(resident => R.personKey(resident) === personKey);

function fresh() {
  const state = structuredClone(defaults);
  state.doctors = [
    { id: 'tm-a', name: 'Médico Uno', title: 'Dr.', shift: 'matutino', schedule: Array(5).fill('qx'), residents: [person('Ana', 1, { startDay: 1, endDay: 31, note: 'Equipo fijo' }), person('Ana', 3, { note: 'Senior histórico' })] },
    { id: 'tm-b', name: 'Médico Dos', title: 'Dra.', shift: 'matutino', schedule: Array(5).fill('consulta'), residents: [person('Beta', 2)] },
    { id: 'tv-a', name: 'Médico Tres', title: 'Dr.', shift: 'vespertino', schedule: Array(5).fill('urgencias'), residents: [person('Ana', 1, { note: 'Equipo vespertino' }), person('Beta', 2), person('Ana', 4)] },
    { id: 'tv-b', name: 'Médico Cuatro', title: 'Dr.', shift: 'vespertino', schedule: Array(5).fill('qx'), residents: [] }
  ];
  state.serviceRules = [
    { id: 'piso-tm', shift: 'matutino', service: 'piso', residents: [person('Ana', 1, { startDay: 19, endDay: 30, note: 'Apoyo por rango' })] },
    { id: 'piso-tv', shift: 'vespertino', service: 'piso', residents: [person('Ana', 1)] }
  ];
  state.dailyOverrides = {
    '2026-10-26': { 'tm-a': { room: 'Q2', residents: [person('Ana', 1, { note: 'Equipo del día' }), person('Ana', 3)] } },
    '2026-10-27': { 'tv-a': { residents: [person('Ana', 1), person('Beta', 2)] } }
  };
  state.guardGroups = ['A', 'B', 'C', 'D'].map(id => ({ id, name: 'Guardia ' + id, members: [] }));
  state.guardGroups[0].members = [person('Ana'), person('Reserva', 2)];
  state.guardGroups[1].members = [person('Beta', 2)];
  state.guardGroups[2].members = [person('Sólo Guardia')];
  state.dutySelection = { guardGroupId: 'A' };
  state.absences = [
    { id: 'vacaciones-ana', personType: 'resident', personId: key(), start: '2026-10-27', end: '2026-10-28', note: 'Curso' },
    { id: 'vacaciones-medico', personType: 'doctor', personId: 'tm-b', coverDoctorId: '', start: '2026-11-01', end: '2026-11-01', note: 'Conservar' }
  ];
  state.mobileAssignments = {
    matutino: [{ residentKey: key('Reserva', 2), fixedResidentKey: key() }],
    vespertino: [{ residentKey: key(), fixedResidentKey: key('Beta', 2) }]
  };
  state.history = [{ id: 'confirmado', date: '2026-10-23', shift: 'matutino', text: 'Rol anterior / Ana R1 / Ana R3' }];
  state.legacyGuardData = { guards: { '2026-09': { days: { 1: [person('Ana')] } } }, manualGuards: {} };
  return state;
}

test('el padrón unifica al integrante de guardia y al fijo por apellido y grado', () => {
  const state = fresh();
  const roster = R.residentRoster(state);
  const ana = roster.find(resident => resident.key === key());
  assert.equal(roster.filter(resident => resident.key === key()).length, 1);
  assert.equal(ana.name, 'Ana');
  assert.equal(ana.grade, 1);
  assert.equal(ana.guardGroupId, 'A');
  assert.deepEqual(ana.doctorIds, { matutino: ['tm-a'], vespertino: ['tv-a'] });
  assert.deepEqual([...ana.serviceRuleIds].sort(), ['piso-tm', 'piso-tv']);
  assert.ok(roster.every(resident => resident.grade === 1 || resident.grade === 2));
  assert.ok(!roster.some(resident => resident.key === key('Ana', 3) || resident.key === key('Ana', 4)));
});

test('el padrón incluye juniors sin guardia que sólo existen en un servicio o ajuste del día', () => {
  const state = fresh();
  state.serviceRules[0].residents.push(person('Sólo Servicio', 2));
  state.dailyOverrides['2026-10-26']['tm-a'].residents.push(person('Sólo Ajuste'));
  const before = structuredClone(state);
  const roster = R.residentRoster(state);
  for (const personKey of [key('Sólo Servicio', 2), key('Sólo Ajuste')]) {
    assert.equal(roster.filter(resident => resident.key === personKey).length, 1);
    assert.equal(roster.find(resident => resident.key === personKey).guardGroupId, '');
  }
  assert.ok(roster.some(resident => resident.key === key('Sólo Guardia') && resident.guardGroupId === 'C'));
  assert.deepEqual(state, before);
});

test('un alta nueva con médicos por turno se guarda y aparece en el rol de cada turno', () => {
  const state = fresh();
  R.addResident(state, { name: 'Nuevo Residente', grade: 2, guardGroupId: 'B', doctorIds: { matutino: ['tm-b'], vespertino: ['tv-b'] } });
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.ok(member(restored, 'B', key('Nuevo Residente', 2)));
  assert.ok(has(restored.doctors.find(doctor => doctor.id === 'tm-b').residents, key('Nuevo Residente', 2)));
  assert.ok(has(restored.doctors.find(doctor => doctor.id === 'tv-b').residents, key('Nuevo Residente', 2)));
  assert.match(at(restored, '2026-10-29').text, /Dra\. Médico Dos \/ Beta R2 \/ Nuevo Residente R2/);
  assert.match(at(restored, '2026-10-29', 'vespertino').text, /Dr\. Médico Cuatro \/ Nuevo Residente R2/);
});

test('un R1 nuevo sin médico conserva su guardia y pasa a Piso sin inventar un médico', () => {
  const state = fresh();
  R.addResident(state, { name: 'Reserva Nueva', grade: 1, guardGroupId: 'B' });
  const resident = R.residentRoster(state).find(resident => resident.key === key('Reserva Nueva'));
  assert.equal(resident.guardGroupId, 'B');
  assert.deepEqual(resident.doctorIds, { matutino: [], vespertino: [] });
  assert.deepEqual(resident.serviceRuleIds, []);
  for (const shift of ['matutino', 'vespertino']) assert.match(at(state, '2026-10-29', shift).text, /Piso\n[^\n]*Reserva Nueva R1/);
});

test('elegir un junior fijo existente lo incorpora a una guardia sin borrar sus referencias', () => {
  const state = fresh();
  const existing = person('Sin Guardia', 2, { startDay: 1, endDay: 31, note: 'Conservar equipo' });
  state.doctors[1].residents.push(existing);
  state.dailyOverrides['2026-10-26']['tm-a'].residents.push(person('Sin Guardia', 2, { note: 'Conservar ajuste' }));
  const references = structuredClone({ doctors: state.doctors, serviceRules: state.serviceRules, dailyOverrides: state.dailyOverrides });
  R.addResident(state, { name: 'Sin Guardia', grade: 2, existingKey: key('Sin Guardia', 2), guardGroupId: 'B' });
  assert.ok(member(state, 'B', key('Sin Guardia', 2)));
  assert.deepEqual(state.doctors, references.doctors);
  assert.deepEqual(state.serviceRules, references.serviceRules);
  assert.deepEqual(state.dailyOverrides, references.dailyOverrides);
  assert.equal(R.residentRoster(state).filter(resident => resident.key === key('Sin Guardia', 2)).length, 1);
});

test('las altas rechazan nombre, grado, guardia o identidad inválidos de forma atómica', () => {
  const requests = [
    { name: '' }, { name: '   ' }, { grade: 3 }, { grade: 4 }, { guardGroupId: '' }, { guardGroupId: 'Z' },
    { name: ' ÁNA ', grade: 1 }, { existingKey: 'desconocido|R1' },
    { name: 'Ana', grade: 1, existingKey: key(), guardGroupId: 'B' }
  ];
  for (const change of requests) {
    const state = fresh();
    const before = structuredClone(state);
    assert.throws(() => R.addResident(state, { name: 'Nuevo', grade: 1, guardGroupId: 'B', ...change }), JSON.stringify(change));
    assert.deepEqual(state, before);
  }
});

test('cada guardia admite diez integrantes y rechaza el alta número once sin modificar equipos', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'C', Array.from({ length: 9 }, (_, index) => person('Integrante ' + index)));
  R.addResident(state, { name: 'Décimo', grade: 2, guardGroupId: 'C' });
  assert.equal(state.guardGroups[2].members.length, 10);
  const before = structuredClone(state);
  assert.throws(() => R.addResident(state, { name: 'Undécimo', grade: 1, guardGroupId: 'C', doctorIds: { matutino: ['tm-b'] } }));
  assert.deepEqual(state, before);
});

test('el cambio R1 a R2 conserva asignaciones y metadatos y actualiza ausencias y ambos extremos de móviles', () => {
  const state = fresh();
  const before = structuredClone(state);
  R.updateResident(state, key(), { grade: 2 });
  const oldKey = key(), newKey = key('Ana', 2);
  assert.ok(!activePeople(state).some(resident => R.personKey(resident) === oldKey));
  assert.deepEqual(state.doctors[0].residents[0], { ...before.doctors[0].residents[0], grade: 2 });
  assert.deepEqual(state.doctors[2].residents[0], { ...before.doctors[2].residents[0], grade: 2 });
  assert.deepEqual(state.serviceRules[0].residents[0], { ...before.serviceRules[0].residents[0], grade: 2 });
  assert.deepEqual(state.dailyOverrides['2026-10-26']['tm-a'].residents[0], { ...before.dailyOverrides['2026-10-26']['tm-a'].residents[0], grade: 2 });
  assert.ok(member(state, 'A', newKey));
  assert.deepEqual(state.absences[0], { ...before.absences[0], personId: newKey });
  assert.equal(state.mobileAssignments.matutino[0].fixedResidentKey, newKey);
  assert.equal(state.mobileAssignments.vespertino[0].residentKey, newKey);
  assert.deepEqual(seniors(state), seniors(before));
  assert.deepEqual(state.history, before.history);
  assert.deepEqual(state.legacyGuardData, before.legacyGuardData);
  assert.doesNotThrow(() => R.validateState(state));
});

test('el cambio de nombre se guarda en guardia, equipos, apoyos, ajustes, ausencias y móviles', () => {
  const state = fresh();
  R.updateResident(state, key(), { name: 'Ana Renombrada' });
  const newKey = key('Ana Renombrada');
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.ok(member(restored, 'A', newKey));
  assert.ok(!activePeople(restored).some(resident => R.personKey(resident) === key()));
  assert.equal(restored.absences[0].personId, newKey);
  assert.equal(restored.mobileAssignments.matutino[0].fixedResidentKey, newKey);
  assert.equal(restored.mobileAssignments.vespertino[0].residentKey, newKey);
  assert.match(at(restored).text, /Ana Renombrada R1/);
  assert.doesNotMatch(at(restored).text, /Ana R1/);
  assert.equal(restored.history[0].text, 'Rol anterior / Ana R1 / Ana R3');
});

test('una promoción con vacaciones mantiene la exclusión por la nueva identidad en las mismas fechas', () => {
  const state = fresh();
  R.updateResident(state, key(), { name: 'Ana Nueva', grade: 2 });
  for (const shift of ['matutino', 'vespertino']) {
    assert.doesNotMatch(at(state, '2026-10-27', shift).text, /Ana Nueva/);
    assert.doesNotMatch(at(state, '2026-10-28', shift).text, /Ana Nueva/);
  }
  assert.match(at(state, '2026-10-29').text, /Ana Nueva R2/);
});

test('editar los médicos de un turno conserva el otro turno, apoyos y ajustes diarios', () => {
  const state = fresh();
  state.mobileAssignments = { matutino: [], vespertino: [] };
  const before = structuredClone(state);
  R.updateResident(state, key(), { doctorIds: { matutino: ['tm-b'] } });
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.ok(!has(restored.doctors[0].residents, key()));
  assert.ok(has(restored.doctors[1].residents, key()));
  assert.deepEqual(restored.doctors[2].residents, before.doctors[2].residents);
  assert.deepEqual(restored.serviceRules, before.serviceRules);
  assert.deepEqual(restored.dailyOverrides, before.dailyOverrides);
  const morning = at(restored, '2026-10-29');
  assert.ok(has(entries(morning).find(doctor => doctor.id === 'tm-b').residents, key()));
  assert.ok(!has(entries(morning).find(doctor => doctor.id === 'tm-a').residents, key()));
  assert.ok(has(entries(at(restored, '2026-10-29', 'vespertino')).find(doctor => doctor.id === 'tv-a').residents, key()));
});

test('vaciar los médicos de un turno retira sólo sus asignaciones fijas y permite conservar el otro', () => {
  const state = fresh();
  const before = structuredClone(state);
  R.updateResident(state, key(), { doctorIds: { matutino: [] } });
  assert.ok(state.doctors.filter(doctor => doctor.shift === 'matutino').every(doctor => !has(doctor.residents, key())));
  assert.deepEqual(state.doctors[2].residents, before.doctors[2].residents);
  assert.deepEqual(state.serviceRules, before.serviceRules);
  assert.deepEqual(state.dailyOverrides, before.dailyOverrides);
  assert.ok(member(state, 'A', key()));
});

test('asignaciones con médicos inexistentes o de otro turno se rechazan antes de cambiar identidad', () => {
  const assignments = [
    { matutino: ['desconocido'] }, { matutino: ['tv-a'] }, { vespertino: ['tm-a'] },
    { matutino: ['tm-b'], vespertino: ['desconocido'] }
  ];
  for (const doctorIds of assignments) {
    const state = fresh();
    const before = structuredClone(state);
    assert.throws(() => R.updateResident(state, key(), { name: 'Otro Nombre', grade: 2, doctorIds }));
    assert.deepEqual(state, before);
  }
});

test('el mismo apellido en grados distintos es válido y un cambio que choque con otra identidad se rechaza', () => {
  const state = fresh();
  R.addResident(state, { name: 'Ana', grade: 2, guardGroupId: 'B' });
  assert.ok(R.residentRoster(state).some(resident => resident.key === key()));
  assert.ok(R.residentRoster(state).some(resident => resident.key === key('Ana', 2)));
  const before = structuredClone(state);
  assert.throws(() => R.updateResident(state, key(), { grade: 2, guardGroupId: 'C', doctorIds: { matutino: ['tm-b'] } }));
  assert.deepEqual(state, before);
});

test('mover un integrante a otra guardia conserva su equipo y una sola pertenencia', () => {
  const state = fresh();
  const doctorsBefore = structuredClone(state.doctors);
  const mobileAssignmentsBefore = structuredClone(state.mobileAssignments);
  R.updateResident(state, key(), { guardGroupId: 'B' });
  assert.equal(member(state, 'A', key()), undefined);
  assert.ok(member(state, 'B', key()));
  assert.equal(state.guardGroups.flatMap(group => group.members).filter(resident => R.personKey(resident) === key()).length, 1);
  assert.deepEqual(state.doctors, doctorsBefore);
  assert.deepEqual(state.mobileAssignments, mobileAssignmentsBefore);
  assert.equal(R.residentRoster(state).find(resident => resident.key === key()).guardGroupId, 'B');
});

test('una guardia llena rechaza el traslado con cambio de nombre, grado y equipo de forma atómica', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'C', Array.from({ length: 10 }, (_, index) => person('Lleno ' + index)));
  const before = structuredClone(state);
  assert.throws(() => R.updateResident(state, key(), { name: 'Nombre Nuevo', grade: 2, guardGroupId: 'C', doctorIds: { matutino: ['tm-b'] } }));
  assert.deepEqual(state, before);
});

test('editar a un integrante dentro de su guardia llena no ocupa una plaza adicional', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'A', [person('Ana'), ...Array.from({ length: 9 }, (_, index) => person('Mismo Grupo ' + index, 2))]);
  R.updateResident(state, key(), { grade: 2, guardGroupId: 'A' });
  assert.equal(state.guardGroups[0].members.length, 10);
  assert.ok(member(state, 'A', key('Ana', 2)));
});

test('un móvil no puede quedar sin guardia y el rechazo conserva todos sus datos y pareos', () => {
  const state = fresh();
  const before = structuredClone(state);
  assert.throws(() => R.updateResident(state, key(), { guardGroupId: '' }), /guardia/i);
  assert.deepEqual(state, before);
  assert.ok(member(state, 'A', key()));
  assert.deepEqual(state.mobileAssignments, before.mobileAssignments);
});

test('un fijo que no es móvil puede quedar sin guardia y conserva los pareos que lo cubren', () => {
  const state = fresh();
  state.mobileAssignments.vespertino = [];
  const before = structuredClone(state);
  R.updateResident(state, key(), { guardGroupId: '' });
  assert.ok(state.guardGroups.every(group => !has(group.members, key())));
  assert.equal(R.residentRoster(state).find(resident => resident.key === key()).guardGroupId, '');
  assert.deepEqual(state.doctors, before.doctors);
  assert.deepEqual(state.serviceRules, before.serviceRules);
  assert.deepEqual(state.dailyOverrides, before.dailyOverrides);
  assert.deepEqual(state.absences, before.absences);
  assert.deepEqual(state.mobileAssignments, before.mobileAssignments);
  assert.doesNotThrow(() => R.validateState(state));
});

test('eliminar un junior limpia todas sus referencias activas y no reaparece al restaurar', () => {
  const state = fresh();
  const before = structuredClone(state);
  assert.equal(R.removeResident(state, key()), true);
  assert.ok(!activePeople(state).some(resident => R.personKey(resident) === key()));
  assert.ok(!state.absences.some(absence => absence.personType === 'resident' && absence.personId === key()));
  assert.deepEqual(state.absences, [before.absences[1]]);
  for (const pairs of Object.values(state.mobileAssignments)) assert.ok(pairs.every(pair => pair.residentKey !== key() && pair.fixedResidentKey !== key()));
  assert.deepEqual(seniors(state), seniors(before));
  assert.deepEqual(state.history, before.history);
  assert.deepEqual(state.legacyGuardData, before.legacyGuardData);
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.ok(!R.residentRoster(restored).some(resident => resident.key === key()));
  assert.ok(!activePeople(restored).some(resident => R.personKey(resident) === key()));
  for (const shift of ['matutino', 'vespertino']) assert.doesNotMatch(at(restored, '2026-10-29', shift).text, /Ana R1/);
  assert.doesNotThrow(() => R.validateState(restored));
  assert.equal(R.removeResident(restored, key()), false);
});

test('promover a R3 retira al junior sin crear un R3 nuevo y conserva seniors e historial', () => {
  const state = fresh();
  const before = structuredClone(state);
  assert.equal(R.updateResident(state, key(), { name: 'Junior Egresado', grade: 3 }), null);
  assert.ok(!activePeople(state).some(resident => R.personKey(resident) === key()));
  assert.ok(!activePeople(state).some(resident => resident.name === 'Junior Egresado'));
  assert.ok(!R.residentRoster(state).some(resident => resident.key === key()));
  assert.deepEqual(seniors(state), seniors(before));
  assert.deepEqual(state.history, before.history);
  assert.deepEqual(state.legacyGuardData, before.legacyGuardData);
  assert.ok(!state.absences.some(absence => absence.personType === 'resident' && absence.personId === key()));
  assert.deepEqual(state.mobileAssignments, { matutino: [], vespertino: [] });
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(seniors(restored), seniors(before));
  assert.ok(!R.residentRoster(restored).some(resident => resident.key === key()));
});

test('el borrado de un junior no modifica seniors homónimos ni acepta borrar una identidad R3', () => {
  const state = fresh();
  const before = structuredClone(state);
  assert.equal(R.removeResident(state, key('Ana', 3)), false);
  assert.deepEqual(state, before);
  R.removeResident(state, key());
  assert.deepEqual(seniors(state), seniors(before));
  assert.ok(has(state.doctors[0].residents, key('Ana', 3)));
  assert.ok(has(state.doctors[2].residents, key('Ana', 4)));
});

test('un residente presente sólo en ajustes diarios puede editarse y borrarse sin dejar referencias', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-26']['tm-a'].residents.push(person('Temporal', 2, { note: 'Asignación puntual' }));
  R.updateResident(state, key('Temporal', 2), { name: 'Temporal Nuevo', guardGroupId: 'B' });
  assert.ok(member(state, 'B', key('Temporal Nuevo', 2)));
  assert.match(at(state).text, /Temporal Nuevo R2/);
  assert.deepEqual(state.dailyOverrides['2026-10-26']['tm-a'].residents.find(resident => resident.name === 'Temporal Nuevo'), person('Temporal Nuevo', 2, { note: 'Asignación puntual' }));
  R.removeResident(state, key('Temporal Nuevo', 2));
  assert.ok(!activePeople(state).some(resident => resident.name === 'Temporal' || resident.name === 'Temporal Nuevo'));
  assert.doesNotMatch(at(state).text, /Temporal/);
});
