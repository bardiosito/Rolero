const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _android } = require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const adbPath = 'C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const serial = process.env.ROLERO_DEVICE || 'emulator-5554';
assert.match(serial, /^emulator-\d+$/, 'Estas pruebas automáticas sólo modifican un emulador.');
const apk = process.argv[2] || 'dist/Rolero-debug.apk';
const out = path.resolve('qa/residents');
const storageKey = 'rolero-state-v1';
const monday = '2026-10-26';
const floorReminder = '(Resto de r1 al terminar actividades)';
const screenshotsEnabled = process.env.ROLERO_SCREENSHOTS === '1';
const passed = [], errors = [], diagnostics = [], cleanupErrors = [];
let device, page, originalEntries, currentStep = '', failure = null;
fs.mkdirSync(out, { recursive: true });
function adb(...args) {
  assert.ok(!device, 'Desconecta Playwright antes de ejecutar una orden externa de ADB.');
  return execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: args[0] === 'install' ? 60000 : 30000, windowsHide: true }).trim();
}
function report() {
  fs.writeFileSync(path.join(out, 'android-results.json'), JSON.stringify({ version: '1.3.0', schemaVersion: 3, device: serial, apk: path.resolve(apk), platform: 'Android WebView', screenshotsEnabled, passed, errors, diagnostics, currentStep, failure, cleanupErrors, success: !failure && !errors.length && !cleanupErrors.length }, null, 2));
}
async function connect() {
  const devices = await _android.devices({ host: '127.0.0.1', port: 5037, omitDriverInstall: true });
  device = devices.find(item => item.serial() === serial);
  for (const other of devices) if (other !== device) await other.close();
  if (!device) throw new Error('El emulador ' + serial + ' no aparece en ADB.');
  const view = await device.webView({ pkg: 'mx.rolero.app' }, { timeout: 30000 });
  page = await view.page(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !!window.RoleroUI, null, { timeout: 30000 });
  await page.locator('.bottom-nav [data-tab="crear"]').click(); await page.locator('#create-date').waitFor({ timeout: 30000 });
}
async function disconnect() { if (!device) return; const active = device; device = null; page = null; await active.close(); }
async function check(name, action) { currentStep = name; report(); console.log('TEST Android:', name); await action(); passed.push(name); currentStep = ''; report(); console.log('PASS Android:', name); }
async function screenshot(name) {
  if (!screenshotsEnabled) return;
  try { await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await page.screenshot({ path: path.join(out, 'android-' + name + '.png'), fullPage: true }); }
  catch (error) { diagnostics.push('Captura ' + name + ': ' + error.message); }
}
const tab = name => page.locator('.bottom-nav [data-tab="' + name + '"]').click();
const state = () => page.evaluate(() => RoleroUI.getState());
const preview = () => page.locator('#preview-text').inputValue();
const residentForm = key => page.locator('form[data-form="resident"][data-key="' + key + '"]');
async function open(name) { const node = page.locator('details[data-detail="' + name + '"]'); if (!await node.evaluate(el => el.open)) await node.locator('summary').first().click(); }
async function setDate(value) { await page.locator('#create-date').fill(value); await page.locator('#create-date').dispatchEvent('change'); }
async function loadFixture(value) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value });
  await page.reload({ timeout: 30000 }); await page.locator('#create-date').waitFor({ timeout: 30000 }); await setDate(monday);
}
async function recordNativeCopy() {
  await page.evaluate(() => {
    const bridge = window.Android;
    if (!bridge || typeof bridge.copyText !== 'function') throw new Error('No está disponible el portapapeles nativo.');
    window.qaNativeCalls = [];
    window.Android = { copyText: text => { qaNativeCalls.push({ action: 'copy', text }); bridge.copyText(text); }, shareText: text => bridge.shareText(text), saveBackup: text => bridge.saveBackup(text), restoreBackup: () => bridge.restoreBackup() };
  });
}
async function richFixture() {
  const s = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS))), person = { name: 'Ciclo nativo', grade: 1 };
  for (const id of ['montoya', 'leyva']) s.doctors.find(d => d.id === id).residents.push({ ...person });
  s.serviceRules[0].residents.push({ ...person, startDay: 1, endDay: 31 });
  s.dailyOverrides = { [monday]: { montoya: { service: 'consulta', room: 'Q5', residents: [{ ...person }, { name: 'Mayor intacto', grade: 4 }] } } };
  s.guardGroups[0].members = [{ ...person }]; s.guardGroups[1].members = [{ name: 'Otro móvil', grade: 2 }];
  s.absences = [{ id: 'ausencia-ciclo', personType: 'resident', personId: 'ciclo nativo|R1', start: '2026-11-01', end: '2026-11-02', note: 'Conservar rango' }];
  s.mobileAssignments = { matutino: [{ residentKey: 'ciclo nativo|R1', fixedResidentKey: 'ibarra|R2' }], vespertino: [{ residentKey: 'otro movil|R2', fixedResidentKey: 'ciclo nativo|R1' }] };
  s.history = [{ id: 'historico', date: monday, shift: 'matutino', text: 'Ciclo nativo R1 / Texto histórico' }];
  s.legacyGuardData = { guards: { anotacion: 'Ciclo nativo R1' }, manualGuards: {} };
  return s;
}
function allPeople(s) { return s.doctors.flatMap(d => d.residents).concat(s.serviceRules.flatMap(r => r.residents), s.guardGroups.flatMap(g => g.members), Object.values(s.dailyOverrides).flatMap(day => Object.values(day).flatMap(o => o.residents || []))); }
async function restoreOriginal() {
  if (!originalEntries) return;
  const restore = async () => {
    await page.evaluate(entries => { localStorage.clear(); Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value)); }, originalEntries);
    assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), originalEntries);
  };
  try { if (!page || page.isClosed()) throw new Error('Reconectar antes de restaurar.'); await restore(); }
  catch (_) { await disconnect().catch(() => {}); adb('shell', 'am', 'start', '-n', 'mx.rolero.app/.MainActivity'); await connect(); await restore(); }
  await page.reload({ timeout: 30000 }); await page.locator('#create-date').waitFor({ timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), originalEntries);
}

(async () => {
  try {
    if (!process.argv.includes('--installed')) { assert.ok(fs.existsSync(path.resolve(apk)), 'No existe el APK: ' + path.resolve(apk)); console.log(adb('install', '--no-incremental', '-r', path.resolve(apk))); }
    adb('shell', 'am', 'start', '-n', 'mx.rolero.app/.MainActivity'); await connect();
    originalEntries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    fs.writeFileSync(path.join(out, 'android-original-state.json'), JSON.stringify({ storageKey, original: originalEntries[storageKey] ?? null, entries: originalEntries }, null, 2));

    await check('Actualización conserva datos y restringe la edición de residentes a Guardias', async () => {
      const loaded = await state(); assert.equal(loaded.schemaVersion, 3);
      const prior = originalEntries[storageKey] ? JSON.parse(originalEntries[storageKey]) : null;
      if (prior) for (const key of ['doctors', 'serviceRules', 'absences', 'dailyOverrides', 'history', 'guardGroups', 'dutySelection', 'mobileAssignments']) if (prior[key] !== undefined && (prior.schemaVersion >= 2 || !['guardGroups', 'dutySelection', 'mobileAssignments'].includes(key))) assert.deepEqual(loaded[key], prior[key], 'La actualización alteró ' + key);
      const defaults = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS))); await loadFixture(defaults);
      await open('organize-turn'); await open('day-montoya'); assert.equal(await page.locator('textarea[data-day-field="residents"], [name="residents"], [data-form="resident"]').count(), 0);
      await tab('equipo'); assert.equal(await page.locator('#team-preview-text, [data-detail="team-report"], .preview-card, [data-action="copy"], [data-action="share"]').count(), 0);
      await open('team-matutino'); await page.locator('[data-action="add-doctor"][data-shift="matutino"]').click(); assert.equal(await page.locator('#add-doctor [name="residents"]').count(), 0); await page.locator('[data-action="close-modal"]').click();
      await tab('guardias'); assert.equal(await page.evaluate(() => Rolero.residentRoster(RoleroUI.getState()).length), 14); assert.equal(await page.locator('textarea').count(), 0);
    });

    await check('Alta R1 con médicos de ambos turnos, nombre de guardia y copia desde Crear', async () => {
      await open('guard-A'); const nameForm = page.locator('form[data-form="guard-name"][data-id="A"]'); await nameForm.locator('[name="name"]').fill('Guardia nativa'); await nameForm.locator('[type="submit"]').click();
      assert.equal(await page.locator('[data-duty-field="guardGroupId"] option[value="A"]').innerText(), 'Guardia nativa');
      await open('add-resident-A'); const form = page.locator('form[data-form="add-resident"][data-group="A"]'); await form.locator('[name="name"]').fill('Alta nativa'); await form.locator('[name="grade"]').selectOption('1');
      await open('assignment-new-A');
      for (const [selectedShift, id] of [['matutino', 'montoya'], ['vespertino', 'leyva']]) { await open('assignment-new-A-' + selectedShift); await form.locator('[name="doctor-' + selectedShift + '"][value="' + id + '"]').check(); }
      await form.locator('[type="submit"]').click();
      const s = await state(); assert.ok(s.doctors.find(d => d.id === 'montoya').residents.some(p => p.name === 'Alta nativa' && p.grade === 1)); assert.ok(s.doctors.find(d => d.id === 'leyva').residents.some(p => p.name === 'Alta nativa' && p.grade === 1));
      await tab('crear'); await recordNativeCopy(); assert.match(await preview(), /Dr\. Montoya[^\n]*Alta nativa R1/);
      assert.equal(await page.locator('.preview-card [data-action="copy"]').isEnabled(), true); await page.locator('.preview-card [data-action="copy"]').click(); assert.equal(await page.evaluate(() => qaNativeCalls.at(-1).text), await preview());
      await page.locator('[data-action="shift"][data-shift="vespertino"]').click(); assert.match(await preview(), /Dr\. Leyva[^\n]*Alta nativa R1/);
      await page.reload({ timeout: 30000 }); await page.locator('#create-date').waitFor(); await tab('guardias'); assert.equal((await state()).guardGroups[0].name, 'Guardia nativa'); await screenshot('alta');
    });

    await check('Ascender R1 a R2 conserva médicos, rangos, ausencias y referencias móviles', async () => {
      const original = await richFixture(); await loadFixture(original); await tab('guardias'); await open('guard-A'); await open('resident-' + encodeURIComponent('ciclo nativo|R1'));
      await residentForm('ciclo nativo|R1').locator('[data-action="promote-resident"]').click(); const s = await state();
      assert.ok(allPeople(s).some(p => p.name === 'Ciclo nativo')); assert.ok(allPeople(s).filter(p => p.name === 'Ciclo nativo').every(p => p.grade === 2));
      assert.equal(s.absences[0].personId, 'ciclo nativo|R2'); assert.equal(s.mobileAssignments.matutino[0].residentKey, 'ciclo nativo|R2'); assert.equal(s.mobileAssignments.vespertino[0].fixedResidentKey, 'ciclo nativo|R2');
      assert.deepEqual(s.serviceRules[0].residents.find(p => p.name === 'Ciclo nativo'), { name: 'Ciclo nativo', grade: 2, startDay: 1, endDay: 31 }); assert.equal(s.dailyOverrides[monday].montoya.room, 'Q5');
      assert.deepEqual(s.history, original.history); assert.deepEqual(s.legacyGuardData, original.legacyGuardData);
      const form = residentForm('ciclo nativo|R2'); assert.equal(await form.locator('[name="doctor-matutino"][value="montoya"]').isChecked(), true); assert.equal(await form.locator('[name="doctor-vespertino"][value="leyva"]').isChecked(), true);
      await form.locator('[type="submit"]').click(); assert.deepEqual((await state()).doctors, s.doctors);
    });

    await check('Ascender R2 a R3 requiere confirmar y elimina sólo las referencias activas', async () => {
      const original = await state(); const form = residentForm('ciclo nativo|R2'); await form.locator('[data-action="promote-resident"]').click();
      assert.equal(await page.locator('#modal').isVisible(), true); await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.deepEqual(await state(), original);
      await form.locator('[data-action="promote-resident"]').click(); await page.locator('[data-action="confirm-retire-resident"][data-key="ciclo nativo|R2"]').click(); const s = await state();
      assert.ok(!allPeople(s).some(p => p.name === 'Ciclo nativo')); assert.ok(!s.absences.some(a => a.personId === 'ciclo nativo|R2')); assert.deepEqual(s.mobileAssignments, { matutino: [], vespertino: [] });
      assert.deepEqual(s.history, original.history); assert.deepEqual(s.legacyGuardData, original.legacyGuardData); assert.ok(allPeople(s).some(p => p.name === 'Mayor intacto' && p.grade === 4));
      await open('guard-B'); await open('resident-' + encodeURIComponent('otro movil|R2')); await residentForm('otro movil|R2').locator('[data-action="remove-resident"]').click(); await page.locator('[data-action="confirm-retire-resident"][data-key="otro movil|R2"]').click();
      assert.ok(!allPeople(await state()).some(p => p.name === 'Otro móvil')); await tab('crear'); assert.doesNotMatch(await preview(), /Ciclo nativo/);
    });

    await check('Guardias, retiros y preferencias persisten con cierre normal y reapertura', async () => {
      await page.locator('#floor-r1-switch').check(); assert.ok((await preview()).includes(floorReminder)); await tab('guardias'); await open('guard-A');
      const form = page.locator('form[data-form="guard-name"][data-id="A"]'); await form.locator('[name="name"]').fill('Guardia persistente'); await form.locator('[type="submit"]').click(); const before = await state();
      await page.waitForFunction(({ key, expected }) => JSON.stringify(JSON.parse(localStorage.getItem(key))) === JSON.stringify(expected), { key: storageKey, expected: before });
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), before);
      await disconnect(); adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await new Promise(resolve => setTimeout(resolve, 2000));
      adb('shell', 'am', 'force-stop', 'mx.rolero.app'); adb('shell', 'am', 'start', '-n', 'mx.rolero.app/.MainActivity'); await connect(); const after = await state(); assert.deepEqual(after, before);
      await setDate(monday); assert.equal(await page.locator('#floor-r1-switch').isChecked(), true); assert.ok((await preview()).includes(floorReminder)); await tab('guardias'); assert.equal(await page.locator('[data-duty-field="guardGroupId"] option[value="A"]').innerText(), 'Guardia persistente');
    });
    assert.deepEqual(errors, []); console.log('Android residents checks passed:', passed.length);
  } catch (error) { failure = { step: currentStep, message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await screenshot('failure'); }
  finally {
    try { await restoreOriginal(); } catch (error) { cleanupErrors.push('Restauración del estado previo: ' + error.message); process.exitCode = 1; }
    try { await disconnect(); } catch (error) { cleanupErrors.push('Desconexión de Playwright: ' + error.message); process.exitCode = 1; }
    report(); cleanupErrors.forEach(error => console.error(error));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
