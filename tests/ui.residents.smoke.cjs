const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const out = path.resolve('qa/residents');
const url = pathToFileURL(path.resolve('app/src/main/assets/index.html')).href;
const storageKey = 'rolero-state-v1';
const monday = '2026-10-26';
const passed = [], errors = [], diagnostics = [], cleanupErrors = [];
let browser, page, originalEntries, currentStep = '', failure = null;
fs.mkdirSync(out, { recursive: true });
function report() {
  fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify({ version: '1.3.0', schemaVersion: 3, platform: 'Edge headless', passed, errors, diagnostics, cleanupErrors, currentStep, failure, success: !failure && !errors.length && !cleanupErrors.length }, null, 2));
}
async function ready() { await page.waitForFunction(() => !!window.RoleroUI); assert.equal(await page.locator('.error-card').count(), 0); await page.locator('#create-date').waitFor(); }
async function check(name, action) { currentStep = name; report(); console.log('TEST UI:', name); await action(); passed.push(name); currentStep = ''; report(); console.log('PASS UI:', name); }
const state = () => page.evaluate(() => RoleroUI.getState());
const defaults = () => page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS)));
const roster = () => page.evaluate(() => Rolero.residentRoster(RoleroUI.getState()));
const tab = name => page.locator('.bottom-nav [data-tab="' + name + '"]').click();
const detail = name => page.locator('details[data-detail="' + name + '"]');
const residentForm = key => page.locator('form[data-form="resident"][data-key="' + key + '"]');
const encoded = key => encodeURIComponent(key);
async function open(name) { const node = detail(name); if (!await node.evaluate(el => el.open)) await node.locator('summary').first().click(); }
async function close(name) { const node = detail(name); if (await node.evaluate(el => el.open)) await node.locator('summary').first().click(); }
async function setDate(value) { await page.locator('#create-date').fill(value); await page.locator('#create-date').dispatchEvent('change'); }
async function shift(value) { await page.locator('[data-action="shift"][data-shift="' + value + '"]').click(); }
async function fixture(value) { await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value }); await page.reload(); await ready(); await setDate(monday); }
async function reset() { await fixture(await defaults()); }
async function preview() { return page.locator('#preview-text').inputValue(); }
async function addExisting(group, key) {
  await open('guard-' + group); await open('add-resident-' + group);
  const form = page.locator('form[data-form="add-resident"][data-group="' + group + '"]');
  await form.locator('[name="existingKey"]').selectOption(key); await form.locator('[type="submit"]').click();
}
async function newResident(group, name, grade, doctorIds = {}) {
  await open('guard-' + group); await open('add-resident-' + group);
  const form = page.locator('form[data-form="add-resident"][data-group="' + group + '"]');
  await form.locator('[name="existingKey"]').selectOption(''); await form.locator('[name="name"]').fill(name); await form.locator('[name="grade"]').selectOption(String(grade));
  if (Object.keys(doctorIds).length) {
    await open('assignment-new-' + group);
    for (const [selectedShift, ids] of Object.entries(doctorIds)) {
      await open('assignment-new-' + group + '-' + selectedShift);
      for (const id of ids) await form.locator('[name="doctor-' + selectedShift + '"][value="' + id + '"]').check();
    }
  }
  await form.locator('[type="submit"]').click();
}
async function richFixture(grade = 1) {
  const s = await defaults(), person = { name: 'Ciclo QA', grade }, key = 'ciclo qa|R' + grade;
  for (const id of ['montoya', 'torres', 'leyva']) s.doctors.find(d => d.id === id).residents.push({ ...person });
  s.serviceRules[0].residents.push({ ...person, startDay: 1, endDay: 31 });
  s.dailyOverrides = { [monday]: { montoya: { service: 'consulta', room: 'Q5', residents: [{ ...person }, { name: 'Mayor intacto', grade: 4 }] } } };
  s.guardGroups[0].members = [{ ...person }]; s.guardGroups[1].members = [{ name: 'Otro móvil', grade: 2 }]; s.guardGroups[2].members = [{ name: 'Reserva QA', grade: 1 }];
  s.absences = [{ id: 'ausencia-ciclo', personType: 'resident', personId: key, start: '2026-11-01', end: '2026-11-02', note: 'Conservar rango' }];
  s.mobileAssignments = { matutino: [{ residentKey: key, fixedResidentKey: 'ibarra|R2' }, { residentKey: 'reserva qa|R1', fixedResidentKey: 'corral|R1' }], vespertino: [{ residentKey: 'otro movil|R2', fixedResidentKey: key }] };
  s.history = [{ id: 'historico', date: monday, shift: 'matutino', text: 'Ciclo QA R' + grade + ' / Texto ya compartido' }];
  s.legacyGuardData = { guards: { anotacion: 'Ciclo QA R' + grade }, manualGuards: {} };
  return s;
}
function allPeople(s) {
  return s.doctors.flatMap(d => d.residents).concat(s.serviceRules.flatMap(r => r.residents), s.guardGroups.flatMap(g => g.members), Object.values(s.dailyOverrides).flatMap(day => Object.values(day).flatMap(o => o.residents || [])));
}
function assertRetired(s, original) {
  assert.ok(!allPeople(s).some(p => p.name === 'Ciclo QA'));
  assert.ok(!s.absences.some(a => a.personType === 'resident' && /^ciclo qa\|R/.test(a.personId)));
  assert.ok(!Object.values(s.mobileAssignments).flat().some(p => /^ciclo qa\|R/.test(p.residentKey) || /^ciclo qa\|R/.test(p.fixedResidentKey)));
  assert.deepEqual(s.mobileAssignments.matutino, [{ residentKey: 'reserva qa|R1', fixedResidentKey: 'corral|R1' }]);
  assert.deepEqual(s.history, original.history); assert.deepEqual(s.legacyGuardData, original.legacyGuardData);
  assert.ok(allPeople(s).some(p => p.name === 'Mayor intacto' && p.grade === 4));
}
async function screenshot(name) { try { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); } catch (error) { diagnostics.push('Captura ' + name + ': ' + error.message); } }
async function assertFits(label) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  if (size.scroll > size.width + 1) { await screenshot('overflow'); fs.writeFileSync(path.join(out, 'overflow.json'), JSON.stringify({ label, size }, null, 2)); }
  assert.ok(size.scroll <= size.width + 1, label + ': ' + JSON.stringify(size));
}
async function restoreOriginal() {
  if (!originalEntries || !browser) return;
  if (!page || page.isClosed()) { page = await browser.newPage(); await page.goto(url); }
  await page.evaluate(entries => { localStorage.clear(); Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value)); }, originalEntries);
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), originalEntries);
}

(async () => {
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-MX', timezoneId: 'America/Hermosillo' }); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.nativeCalls = []; window.Android = { copyText: text => nativeCalls.push({ action: 'copy', text }), shareText: text => nativeCalls.push({ action: 'share', text }), saveBackup: text => nativeCalls.push({ action: 'backup', text }) }; });
    await page.goto(url); await ready(); originalEntries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); await reset();

    await check('Crear y Equipo dejan la edición de residentes únicamente en Guardias', async () => {
      await open('organize-turn'); await open('day-montoya');
      assert.equal(await page.locator('textarea[data-day-field="residents"], [name="residents"], [data-form="resident"]').count(), 0);
      assert.match(await detail('day-montoya').locator('summary').first().innerText(), /Márquez R2/);
      assert.equal(await page.locator('.preview-card [data-action="copy"]').isEnabled(), true); await page.locator('.preview-card [data-action="copy"]').click();
      assert.equal(await page.evaluate(() => nativeCalls.at(-1).text), await preview());
      await tab('equipo'); assert.equal(await page.locator('[data-detail="team-report"], #team-preview-text, .preview-card, [data-action="copy"], [data-action="share"]').count(), 0);
      await open('team-matutino'); await open('roster-montoya'); assert.equal(await page.locator('[name="residents"], [data-form="resident"]').count(), 0);
      await page.locator('[data-action="add-doctor"][data-shift="matutino"]').click(); assert.equal(await page.locator('#add-doctor [name="residents"]').count(), 0);
      await page.locator('#add-doctor [name="name"]').fill('Nuevo sin residentes'); await page.locator('#add-doctor [type="submit"]').click();
      assert.deepEqual((await state()).doctors.find(d => d.name === 'Nuevo sin residentes').residents, []);
    });

    await check('Catorce residentes existentes sin guardia y nombre de guardia persistente', async () => {
      await reset(); await tab('guardias'); const initial = await roster(); assert.equal(initial.length, 14); assert.ok(initial.every(p => !p.guardGroupId));
      for (const id of ['A', 'B', 'C', 'D']) assert.equal(await detail('guard-' + id).evaluate(el => el.open), false);
      assert.equal(await detail('residents-ungrouped').evaluate(el => el.open), false); assert.equal(await page.locator('textarea').count(), 0);
      await open('guard-A'); const form = page.locator('form[data-form="guard-name"][data-id="A"]'); assert.match(await form.innerText(), /Nombre de la guardia/);
      await form.locator('[name="name"]').fill('Guardia de prueba'); await form.locator('[type="submit"]').click();
      assert.equal(await page.locator('[data-duty-field="guardGroupId"] option[value="A"]').innerText(), 'Guardia de prueba');
      await page.reload(); await ready(); await tab('guardias'); assert.equal((await state()).guardGroups[0].name, 'Guardia de prueba');
      assert.equal(await page.locator('[data-duty-field="guardGroupId"] option[value="A"]').innerText(), 'Guardia de prueba');
    });

    await check('Alta R1 con médicos matutino y vespertino aparece en ambos textos', async () => {
      await reset(); await tab('guardias'); await newResident('A', 'Nuevo QA', 1, { matutino: ['montoya'], vespertino: ['leyva'] });
      const person = (await roster()).find(p => p.key === 'nuevo qa|R1'); assert.ok(person); assert.equal(person.guardGroupId, 'A'); assert.deepEqual(person.doctorIds, { matutino: ['montoya'], vespertino: ['leyva'] });
      await tab('crear'); assert.match(await preview(), /Dr\. Montoya[^\n]*Nuevo QA R1/); await shift('vespertino'); assert.match(await preview(), /Dr\. Leyva[^\n]*Nuevo QA R1/);
      await page.locator('.preview-card [data-action="share"]').click(); assert.equal(await page.evaluate(() => nativeCalls.at(-1).text), await preview());
    });

    await check('Agregar existente conserva todas sus combinaciones y la postguardia usa su grupo', async () => {
      await reset(); const before = await state(); await tab('guardias'); await open('guard-A'); await open('add-resident-A');
      const form = page.locator('form[data-form="add-resident"][data-group="A"]'); assert.equal(await form.locator('[name="existingKey"] option').count(), 15);
      await form.locator('[name="existingKey"]').selectOption('ibarra|R2'); assert.equal(await form.locator('.resident-add-fields').isVisible(), false);
      assert.equal(await form.locator('[name="name"]').isDisabled(), true); await form.locator('[type="submit"]').click();
      const s = await state(); assert.deepEqual(s.doctors, before.doctors); assert.deepEqual(s.serviceRules, before.serviceRules); assert.equal((await roster()).length, 14);
      assert.deepEqual(s.guardGroups[0].members, [{ name: 'Ibarra', grade: 2 }]);
      await page.locator('[data-duty-field="guardGroupId"]').selectOption('B'); await tab('crear'); assert.doesNotMatch(await preview(), /Ibarra R2/);
      await shift('vespertino'); assert.doesNotMatch(await preview(), /Ibarra R2/);
    });

    await check('Asignaciones múltiples se guardan con paneles cerrados y al renombrar', async () => {
      await reset(); await tab('guardias'); await addExisting('A', 'ibarra|R2'); await open('resident-' + encoded('ibarra|R2'));
      const form = residentForm('ibarra|R2'); await open('assignment-' + encoded('ibarra|R2'));
      for (const selectedShift of ['matutino', 'vespertino']) await open('assignment-' + encoded('ibarra|R2') + '-' + selectedShift);
      assert.equal(await form.locator('[name="doctor-matutino"][value="cerda"]').isChecked(), true); assert.equal(await form.locator('[name="doctor-vespertino"][value="salgado"]').isChecked(), true);
      for (const id of ['montoya', 'torres']) await form.locator('[name="doctor-matutino"][value="' + id + '"]').check();
      await form.locator('[name="doctor-vespertino"][value="leyva"]').check(); await close('assignment-' + encoded('ibarra|R2'));
      await form.locator('[type="submit"]').click(); await residentForm('ibarra|R2').locator('[name="name"]').fill('Ibarra editado'); await residentForm('ibarra|R2').locator('[type="submit"]').click();
      const person = (await roster()).find(p => p.key === 'ibarra editado|R2');
      assert.deepEqual(person.doctorIds.matutino, ['montoya', 'torres', 'cerda']); assert.deepEqual(person.doctorIds.vespertino, ['leyva', 'salgado']);
      assert.equal(await detail('resident-' + encoded(person.key)).evaluate(el => el.open), true);
      await open('assignment-' + encoded(person.key)); await open('assignment-' + encoded(person.key) + '-matutino');
      const saved = residentForm(person.key); assert.equal(await saved.locator('[name="doctor-matutino"]:checked').count(), 3); assert.equal(await saved.locator('[name="doctor-vespertino"]:checked').count(), 2);
      assert.ok(!(await roster()).some(p => p.key === 'ibarra|R2'));
    });

    await check('Ascender R1 a R2 actualiza todas las referencias activas y conserva rangos e historial', async () => {
      const original = await richFixture(); await fixture(original); await tab('guardias'); await open('guard-A'); await open('resident-' + encoded('ciclo qa|R1'));
      await residentForm('ciclo qa|R1').locator('[data-action="promote-resident"]').click(); const s = await state();
      assert.ok(allPeople(s).filter(p => p.name === 'Ciclo QA').every(p => p.grade === 2)); assert.ok(!allPeople(s).some(p => p.name === 'Ciclo QA' && p.grade === 1));
      assert.equal(s.absences[0].personId, 'ciclo qa|R2'); assert.equal(s.mobileAssignments.matutino[0].residentKey, 'ciclo qa|R2'); assert.equal(s.mobileAssignments.vespertino[0].fixedResidentKey, 'ciclo qa|R2');
      assert.deepEqual(s.serviceRules[0].residents.find(p => p.name === 'Ciclo QA'), { name: 'Ciclo QA', grade: 2, startDay: 1, endDay: 31 });
      assert.equal(s.dailyOverrides[monday].montoya.room, 'Q5'); assert.deepEqual(s.history, original.history); assert.deepEqual(s.legacyGuardData, original.legacyGuardData);
      assert.equal(await detail('resident-' + encoded('ciclo qa|R2')).evaluate(el => el.open), true);
    });

    await check('Ascender R2 a R3 exige confirmar y retira sólo los datos activos de esa persona', async () => {
      const original = await richFixture(2); await fixture(original); await tab('guardias'); await open('guard-A'); await open('resident-' + encoded('ciclo qa|R2'));
      await residentForm('ciclo qa|R2').locator('[data-action="promote-resident"]').click(); assert.equal(await page.locator('#modal').isVisible(), true); assert.deepEqual(await state(), original);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.deepEqual(await state(), original);
      await residentForm('ciclo qa|R2').locator('[data-action="promote-resident"]').click(); await page.locator('[data-action="confirm-retire-resident"][data-key="ciclo qa|R2"]').click();
      assertRetired(await state(), original); assert.ok(!(await roster()).some(p => p.name === 'Ciclo QA'));
      await tab('crear'); assert.doesNotMatch(await preview(), /Ciclo QA/);
    });

    await check('Quitar residente cancela o confirma la baja global', async () => {
      const original = await richFixture(); await fixture(original); await tab('guardias'); await open('guard-A'); await open('resident-' + encoded('ciclo qa|R1'));
      await residentForm('ciclo qa|R1').locator('[data-action="remove-resident"]').click(); await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.deepEqual(await state(), original);
      await residentForm('ciclo qa|R1').locator('[data-action="remove-resident"]').click(); await page.locator('[data-action="confirm-retire-resident"][data-key="ciclo qa|R1"]').click(); assertRetired(await state(), original);
    });

    await check('Duplicados y límite de diez rechazan cambios sin pérdida de datos', async () => {
      await reset(); await tab('guardias'); const baseline = await state(); await newResident('A', 'Ibarra', 2, { matutino: ['montoya'] });
      assert.match(await page.locator('#toast').innerText(), /ya existe/i); assert.deepEqual(await state(), baseline);
      const full = await defaults(); full.guardGroups[0].members = Array.from({ length: 10 }, (_, i) => ({ name: 'Persona ' + i, grade: 1 })); full.guardGroups[1].members = [{ name: 'Ibarra', grade: 2 }];
      await fixture(full); await tab('guardias'); const before = await state(); await newResident('A', 'Extra QA', 1, { matutino: ['montoya'] }); assert.match(await page.locator('#toast').innerText(), /10/); assert.deepEqual(await state(), before);
      await open('guard-B'); await open('resident-' + encoded('ibarra|R2')); const form = residentForm('ibarra|R2'); await form.locator('[name="guardGroupId"]').selectOption('A'); await form.locator('[type="submit"]').click();
      assert.match(await page.locator('#toast').innerText(), /10/); assert.deepEqual(await state(), before);
      assert.deepEqual(await form.locator('[name="grade"] option').evaluateAll(nodes => nodes.map(n => n.value)), ['1', '2']);
    });

    await check('Respaldo y recarga conservan asignaciones, ausencias, móviles e historia', async () => {
      const original = await richFixture(); await fixture(original); await tab('guardias'); await open('guard-A'); await open('resident-' + encoded('ciclo qa|R1'));
      await residentForm('ciclo qa|R1').locator('[name="name"]').fill('Persistente QA'); await residentForm('ciclo qa|R1').locator('[type="submit"]').click(); const before = await state();
      assert.equal(before.absences[0].personId, 'persistente qa|R1'); assert.equal(before.mobileAssignments.vespertino[0].fixedResidentKey, 'persistente qa|R1');
      await page.locator('[data-action="tools"]').click(); await page.locator('[data-action="export"]').click(); const text = await page.evaluate(() => nativeCalls.find(c => c.action === 'backup').text);
      assert.deepEqual(JSON.parse(text), before); await page.reload(); await ready(); assert.deepEqual(await state(), before);
      await page.evaluate(text => onBackupRestored(text), text); await page.locator('[data-action="confirm-import"]').click(); assert.deepEqual(await state(), before);
      assert.deepEqual(before.history, original.history); assert.deepEqual(before.legacyGuardData, original.legacyGuardData);
    });

    await check('Guardias y formularios de residentes caben entre 360 y 1440 píxeles', async () => {
      await reset(); await tab('guardias'); await newResident('A', 'Vista QA', 1, { matutino: ['montoya', 'torres'], vespertino: ['leyva'] });
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const selectedTab of ['crear', 'equipo', 'guardias']) {
          await tab(selectedTab); await assertFits(selectedTab + ' ' + width);
          if (selectedTab === 'crear') { await open('organize-turn'); await open('day-montoya'); }
          else if (selectedTab === 'equipo') { await open('team-matutino'); await open('roster-montoya'); await open('absences'); await open('absence-doctor'); await open('absence-doctor-matutino'); }
          else { await open('guard-A'); await open('resident-' + encoded('vista qa|R1')); await open('assignment-' + encoded('vista qa|R1')); await open('assignment-' + encoded('vista qa|R1') + '-matutino'); await open('add-resident-A'); await open('assignment-new-A'); await open('assignment-new-A-vespertino'); await open('residents-ungrouped'); }
          await assertFits(selectedTab + ' abierto ' + width);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 }); await tab('crear'); await screenshot('crear-mobile'); await tab('equipo'); await screenshot('equipo-mobile'); await tab('guardias'); await screenshot('guardias-mobile');
      await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot('guardias-desktop');
    });
    assert.deepEqual(errors, []); console.log('UI residents checks passed:', passed.length);
  } catch (error) { failure = { step: currentStep, message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await screenshot('failure'); }
  finally {
    try { await restoreOriginal(); } catch (error) { cleanupErrors.push('Restauración localStorage: ' + error.message); process.exitCode = 1; }
    try { if (browser) await browser.close(); } catch (error) { cleanupErrors.push('Cierre del navegador: ' + error.message); process.exitCode = 1; }
    report();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
