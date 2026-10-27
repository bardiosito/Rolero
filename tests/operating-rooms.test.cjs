const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../app/src/main/assets/data.js');
const R = require('../app/src/main/assets/engine.js');

const person = (name, grade = 2) => ({ name, grade });
const at = (state, date = '2026-10-26', shift = 'matutino') => R.generate(state, { date, shift });
const setRoom = (state, doctorId, room, rest = {}) => R.setOperatingRoom(state, { date: '2026-10-26', shift: 'matutino', doctorId, room, ...rest });
const clearRoom = (state, doctorId, rest = {}) => R.clearOperatingRoom(state, { date: '2026-10-26', shift: 'matutino', doctorId, ...rest });
const qx = result => result.groups.find(group => group.service === 'qx');
const roomBoard = (state, rest = {}) => R.operatingRooms(state, { date: '2026-10-26', shift: 'matutino', ...rest });

function fresh() {
  const state = structuredClone(defaults);
  state.doctors = [
    { id: 'md-a', name: 'Alfa', title: 'Dr.', shift: 'matutino', schedule: Array(5).fill('qx'), residents: [person('Compartido'), person('Ana', 1), person('Mayor Alfa', 4)] },
    { id: 'md-b', name: 'Beta', title: 'Dra.', shift: 'matutino', schedule: Array(5).fill('consulta'), residents: [person('Compartido'), person('Berta', 1), person('Mayor Beta', 3)] },
    { id: 'md-c', name: 'Gamma', title: 'Dr.', shift: 'matutino', schedule: Array(5).fill('consulta'), residents: [person('Carlos')] },
    { id: 'md-d', name: 'Delta', title: 'Dr.', shift: 'vespertino', schedule: Array(5).fill('urgencias'), residents: [person('Diana', 1)] }
  ];
  state.serviceRules = [];
  state.dailyOverrides = {};
  state.absences = [];
  state.mobileAssignments = { matutino: [], vespertino: [] };
  return state;
}

test('las salas reconocen números y formatos anteriores dentro del rango QX 1 a QX 6', () => {
  for (const [value, expected] of [[1, 1], [6, 6], ['Q1', 1], ['QX1', 1], ['QX 1', 1], ['Q6', 6], ['QX 6', 6]]) assert.equal(R.normalizeOperatingRoom(value), expected);
  for (const value of [0, 7, 1.5, '', null, undefined, 'QX 7', 'Sala desconocida']) assert.equal(R.normalizeOperatingRoom(value), null);
});

test('el tablero muestra seis salas y distingue médicos de quirófano sin sala de otros candidatos', () => {
  const state = fresh();
  const before = structuredClone(state);
  const board = roomBoard(state);
  assert.deepEqual(board.rooms.map(room => [room.number, room.label]), [[1, 'QX 1'], [2, 'QX 2'], [3, 'QX 3'], [4, 'QX 4'], [5, 'QX 5'], [6, 'QX 6']]);
  assert.ok(board.rooms.every(room => room.doctors.length === 0));
  assert.deepEqual(board.unassigned, []);
  assert.deepEqual(board.candidates.map(doctor => doctor.id).sort(), ['md-a', 'md-b', 'md-c']);
  assert.equal(board.candidates.find(doctor => doctor.id === 'md-b').service, 'consulta');
  assert.deepEqual(state, before);
});

test('asignar sala lleva al médico a quirófano sólo en esa fecha y conserva su rol fijo', () => {
  const state = fresh();
  const before = structuredClone(state);
  setRoom(state, 'md-b', 3);
  assert.equal(state.dailyOverrides['2026-10-26']['md-b'].service, 'qx');
  assert.equal(state.dailyOverrides['2026-10-26']['md-b'].room, 'QX 3');
  assert.deepEqual(state.doctors, before.doctors);
  assert.match(at(state).text, /QX 3 Dra\. Beta/);
  assert.ok(qx(at(state)).doctors.some(doctor => doctor.id === 'md-b'));
  assert.ok(at(state, '2026-10-27').groups.find(group => group.service === 'consulta').doctors.some(doctor => doctor.id === 'md-b'));
  assert.equal(roomBoard(state).candidates.find(doctor => doctor.id === 'md-b').currentRoom, 3);
});

test('dos médicos en la misma sala se publican en líneas propias con sus residentes', () => {
  const state = fresh();
  setRoom(state, 'md-a', 1);
  setRoom(state, 'md-b', 1);
  const result = at(state);
  const room = qx(result).rooms.find(room => room.number === 1);
  assert.equal(room.room, 'QX 1');
  assert.deepEqual(room.doctors.map(doctor => doctor.id), ['md-a', 'md-b']);
  assert.equal(room.residents.filter(resident => R.personKey(resident) === R.personKey(person('Compartido'))).length, 1);
  const lines = result.text.split('\n').filter(line => line.startsWith('QX 1 '));
  assert.deepEqual(lines, ['QX 1 Dr. Alfa / Rotantes / Compartido R2 / Ana R1', 'QX 1 Dra. Beta / Rotantes / Compartido R2 / Berta R1']);
});

test('las salas ocupadas se ordenan de QX 1 a QX 6 sin importar el orden de asignación', () => {
  const state = fresh();
  setRoom(state, 'md-a', 6);
  setRoom(state, 'md-b', 1);
  setRoom(state, 'md-c', 2);
  const result = at(state);
  assert.deepEqual(qx(result).rooms.map(room => room.number), [1, 2, 6]);
  const lines = result.text.split('\n').filter(line => /^QX \d/.test(line));
  assert.deepEqual(lines.map(line => line.slice(0, 4)), ['QX 1', 'QX 2', 'QX 6']);
});

test('sólo las salas QX 1 a 6 incluyen médicos en el reporte y los demás siguen disponibles para asignar', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-26'] = { 'md-a': { room: 'Q1' }, 'md-b': { service: 'qx', room: 'Q9' } };
  const result = at(state);
  assert.deepEqual(qx(result).rooms.map(room => room.number), [1]);
  assert.match(result.text, /QX 1 Dr\. Alfa/);
  assert.doesNotMatch(result.text,/Q9 Dra\. Beta/);
  assert.ok(result.text.indexOf('QX 1 Dr. Alfa') < result.text.indexOf('Dr. Gamma'));
  assert.deepEqual(roomBoard(state).unassigned, []);
});

test('la unión de residentes de la sala respeta ausencias y postguardia', () => {
  const state = fresh();
  R.setGuardGroupMembers(state, 'D', [person('Compartido'), person('Ana', 1)]);
  state.absences = [{ id: 'berta-ausente', personType: 'resident', personId: R.personKey(person('Berta', 1)), start: '2026-10-26', end: '2026-10-26' }];
  setRoom(state, 'md-a', 1);
  setRoom(state, 'md-b', 1);
  const result = at(state);
  const room = qx(result).rooms.find(room => room.number === 1);
  assert.ok(room.residents.every(resident => resident.grade >= 3));
  assert.deepEqual(result.text.split('\n').filter(line => line.startsWith('QX 1 ')), ['QX 1 Dr. Alfa / Rotantes', 'QX 1 Dra. Beta / Rotantes']);
  assert.doesNotMatch(result.text, /Compartido R2|Ana R1|Berta R1/);
});

test('la cobertura médica usa la sala y el equipo del origen y muestra el nombre del suplente', () => {
  const state = fresh();
  R.registerAbsence(state, { id: 'alfa-cubierto', personType: 'doctor', personId: 'md-a', coverDoctorId: 'md-b', start: '2026-10-26', end: '2026-10-26' });
  setRoom(state, 'md-a', 4);
  const candidate = roomBoard(state).candidates.find(doctor => doctor.id === 'md-a');
  assert.equal(candidate.sourceDoctorId, 'md-a');
  assert.equal(candidate.name, 'Beta');
  assert.equal(candidate.originalName, 'Alfa');
  assert.equal(candidate.covering, true);
  assert.equal(candidate.currentRoom, 4);
  const room = qx(at(state)).rooms.find(room => room.number === 4);
  assert.equal(room.doctors[0].id, 'md-a');
  assert.equal(room.doctors[0].coverDoctorId, 'md-b');
  assert.match(at(state).text, /QX 4 Dra\. Beta \/ Rotantes \/ Compartido R2 \/ Ana R1/);
});

test('el suplente que ocupa dos plazas conserva cada equipo en su propia línea', () => {
  const state = fresh();
  R.registerAbsence(state, { id: 'alfa-cubierto', personType: 'doctor', personId: 'md-a', coverDoctorId: 'md-b', start: '2026-10-26', end: '2026-10-26' });
  setRoom(state, 'md-a', 1);
  setRoom(state, 'md-b', 1);
  const result = at(state);
  const room = qx(result).rooms.find(room => room.number === 1);
  assert.deepEqual(room.doctors.map(doctor => doctor.id), ['md-a', 'md-b']);
  const lines = result.text.split('\n').filter(line => line.startsWith('QX 1 '));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Dra\. Beta.*Ana R1/); assert.doesNotMatch(lines[0], /Berta R1/);
  assert.match(lines[1], /Dra\. Beta.*Berta R1/); assert.doesNotMatch(lines[1], /Ana R1/);
});

test('las asignaciones inválidas no alteran el día, los equipos ni las salas previas', () => {
  for (const request of [{ room: 0 }, { room: 7 }, { room: 1.5 }, { doctorId: 'desconocido' }, { doctorId: 'md-d' }, { date: '2026-02-30' }, { shift: 'nocturno' }]) {
    const state = fresh();
    const before = structuredClone(state);
    assert.throws(() => setRoom(state, 'md-a', 2, request), JSON.stringify(request));
    assert.deepEqual(state, before);
  }
});

test('un médico excluido o ausente sin cobertura no puede asignarse a una sala', () => {
  const states = [fresh(), fresh()];
  states[0].dailyOverrides['2026-10-26'] = { 'md-a': { excluded: true } };
  states[1].absences = [{ id: 'ausente', personType: 'doctor', personId: 'md-a', coverDoctorId: '', start: '2026-10-26', end: '2026-10-26' }];
  for (const state of states) {
    const before = structuredClone(state);
    assert.throws(() => setRoom(state, 'md-a', 1));
    assert.deepEqual(state, before);
    assert.ok(!roomBoard(state).candidates.some(doctor => doctor.id === 'md-a'));
  }
});

test('quitar una sala restaura la actividad implícita sin perder el ajuste de residentes', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-26'] = { 'md-b': { residents: [person('Equipo del Día', 1)], excluded: false } };
  setRoom(state, 'md-b', 2);
  clearRoom(state, 'md-b');
  const override = state.dailyOverrides['2026-10-26']['md-b'];
  assert.ok(!Object.hasOwn(override, 'service'));
  assert.ok(!Object.hasOwn(override, 'room'));
  assert.deepEqual(override.residents, [person('Equipo del Día', 1)]);
  assert.equal(override.excluded, false);
  assert.match(at(state).text, /Piso\n[^\n]*Equipo del Día R1/);
});

test('reasignar varias veces y limpiar restaura sala y actividad originales conservando cambios ajenos', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-26'] = { 'md-a': { service: 'consulta', room: 'Q4', residents: [person('Anterior', 1)] } };
  setRoom(state, 'md-a', 2);
  setRoom(state, 'md-a', 5);
  state.dailyOverrides['2026-10-26']['md-a'].residents = [person('Modificado Después', 1)];
  state.dailyOverrides['2026-10-26']['md-a'].excluded = true;
  clearRoom(state, 'md-a');
  const override = state.dailyOverrides['2026-10-26']['md-a'];
  assert.equal(override.service, 'consulta');
  assert.equal(override.room, 'Q4');
  assert.deepEqual(override.residents, [person('Modificado Después', 1)]);
  assert.equal(override.excluded, true);
});

test('limpiar una sala antigua sin marcador conserva la actividad manual guardada', () => {
  const state = fresh();
  state.dailyOverrides['2026-10-26'] = { 'md-a': { service: 'consulta', room: 'Q1', residents: [person('Conservar', 1)] } };
  clearRoom(state, 'md-a');
  assert.equal(state.dailyOverrides['2026-10-26']['md-a'].service, 'consulta');
  assert.ok(!Object.hasOwn(state.dailyOverrides['2026-10-26']['md-a'], 'room'));
  assert.deepEqual(state.dailyOverrides['2026-10-26']['md-a'].residents, [person('Conservar', 1)]);
});

test('las salas se guardan por fecha y turno y pueden restaurarse sin modificar el rol fijo', () => {
  const state = fresh();
  const doctorsBefore = structuredClone(state.doctors);
  setRoom(state, 'md-a', 1);
  setRoom(state, 'md-d', 6, { shift: 'vespertino' });
  setRoom(state, 'md-a', 3, { date: '2026-10-27' });
  const restored = R.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(qx(at(restored)).rooms[0].number, 1);
  assert.equal(qx(at(restored, '2026-10-26', 'vespertino')).rooms[0].number, 6);
  assert.equal(qx(at(restored, '2026-10-27')).rooms[0].number, 3);
  assert.deepEqual(restored.doctors, doctorsBefore);
  clearRoom(restored, 'md-a');
  assert.equal(qx(at(restored, '2026-10-27')).rooms[0].number, 3);
  assert.equal(qx(at(restored, '2026-10-26', 'vespertino')).rooms[0].number, 6);
});

test('puede asignarse una sala de fin de semana sin inventar actividad para otros días', () => {
  const state = fresh();
  setRoom(state, 'md-b', 2, { date: '2026-10-25' });
  assert.match(at(state, '2026-10-25').text, /QX 2 Dra\. Beta/);
  assert.equal(qx(at(state, '2026-10-25')).rooms[0].number, 2);
  assert.ok(at(state, '2026-10-26').groups.find(group => group.service === 'consulta').doctors.some(doctor => doctor.id === 'md-b'));
});
