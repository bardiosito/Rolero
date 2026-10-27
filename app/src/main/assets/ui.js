(function () {
  'use strict';

  var STORAGE_KEY = 'rolero-state-v1';
  var SERVICES = [
    ['qx', 'Quirófano'], ['consulta', 'Consulta externa'], ['urgencias', 'Urgencias'],
    ['piso', 'Piso'], ['residencia', 'Actividad de residencia'], ['cobertura', 'Cubre vacaciones'], ['manual', 'Otra actividad']
  ];
  var SHORT_SERVICES = { qx: 'QX', consulta: 'C. externa', urgencias: 'Urgencias', piso: 'Piso', residencia: 'Residencia', cobertura: 'Cobertura', manual: 'Otra' };
  var DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  var engine = window.Rolero;
  var app = document.getElementById('app');
  var state;
  var revision = 0;
  var toastTimer;
  var lastFocus;
  var pendingImport;
  var ui = {
    tab: 'crear', date: localDate(), shift: 'matutino',
    preview: '', previewKey: '', previewEdited: false, result: null, absenceType: 'doctor',
    absenceDraft: { doctorId: '', coverDoctorId: '', residentId: '', start: '', end: '', note: '' }, detailStates: {}
  };

  function localDate() {
    var date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function h(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function id(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function cloneDefaults() { return JSON.parse(JSON.stringify(window.ROLERO_DEFAULTS)); }
  function normalize(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.doctors)) throw new Error('El archivo no contiene un respaldo de Rolero.');
    if (typeof engine.migrateState === 'function') data = engine.migrateState(data, { referenceDate: localDate() });
    if (data.schemaVersion !== 3) throw new Error('Esta versión del respaldo no es compatible.');
    data.doctors.forEach(function (doctor) {
      if (!doctor || typeof doctor.id !== 'string' || typeof doctor.name !== 'string' || !Array.isArray(doctor.schedule) || doctor.schedule.length !== 5 || !['matutino', 'vespertino'].includes(doctor.shift)) throw new Error('El respaldo contiene un médico o un rol semanal incompleto.');
      if (!Array.isArray(doctor.residents)) doctor.residents = [];
    });
    engine.validateState(data);
    var base = cloneDefaults();
    var normalized = Object.assign(base, data, {
      schemaVersion: 3, serviceRules: Array.isArray(data.serviceRules) ? data.serviceRules : base.serviceRules,
      absences: Array.isArray(data.absences) ? data.absences : [],
      dailyOverrides: plainObject(data.dailyOverrides) ? data.dailyOverrides : {},
      guardGroups: Array.isArray(data.guardGroups) ? data.guardGroups : base.guardGroups,
      dutySelection: Object.assign({ guardGroupId: 'A' }, data.dutySelection || {}),
      mobileAssignments: Object.assign({ matutino: [], vespertino: [] }, data.mobileAssignments || {}),
      history: Array.isArray(data.history) ? data.history : [],
      settings: Object.assign({ includeServiceSupport: true, postGuardMode: 'previous', floorR1Reminder: false }, data.settings || {}, { showDoctors: true, includeGuards: false, excludePostGuard: true, includeDate: false })
    });
    engine.validateState(normalized);
    return normalized;
  }
  function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function save() {
    revision += 1;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { toast('No se pudo guardar. Exporta un respaldo para conservar tus cambios.'); }
  }
  function dateLabel(value, options) {
    var date = new Date(value + 'T12:00:00');
    if (isNaN(date)) return value;
    return date.toLocaleDateString('es-MX', options || { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function cap(value) { return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''; }
  function icon(name) {
    var paths = {
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
      moon: '<path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/>',
      copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
      share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
      users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
      down: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
      up: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
      edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
      calendar: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2v4m8-4v4M4 10h16m-12 5h8m-8 3h5"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.info) + '</svg>';
  }
  function toast(message) {
    var element = document.getElementById('toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('show');
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 3500);
  }
  function openModal(title, content) {
    lastFocus = document.activeElement;
    document.getElementById('modal-body').innerHTML = '<div class="modal-header"><h2 id="modal-title">' + h(title) + '</h2><button class="icon-button" data-action="close-modal" aria-label="Cerrar">' + icon('close') + '</button></div>' + content;
    document.getElementById('modal').hidden = false;
    document.body.classList.add('body-modal-open');
    var focusTarget = document.querySelector('#modal input, #modal textarea, #modal button');
    if (focusTarget) focusTarget.focus();
  }
  function closeModal() {
    document.getElementById('modal').hidden = true;
    document.body.classList.remove('body-modal-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function residentText(residents) {
    return (residents || []).map(function (resident) { return resident.name + ' R' + resident.grade; }).join(', ');
  }
  function serviceOptions(current, short) {
    return SERVICES.map(function (service) { return '<option value="' + service[0] + '"' + (current === service[0] ? ' selected' : '') + '>' + h(short ? SHORT_SERVICES[service[0]] : service[1]) + '</option>'; }).join('');
  }
  function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase(); }
  function hero(eyebrow, title, subtitle) {
    return '<section class="hero compact-hero"><h1>' + title + '</h1></section>';
  }
  function absenceForDoctor(doctor, date) { return state.absences.slice().reverse().find(function (absence) { return absence.personType === 'doctor' && absence.personId === doctor.id && absence.start <= date && absence.end >= date; }); }
  function dayOverride(doctorId) { return (state.dailyOverrides[ui.date] || {})[doctorId] || {}; }
  function generate() {
    var result = engine.generate(state, { date: ui.date, shift: ui.shift, includeGuards: state.settings.includeGuards, showDoctors: state.settings.showDoctors });
    var key = ui.date + '|' + ui.shift + '|' + revision;
    if (ui.previewKey !== key) { ui.preview = result.text; ui.previewKey = key; ui.previewEdited = false; }
    ui.result = result;
    return result;
  }
  function render() {
    app.querySelectorAll('details[data-detail]').forEach(function (detail) { ui.detailStates[detail.getAttribute('data-detail')] = detail.open; });
    if (ui.tab === 'crear') app.innerHTML = renderCreate();
    else if (ui.tab === 'equipo') app.innerHTML = renderTeam();
    else app.innerHTML = renderGuards();
    app.querySelectorAll('details[data-detail]').forEach(function (detail) { if (Object.prototype.hasOwnProperty.call(ui.detailStates, detail.getAttribute('data-detail'))) detail.open = ui.detailStates[detail.getAttribute('data-detail')]; });
    document.querySelectorAll('.bottom-nav .nav-item').forEach(function (button) {
      var active = button.dataset.tab === ui.tab;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
  }

  function reportActions() {
    return '<div class="action-row"><button class="button secondary" data-action="copy">' + icon('copy') + 'Copiar texto</button><button class="button lime" data-action="share">' + icon('share') + 'Compartir</button></div>';
  }
  function renderCreate() {
    var result = generate();
    var doctors = state.doctors.filter(function (doctor) { return doctor.shift === ui.shift; });
    var weekday = engine.weekdayIndex(ui.date);
    return hero('', 'Tu equipo, <span>en orden.</span>', '') +
      '<section class="card selection-card"><div class="selection-grid"><div><div class="field-title"><span>FECHA DEL ROL</span><button class="small-action" data-action="today">Hoy</button></div><label aria-label="Fecha del rol"><input type="date" id="create-date" value="' + h(ui.date) + '" required></label></div><div><div class="field-title">TURNO</div><div class="segmented" aria-label="Seleccionar turno"><button data-action="shift" data-shift="matutino" class="' + (ui.shift === 'matutino' ? 'active' : '') + '" aria-pressed="' + (ui.shift === 'matutino') + '">' + icon('sun') + 'Matutino</button><button data-action="shift" data-shift="vespertino" class="' + (ui.shift === 'vespertino' ? 'active' : '') + '" aria-pressed="' + (ui.shift === 'vespertino') + '">' + icon('moon') + 'Vespertino</button></div></div></div></section>' +
      renderPostGuard(result) +
      '<details class="section-accordion" data-detail="organize-turn"><summary>Organiza el turno</summary><div class="accordion-content doctor-list">' + (doctors.length ? doctors.map(function (doctor) { return renderDayDoctor(doctor, weekday); }).join('') : '<div class="quiet-empty">No hay médicos en este turno.<button class="button soft space-top" data-action="tab" data-tab="equipo">Ir a Equipo</button></div>') + '</div></details>' +
      renderOperatingRooms() + '<section class="card preview-card" aria-label="Vista previa"><div class="preview-head"><h2>Vista previa</h2></div><div class="preview-controls"><label class="switch-row" for="floor-r1-switch"><span>Resto de R1 al terminar actividades</span><input type="checkbox" role="switch" id="floor-r1-switch" data-setting="floorR1Reminder"' + (state.settings.floorR1Reminder ? ' checked' : '') + '><span class="switch-track" aria-hidden="true"></span></label></div><div class="preview-text-wrap"><textarea id="preview-text" class="preview-text" aria-label="Texto del rol, editable" spellcheck="false">' + h(ui.preview) + '</textarea></div><div class="preview-footer">' + reportActions() + '</div></section>';
  }
  function operatingDoctorId(doctor) { return doctor.sourceDoctorId || doctor.id; }
  function operatingDoctorLabel(doctor) {
    var label = doctorLabel(doctor);
    if (doctor.covering) {
      var source = state.doctors.find(function (person) { return person.id === operatingDoctorId(doctor); });
      label += ' · cubre a ' + (source ? doctorLabel(source) : doctor.originalName || 'otro médico');
    }
    return label;
  }
  function renderOperatingRooms() {
    var result = engine.operatingRooms(state, { date: ui.date, shift: ui.shift });
    return '<details class="section-accordion qx-rooms" data-detail="qx-rooms"><summary>Salas de quirófano</summary><div class="accordion-content qx-room-grid">' + result.rooms.map(function (room) {
      var candidates = result.candidates.filter(function (doctor) { return Number(doctor.currentRoom) !== room.number; });
      return '<details class="qx-room" data-detail="qx-room-' + room.number + '"><summary><strong>' + h(room.label) + '</strong><span>' + h(room.doctors.map(doctorLabel).join(', ') || 'Sin asignar') + '</span></summary><div class="qx-room-content">' + (room.doctors.length ? '<div class="qx-room-members">' + room.doctors.map(function (doctor) {
        var residents = doctor.formattedResidents || engine.formatResidents(doctor.residents || []);
        return '<div class="qx-room-doctor"><div><strong>' + h(operatingDoctorLabel(doctor)) + '</strong>' + (residents ? '<small>' + h(residents) + '</small>' : '') + '</div><button type="button" class="delete-link" data-action="clear-qx-room" data-id="' + h(operatingDoctorId(doctor)) + '">Restablecer actividad</button></div>';
      }).join('') + '</div>' : '') + '<form class="qx-room-form" data-form="qx-room" data-room="' + room.number + '"><label>Médico<select name="doctorId" required aria-label="Médico para ' + h(room.label) + '"><option value="">Seleccionar médico</option>' + candidates.map(function (doctor) { return '<option value="' + h(operatingDoctorId(doctor)) + '">' + h(operatingDoctorLabel(doctor)) + '</option>'; }).join('') + '</select></label><button class="button soft small" type="submit"' + (!candidates.length ? ' disabled' : '') + '>Asignar a ' + h(room.label) + '</button></form></div></details>';
    }).join('') + '</div></details>';
  }
  function renderPostGuard(result) {
    var guard = (state.guardGroups || []).find(function (group) { return group.id === result.guardGroup; });
    var post = (state.guardGroups || []).find(function (group) { return group.id === result.postGuardGroup; });
    return '<div class="duty-summary" aria-label="Guardia y postguardia"><span>Guardia <strong>' + h(guard ? guard.name || guard.id : 'Sin seleccionar') + '</strong></span><span>Postguardia <strong>' + h(post ? post.name || post.id : 'Sin seleccionar') + '</strong></span></div>';
  }

  function renderDayDoctor(doctor, weekday) {
    var override = dayOverride(doctor.id);
    var service = override.service || (weekday >= 0 ? doctor.schedule[weekday] : 'manual');
    var residents = override.residents || doctor.residents || [];
    var absence = absenceForDoctor(doctor, ui.date);
    var assignment = typeof engine.resolveDoctorAssignment === 'function' ? engine.resolveDoctorAssignment(state, doctor.id, ui.date) : { doctor: doctor, covering: false };
    var displayDoctor = assignment ? assignment.doctor : doctor;
    var needsRoom = service === 'qx' && !engine.normalizeOperatingRoom(override.room);
    var excluded = !!override.excluded || !assignment || needsRoom;
    var postGuardKeys = new Set((ui.result && ui.result.postGuardExcluded || []).filter(function (person) { return Number(person.grade) <= 2; }).map(function (person) { return engine.personKey(person); }));
    var postGuardResidents = state.settings.excludePostGuard !== false ? residents.filter(function (person) { return Number(person.grade) <= 2 && postGuardKeys.has(engine.personKey(person)); }) : [];
    var generatedDoctor = (ui.result && ui.result.groups || []).reduce(function (list, group) { return list.concat(group.doctors); }, []).find(function (person) { return person.id === doctor.id; });
    var visibleResidents = generatedDoctor ? generatedDoctor.residents : engine.availableResidents(state, residents, ui.date).filter(function (person) { return state.settings.excludePostGuard === false || Number(person.grade) >= 3 || !postGuardKeys.has(engine.personKey(person)); });
    var detail = visibleResidents.length ? engine.formatResidents(visibleResidents) : 'Sin residentes disponibles';
    if (assignment && assignment.covering) detail = 'Cubre a ' + doctorLabel(doctor) + ' · ' + detail;
    if (postGuardResidents.length) detail += ' · Postguardia: ' + residentText(postGuardResidents);
    if (needsRoom) detail = 'Elige una sala para incluirlo en este rol';
    return '<details class="doctor-card' + (excluded ? ' is-excluded' : '') + '" data-detail="day-' + h(doctor.id) + '"><summary><span class="avatar">' + h(initials(doctor.name)) + '</span><span class="doctor-summary"><span class="doctor-name">' + h(doctorLabel(displayDoctor)) + '</span><div class="doctor-sub">' + h(absence && !(assignment && assignment.covering) ? 'Ausencia registrada · ' + (absence.note || 'No disponible') : override.excluded ? 'Excluido de este día' : detail) + '</div></span><span class="service-tag ' + h(service) + '">' + h(SHORT_SERVICES[service] || service) + '</span></summary><div class="doctor-fields">' +
      (absence ? '<div class="info-banner warning-banner">' + icon('info') + '<div>Ausencia del ' + h(dateLabel(absence.start, { day: 'numeric', month: 'short' })) + ' al ' + h(dateLabel(absence.end, { day: 'numeric', month: 'short' })) + '. Puedes modificarla en Equipo.</div></div>' : '') +
      (postGuardResidents.length ? '<div class="info-banner">' + icon('moon') + '<div><strong>' + h(residentText(postGuardResidents)) + '</strong>: se excluye' + (postGuardResidents.length > 1 ? 'n' : '') + ' del texto por postguardia. La combinación fija se conserva.</div></div>' : '') +
      '<label>Actividad de este día<select data-day-doctor="' + h(doctor.id) + '" data-day-field="service">' + serviceOptions(service) + '</select></label>' + '<label class="check-row"><input type="checkbox" data-day-doctor="' + h(doctor.id) + '" data-day-field="excluded"' + (override.excluded ? ' checked' : '') + '>Excluir de este rol</label>' +
      (Object.keys(override).length ? '<button class="small-action" data-action="reset-day" data-id="' + h(doctor.id) + '" style="text-align:left">Restablecer el rol fijo para este médico</button>' : '') + '</div></details>';
  }
  function renderTeam() {
    return hero('', 'El equipo <span>completo.</span>', '') +
      '<div class="team-sections">' +
      ['matutino', 'vespertino'].map(function (shift) {
        var doctors = state.doctors.filter(function (doctor) { return doctor.shift === shift; });
        return '<details class="section-accordion" data-detail="team-' + shift + '"><summary>Turno ' + cap(shift) + '</summary><div class="accordion-content"><div class="doctor-list">' + (doctors.length ? doctors.map(renderRosterDoctor).join('') : '<p class="small-caption">Sin médicos en este turno.</p>') + '</div><button class="button soft full space-top" data-action="add-doctor" data-shift="' + shift + '">' + icon('plus') + 'Añadir médico</button></div></details>';
      }).join('') + renderAbsences() + renderR1Priorities() + '</div>';
  }
  function titleOptions(current) {
    return '<option value="Dr."' + (current !== 'Dra.' ? ' selected' : '') + '>Dr.</option><option value="Dra."' + (current === 'Dra.' ? ' selected' : '') + '>Dra.</option>';
  }
  function weeklyFields(schedule) {
    return '<div class="weekly-grid">' + DAYS.map(function (day, index) { return '<label>' + day + '<select name="day' + index + '">' + serviceOptions(schedule[index], true) + '</select></label>'; }).join('') + '</div>';
  }
  function renderRosterDoctor(doctor) {
    var policies = engine.r1PriorityRoster(state).filter(function (person) { return person.configured[doctor.shift] && !((state.mobileAssignments || {})[doctor.shift] || []).some(function (pair) { return pair.residentKey === person.key; }); });
    var configured = new Set(policies.map(function (person) { return person.key; }));
    var residents = (doctor.residents || []).filter(function (person) { return !configured.has(engine.personKey(person)); });
    policies.filter(function (person) { return person.priorities[doctor.shift][0] === 'doctor:' + doctor.id; }).forEach(function (person) { residents.push({ name: person.name, grade: 1 }); });
    return '<details class="doctor-card roster-card" data-detail="roster-' + h(doctor.id) + '"><summary><span class="avatar">' + h(initials(doctor.name)) + '</span><span class="doctor-summary"><span class="doctor-name">' + h((doctor.title || 'Dr.') + ' ' + doctor.name) + '</span><div class="doctor-sub">' + h(engine.formatResidents(residents) || 'Sin residentes asignados') + '</div></span></summary><div class="doctor-fields"><form class="staff-form" data-form="doctor" data-id="' + h(doctor.id) + '"><div class="form-grid"><label>Tratamiento<select name="title">' + titleOptions(doctor.title) + '</select></label><label>Apellido o nombre<input name="name" value="' + h(doctor.name) + '" required maxlength="90"></label></div>' + weeklyFields(doctor.schedule) + '<div class="actions-end"><button type="button" class="delete-link" data-action="delete-doctor" data-id="' + h(doctor.id) + '">Quitar médico</button><button class="button soft small" type="submit">' + icon('check') + 'Guardar cambios</button></div></form></div></details>';
  }
  function showAddDoctor(shift) {
    openModal('Añadir médico · ' + cap(shift), '<form id="add-doctor" class="form-stack"><input type="hidden" name="shift" value="' + h(shift) + '"><div class="form-grid"><label>Tratamiento<select name="title">' + titleOptions('Dr.') + '</select></label><label>Apellido o nombre<input name="name" required maxlength="90" placeholder="Ej. López"></label></div>' + weeklyFields(['consulta', 'qx', 'urgencias', 'qx', 'consulta']) + '<button class="button lime full" type="submit">' + icon('plus') + 'Añadir médico</button></form>');
  }
  function doctorLabel(doctor) { return (doctor.title || 'Dr.') + ' ' + doctor.name; }
  function absenceDoctorSelector(kind, label, selected, optional) {
    var field = kind === 'doctor' ? 'doctorId' : 'coverDoctorId';
    var chosen = state.doctors.find(function (doctor) { return doctor.id === selected; });
    return '<details class="person-selector" data-detail="absence-' + kind + '"><summary><span>' + label + '</span><strong data-selection-label="' + field + '">' + h(chosen ? doctorLabel(chosen) : optional ? 'Sin cobertura' : 'Seleccionar médico') + '</strong></summary><div class="person-options">' + (optional ? '<label class="radio-option"><input type="radio" name="' + field + '" value=""' + (!selected ? ' checked' : '') + '>Sin cobertura</label>' : '') + ['matutino', 'vespertino'].map(function (shift) {
      var doctors = state.doctors.filter(function (doctor) { return doctor.shift === shift; });
      return '<details class="person-shift" data-detail="absence-' + kind + '-' + shift + '"><summary>' + cap(shift) + '</summary><div>' + (doctors.length ? doctors.map(function (doctor) { return '<label class="radio-option"><input type="radio" name="' + field + '" value="' + h(doctor.id) + '"' + (selected === doctor.id ? ' checked' : '') + '>' + h(doctorLabel(doctor)) + '</label>'; }).join('') : '<p class="small-caption">Sin médicos.</p>') + '</div></details>';
    }).join('') + '</div></details>';
  }
  function renderAbsences() {
    var draft = ui.absenceDraft;
    var type = ui.absenceType;
    return '<details class="section-accordion" data-detail="absences"><summary>Vacaciones y ausencias</summary><div class="accordion-content"><form id="add-absence" class="form-stack" data-person-type="' + type + '"><div class="segmented absence-mode" aria-label="Tipo de persona"><label class="' + (type === 'doctor' ? 'active' : '') + '"><input type="radio" name="personType" value="doctor"' + (type === 'doctor' ? ' checked' : '') + '>Médico</label><label class="' + (type === 'resident' ? 'active' : '') + '"><input type="radio" name="personType" value="resident"' + (type === 'resident' ? ' checked' : '') + '>Residente</label></div>' +
      (type === 'doctor' ? absenceDoctorSelector('doctor', 'Quién sale', draft.doctorId, false) + absenceDoctorSelector('cover', 'Quién cubre', draft.coverDoctorId, true) : '<label>Residente<select name="residentId" required><option value="">Seleccionar residente</option>' + allResidents().map(function (resident) { var key = engine.personKey(resident); return '<option value="' + h(key) + '"' + (key === draft.residentId ? ' selected' : '') + '>' + h(resident.name + ' R' + resident.grade) + '</option>'; }).join('') + '</select></label>') +
      '<div class="form-grid"><label>Desde<input type="date" name="start" value="' + h(draft.start || ui.date) + '" required></label><label>Hasta<input type="date" name="end" value="' + h(draft.end || ui.date) + '" required></label></div><label>Motivo (opcional)<input name="note" value="' + h(draft.note) + '" placeholder="Ej. Vacaciones" maxlength="120"></label><button type="submit" class="button soft full">Registrar ausencia</button></form>' + (state.absences.length ? '<div class="absence-list">' + state.absences.slice().sort(function (a, b) { return a.start.localeCompare(b.start); }).map(renderAbsence).join('') + '</div>' : '') + '</div></details>';
  }

  function renderR1Priorities() {
    var roster = engine.r1PriorityRoster(state);
    return '<details class="section-accordion r1-priorities" data-detail="r1-priorities"><summary>Rol de R1</summary><div class="accordion-content"><p class="priority-note">Elige un destino por turno. Si no está disponible, el residente pasa a Piso. Se respetan las ausencias, la postguardia y las sustituciones.</p><div class="priority-roster">' + (roster.length ? roster.map(function (resident) {
      var encoded = h(encodeURIComponent(resident.key));
      return '<details class="r1-priority-person" data-detail="r1-priority-' + encoded + '"><summary><span class="resident-grade">R1</span><strong>' + h(resident.name) + '</strong></summary><div class="priority-shifts">' + ['matutino', 'vespertino'].map(function (shift) {
        var configured = resident.configured[shift];
        var target = configured ? resident.priorities[shift][0] || 'service:piso' : '';
        var destination = target.indexOf('doctor:') === 0 ? 'doctor' : target;
        var doctorId = destination === 'doctor' ? target.slice(7) : '';
        var options = [['', 'Conservar rol actual'], ['service:piso', 'Piso'], ['service:consulta', 'Consulta externa'], ['service:qx', 'Quirófano'], ['service:urgencias', 'Urgencias'], ['doctor', 'Médico de base']];
        return '<details class="priority-shift" data-detail="r1-priority-' + encoded + '-' + shift + '"><summary>' + cap(shift) + '</summary><form class="form-stack" data-form="r1-priorities" data-key="' + h(resident.key) + '" data-shift="' + shift + '"><label>Destino<select name="destination">' + options.map(function (option) { return '<option value="' + option[0] + '"' + (destination === option[0] ? ' selected' : '') + '>' + option[1] + '</option>'; }).join('') + '</select></label><label class="r1-doctor-field"' + (destination !== 'doctor' ? ' hidden' : '') + '>Médico de base<select name="doctorId"' + (destination === 'doctor' ? ' required' : ' disabled') + '><option value="">Seleccionar médico</option>' + state.doctors.filter(function (doctor) { return doctor.shift === shift; }).map(function (doctor) { return '<option value="' + h(doctor.id) + '"' + (doctor.id === doctorId ? ' selected' : '') + '>' + h(doctorLabel(doctor)) + '</option>'; }).join('') + '</select></label><button class="button soft full" type="submit">' + icon('check') + 'Guardar rol</button></form></details>';
      }).join('') + '</div></details>';
    }).join('') : '<p class="small-caption">No hay residentes R1 registrados.</p>') + '</div></div></details>';
  }
  function allResidents() {
    var map = new Map();
    state.doctors.forEach(function (doctor) { (doctor.residents || []).forEach(function (resident) { map.set(engine.personKey(resident), resident); }); });
    (state.serviceRules || []).forEach(function (rule) { (rule.residents || []).forEach(function (resident) { map.set(engine.personKey(resident), resident); }); });
    Object.values(state.dailyOverrides || {}).forEach(function (overrides) { Object.values(overrides).forEach(function (override) { (override.residents || []).forEach(function (resident) { map.set(engine.personKey(resident), resident); }); }); });
    (state.guardGroups || []).forEach(function (group) { (group.members || []).forEach(function (resident) { map.set(engine.personKey(resident), resident); }); });
    return Array.from(map.values()).sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
  }
  function personName(absence) {
    if (absence.personType === 'doctor') {
      var doctor = state.doctors.find(function (person) { return person.id === absence.personId; });
      return doctor ? (doctor.title || 'Dr.') + ' ' + doctor.name : 'Médico eliminado';
    }
    var resident = allResidents().find(function (person) { return engine.personKey(person) === absence.personId; });
    return resident ? resident.name + ' R' + resident.grade : absence.personId;
  }
  function renderAbsence(absence) {
    var cover = state.doctors.find(function (doctor) { return doctor.id === absence.coverDoctorId; });
    return '<div class="list-row"><div class="list-main"><strong>' + h(personName(absence)) + '</strong>' + (cover ? '<small>Cubre: ' + h(doctorLabel(cover)) + '</small>' : '') + '<small>' + h(dateLabel(absence.start, { day: 'numeric', month: 'short' })) + ' – ' + h(dateLabel(absence.end, { day: 'numeric', month: 'short' })) + (absence.note ? ' · ' + h(absence.note) : '') + '</small></div><button class="delete-link" data-action="delete-absence" data-id="' + h(absence.id) + '" aria-label="Eliminar ausencia de ' + h(personName(absence)) + '">Quitar</button></div>';
  }
  function guardGroupOptions(current) {
    return (state.guardGroups || []).map(function (group) {
      return '<option value="' + h(group.id) + '"' + (current === group.id ? ' selected' : '') + '>' + h(group.name || 'Guardia ' + group.id) + '</option>';
    }).join('');
  }
  function residentRoster() { return engine.residentRoster(state); }
  function gradeOptions(grade) {
    return [1, 2].map(function (number) { return '<option value="' + number + '"' + (Number(grade) === number ? ' selected' : '') + '>R' + number + '</option>'; }).join('');
  }
  function residentDoctorSummary(resident) {
    var labels = ['matutino', 'vespertino'].map(function (shift) {
      var ids = (resident.doctorIds || {})[shift] || [];
      var names = state.doctors.filter(function (doctor) { return ids.includes(doctor.id); }).map(doctorLabel);
      return names.length ? (shift === 'matutino' ? 'TM: ' : 'TV: ') + names.join(', ') : '';
    }).filter(Boolean);
    if ((resident.serviceRuleIds || []).length) labels.push('Apoyo por servicio');
    return labels.join(' · ') || 'Sin médico asignado';
  }
  function renderResidentAssignments(detailKey, doctorIds) {
    var encoded = encodeURIComponent(detailKey);
    return '<details class="resident-assignments" data-detail="assignment-' + h(encoded) + '"><summary>Médicos por turno</summary><div class="assignment-shifts">' + ['matutino', 'vespertino'].map(function (shift) {
      var doctors = state.doctors.filter(function (doctor) { return doctor.shift === shift; });
      var selected = (doctorIds || {})[shift] || [];
      return '<details class="person-shift" data-detail="assignment-' + h(encoded) + '-' + shift + '"><summary>' + cap(shift) + '</summary><div>' + (doctors.length ? doctors.map(function (doctor) { return '<label class="check-row resident-doctor-option"><input type="checkbox" name="doctor-' + shift + '" value="' + h(doctor.id) + '"' + (selected.includes(doctor.id) ? ' checked' : '') + '>' + h(doctorLabel(doctor)) + '</label>'; }).join('') : '<p class="small-caption">Sin médicos en este turno.</p>') + '</div></details>';
    }).join('') + '</div></details>';
  }
  function renderResident(resident) {
    var key = h(resident.key);
    return '<details class="doctor-card resident-card" data-detail="resident-' + h(encodeURIComponent(resident.key)) + '"><summary><span class="resident-grade">R' + resident.grade + '</span><span class="doctor-summary"><span class="doctor-name">' + h(resident.name) + '</span><div class="doctor-sub">' + h(residentDoctorSummary(resident)) + '</div></span></summary><div class="doctor-fields"><form class="form-stack" data-form="resident" data-key="' + key + '"><div class="form-grid"><label>Nombre<input name="name" value="' + h(resident.name) + '" required maxlength="90"></label><label>Grado<select name="grade">' + gradeOptions(resident.grade) + '</select></label></div><label>Guardia<select name="guardGroupId"><option value=""' + (!resident.guardGroupId ? ' selected' : '') + '>Sin guardia</option>' + guardGroupOptions(resident.guardGroupId) + '</select></label>' + renderResidentAssignments(resident.key, resident.doctorIds) + '<button class="button soft full" type="submit">' + icon('check') + 'Guardar residente</button><div class="resident-actions"><button type="button" class="button secondary small" data-action="promote-resident" data-key="' + key + '">Ascender a R' + (Number(resident.grade) + 1) + '</button><button type="button" class="delete-link" data-action="remove-resident" data-key="' + key + '">Quitar residente</button></div></form></div></details>';
  }
  function renderAddResident(group, roster) {
    var existing = roster.filter(function (resident) { return !resident.guardGroupId; });
    return '<details class="resident-add" data-detail="add-resident-' + h(group.id) + '"><summary>' + icon('plus') + 'Añadir integrante</summary><form class="form-stack" data-form="add-resident" data-group="' + h(group.id) + '"><label>Integrante<select name="existingKey" data-existing-resident><option value="">Nuevo residente</option>' + existing.map(function (resident) { return '<option value="' + h(resident.key) + '">' + h(resident.name + ' R' + resident.grade) + '</option>'; }).join('') + '</select></label><div class="resident-add-fields form-stack"><div class="form-grid"><label>Nombre<input name="name" required maxlength="90" placeholder="Apellido o nombre"></label><label>Grado<select name="grade">' + gradeOptions(1) + '</select></label></div>' + renderResidentAssignments('new-' + group.id, {}) + '</div><button class="button soft full" type="submit">' + icon('plus') + 'Añadir a esta guardia</button></form></details>';
  }
  function renderGuards() {
    var groups = state.guardGroups || [];
    var roster = residentRoster();
    var ungrouped = roster.filter(function (resident) { return !resident.guardGroupId; });
    return hero('', 'Guardias', '') + '<section class="card guard-setup form-stack"><label>Guardia actual<select data-duty-field="guardGroupId" aria-label="Guardia actual">' + guardGroupOptions((state.dutySelection || {}).guardGroupId) + '</select></label><label>Fecha de esta guardia<input type="date" id="duty-reference-date" data-duty-field="referenceDate" value="' + h((state.dutySelection || {}).referenceDate || localDate()) + '" required></label><label>Número de guardias<select id="guard-count" aria-label="Número de guardias">' + [3, 4, 5, 6].map(function (number) { return '<option value="' + number + '"' + (groups.length === number ? ' selected' : '') + '>' + number + '</option>'; }).join('') + '</select></label></section><div class="guard-groups-grid">' + groups.map(function (group) { return renderGuardGroup(group, roster); }).join('') + '</div>' + (ungrouped.length ? '<details class="section-accordion" data-detail="residents-ungrouped"><summary>Residentes sin guardia</summary><div class="accordion-content doctor-list">' + ungrouped.map(renderResident).join('') + '</div></details>' : '');
  }
  function renderGuardGroup(group, roster) {
    var members = roster.filter(function (resident) { return resident.guardGroupId === group.id; });
    return '<details class="section-accordion guard-group-card" data-detail="guard-' + h(group.id) + '"><summary><span>' + h(group.name || 'Guardia ' + group.id) + '</span><span class="small-caption">' + group.members.length + '/10 · R1/R2</span></summary><div class="accordion-content"><form class="guard-name-form" data-form="guard-name" data-id="' + h(group.id) + '"><label>Nombre de la guardia<input name="name" value="' + h(group.name || 'Guardia ' + group.id) + '" maxlength="64" required></label><button type="submit" class="button secondary small">Guardar nombre</button></form><div class="resident-list doctor-list">' + (members.length ? members.map(renderResident).join('') : '<p class="small-caption">Sin integrantes.</p>') + '</div>' + renderAddResident(group, roster) + '</div></details>';
  }
  function retireResident(key, promotion) {
    var resident = residentRoster().find(function (person) { return person.key === key; });
    if (!resident) return;
    openModal(promotion ? 'Ascender a R3 y retirar' : 'Quitar residente', '<p>' + (promotion ? 'Al pasar a R3, ' : 'Se retirará a ') + '<strong>' + h(resident.name + ' R' + resident.grade) + '</strong>' + (promotion ? ' se retirará de todos los turnos y guardias.' : ' de todos los turnos y guardias.') + '</p><div class="action-row"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button danger" data-action="confirm-retire-resident" data-key="' + h(key) + '">' + (promotion ? 'Ascender y retirar' : 'Quitar residente') + '</button></div>');
  }
  function formDoctorIds(form) { return { matutino: form.getAll('doctor-matutino'), vespertino: form.getAll('doctor-vespertino') }; }
  function rememberResidentDetails(oldKey, newKey) {
    var oldEncoded = encodeURIComponent(oldKey);
    var newEncoded = encodeURIComponent(newKey);
    app.querySelectorAll('details[data-detail]').forEach(function (detail) {
      var value = detail.getAttribute('data-detail');
      if (value === 'resident-' + oldEncoded || value === 'assignment-' + oldEncoded || value.indexOf('assignment-' + oldEncoded + '-') === 0) ui.detailStates[value.replace(oldEncoded, newEncoded)] = detail.open;
    });
    if (ui.absenceDraft.residentId === oldKey) ui.absenceDraft.residentId = newKey;
  }

  function changeGroupCount(count, confirmed) {
    if (count === state.guardGroups.length) return;
    var removed = state.guardGroups.slice(count);
    var memberCount = removed.reduce(function (total, group) { return total + group.members.length; }, 0);
    var removedKeys = new Set(removed.reduce(function (people, group) { return people.concat(group.members); }, []).map(function (person) { return engine.personKey(person); }));
    var pairCount = ['matutino', 'vespertino'].reduce(function (total, shift) { return total + ((state.mobileAssignments || {})[shift] || []).filter(function (pair) { return removedKeys.has(pair.residentKey); }).length; }, 0);
    if (!confirmed && count < state.guardGroups.length && (memberCount || pairCount)) {
      openModal('Reducir grupos de guardia', '<p>Se quitarán <strong>' + h(removed.map(function (group) { return group.name || 'Guardia ' + group.id; }).join(', ')) + '</strong>, con ' + memberCount + ' integrantes y sus ajustes asociados.</p><div class="action-row"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button danger" data-action="confirm-group-count" data-count="' + count + '">Quitar esos grupos</button></div>');
      var control = document.getElementById('guard-count'); if (control) control.value = String(state.guardGroups.length);
      return;
    }
    engine.setGuardGroupCount(state, count, { confirmRemoval: !!confirmed });
    save(); closeModal(); render(); toast('Número de guardias actualizado.');
  }

  async function copyText(text) {
    if (window.Android && typeof window.Android.copyText === 'function') { window.Android.copyText(text); return; }
    if (navigator.clipboard && window.isSecureContext) { try { await navigator.clipboard.writeText(text); return; } catch (error) { /* Use the local clipboard fallback. */ } }
    var area = document.createElement('textarea');
    area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; area.style.pointerEvents = 'none';
    document.body.appendChild(area); area.focus(); area.select();
    var copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('No fue posible copiar. Selecciona el texto de la vista previa.');
  }
  async function publish(action) {
    generate();
    try {
      if (action === 'copy') { await copyText(ui.preview); toast('Texto copiado.'); }
      else if (window.Android && typeof window.Android.shareText === 'function') window.Android.shareText(ui.preview);
      else if (navigator.share) await navigator.share({ title: 'Turno ' + ui.shift, text: ui.preview });
      else { await copyText(ui.preview); toast('Texto copiado. Pégalo donde lo compartirás.'); }
    } catch (error) { if (error.name !== 'AbortError') toast(error.message || 'No fue posible completar la acción.'); }
  }

  function showTools() {
    openModal('Tus datos, a salvo.', '<p class="space-bottom">El rol, los grupos y las ausencias se guardan sólo en este dispositivo. Conserva una copia para recuperarlos o moverlos a otro teléfono.</p><div class="modal-content"><button class="tool-option" data-action="export">' + icon('down') + '<span><strong>Exportar respaldo</strong><small>Guardar todos los datos en un archivo JSON.</small></span></button><button class="tool-option" data-action="import">' + icon('up') + '<span><strong>Restaurar respaldo</strong><small>Elegir una copia guardada anteriormente.</small></span></button></div><p class="inline-note">El respaldo incluye los nombres de tu equipo. Guárdalo en un lugar de confianza.</p>');
  }
  function exportBackup() {
    var text = JSON.stringify(state, null, 2);
    try {
      if (window.Android && typeof window.Android.saveBackup === 'function') window.Android.saveBackup(text);
      else {
        var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        var link = document.createElement('a'); link.href = url; link.download = 'rolero-respaldo-' + localDate() + '.json';
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
      closeModal(); toast('Respaldo preparado. Elige dónde guardarlo.');
    } catch (error) { toast('No fue posible exportar el respaldo.'); }
  }
  function requestImport() {
    try {
      if (window.Android && typeof window.Android.restoreBackup === 'function') window.Android.restoreBackup();
      else document.getElementById('backup-file').click();
    } catch (error) { toast('No fue posible abrir el selector de archivos.'); }
  }
  window.onBackupRestored = function (text) {
    try {
      pendingImport = normalize(JSON.parse(text));
      openModal('Restaurar este respaldo', '<p>Se cargarán <strong>' + pendingImport.doctors.length + ' médicos</strong>, ' + pendingImport.absences.length + ' ausencias.</p><div class="info-banner warning-banner space-top">' + icon('info') + '<div>Los datos actuales de este dispositivo serán reemplazados. Puedes exportarlos antes de continuar.</div></div><div class="action-row"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button lime" data-action="confirm-import">Restaurar datos</button></div>');
    } catch (error) { pendingImport = null; toast(error.message || 'El respaldo no se pudo leer.'); }
  };
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    var action = button.dataset.action;
    if (action === 'tab') { ui.tab = button.dataset.tab; render(); window.scrollTo(0, 0); }
    else if (action === 'shift') { ui.shift = button.dataset.shift; render(); }
    else if (action === 'today') { ui.date = localDate(); render(); }
    else if (action === 'copy' || action === 'share') publish(action);
    else if (action === 'add-doctor') showAddDoctor(button.dataset.shift);
    else if (action === 'clear-qx-room') {
      try { engine.clearOperatingRoom(state, { date: ui.date, shift: ui.shift, doctorId: button.dataset.id }); save(); render(); toast('Actividad restablecida.'); }
      catch (error) { toast(error.message); }
    }
    else if (action === 'remove-resident') retireResident(button.dataset.key, false);
    else if (action === 'promote-resident') {
      var resident = residentRoster().find(function (person) { return person.key === button.dataset.key; });
      if (!resident) return;
      if (Number(resident.grade) === 2) retireResident(resident.key, true);
      else {
        try { engine.updateResident(state, resident.key, { grade: 2 }); rememberResidentDetails(resident.key, engine.personKey({ name: resident.name, grade: 2 })); save(); render(); toast('Residente ascendido a R2.'); }
        catch (error) { toast(error.message); }
      }
    } else if (action === 'confirm-retire-resident') {
      try { engine.removeResident(state, button.dataset.key); if (ui.absenceDraft.residentId === button.dataset.key) ui.absenceDraft.residentId = ''; save(); closeModal(); render(); toast('Residente retirado.'); }
      catch (error) { toast(error.message); }
    }
    else if (action === 'tools') showTools();
    else if (action === 'close-modal') closeModal();
    else if (action === 'export') exportBackup();
    else if (action === 'import') requestImport();
    else if (action === 'confirm-import' && pendingImport) { state = pendingImport; pendingImport = null; ui.absenceDraft = { doctorId: '', coverDoctorId: '', residentId: '', start: '', end: '', note: '' }; save(); closeModal(); render(); toast('Respaldo restaurado.'); }
    else if (action === 'reset-day') { if (state.dailyOverrides[ui.date]) delete state.dailyOverrides[ui.date][button.dataset.id]; save(); render(); toast('Se restableció la asignación fija.'); }
    else if (action === 'delete-absence') { state.absences = state.absences.filter(function (absence) { return absence.id !== button.dataset.id; }); save(); render(); toast('Ausencia eliminada.'); }
    else if (action === 'delete-doctor') {
      var doctor = state.doctors.find(function (person) { return person.id === button.dataset.id; });
      if (!doctor) return;
      openModal('Quitar médico', '<p>Se quitará a <strong>' + h(doctorLabel(doctor)) + '</strong> del equipo.</p><div class="action-row"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button danger" data-action="confirm-delete-doctor" data-id="' + h(doctor.id) + '">Quitar del equipo</button></div>');
    } else if (action === 'confirm-delete-doctor') {
      try { engine.removeDoctor(state, button.dataset.id); save(); closeModal(); render(); toast('Médico eliminado del equipo.'); }
      catch (error) { toast(error.message); }
    } else if (action === 'confirm-group-count') {
      try { changeGroupCount(Number(button.dataset.count), true); }
      catch (error) { toast(error.message); }
    }
  });
  function captureAbsenceDraft(form) {
    if (!form) return;
    var data = new FormData(form);
    ['doctorId', 'coverDoctorId', 'residentId', 'start', 'end', 'note'].forEach(function (field) { if (data.has(field)) ui.absenceDraft[field] = String(data.get(field)); });
  }
  document.addEventListener('change', function (event) {
    var input = event.target;
    try {
      if (input.name === 'destination' && input.closest('[data-form="r1-priorities"]')) {
        var doctorField = input.closest('form').querySelector('.r1-doctor-field');
        var doctorInput = doctorField.querySelector('select');
        doctorField.hidden = input.value !== 'doctor'; doctorInput.disabled = input.value !== 'doctor'; doctorInput.required = input.value === 'doctor';
      } else if (input.hasAttribute('data-existing-resident')) {
        var fields = input.closest('form').querySelector('.resident-add-fields');
        fields.hidden = !!input.value;
        fields.querySelectorAll('input, select, textarea').forEach(function (field) { field.disabled = !!input.value; });
      } else if (input.closest('#add-absence')) {
        captureAbsenceDraft(input.closest('form'));
        if (input.name === 'personType') { ui.absenceType = input.value; render(); }
        else if (input.name === 'doctorId' || input.name === 'coverDoctorId') {
          var label = app.querySelector('[data-selection-label="' + input.name + '"]');
          var person = state.doctors.find(function (doctor) { return doctor.id === input.value; });
          if (label) label.textContent = person ? doctorLabel(person) : 'Sin cobertura';
        }
      } else if (input.id === 'create-date' && input.value) {
        if (!engine.validDateRange(input.value, input.value)) throw new Error('Elige una fecha válida entre 1900 y 2200.');
        ui.date = input.value; render();
      } else if (input.dataset.setting) { state.settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value; save(); render(); }
      else if (input.dataset.dayDoctor) {
        var doctorId = input.dataset.dayDoctor;
        var field = input.dataset.dayField;
        var value = field === 'excluded' ? input.checked : input.value;
        state.dailyOverrides[ui.date] = state.dailyOverrides[ui.date] || {};
        var override = state.dailyOverrides[ui.date][doctorId] = state.dailyOverrides[ui.date][doctorId] || {};
        override[field] = value;
        if (field === 'service') { delete override.operatingRoomPrevious; if (value !== 'qx') { delete override.room; delete override.roomOrder; } }
        save(); render();
      } else if (input.id === 'guard-count') changeGroupCount(Number(input.value), false);
      else if (input.dataset.dutyField) {
        var guardSelection = app.querySelector('[data-duty-field="guardGroupId"]');
        var referenceDate = document.getElementById('duty-reference-date');
        engine.setDutyReference(state, guardSelection.value, referenceDate.value); save(); render();
      }
      else if (input.id === 'backup-file' && input.files && input.files[0]) {
        var file = input.files[0];
        if (file.size > 5000000) { toast('El archivo es demasiado grande para un respaldo de Rolero.'); input.value = ''; return; }
        var reader = new FileReader(); reader.onload = function () { window.onBackupRestored(String(reader.result)); }; reader.onerror = function () { toast('No se pudo leer el archivo.'); };
        reader.readAsText(file); input.value = '';
      }
    } catch (error) { toast(error.message || 'Revisa el valor antes de continuar.'); }
  });
  document.addEventListener('input', function (event) {
    if (event.target.closest('#add-absence')) captureAbsenceDraft(event.target.closest('form'));
    if (event.target.id === 'preview-text') {
      ui.preview = event.target.value; ui.previewEdited = true;
    }
  });
  document.addEventListener('submit', function (event) {
    var element = event.target;
    if (!(element instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (!element.reportValidity()) return;
    var form = new FormData(element);
    try {
      if (element.dataset.form === 'r1-priorities') {
        var destination = String(form.get('destination') || '');
        if (!destination) engine.resetR1Priorities(state, element.dataset.key, element.dataset.shift);
        else engine.setR1Priorities(state, element.dataset.key, element.dataset.shift, [destination === 'doctor' ? 'doctor:' + String(form.get('doctorId') || '') : destination]);
        save(); render(); toast('Rol de R1 guardado.');
      } else if (element.dataset.form === 'qx-room') {
        engine.setOperatingRoom(state, { date: ui.date, shift: ui.shift, doctorId: String(form.get('doctorId') || ''), room: Number(element.dataset.room) });
        save(); render(); toast('Médico asignado a la sala.');
      } else if (element.id === 'add-doctor') {
        var name = String(form.get('name') || '').trim(); if (!name) return;
        state.doctors.push({ id: id('doctor'), name: name, title: form.get('title'), shift: form.get('shift'), schedule: DAYS.map(function (_, index) { return form.get('day' + index); }), residents: [] });
        save(); closeModal(); render(); toast('Médico añadido.');
      } else if (element.dataset.form === 'doctor') {
        var doctor = state.doctors.find(function (person) { return person.id === element.dataset.id; });
        var updatedName = String(form.get('name') || '').trim(); if (!updatedName) throw new Error('Escribe el nombre del médico.');
        doctor.name = updatedName; doctor.title = form.get('title');
        doctor.schedule = DAYS.map(function (_, index) { return form.get('day' + index); });
        save(); render(); toast('Rol semanal guardado.');
      } else if (element.id === 'add-absence') {
        var type = String(form.get('personType'));
        engine.registerAbsence(state, { id: id('absence'), personType: type, personId: String(form.get(type === 'doctor' ? 'doctorId' : 'residentId') || ''), coverDoctorId: type === 'doctor' ? String(form.get('coverDoctorId') || '') : '', start: form.get('start'), end: form.get('end'), note: String(form.get('note') || '').trim() });
        ui.absenceDraft = { doctorId: '', coverDoctorId: '', residentId: '', start: '', end: '', note: '' };
        save(); render(); toast('Ausencia registrada.');
      } else if (element.dataset.form === 'guard-name') {
        var groupName = String(form.get('name') || '').trim();
        if (!groupName) throw new Error('Escribe el nombre de la guardia.');
        var group = state.guardGroups.find(function (item) { return item.id === element.dataset.id; });
        if (!group) throw new Error('No existe esa guardia.');
        group.name = groupName; save(); render(); toast('Nombre de la guardia guardado.');
      } else if (element.dataset.form === 'add-resident') {
        var existingKey = String(form.get('existingKey') || '');
        var entry = { guardGroupId: element.dataset.group };
        if (existingKey) entry.existingKey = existingKey;
        else { entry.name = String(form.get('name') || '').trim(); entry.grade = Number(form.get('grade')); entry.doctorIds = formDoctorIds(form); }
        engine.addResident(state, entry); save(); render(); toast('Integrante añadido.');
      } else if (element.dataset.form === 'resident') {
        var residentUpdate = { name: String(form.get('name') || '').trim(), grade: Number(form.get('grade')), guardGroupId: String(form.get('guardGroupId') || ''), doctorIds: formDoctorIds(form) };
        engine.updateResident(state, element.dataset.key, residentUpdate);
        rememberResidentDetails(element.dataset.key, engine.personKey(residentUpdate));
        save(); render(); toast('Residente guardado.');
      }
    } catch (error) { toast(error.message || 'Revisa los datos e intenta de nuevo.'); }
  });
  document.getElementById('modal').addEventListener('click', function (event) { if (event.target === event.currentTarget) closeModal(); });
  document.addEventListener('keydown', function (event) {
    var modal = document.getElementById('modal');
    if (modal.hidden) return;
    if (event.key === 'Escape') { closeModal(); return; }
    if (event.key === 'Tab') {
      var focusable = Array.from(modal.querySelectorAll('button:not(:disabled), input, select, textarea, [tabindex="0"]'));
      var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.RoleroUI = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    render: render,
    storageKey: STORAGE_KEY,
    handleBack: function () {
      if (!document.getElementById('modal').hidden) { closeModal(); return true; }
      if (ui.tab !== 'crear') { ui.tab = 'crear'; render(); window.scrollTo(0, 0); return true; }
      return false;
    }
  };
  try {
    if (!engine || !window.ROLERO_DEFAULTS) throw new Error('No se encontraron los datos iniciales de la aplicación.');
    var saved = localStorage.getItem(STORAGE_KEY);
    try {
      var loaded = saved ? JSON.parse(saved) : cloneDefaults();
      var needsDutyAnchor = !loaded.dutySelection || !Object.prototype.hasOwnProperty.call(loaded.dutySelection, 'referenceDate');
      state = normalize(loaded);
      if (!saved || needsDutyAnchor) save();
    }
    catch (error) { state = normalize(cloneDefaults()); toast('No se pudo cargar el respaldo local. Se muestran los datos iniciales.'); }
    render();
  } catch (error) {
    app.innerHTML = '<div class="error-card"><h2>No se pudo abrir Rolero</h2><p>' + h(error.message) + '</p><p>Cierra y vuelve a abrir la aplicación. Si el problema continúa, conserva tu respaldo antes de reinstalar.</p></div>';
  }
})();
