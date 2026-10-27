const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _android } = require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const adbPath = 'C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const serial = process.env.ROLERO_DEVICE || 'emulator-5554';
assert.match(serial, /^emulator-\d+$/, 'Estas pruebas automáticas sólo modifican un emulador.');
const apk = process.argv[2] || 'dist/Rolero-debug.apk';
const out = path.resolve('qa/rooms');
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
  fs.writeFileSync(path.join(out, 'android-results.json'), JSON.stringify({ version: '1.4.0', schemaVersion: 3, device: serial, apk: path.resolve(apk), platform: 'Android WebView', screenshotsEnabled, passed, errors, diagnostics, currentStep, failure, cleanupErrors, success: !failure && !errors.length && !cleanupErrors.length }, null, 2));
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
  assert.ok(value.dutySelection.referenceDate, 'Cada fixture debe fijar su fecha de referencia.');
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
async function defaults() { const s = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS))); s.dutySelection = { guardGroupId: 'A', referenceDate: monday }; return s; }
async function cycleFixture() {
  const s = await defaults(), people = [{ name: 'Alfa QA', grade: 1 }, { name: 'Beta QA', grade: 2 }, { name: 'Gamma QA', grade: 1 }, { name: 'Delta QA', grade: 2 }];
  s.guardGroups.forEach((group, index) => { group.members = [{ ...people[index] }]; }); s.serviceRules = [];
  for (const id of ['montoya', 'leyva']) s.doctors.find(d => d.id === id).residents = [{ name: 'Mayor QA', grade: 4 }, ...people.map(p => ({ ...p }))];
  return s;
}
async function mobileFixture() {
  const s = await defaults(); s.guardGroups[0].members = [{ name: 'Ibarra', grade: 2 }]; s.guardGroups[1].members = [{ name: 'Beta QA', grade: 1 }]; s.guardGroups[2].members = [{ name: 'Móvil QA', grade: 2 }]; s.guardGroups[3].members = [{ name: 'Delta QA', grade: 1 }];
  for (const id of ['montoya', 'leyva']) s.doctors.find(d => d.id === id).residents = [{ name: 'Ibarra', grade: 2 }];
  s.mobileAssignments = { matutino: [{ residentKey: 'movil qa|R2', fixedResidentKey: 'ibarra|R2' }], vespertino: [{ residentKey: 'movil qa|R2', fixedResidentKey: 'ibarra|R2' }] };
  s.absences = [{ id: 'ausencia-fijo', personType: 'resident', personId: 'ibarra|R2', start: '2026-10-29', end: '2026-10-29', note: 'Móvil de postguardia' }]; return s;
}
async function shift(value) { await page.locator('[data-action="shift"][data-shift="' + value + '"]').click(); }
async function assign(room, doctorId) { await open('qx-rooms'); await open('qx-room-' + room); const form = page.locator('form[data-form="qx-room"][data-room="' + room + '"]'); await form.locator('[name="doctorId"]').selectOption(doctorId); await form.locator('[type="submit"]').click(); }
async function clear(room, doctorId) { await open('qx-rooms'); await open('qx-room-' + room); await page.locator('details[data-detail="qx-room-' + room + '"] [data-action="clear-qx-room"][data-id="' + doctorId + '"]').click(); }
function roomLines(text) { return text.split('\n').filter(line => /^QX [1-6]\b/.test(line)); }
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

    await check('La actualización conserva datos y la referencia cambia sólo desde Guardias', async () => {
      const loaded = await state(); assert.equal(loaded.schemaVersion, 3); assert.match(loaded.dutySelection.referenceDate, /^\d{4}-\d{2}-\d{2}$/);
      const prior = originalEntries[storageKey] ? JSON.parse(originalEntries[storageKey]) : null;
      if (prior) for (const key of ['doctors', 'serviceRules', 'absences', 'dailyOverrides', 'history', 'guardGroups', 'dutySelection', 'mobileAssignments']) if (prior[key] !== undefined && (prior.schemaVersion >= 2 || !['guardGroups', 'dutySelection', 'mobileAssignments'].includes(key))) assert.deepEqual(loaded[key], prior[key], 'La actualización alteró ' + key);
      await loadFixture(await cycleFixture()); await tab('guardias'); await page.locator('#duty-reference-date').fill(monday); await page.locator('#duty-reference-date').dispatchEvent('change'); await page.locator('[data-duty-field="guardGroupId"]').selectOption('A'); const reference = (await state()).dutySelection;
      await tab('crear'); await setDate('2026-10-27'); assert.deepEqual(await page.locator('.duty-summary strong').allInnerTexts(), ['Guardia B', 'Guardia A']);
      for (const selectedShift of ['matutino', 'vespertino']) { await shift(selectedShift); assert.doesNotMatch(await preview(), /Alfa QA/); assert.match(await preview(), /Delta QA/); }
      await setDate(monday); assert.deepEqual(await page.locator('.duty-summary strong').allInnerTexts(), ['Guardia A', 'Guardia D']); assert.deepEqual((await state()).dutySelection, reference);
      assert.doesNotMatch(await page.locator('.preview-card').innerText(), /postguardia/i); assert.doesNotMatch(await preview(), /postguardia/i); assert.equal(await page.locator('[data-day-field="room"], [data-day-field="residents"]').count(), 0);
      await tab('equipo'); assert.equal(await page.locator('#team-preview-text, [data-detail="team-report"], [data-action="copy"], [data-action="share"]').count(), 0);
    });

    await check('La fecha del rol calcula la postguardia y las sustituciones en ambos turnos', async () => {
      await loadFixture(await mobileFixture()); await recordNativeCopy();
      for (const [date, expected] of [[monday, 'reserve'], ['2026-10-27', 'cover'], ['2026-10-29', 'unavailable'], [monday, 'reserve']]) {
        await setDate(date);
        for (const selectedShift of ['matutino', 'vespertino']) { await shift(selectedShift); const text = await preview(); if (expected === 'reserve') { assert.match(text, /Ibarra R2/); assert.doesNotMatch(text, /Móvil QA/); } else if (expected === 'cover') { assert.doesNotMatch(text, /Ibarra R2/); assert.match(text, /Móvil QA R2 \(móvil\)/); await page.locator('.preview-card [data-action="copy"]').click(); assert.equal(await page.evaluate(() => qaNativeCalls.at(-1).text), text); } else assert.doesNotMatch(text, /Ibarra R2|Móvil QA/); }
      }
      assert.deepEqual((await state()).dutySelection, { guardGroupId: 'A', referenceDate: monday });
    });

    await check('QX ordena seis salas y reúne dos médicos y residentes sin duplicados', async () => {
      const initial = await defaults(); initial.doctors.find(d => d.id === 'quiroz').residents.push({ name: 'Andrade', grade: 2 }); await loadFixture(initial); await recordNativeCopy();
      assert.equal(await page.locator('details[data-detail="qx-rooms"]').evaluate(el => el.open), false);
      for (const [room, doctorId] of [[6, 'montoya'], [5, 'torres'], [4, 'cerda'], [3, 'pardini'], [2, 'flores'], [1, 'ramirez'], [1, 'quiroz']]) await assign(room, doctorId);
      const text = await preview(), lines = roomLines(text); assert.deepEqual(lines.map(line => Number(/^QX (\d)/.exec(line)[1])), [1, 2, 3, 4, 5, 6]);
      for (const name of ['Dr. Ramírez', 'Dr. Quiroz']) { assert.equal(lines[0].split(name).length - 1, 1); assert.ok(lines[0].indexOf(name) < lines[0].indexOf('Rotantes')); }
      assert.equal((lines[0].match(/Andrade R2/g) || []).length, 1); assert.equal((lines[0].match(/Rotantes/g) || []).length, 1);
      assert.equal(await page.locator('details[data-detail="qx-room-1"] .qx-room-doctor').count(), 2); await page.locator('.preview-card [data-action="copy"]').click(); assert.equal(await page.evaluate(() => qaNativeCalls.at(-1).text), text); await screenshot('salas');
    });

    await check('Mover y restablecer sala conserva el ajuste previo y separa fechas y turnos', async () => {
      const initial = await defaults(), old = { service: 'urgencias', room: 'Sala previa', excluded: false, residents: [{ name: 'Previo QA', grade: 2 }] }; initial.dailyOverrides = { [monday]: { montoya: old } }; await loadFixture(initial);
      await assign(6, 'montoya'); await assign(2, 'montoya'); assert.deepEqual((await state()).dailyOverrides[monday].montoya.operatingRoomPrevious, { service: 'urgencias', room: 'Sala previa' }); assert.equal((await preview()).split('\n').filter(line => /Dr\. Montoya/.test(line)).length, 1);
      await clear(2, 'montoya'); assert.deepEqual((await state()).dailyOverrides[monday].montoya, old); await assign(6, 'montoya');
      await shift('vespertino'); await assign(2, 'leyva'); assert.equal(await page.locator('form[data-room="1"] option[value="montoya"]').count(), 0); assert.match(await preview(), /QX 2 Dr\. Leyva/);
      await shift('matutino'); await setDate('2026-10-27'); assert.doesNotMatch(await preview(), /QX 6 Dr\. Montoya/); await assign(5, 'montoya'); await setDate(monday); assert.match(await preview(), /QX 6 Dr\. Montoya/);
      const s = await state(); assert.equal(s.dailyOverrides[monday].leyva.room, 'QX 2'); assert.equal(s.dailyOverrides['2026-10-27'].montoya.room, 'QX 5');
    });

    await check('Referencia, salas y ajustes persisten con cierre normal y reapertura', async () => {
      await page.locator('#floor-r1-switch').check(); assert.ok((await preview()).includes(floorReminder)); await tab('guardias'); await page.locator('#duty-reference-date').fill('2026-10-30'); await page.locator('#duty-reference-date').dispatchEvent('change'); await page.locator('[data-duty-field="guardGroupId"]').selectOption('C'); const before = await state();
      await page.waitForFunction(({ key, expected }) => JSON.stringify(JSON.parse(localStorage.getItem(key))) === JSON.stringify(expected), { key: storageKey, expected: before }); assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), before);
      await disconnect(); adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await new Promise(resolve => setTimeout(resolve, 2000)); adb('shell', 'am', 'force-stop', 'mx.rolero.app'); adb('shell', 'am', 'start', '-n', 'mx.rolero.app/.MainActivity'); await connect(); assert.deepEqual(await state(), before);
      await setDate(monday); assert.match(await preview(), /QX 6 Dr\. Montoya/); await shift('vespertino'); assert.match(await preview(), /QX 2 Dr\. Leyva/); await tab('guardias'); assert.equal(await page.locator('#duty-reference-date').inputValue(), '2026-10-30'); assert.equal(await page.locator('[data-duty-field="guardGroupId"]').inputValue(), 'C');
    });
    assert.deepEqual(errors, []); console.log('Android rooms checks passed:', passed.length);
  } catch (error) { failure = { step: currentStep, message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await screenshot('failure'); }
  finally {
    try { await restoreOriginal(); } catch (error) { cleanupErrors.push('Restauración del estado previo: ' + error.message); process.exitCode = 1; }
    try { await disconnect(); } catch (error) { cleanupErrors.push('Desconexión de Playwright: ' + error.message); process.exitCode = 1; }
    report(); cleanupErrors.forEach(error => console.error(error));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

