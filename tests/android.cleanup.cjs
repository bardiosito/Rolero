// Reset only the disposable AVD created for this test run; keep a recovery copy.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {_android}=require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adbPath='C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe';
(async()=>{
  const avd=execFileSync(adbPath,['-s','emulator-5554','emu','avd','name'],{encoding:'utf8',timeout:10000});
  assert.equal(avd.trim().split(/\s+/)[0],'Rolero_Test35','Do not reset a personal device or another AVD.');
  const devices=await _android.devices({host:'127.0.0.1',port:5037,omitDriverInstall:true});
  const device=devices.find(d=>d.serial()==='emulator-5554');
  try {
    const view=await device.webView({pkg:'mx.rolero.app'},{timeout:30000});
    const page=await view.page();
    const snapshot=await page.evaluate(()=>RoleroUI.getState());
    fs.writeFileSync('qa/android/final-test-state.json',JSON.stringify(snapshot,null,2));
    await page.evaluate(()=>localStorage.removeItem('rolero-state-v1'));
    await page.reload();
    const restored=await page.evaluate(()=>RoleroUI.getState());
    assert.equal(restored.doctors.length,18);
    assert.equal(restored.guardGroups.length,4);
    assert.ok(restored.guardGroups.every(group=>group.members.length===0));
    assert.deepEqual(restored.mobileAssignments,{matutino:[],vespertino:[]});
    assert.equal(restored.history.length,0);
    console.log('Dispositivo de prueba restaurado a los datos iniciales; copia de recuperación conservada.');
  } finally {await device.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
