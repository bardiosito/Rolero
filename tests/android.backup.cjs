const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {_android} = require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const R = require('../app/src/main/assets/engine.js');
const adbPath='C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const output=path.resolve('qa/android');
const backup=R.migrateState(JSON.parse(fs.readFileSync(path.join(output,'roundtrip-backup.json'),'utf8')));
R.validateState(backup);
assert.equal(backup.doctors.length,18);
const adb=(...args)=>execFileSync(adbPath,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000}).trim();
async function shot(name) {
  adb('shell','screencap','-p','/data/local/tmp/rolero-'+name+'.png');
  adb('pull','/data/local/tmp/rolero-'+name+'.png',path.join(output,name+'.png'));
}
let device,page,previous;
(async()=>{
  const devices=await _android.devices({host:'127.0.0.1',port:5037,omitDriverInstall:true});
  device=devices.find(d=>d.serial()==='emulator-5554');
  assert.ok(device,'Emulador de prueba conectado');
  const webview=await device.webView({pkg:'mx.rolero.app'},{timeout:30000});
  page=await webview.page();
  previous=await page.evaluate(()=>localStorage.getItem('rolero-state-v1'));
  try {
    await page.locator('.bottom-nav [data-tab="equipo"]').click();
    const note=page.locator('[data-floor-note="vespertino"]');
    await note.fill('PRUEBA_RESTAURACION_ANDROID');
    await note.dispatchEvent('change');
    assert.equal(await page.evaluate(()=>RoleroUI.getState().settings.floorNotes.vespertino),'PRUEBA_RESTAURACION_ANDROID');
    await page.locator('[data-action="tools"]').click();
    await page.locator('[data-action="import"]').click();
    console.log('READY: seleccionar rol de respaldo JSON en el selector nativo de Android.');
    let ready=false;
    for(let attempt=0;attempt<10;attempt++) {
      try {await page.locator('[data-action="confirm-import"]').waitFor({state:'visible',timeout:30000});ready=true;break;}
      catch(error) {console.log('Esperando selección del archivo local de prueba…');}
    }
    assert.ok(ready,'Android debe entregar el archivo a la app y mostrar la revisión');
    assert.equal(await page.locator('#modal-title').innerText(),'Restaurar este respaldo');
    await shot('restaurar-revision');
    await page.locator('[data-action="confirm-import"]').click();
    const restored=await page.evaluate(()=>RoleroUI.getState());
    assert.deepEqual(restored.doctors,backup.doctors);
    assert.deepEqual(restored.settings,backup.settings);
    assert.deepEqual(restored.history,backup.history);
    assert.deepEqual(restored.guardGroups,backup.guardGroups);
    assert.deepEqual(restored.mobileAssignments,backup.mobileAssignments);
    assert.deepEqual(restored.dutySelection,backup.dutySelection);
    await shot('respaldo-restaurado');
    const report={
      platform:'Android 15 (API 35)',
      exportedBytes:fs.statSync(path.join(output,'roundtrip-backup.json')).size,
      doctors:restored.doctors.length,
      nativeExportVerified:true,nativeImportVerified:true,
      changedNoteReverted:true,settingsAndHistoryMatch:true,
      doctorNamesAndAccentsMatch:true
    };
    fs.writeFileSync(path.join(output,'backup-results.json'),JSON.stringify(report,null,2));
    console.log('PASS Android: respaldo JSON nativo, archivo válido y restauración exacta de médicos, notas, historial y guardias.');
  } finally {
    if(page&&!page.isClosed()) {
      await page.evaluate(value=>{if(value===null)localStorage.removeItem('rolero-state-v1');else localStorage.setItem('rolero-state-v1',value);},previous).catch(()=>{});
      await page.reload().catch(()=>{});
    }
    if(device)await device.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
