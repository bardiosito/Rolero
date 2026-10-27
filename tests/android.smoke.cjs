const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {_android}=require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {flow,key,date}=require('./ui.redistribution.smoke.cjs');
const out=path.resolve('qa/redistribution'),serial=process.env.ROLERO_DEVICE||'emulator-5554',apk=process.argv[2]||'dist/Rolero-debug.apk';
assert.match(serial,/^emulator-\d+$/);fs.mkdirSync(out,{recursive:true});
let device,page,original,failure=null;const passed=[],errors=[],cleanupErrors=[];
function adb(...args){assert.ok(!device,'Desconectar antes de ADB externo');return execFileSync('C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe',['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:args[0]==='install'?60000:30000}).trim();}
const report=()=>fs.writeFileSync(path.join(out,'android-results.json'),JSON.stringify({version:'1.6.0',device:serial,apk:path.resolve(apk),passed,errors,cleanupErrors,failure,success:!failure&&!errors.length&&!cleanupErrors.length&&passed.length===6},null,2));
const check=async(name,fn)=>{console.log('TEST Android:',name);await fn();passed.push(name);report();console.log('PASS Android:',name);};
async function connect(){const devices=await _android.devices({host:'127.0.0.1',port:5037,omitDriverInstall:true});device=devices.find(d=>d.serial()===serial);for(const other of devices)if(other!==device)await other.close();assert.ok(device,'Emulador disponible');const view=await device.webView({pkg:'mx.rolero.app'},{timeout:30000});page=await view.page();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>!!window.RoleroUI,null,{timeout:30000});await page.locator('.bottom-nav [data-tab="crear"]').click();await page.locator('#create-date').waitFor();}
async function disconnect(){if(device){const old=device;device=null;page=null;await old.close();}}
async function restore(){if(!original)return;const apply=async()=>{await page.evaluate(entries=>{localStorage.clear();for(const[k,v]of Object.entries(entries))localStorage.setItem(k,v);},original);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),original);};try{if(!page||page.isClosed())throw Error('Reconectar');await apply();}catch(_){await disconnect().catch(()=>{});adb('shell','am','start','-n','mx.rolero.app/.MainActivity');await connect();await apply();}await page.reload();await page.waitForFunction(()=>!!window.RoleroUI);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),original);}
(async()=>{try{
 if(!process.argv.includes('--installed'))console.log(adb('install','--no-incremental','-r',path.resolve(apk)));
 adb('shell','am','start','-n','mx.rolero.app/.MainActivity');await connect();original=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));fs.writeFileSync(path.join(out,'android-original-state.json'),JSON.stringify({entries:original},null,2));
 await flow(page,check,p=>p.evaluate(()=>{const bridge=window.Android;if(!bridge||typeof bridge.copyText!=='function')throw Error('Sin portapapeles nativo');window.__qaCopiedText=undefined;window.Android={copyText:text=>{window.__qaCopiedText=text;bridge.copyText(text);},shareText:text=>bridge.shareText(text),saveBackup:text=>bridge.saveBackup(text),restoreBackup:()=>bridge.restoreBackup()};}));
 await check('Destinos y orden QX persisten al cerrar y reabrir',async()=>{const before=await page.evaluate(()=>RoleroUI.getState());assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),before);await disconnect();adb('shell','input','keyevent','KEYCODE_HOME');await new Promise(r=>setTimeout(r,2000));adb('shell','am','force-stop','mx.rolero.app');adb('shell','am','start','-n','mx.rolero.app/.MainActivity');await connect();assert.deepEqual(await page.evaluate(()=>RoleroUI.getState()),before);await page.locator('#create-date').fill(date);await page.locator('#create-date').dispatchEvent('change');const lines=(await page.locator('#preview-text').inputValue()).split('\n').filter(l=>l.startsWith('QX 2'));assert.equal(lines.length,2);assert.match(lines[0],/Beta/);assert.match(lines[1],/Alfa/);});assert.deepEqual(errors,[]);
 }catch(e){failure={message:e.message,stack:e.stack};console.error(e);process.exitCode=1;}
 finally{try{await restore();}catch(e){cleanupErrors.push(e.message);process.exitCode=1;}try{await disconnect();}catch(e){cleanupErrors.push(e.message);process.exitCode=1;}report();}
})().catch(e=>{console.error(e);process.exitCode=1;});

