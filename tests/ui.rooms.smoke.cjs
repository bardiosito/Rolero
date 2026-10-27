const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const out = path.resolve('qa/rooms');
const url = pathToFileURL(path.resolve('app/src/main/assets/index.html')).href;
const storageKey = 'rolero-state-v1', monday = '2026-10-26';
const passed = [], errors = [], diagnostics = [], cleanupErrors = [];
let browser, page, originalEntries, currentStep = '', failure = null;
fs.mkdirSync(out, { recursive: true });
function report() { fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify({ version: '1.4.0', schemaVersion: 3, platform: 'Edge headless', passed, errors, diagnostics, cleanupErrors, currentStep, failure, success: !failure && !errors.length && !cleanupErrors.length }, null, 2)); }
async function ready() { await page.waitForFunction(() => !!window.RoleroUI); assert.equal(await page.locator('.error-card').count(), 0); await page.locator('#create-date').waitFor(); }
async function check(name, action) { currentStep = name; report(); console.log('TEST UI:', name); await action(); passed.push(name); currentStep = ''; report(); console.log('PASS UI:', name); }
const state = () => page.evaluate(() => RoleroUI.getState());
const tab = name => page.locator('.bottom-nav [data-tab="' + name + '"]').click();
const detail = name => page.locator('details[data-detail="' + name + '"]');
async function open(name) { const node = detail(name); if (!await node.evaluate(el => el.open)) await node.locator('summary').first().click(); }
async function setDate(value) { await page.locator('#create-date').fill(value); await page.locator('#create-date').dispatchEvent('change'); }
async function shift(value) { await page.locator('[data-action="shift"][data-shift="' + value + '"]').click(); }
async function preview() { return page.locator('#preview-text').inputValue(); }
async function defaults() { const value = await page.evaluate(() => JSON.parse(JSON.stringify(ROLERO_DEFAULTS))); value.dutySelection = { guardGroupId: 'A', referenceDate: monday }; return value; }
async function fixture(value) { assert.ok(value.dutySelection.referenceDate, 'Cada fixture debe fijar su fecha de referencia.'); await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value }); await page.reload(); await ready(); await setDate(monday); }
async function cycleFixture() {
  const s = await defaults(), people = [{ name: 'Alfa QA', grade: 1 }, { name: 'Beta QA', grade: 2 }, { name: 'Gamma QA', grade: 1 }, { name: 'Delta QA', grade: 2 }];
  s.guardGroups.forEach((group, index) => { group.members = [{ ...people[index] }]; }); s.serviceRules = [];
  for (const id of ['montoya', 'leyva']) s.doctors.find(d => d.id === id).residents = [{ name: 'Mayor QA', grade: 4 }, ...people.map(p => ({ ...p }))];
  for (const date of ['2026-10-25', '2026-10-31', '2026-11-01']) s.dailyOverrides[date] = { montoya: { service: 'consulta' }, leyva: { service: 'consulta' } };
  return s;
}
async function mobileFixture() {
  const s = await defaults(); s.guardGroups[0].members = [{ name: 'Ibarra', grade: 2 }]; s.guardGroups[1].members = [{ name: 'Beta QA', grade: 1 }]; s.guardGroups[2].members = [{ name: 'Móvil QA', grade: 2 }]; s.guardGroups[3].members = [{ name: 'Delta QA', grade: 1 }];
  for (const id of ['montoya', 'leyva']) s.doctors.find(d => d.id === id).residents = [{ name: 'Ibarra', grade: 2 }];
  s.mobileAssignments = { matutino: [{ residentKey: 'movil qa|R2', fixedResidentKey: 'ibarra|R2' }], vespertino: [{ residentKey: 'movil qa|R2', fixedResidentKey: 'ibarra|R2' }] };
  s.absences = [{ id: 'ausencia-fijo', personType: 'resident', personId: 'ibarra|R2', start: '2026-10-29', end: '2026-10-29', note: 'Verificar móvil de postguardia' }]; return s;
}
async function assign(room, doctorId) { await open('qx-rooms'); await open('qx-room-' + room); const form = page.locator('form[data-form="qx-room"][data-room="' + room + '"]'); await form.locator('[name="doctorId"]').selectOption(doctorId); await form.locator('[type="submit"]').click(); }
async function clear(room, doctorId) { await open('qx-rooms'); await open('qx-room-' + room); await detail('qx-room-' + room).locator('[data-action="clear-qx-room"][data-id="' + doctorId + '"]').click(); }
function roomLines(text) { return text.split('\n').filter(line => /^QX [1-6]\b/.test(line)); }
async function summary(expectedGuard, expectedPost) { assert.deepEqual(await page.locator('.duty-summary strong').allInnerTexts(), ['Guardia ' + expectedGuard, 'Guardia ' + expectedPost]); }
async function screenshot(name) { try { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); } catch (error) { diagnostics.push('Captura ' + name + ': ' + error.message); } }
async function assertFits(label) { const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); if (size.scroll > size.width + 1) { await screenshot('overflow'); fs.writeFileSync(path.join(out, 'overflow.json'), JSON.stringify({ label, size }, null, 2)); } assert.ok(size.scroll <= size.width + 1, label + ': ' + JSON.stringify(size)); }
async function restoreOriginal() { if (!originalEntries || !browser) return; if (!page || page.isClosed()) { page = await browser.newPage(); await page.goto(url); } await page.evaluate(entries => { localStorage.clear(); Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value)); }, originalEntries); assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), originalEntries); }

(async () => {
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true }); page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-MX', timezoneId: 'America/Hermosillo' }); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.nativeCalls = []; window.Android = { copyText: text => nativeCalls.push({ action: 'copy', text }), shareText: text => nativeCalls.push({ action: 'share', text }), saveBackup: text => nativeCalls.push({ action: 'backup', text }) }; });
    await page.goto(url); await ready(); originalEntries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); await fixture(await defaults());

    await check('Crear ofrece seis salas cerradas después de Organiza y una vista previa sin postguardia', async () => {
      assert.equal(await detail('organize-turn').evaluate(el => el.open), false); assert.equal(await detail('qx-rooms').evaluate(el => el.open), false);
      assert.equal(await detail('organize-turn').evaluate(el => el.nextElementSibling.getAttribute('data-detail')), 'qx-rooms');
      await open('qx-rooms'); assert.deepEqual(await page.locator('.qx-room > summary > strong').allInnerTexts(), ['QX 1', 'QX 2', 'QX 3', 'QX 4', 'QX 5', 'QX 6']);
      for (const number of [1, 2, 3, 4, 5, 6]) assert.equal(await detail('qx-room-' + number).evaluate(el => el.open), false);
      assert.equal(await page.locator('[data-day-field="room"], [data-day-field="residents"]').count(), 0);
      assert.doesNotMatch(await page.locator('.preview-card').innerText(), /postguardia/i); assert.doesNotMatch(await preview(), /postguardia/i);
      assert.equal(await page.locator('.preview-card [data-action="copy"]').isEnabled(), true);
    });

    await check('La fecha y guardia de referencia se guardan sólo desde Guardias', async () => {
      await fixture(await cycleFixture()); await tab('guardias'); assert.equal(await page.locator('#duty-reference-date').inputValue(), monday);
      await page.locator('#duty-reference-date').fill('2026-10-30'); await page.locator('#duty-reference-date').dispatchEvent('change'); await page.locator('[data-duty-field="guardGroupId"]').selectOption('C');
      const reference = { guardGroupId: 'C', referenceDate: '2026-10-30' }; assert.deepEqual((await state()).dutySelection, reference);
      await tab('crear'); await setDate('2026-10-30'); await summary('C', 'B'); await setDate('2026-10-31'); await summary('D', 'C'); await setDate('2026-10-30'); await summary('C', 'B');
      assert.deepEqual((await state()).dutySelection, reference); assert.equal(await page.locator('[data-duty-field], #duty-reference-date').count(), 0);
      await tab('guardias'); assert.equal(await page.locator('#duty-reference-date').inputValue(), '2026-10-30'); assert.equal(await page.locator('[data-duty-field="guardGroupId"]').inputValue(), 'C');
    });

    await check('Ciclo reversible por fecha excluye la postguardia en ambos turnos, incluidos fines de semana y cambio de mes', async () => {
      await fixture(await cycleFixture()); const reference = (await state()).dutySelection;
      const days = [['2026-10-25', 'D', 'C', 'Gamma QA'], [monday, 'A', 'D', 'Delta QA'], ['2026-10-27', 'B', 'A', 'Alfa QA'], ['2026-10-28', 'C', 'B', 'Beta QA'], ['2026-10-31', 'B', 'A', 'Alfa QA'], ['2026-11-01', 'C', 'B', 'Beta QA'], [monday, 'A', 'D', 'Delta QA']];
      for (const [date, guard, post, excluded] of days) {
        await setDate(date); await summary(guard, post);
        for (const selectedShift of ['matutino', 'vespertino']) { await shift(selectedShift); const text = await preview(); assert.ok(!text.includes(excluded), date + ' ' + selectedShift + ' excluye ' + excluded); for (const name of ['Alfa QA', 'Beta QA', 'Gamma QA', 'Delta QA'].filter(name => name !== excluded)) assert.ok(text.includes(name), date + ' ' + selectedShift + ' conserva ' + name); }
        assert.deepEqual((await state()).dutySelection, reference);
      }
    });

    await check('Móviles usan la postguardia calculada para el día del rol', async () => {
      await fixture(await mobileFixture());
      for (const [date, expected] of [[monday, 'reserve'], ['2026-10-27', 'cover'], ['2026-10-29', 'unavailable'], [monday, 'reserve']]) {
        await setDate(date);
        for (const selectedShift of ['matutino', 'vespertino']) { await shift(selectedShift); const text = await preview(); if (expected === 'reserve') { assert.match(text, /Ibarra R2/); assert.doesNotMatch(text, /Móvil QA/); } else if (expected === 'cover') { assert.doesNotMatch(text, /Ibarra R2/); assert.match(text, /Móvil QA R2 \(móvil\)/); } else { assert.doesNotMatch(text, /Ibarra R2|Móvil QA/); } }
      }
      assert.deepEqual((await state()).dutySelection, { guardGroupId: 'A', referenceDate: monday });
    });

    await check('QX se ordena de 1 a 6 aunque se asigne al revés y reúne dos médicos sin repetir residentes', async () => {
      const initial = await defaults(); initial.doctors.find(d => d.id === 'quiroz').residents.push({ name: 'Andrade', grade: 2 }); await fixture(initial);
      for (const [room, doctorId] of [[6, 'montoya'], [5, 'torres'], [4, 'cerda'], [3, 'pardini'], [2, 'flores'], [1, 'ramirez'], [1, 'quiroz']]) await assign(room, doctorId);
      const text = await preview(), lines = roomLines(text); assert.deepEqual(lines.map(line => Number(/^QX (\d)/.exec(line)[1])), [1, 2, 3, 4, 5, 6]);
      for (const name of ['Dr. Ramírez', 'Dr. Quiroz']) assert.ok(lines[0].includes(name) && lines[0].indexOf(name) < lines[0].indexOf('Rotantes'));
      assert.equal((lines[0].match(/Andrade R2/g) || []).length, 1); assert.equal((lines[0].match(/Rotantes/g) || []).length, 1);
      for (const name of ['Montoya', 'Torres', 'Cerda', 'Pardini', 'Flores', 'Ramírez', 'Quiroz']) assert.equal((text.match(new RegExp('(?:Dr\\.|Dra\\.) ' + name, 'g')) || []).length, 1, name);
      assert.equal(await detail('qx-room-1').locator('.qx-room-doctor').count(), 2); assert.equal(await page.locator('form[data-room="1"] option[value="ramirez"], form[data-room="1"] option[value="quiroz"]').count(), 0);
      await page.locator('.preview-card [data-action="copy"]').click(); assert.equal(await page.evaluate(() => nativeCalls.at(-1).text), text);
    });

    await check('Mover de sala no duplica al médico y Restablecer recupera la actividad anterior', async () => {
      const initial = await defaults(); const old = { service: 'urgencias', room: 'Sala previa', excluded: false, residents: [{ name: 'Residente previo', grade: 2 }] }; initial.dailyOverrides = { [monday]: { montoya: old } }; await fixture(initial);
      await assign(6, 'montoya'); await assign(2, 'montoya'); const current = (await state()).dailyOverrides[monday].montoya;
      assert.equal(current.room, 'QX 2'); assert.deepEqual(current.operatingRoomPrevious, { service: 'urgencias', room: 'Sala previa' }); assert.deepEqual(current.residents, old.residents);
      assert.equal((await preview()).split('\n').filter(line => /Dr\. Montoya/.test(line)).length, 1); assert.equal(await detail('qx-room-6').locator('.qx-room-doctor').count(), 0);
      await clear(2, 'montoya'); assert.deepEqual((await state()).dailyOverrides[monday].montoya, old); assert.equal(await page.locator('[data-action="clear-qx-room"][data-id="montoya"]').count(), 0);
      const s = await defaults(); await fixture(s); await assign(3, 'montoya'); await clear(3, 'montoya'); assert.deepEqual((await state()).dailyOverrides, s.dailyOverrides);
    });

    await check('Las salas se conservan por fecha y turno y Organiza puede reemplazar la actividad', async () => {
      await fixture(await defaults()); await assign(6, 'montoya'); await shift('vespertino'); await assign(2, 'leyva');
      assert.equal(await page.locator('form[data-room="1"] option[value="montoya"]').count(), 0); assert.match(await preview(), /^Rol TV/); assert.match(await preview(), /QX 2 Dr\. Leyva/);
      await shift('matutino'); assert.match(await preview(), /QX 6 Dr\. Montoya/); assert.doesNotMatch(await preview(), /Dr\. Leyva/);
      await setDate('2026-10-27'); assert.doesNotMatch(await preview(), /QX 6 Dr\. Montoya/); await assign(5, 'montoya'); await setDate(monday); assert.match(await preview(), /QX 6 Dr\. Montoya/);
      await open('organize-turn'); await open('day-montoya'); await page.locator('[data-day-doctor="montoya"][data-day-field="service"]').selectOption('consulta');
      const s = await state(); assert.equal(s.dailyOverrides[monday].montoya.service, 'consulta'); assert.equal(s.dailyOverrides[monday].montoya.room, undefined); assert.equal(s.dailyOverrides[monday].montoya.operatingRoomPrevious, undefined);
      assert.equal(s.dailyOverrides[monday].leyva.room, 'QX 2'); assert.equal(s.dailyOverrides['2026-10-27'].montoya.room, 'QX 5');
    });

    await check('La sala usa el médico fuente de una cobertura y el texto reúne su nombre una sola vez', async () => {
      const initial = await defaults(); initial.absences = [{ id: 'cover', personType: 'doctor', personId: 'montoya', coverDoctorId: 'pardini', start: monday, end: monday, note: 'Cobertura QX' }, { id: 'no-cover', personType: 'doctor', personId: 'cerda', coverDoctorId: '', start: monday, end: monday, note: 'Ausente' }]; initial.dailyOverrides = { [monday]: { torres: { excluded: true } } }; await fixture(initial); await open('qx-rooms'); await open('qx-room-1');
      const choices = page.locator('form[data-room="1"] [name="doctorId"]'); assert.match(await choices.locator('option[value="montoya"]').innerText(), /Pardini.*cubre a.*Montoya/); assert.equal(await choices.locator('option[value="cerda"], option[value="torres"]').count(), 0);
      await assign(1, 'montoya'); await assign(1, 'pardini'); const line = roomLines(await preview()).find(line => line.startsWith('QX 1 ')); assert.equal((line.match(/Dr\. Pardini/g) || []).length, 1); assert.match(line, /Márquez R2/); assert.match(line, /Rojo R2/); assert.doesNotMatch(await preview(), /Dr\. Montoya/);
      await clear(1, 'montoya'); assert.equal((await state()).dailyOverrides[monday].montoya, undefined); assert.equal((await state()).dailyOverrides[monday].pardini.room, 'QX 1');
    });

    await check('Respaldo y recarga conservan ancla, salas, móviles y ajustes previos', async () => {
      const initial = await mobileFixture(); initial.history = [{ id: 'history', text: 'Rol histórico intacto' }]; await fixture(initial); await assign(4, 'montoya'); await shift('vespertino'); await assign(1, 'leyva'); const before = await state();
      await page.locator('[data-action="tools"]').click(); await page.locator('[data-action="export"]').click(); const backup = await page.evaluate(() => nativeCalls.find(call => call.action === 'backup').text); assert.deepEqual(JSON.parse(backup), before);
      await page.reload(); await ready(); assert.deepEqual(await state(), before); await setDate('2026-10-27'); assert.deepEqual((await state()).dutySelection, initial.dutySelection);
      await page.evaluate(text => onBackupRestored(text), backup); await page.locator('[data-action="confirm-import"]').click(); assert.deepEqual(await state(), before); await setDate(monday); await shift('vespertino'); assert.match(await preview(), /QX 1 Dr\. Leyva/);
      await page.locator('.preview-card [data-action="share"]').click(); assert.equal(await page.evaluate(() => nativeCalls.at(-1).text), await preview());
    });

    await check('Los formularios de salas y la fecha de referencia caben entre 360 y 1440 píxeles', async () => {
      await fixture(await cycleFixture()); await assign(1, 'montoya'); await assign(1, 'torres'); await assign(6, 'pardini');
      for (const width of [360, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); for (const selectedTab of ['crear', 'equipo', 'guardias']) { await tab(selectedTab); await assertFits(selectedTab + ' ' + width); if (selectedTab === 'crear') { await open('organize-turn'); await open('day-montoya'); await open('qx-rooms'); for (const room of [1, 2, 3, 4, 5, 6]) await open('qx-room-' + room); } else if (selectedTab === 'equipo') { await open('team-matutino'); await open('roster-montoya'); } else await open('guard-A'); await assertFits(selectedTab + ' abierto ' + width); } }
      await page.setViewportSize({ width: 390, height: 844 }); await tab('crear'); await screenshot('crear-mobile'); await tab('guardias'); await screenshot('guardias-mobile'); await page.setViewportSize({ width: 1440, height: 1000 }); await tab('crear'); await screenshot('crear-desktop');
    });
    assert.deepEqual(errors, []); console.log('UI rooms checks passed:', passed.length);
  } catch (error) { failure = { step: currentStep, message: error.message, stack: error.stack }; console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await screenshot('failure'); }
  finally { try { await restoreOriginal(); } catch (error) { cleanupErrors.push('Restauración localStorage: ' + error.message); process.exitCode = 1; } try { if (browser) await browser.close(); } catch (error) { cleanupErrors.push('Cierre del navegador: ' + error.message); process.exitCode = 1; } report(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
