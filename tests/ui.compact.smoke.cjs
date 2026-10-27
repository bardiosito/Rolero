const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const out = path.resolve('qa/compact');
const url = pathToFileURL(path.resolve('app/src/main/assets/index.html')).href;
const storageKey = 'rolero-state-v1';
const monday = '2026-10-26';
const floorReminder = '(Resto de r1 al terminar actividades)';
const passed = [], errors = [], diagnostics = [], cleanupErrors = [];
let browser, page, originalEntries, failure = null, currentStep = '';
fs.mkdirSync(out, { recursive: true });

function report() {
  fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify({
    version: '1.2.0', schemaVersion: 3, platform: 'Edge headless',
    passed, errors, diagnostics, currentStep, failure, cleanupErrors,
    success: !failure && !errors.length && !cleanupErrors.length
  }, null, 2));
}
async function ready() {
  await page.waitForFunction(() => !!window.RoleroUI);
  assert.equal(await page.locator('.error-card').count(), 0);
  await page.locator('#create-date').waitFor();
}
async function check(name, action) {
  currentStep = name; report(); console.log('TEST UI:', name);
  await action(); passed.push(name); currentStep = ''; report(); console.log('PASS UI:', name);
}
const state = () => page.evaluate(() => RoleroUI.getState());
const tab = name => page.locator('.bottom-nav [data-tab="' + name + '"]').click();
const detail = name => page.locator('details[data-detail="' + name + '"]');
async function open(name) {
  const node = detail(name);
  if (!await node.evaluate(el => el.open)) await node.locator('summary').first().click();
}
async function setDate(value) {
  await page.locator('#create-date').fill(value);
  await page.locator('#create-date').dispatchEvent('change');
}
async function shift(value) { await page.locator('[data-action="shift"][data-shift="' + value + '"]').click(); }
async function loadFixture(value) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value });
  await page.reload(); await ready(); await setDate(monday);
}
async function reset() {
  const defaults = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS)));
  await loadFixture(defaults);
}
async function preview() { return page.locator('#preview-text').inputValue(); }
async function setGroup(id, members) {
  await open('guard-' + id);
  const form = page.locator('form[data-form="guard-group"][data-id="' + id + '"]');
  await form.locator('[name="members"]').fill(members);
  await form.locator('[type="submit"]').click();
}
async function selectDoctor(field, id, selectedShift) {
  await open(field === 'doctorId' ? 'absence-doctor' : 'absence-cover');
  await open((field === 'doctorId' ? 'absence-doctor-' : 'absence-cover-') + selectedShift);
  await page.locator('#add-absence [name="' + field + '"][value="' + id + '"]').check();
}
async function fillAbsence(start, end, note) {
  const form = page.locator('#add-absence');
  await form.locator('[name="start"]').fill(start);
  await form.locator('[name="end"]').fill(end);
  await form.locator('[name="note"]').fill(note);
  await form.locator('[type="submit"]').click();
}
async function removeDoctor(id) {
  await open('roster-' + id);
  await page.locator('[data-action="delete-doctor"][data-id="' + id + '"]').click();
  await page.locator('[data-action="confirm-delete-doctor"][data-id="' + id + '"]').click();
}
async function screenshot(name) {
  try { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); }
  catch (error) { diagnostics.push('Captura ' + name + ': ' + error.message); }
}
async function assertFits(label) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  if (geometry.scroll > geometry.width + 1) {
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).map(el => {
      const rect = el.getBoundingClientRect();
      return { tag: el.tagName, id: el.id, className: String(el.className), left: rect.left, right: rect.right };
    }).filter(el => el.right > innerWidth + 1 || el.left < -1).slice(0, 30));
    fs.writeFileSync(path.join(out, 'overflow.json'), JSON.stringify({ label, geometry, overflow }, null, 2));
    await screenshot('overflow');
  }
  assert.ok(geometry.scroll <= geometry.width + 1, label + ': desborde horizontal ' + JSON.stringify(geometry));
}
async function restoreOriginal() {
  if (!originalEntries || !browser) return;
  if (!page || page.isClosed()) { page = await browser.newPage(); await page.goto(url); }
  await page.evaluate(entries => {
    localStorage.clear(); Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
  }, originalEntries);
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), originalEntries);
}

(async () => {
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-MX', timezoneId: 'America/Hermosillo' });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.nativeCalls = [];
      window.Android = {
        copyText: text => nativeCalls.push({ action: 'copy', text }),
        shareText: text => nativeCalls.push({ action: 'share', text }),
        saveBackup: text => nativeCalls.push({ action: 'backup', text })
      };
    });
    await page.goto(url); await ready();
    originalEntries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    await reset();

    await check('Crear compacto: organización cerrada, médicos visibles y acciones inmediatas', async () => {
      const s = await state();
      assert.equal(s.schemaVersion, 3); assert.equal(s.doctors.length, 18);
      assert.deepEqual(s.guardGroups.map(g => [g.id, g.members.length]), [['A', 0], ['B', 0], ['C', 0], ['D', 0]]);
      assert.equal(await detail('organize-turn').evaluate(el => el.open), false);
      assert.equal(await page.locator('[data-duty-field="guardGroupId"]').count(), 0);
      assert.equal(await page.locator('[data-action="preview"], .mobile-preview-link, #confirm-role, .preview-meta, #char-count, .warn-details, .history, [data-action="save-history"], [data-setting="showDoctors"], [data-setting="includeGuards"], [data-setting="excludePostGuard"]').count(), 0);
      assert.equal((await page.locator('.preview-head').innerText()).trim(), 'Vista previa');
      assert.match(await preview(), /Dr\. Montoya/);
      for (const action of ['copy', 'share']) {
        const button = page.locator('.preview-card [data-action="' + action + '"]');
        assert.equal(await button.isEnabled(), true); await button.click();
      }
      const calls = await page.evaluate(() => nativeCalls.filter(c => c.action === 'copy' || c.action === 'share'));
      assert.deepEqual(calls.map(c => c.action), ['copy', 'share']);
      const expected = await preview();
      calls.forEach(call => assert.equal(call.text, expected));
    });

    await check('Recordatorio de Piso y edición del texto se copian sin confirmación', async () => {
      const control = page.locator('#floor-r1-switch');
      assert.equal(await control.isChecked(), false); assert.doesNotMatch(await preview(), /Resto de r1/);
      await control.check(); assert.ok((await preview()).includes(floorReminder));
      assert.equal((await state()).settings.floorR1Reminder, true);
      await page.locator('.preview-card [data-action="copy"]').click();
      assert.ok(await page.evaluate(text => nativeCalls.filter(c => c.action === 'copy').at(-1).text.includes(text), floorReminder));
      await page.locator('#floor-r1-switch').uncheck(); assert.ok(!(await preview()).includes(floorReminder));
      const edited = (await preview()) + '\nNota editada para QA';
      await page.locator('#preview-text').fill(edited);
      await page.locator('.preview-card [data-action="copy"]').click();
      assert.equal(await page.evaluate(() => nativeCalls.filter(c => c.action === 'copy').at(-1).text), edited);
    });

    await check('Equipo abre con Texto del turno y turnos cerrados, sin estadísticas ni apoyos editables', async () => {
      await reset(); await tab('equipo');
      for (const name of ['team-report', 'team-matutino', 'team-vespertino', 'absences']) assert.equal(await detail(name).evaluate(el => el.open), false, name);
      const reportBox = await detail('team-report').boundingBox();
      const morningBox = await detail('team-matutino').boundingBox();
      assert.ok(reportBox.y < morningBox.y);
      assert.equal(await page.locator('.stat-strip, .legend, .info-banner, [data-form="support"], #add-support, [data-floor-note], #mobile-form, .mobile-pair, [data-duty-field="guardGroupId"]').count(), 0);
      await open('team-report'); assert.match(await page.locator('#team-preview-text').inputValue(), /Dr\. Montoya/);
      await detail('team-report').locator('[data-action="copy"]').click();
      assert.equal(await page.evaluate(() => nativeCalls.filter(c => c.action === 'copy').at(-1).text), await page.locator('#team-preview-text').inputValue());
      await open('team-matutino'); await open('roster-montoya');
      const roster = detail('roster-montoya');
      assert.match(await roster.locator('summary').first().innerText(), /Dr\. Montoya[\s\S]*Márquez R2/);
      const form = roster.locator('form[data-form="doctor"]');
      assert.equal(await form.locator('[name="name"]').count(), 1); assert.equal(await form.locator('[name="title"]').count(), 1);
      assert.equal(await form.locator('select[name^="day"]').count(), 5);
      assert.equal(await form.locator('[name="shift"], [name="residents"]').count(), 0);
    });

    await check('Añadir y quitar médicos conserva el turno elegido', async () => {
      for (const selectedShift of ['matutino', 'vespertino']) {
        await open('team-' + selectedShift);
        await page.locator('[data-action="add-doctor"][data-shift="' + selectedShift + '"]').click();
        const form = page.locator('#add-doctor');
        assert.equal(await form.locator('[name="shift"]').inputValue(), selectedShift);
        assert.equal(await form.locator('select[name^="day"]').count(), 5);
        await form.locator('[name="title"]').selectOption('Dra.');
        const name = 'Prueba ' + selectedShift;
        await form.locator('[name="name"]').fill(name); await form.locator('[type="submit"]').click();
        const doctor = (await state()).doctors.find(d => d.name === name);
        assert.ok(doctor); assert.equal(doctor.shift, selectedShift); assert.equal(doctor.title, 'Dra.');
        await removeDoctor(doctor.id); assert.equal((await state()).doctors.some(d => d.id === doctor.id), false);
      }
    });

    await check('El último médico también se puede quitar y el equipo vacío persiste', async () => {
      const s = await state(); s.doctors = [s.doctors.find(d => d.id === 'montoya')]; s.absences = []; s.dailyOverrides = {};
      await loadFixture(s); await tab('equipo'); await open('team-matutino'); await removeDoctor('montoya');
      assert.deepEqual((await state()).doctors, []);
      await page.reload(); await ready(); assert.deepEqual((await state()).doctors, []);
      assert.equal(await page.locator('.preview-card [data-action="copy"]').isEnabled(), true);
    });

    await check('Cobertura médica conserva la actividad propia del cobertor y hereda residentes', async () => {
      await reset(); await tab('equipo'); await open('absences');
      assert.equal(await page.locator('#add-absence [name="personType"][value="doctor"]').isChecked(), true);
      for (const name of ['absence-doctor', 'absence-cover']) assert.equal(await detail(name).evaluate(el => el.open), false);
      await selectDoctor('doctorId', 'montoya', 'matutino');
      await selectDoctor('coverDoctorId', 'pardini', 'matutino');
      await fillAbsence(monday, monday, 'Cobertura Montoya → Pardini');
      const absence = (await state()).absences.at(-1);
      assert.equal(absence.personId, 'montoya'); assert.equal(absence.coverDoctorId, 'pardini');
      await tab('crear'); const text = await preview();
      assert.doesNotMatch(text, /Dr\. Montoya/);
      const lines = text.split('\n').filter(line => /Dr\. Pardini/.test(line));
      assert.equal(lines.length, 2); assert.ok(lines.some(line => /Márquez R2/.test(line))); assert.ok(lines.some(line => /Rojo R2/.test(line)));
      assert.match(text, /Consulta[\s\S]*Dr\. Pardini[^\n]*Márquez R2/);
      assert.match(text, /Quirófano[\s\S]*Dr\. Pardini[^\n]*Rojo R2/);
      await tab('equipo'); await open('team-report');
      assert.equal(await page.locator('#team-preview-text').inputValue(), text);
      await detail('team-report').locator('[data-action="share"]').click();
      assert.equal(await page.evaluate(() => nativeCalls.filter(c => c.action === 'share').at(-1).text), text);
    });

    await check('Cobertor de otro turno aparece sin alterar su rol original', async () => {
      await reset(); await tab('equipo'); await open('absences');
      await selectDoctor('doctorId', 'montoya', 'matutino'); await selectDoctor('coverDoctorId', 'leyva', 'vespertino');
      await fillAbsence(monday, monday, 'Cobertura entre turnos');
      await tab('crear'); const morning = await preview();
      assert.doesNotMatch(morning, /Dr\. Montoya/); assert.match(morning, /Dr\. Leyva[^\n]*Márquez R2/);
      await shift('vespertino'); const afternoon = await preview();
      assert.match(afternoon, /Dr\. Leyva[^\n]*González R1/); assert.doesNotMatch(afternoon.split('\n').find(line => /Dr\. Leyva/.test(line)), /Márquez R2/);
    });

    await check('Ausencia de residente aplica a todas sus asignaciones y sólo al rango de fechas', async () => {
      await reset(); await tab('equipo'); await open('absences');
      await page.locator('#add-absence [name="personType"][value="resident"]').check();
      await page.locator('#add-absence [name="residentId"]').selectOption('ibarra|R2');
      await fillAbsence(monday, '2026-10-27', 'Ausencia por fechas');
      const absence = (await state()).absences.at(-1); assert.equal(absence.personType, 'resident'); assert.equal(absence.personId, 'ibarra|R2');
      await tab('crear'); assert.doesNotMatch(await preview(), /Ibarra R2/);
      await shift('vespertino'); assert.doesNotMatch(await preview(), /Ibarra R2/);
      await setDate('2026-10-28'); assert.match(await preview(), /Ibarra R2/);
      await shift('matutino'); assert.match(await preview(), /Ibarra R2/);
    });

    await check('Guardias concentra la selección actual y mantiene los grupos cerrados', async () => {
      await reset(); await tab('guardias');
      assert.equal(await page.locator('[data-duty-field="guardGroupId"]').count(), 1);
      assert.equal(await page.locator('#guard-count').inputValue(), '4');
      const selection = await page.locator('[data-duty-field="guardGroupId"]').boundingBox();
      const count = await page.locator('#guard-count').boundingBox(); assert.ok(count.y > selection.y);
      for (const id of ['A', 'B', 'C', 'D']) assert.equal(await detail('guard-' + id).evaluate(el => el.open), false);
      assert.equal(await page.locator('input[type="month"], .calendar, .stat-strip, .derived-guard, .postguard-box, #mobile-form, .mobile-pair, [data-action="mobile-shift"]').count(), 0);
      await setGroup('A', 'Integrante A R1'); await setGroup('D', 'Ibarra R2');
      await setGroup('A', 'Mayor R3'); assert.match(await page.locator('#toast').innerText(), /R1.*R2/);
      assert.equal((await state()).guardGroups[0].members[0].name, 'Integrante A');
      await setGroup('A', Array.from({ length: 11 }, (_, i) => 'Persona ' + i + ' R1').join(', '));
      assert.match(await page.locator('#toast').innerText(), /10/);
      await page.locator('[data-duty-field="guardGroupId"]').selectOption('A');
      await tab('crear'); assert.doesNotMatch(await preview(), /Ibarra R2/); assert.equal(await page.locator('[data-duty-field="guardGroupId"]').count(), 0);
      assert.equal((await state()).settings.excludePostGuard, true);
      await tab('guardias'); await page.locator('#guard-count').selectOption('6'); await setGroup('F', 'Integrante F R1');
      await page.locator('[data-duty-field="guardGroupId"]').selectOption('F'); await page.locator('#guard-count').selectOption('3');
      assert.equal(await page.locator('#modal').isVisible(), true); assert.equal((await state()).guardGroups.length, 6);
      await page.locator('[data-action="confirm-group-count"]').click();
      assert.equal((await state()).guardGroups.length, 3); assert.equal((await state()).dutySelection.guardGroupId, 'A');
    });

    await check('Respaldo v3 conserva móviles y campos previos, con migración desde v2', async () => {
      const old = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS)));
      old.schemaVersion = 2; old.doctors[0].name = 'Nombre conservado'; old.guardGroups[0].members = [{ name: 'Móvil previo', grade: 2 }];
      old.mobileAssignments.matutino = [{ residentKey: 'movil previo|R2', fixedResidentKey: 'ibarra|R2' }];
      old.absences = [{ id: 'previa', personType: 'resident', personId: 'corral|R1', start: monday, end: monday, note: 'Conservar' }];
      old.dailyOverrides = { [monday]: { montoya: { room: 'Q5', residents: [{ name: 'Prueba', grade: 2 }] } } };
      old.history = [{ id: 'previo', date: monday, shift: 'matutino', text: 'Texto previo' }];
      old.settings = { ...old.settings, showDoctors: false, includeGuards: true, includeDate: true, excludePostGuard: false, floorNotes: { matutino: 'Nota previa', vespertino: 'Otra nota' } };
      delete old.settings.floorR1Reminder;
      await loadFixture(old); const migrated = await state();
      assert.equal(migrated.schemaVersion, 3);
      for (const key of ['doctors', 'guardGroups', 'mobileAssignments', 'absences', 'dailyOverrides', 'history', 'serviceRules']) assert.deepEqual(migrated[key], old[key], key);
      assert.deepEqual(migrated.settings.floorNotes, old.settings.floorNotes);
      assert.equal(migrated.settings.showDoctors, true); assert.equal(migrated.settings.includeGuards, false);
      assert.equal(migrated.settings.includeDate, false); assert.equal(migrated.settings.excludePostGuard, true); assert.equal(migrated.settings.floorR1Reminder, false);
      await page.locator('[data-action="tools"]').click(); await page.locator('[data-action="export"]').click();
      const backupText = await page.evaluate(() => nativeCalls.find(c => c.action === 'backup').text);
      assert.deepEqual(JSON.parse(backupText), migrated);
      await page.evaluate(text => onBackupRestored(text), backupText); await page.locator('[data-action="confirm-import"]').click();
      assert.deepEqual(await state(), migrated);
      await page.reload(); await ready(); assert.deepEqual(await state(), migrated);
    });

    await check('Migración de esquema v1 conserva el calendario anterior dentro del respaldo', async () => {
      const old = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS)));
      old.schemaVersion = 1; delete old.guardGroups; delete old.dutySelection; delete old.mobileAssignments; delete old.settings.floorR1Reminder;
      old.doctors[0].name = 'Nombre v1'; old.history = [{ id: 'viejo', text: 'Texto v1' }];
      old.guards = { '2026-10': { confirmed: true, groups: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }, days: { 1: [{ name: 'Uno', grade: 1 }], 2: [{ name: 'Dos', grade: 2 }], 3: [{ name: 'Tres', grade: 1 }], 4: [{ name: 'Cuatro', grade: 2 }] } } };
      old.manualGuards = {};
      await loadFixture(old); const migrated = await state();
      assert.equal(migrated.schemaVersion, 3); assert.equal(migrated.doctors[0].name, 'Nombre v1'); assert.equal(migrated.history[0].text, 'Texto v1');
      assert.equal(migrated.guardGroups[0].members[0].name, 'Uno'); assert.deepEqual(migrated.legacyGuardData, { guards: old.guards, manualGuards: {} });
      assert.equal(migrated.settings.showDoctors, true); assert.equal(migrated.settings.includeGuards, false); assert.equal(migrated.settings.excludePostGuard, true);
    });

    await check('Diseño sin desbordes de 360 a 1440 píxeles', async () => {
      await reset();
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const selectedTab of ['crear', 'equipo', 'guardias']) {
          await tab(selectedTab); await assertFits(selectedTab + ' ' + width);
          if (selectedTab === 'crear') { await open('organize-turn'); await open('day-montoya'); }
          else if (selectedTab === 'equipo') { await open('team-matutino'); await open('roster-montoya'); await open('absences'); await open('absence-doctor'); await open('absence-doctor-matutino'); }
          else await open('guard-A');
          await assertFits(selectedTab + ' abierto ' + width);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 }); await tab('crear'); await screenshot('crear-mobile');
      await tab('equipo'); await screenshot('equipo-mobile'); await tab('guardias'); await screenshot('guardias-mobile');
      await page.setViewportSize({ width: 1440, height: 1000 }); await tab('crear'); await screenshot('crear-desktop');
    });
    assert.deepEqual(errors, []); console.log('UI compact checks passed:', passed.length);
  } catch (error) {
    failure = { step: currentStep, message: error.message, stack: error.stack };
    console.error(error); process.exitCode = 1;
    if (page && !page.isClosed()) await screenshot('failure');
  } finally {
    try { await restoreOriginal(); } catch (error) { cleanupErrors.push('Restauración localStorage: ' + error.message); process.exitCode = 1; }
    try { if (browser) await browser.close(); } catch (error) { cleanupErrors.push('Cierre del navegador: ' + error.message); process.exitCode = 1; }
    report();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
