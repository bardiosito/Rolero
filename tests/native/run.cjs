const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const serial=process.argv[2]||process.env.ROLERO_DEVICE,adbPath='C:/Users/bardiostudio/AppData/Local/Android/Sdk/platform-tools/adb.exe';
if(!/^emulator-\d+$/.test(serial||''))throw Error('Sólo se permite ejecutar esta prueba en un emulador.');
const out=path.resolve('qa/guard-sync'),baselinePath=path.resolve(process.env.ROLERO_BASELINE_FILE||'build/guard-sync-original-state-before-retry.json');
const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));if(!baseline.entries||!Object.values(baseline.entries).every(value=>typeof value==='string'))throw Error('La copia original no es válida.');
const adb=(args,timeout=60000)=>cp.execFileSync(adbPath,['-s',serial,...args],{windowsHide:true,encoding:'utf8',timeout,stdio:['ignore','pipe','pipe']}).trim();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stableProvider(){
 const start=Date.now();let previous='',stableSince=start,lastPrint=0;
 while(Date.now()-start<180000){
  const dump=adb(['shell','dumpsys','webviewupdate']),provider=(dump.split(/[\r\n]+/).find(line=>/Current WebView package/.test(line))||'Proveedor pendiente').trim();
  if(provider!==previous){previous=provider;stableSince=Date.now();console.log(provider);}
  const seconds=Math.floor((Date.now()-start)/1000);if(seconds>=lastPrint){console.log('Esperando estabilidad de WebView:',seconds,'s');lastPrint=seconds+30;}
  if(Date.now()-start>=60000&&Date.now()-stableSince>=30000)return previous;
  await delay(5000);
 }
 throw Error('WebView no alcanzó un estado estable antes de la prueba.');
}
async function instrument(encoded,recovery){
 const child=cp.spawn(adbPath,['-s',serial,'shell','am','instrument','-w','-r','-e','baseline',encoded,...(recovery?['-e','restoreOnly','true']:[]),'mx.rolero.qa/mx.rolero.qa.RoleroInstrumentation'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',chunk=>{const text=chunk.toString();output+=text;process.stdout.write(text);});child.stderr.on('data',chunk=>{const text=chunk.toString();output+=text;process.stderr.write(text);});
 const timeout=setTimeout(()=>child.kill(),600000);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timeout);
 const match=output.match(/^INSTRUMENTATION_RESULT: roleroResult=(.+)$/m)||output.match(/ROLERO_RESULT (\{[^\r\n]+\})/);
 const result=match?JSON.parse(match[1].trim()):{version:'1.9.0',method:'native-instrumentation',passed:[],failures:[{message:'La prueba nativa no devolvió un resultado completo.'}],originalRestored:false,success:false};
 return{code,output,result};
}
(async()=>{
 const api=adb(['shell','getprop','ro.build.version.sdk']),avd=adb(['emu','avd','name']).split(/[\r\n]+/)[0].trim();
 if(avd!=='Small_Phone')throw Error('Se esperaba el emulador Small Phone.');
 console.log(adb(['install','--no-incremental','-r',path.resolve('build/native-qa/Rolero-QA.apk')],120000));
 const recovery=process.env.ROLERO_NATIVE_RESTORE_ONLY==='1',encoded=Buffer.from(JSON.stringify(baseline),'utf8').toString('base64');
 let provider=await stableProvider(),attempt;
 for(let number=1;number<=2;number++){
  adb(['shell','am','force-stop','mx.rolero.app']);adb(['shell','input','keyevent','KEYCODE_WAKEUP']);adb(['shell','wm','dismiss-keyguard']);await delay(2000);
  attempt=await instrument(encoded,recovery);fs.writeFileSync(path.join(out,'android-instrumentation-output.log'),attempt.output);
  if(attempt.result.success&&attempt.result.originalRestored&&(recovery||attempt.result.passed.length===4))break;
  const crash=adb(['logcat','-d','-v','brief','-b','main','-b','system','-b','crash','-t','700']);fs.writeFileSync('build/native-qa/crash.log',crash);
  fs.writeFileSync(path.join(out,'android-instrumentation-attempt-'+number+'.json'),JSON.stringify(attempt.result,null,2));
  if(number===1&&/stop com\.google\.android\.webview due to installPackageLI|Force stopping com\.google\.android\.webview.*installPackageLI/.test(crash)){
   console.log('Android actualizó WebView durante la prueba. Esperando antes de repetir.');provider=await stableProvider();continue;
  }
  console.error(crash.split(/[\r\n]+/).filter(line=>/rolero|chromium|AndroidRuntime|FATAL|lmkd|lowmemorykiller/.test(line)).slice(-35).join('\n'));break;
 }
 const result=attempt.result;Object.assign(result,{device:serial,avd,androidApi:api,provider,runnerExitCode:attempt.code,apkSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync('dist/Rolero-debug.apk')).digest('hex')});
 fs.writeFileSync(path.join(out,'android-instrumentation-results.json'),JSON.stringify(result,null,2));
 if(!result.success||!result.originalRestored||(!recovery&&result.passed.length!==4))throw Error('La comprobación nativa no terminó correctamente. Revisa su informe.');
 console.log('Comprobaciones nativas aprobadas; datos originales restaurados.');console.log(adb(['uninstall','mx.rolero.qa']));
})().catch(error=>{console.error(error.message);process.exitCode=1;});