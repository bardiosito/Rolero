// Complete the final persistence check after a diagnostic ADB transfer failure.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {_android}=require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adbPath='C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const resultPath='qa/groups/android-results.json';
const report=JSON.parse(fs.readFileSync(resultPath,'utf8'));
const snapshot=JSON.parse(fs.readFileSync('qa/groups/android-original-state.json','utf8'));
const last='grupos, guardia seleccionada y emparejamientos sobreviven al cierre del proceso';
assert.equal(report.currentStep,last);
assert.equal(report.passed.length,7);
fs.writeFileSync('qa/groups/android-diagnostic-before-recovery.json',JSON.stringify(report,null,2));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const adb=(...args)=>execFileSync(adbPath,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000}).trim();
(async()=>{
 let device,page;
 try{
  for(let attempt=0;attempt<15;attempt++){
   const devices=await _android.devices({host:'127.0.0.1',port:5037,omitDriverInstall:true});
   device=devices.find(item=>item.serial()==='emulator-5554');
   for(const other of devices)if(other!==device)await other.close();
   if(device)break;await pause(1000);
  }
  assert.ok(device,'Emulador de prueba conectado');
  const view=await device.webView({pkg:'mx.rolero.app'},{timeout:30000});page=await view.page();
  await page.waitForFunction(()=>!!window.RoleroUI);
  const saved=await page.evaluate(()=>RoleroUI.getState());
  assert.equal(saved.schemaVersion,2);assert.equal(saved.guardGroups.length,3);assert.equal(saved.dutySelection.guardGroupId,'A');
  assert.equal(saved.mobileAssignments.matutino.length,2);assert.equal(saved.absences.length,1);assert.equal(saved.history.length,1);
  await page.locator('.bottom-nav [data-tab="crear"]').click();
  await page.locator('#create-date').fill('2026-10-26');await page.locator('#create-date').dispatchEvent('change');
  const text=await page.locator('#preview-text').inputValue();
  assert.match(text,/Móvil Alfa R2 \(móvil\)/);assert.match(text,/Móvil Beta R1 \(móvil\)/);assert.doesNotMatch(text,/Ibarra R2|Corral R1/);
  await page.locator('.bottom-nav [data-tab="guardias"]').click();
  assert.equal(await page.locator('#guard-count').inputValue(),'3');assert.equal(await page.locator('.mobile-pair').count(),2);
  try{adb('shell','screencap','-p','/data/local/tmp/rolero-groups-recovered.png');adb('pull','/data/local/tmp/rolero-groups-recovered.png','qa/groups/android-persistencia.png');}catch(error){console.log('Captura opcional omitida:',error.message);}
  await page.evaluate(entries=>{localStorage.clear();Object.entries(entries).forEach(([key,value])=>localStorage.setItem(key,value));},snapshot.entries);
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),snapshot.entries);
  await page.reload();await page.waitForFunction(()=>!!window.RoleroUI);
  report.passed.push(last);report.diagnostics=['La conexión ADB se interrumpió al copiar una captura; se repitió y verificó la persistencia y se restauró el estado previo.'];
  report.currentStep='';report.failure=null;report.cleanupErrors=[];report.success=true;
  fs.writeFileSync(resultPath,JSON.stringify(report,null,2));
  console.log('PASS: persistencia verificada y configuración previa restaurada. Android: 8/8.');
 }finally{if(device)await device.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
