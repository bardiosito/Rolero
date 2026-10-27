const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/bardiostudio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'es-MX',timezoneId:'America/Hermosillo'});
 const errors=[],passed=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.nativeCalls=[];window.Android={copyText:text=>nativeCalls.push({action:'copy',text}),shareText:text=>nativeCalls.push({action:'share',text}),saveBackup:text=>nativeCalls.push({action:'backup',text})};});
 const tab=async name=>page.locator('.bottom-nav [data-tab="'+name+'"]').click();
 const setDate=async date=>{await page.locator('#create-date').fill(date);await page.locator('#create-date').dispatchEvent('change');};
 const group=async(id,text)=>{const form=page.locator('form[data-form="guard-group"][data-id="'+id+'"]');await form.locator('[name="members"]').fill(text);await form.locator('[type="submit"]').click();};
 const duty=async id=>page.locator('[data-duty-field="guardGroupId"]').selectOption(id);
 async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
 fs.mkdirSync('qa/groups',{recursive:true});
 try{
  await page.goto(pathToFileURL(path.resolve('app/src/main/assets/index.html')).href);
  await check('inicio v2 con cuatro grupos vacíos y sin calendario',async()=>{
   await page.locator('#create-date').waitFor();assert.equal(await page.locator('.error-card').count(),0);
   await setDate('2026-10-26');assert.equal(await page.locator('#confirm-role').isDisabled(),true);
   await tab('guardias');assert.equal(await page.locator('#guard-count').inputValue(),'4');
   assert.equal(await page.locator('input[type="month"], .calendar').count(),0);
   assert.equal(await page.evaluate(()=>RoleroUI.getState().schemaVersion),2);
  });
  await check('formación manual de guardias sólo R1/R2',async()=>{
   await group('A','Móvil Alfa R2');await group('B','Móvil Beta R1');await group('C','Ibarra R2');await group('D','Reserva R1');
   assert.equal(await page.evaluate(()=>RoleroUI.getState().guardGroups.every(g=>g.members.length===1)),true);
   await group('A','Mayor R3');assert.match(await page.locator('#toast').innerText(),/R1.*R2/);
   assert.equal(await page.evaluate(()=>RoleroUI.getState().guardGroups[0].members[0].name),'Móvil Alfa');
   await group('A',Array.from({length:11},(_,i)=>'Persona '+i+' R1').join(', '));
   assert.match(await page.locator('#toast').innerText(),/10/);
   assert.equal(await page.evaluate(()=>RoleroUI.getState().guardGroups[0].members.length),1);
  });
  await check('móvil emparejado queda de reserva si el fijo está disponible',async()=>{
   await page.locator('#mobile-form [name="residentKey"]').selectOption('movil alfa|R2');
   await page.locator('#mobile-form [name="fixedResidentKey"]').selectOption('ibarra|R2');
   await page.locator('#mobile-form [type="submit"]').click();
   await duty('A');await tab('crear');
   const text=await page.locator('#preview-text').inputValue();assert.match(text,/Ibarra R2/);assert.doesNotMatch(text,/Móvil Alfa/);
  });
  await check('seleccionar guardia D excluye C y activa el sustituto',async()=>{
   await duty('D');const text=await page.locator('#preview-text').inputValue();
   assert.doesNotMatch(text,/Ibarra R2/);assert.match(text,/Móvil Alfa R2 \(móvil\)/);assert.match(text,/Rotantes/);
   assert.match(await page.locator('[aria-label="Revisión de postguardia"]').innerText(),/Guardia C|Grupo C/);
   await page.locator('#confirm-role').check();await page.locator('[data-action="copy"]').click();
   assert.ok(await page.evaluate(()=>nativeCalls.some(c=>c.action==='copy'&&c.text.includes('Móvil Alfa R2 (móvil)'))));
   await duty('A');assert.equal(await page.locator('#confirm-role').isChecked(),false);
  });
  await check('móvil cubre una ausencia R1 de apoyo por servicio',async()=>{
   await tab('guardias');await page.locator('#mobile-form [name="residentKey"]').selectOption('movil beta|R1');
   await page.locator('#mobile-form [name="fixedResidentKey"]').selectOption('corral|R1');await page.locator('#mobile-form [type="submit"]').click();
   await tab('equipo');const form=page.locator('#add-absence');await form.locator('[name="person"]').selectOption('resident:corral|R1');
   await form.locator('[name="start"]').fill('2026-10-26');await form.locator('[name="end"]').fill('2026-10-26');await form.locator('[name="note"]').fill('Prueba ausencia');await form.locator('[type="submit"]').click();
   await tab('crear');const text=await page.locator('#preview-text').inputValue();assert.doesNotMatch(text,/Corral R1/);assert.match(text,/Móvil Beta R1 \(móvil\)/);
  });
  await check('seis grupos y reducción confirmada a tres recalculan el ciclo',async()=>{
   await tab('guardias');await page.locator('#guard-count').selectOption('6');await group('E','Persona E R1');await group('F','Persona F R2');
   await duty('A');assert.match(await page.locator('.derived-guard').innerText(),/Guardia F/);
   await duty('F');await page.locator('#guard-count').selectOption('3');assert.equal(await page.locator('#modal').isVisible(),true);
   assert.equal(await page.evaluate(()=>RoleroUI.getState().guardGroups.length),6);
   await page.locator('[data-action="confirm-group-count"]').click();
   assert.equal(await page.evaluate(()=>RoleroUI.getState().guardGroups.length),3);
   assert.equal(await page.evaluate(()=>RoleroUI.getState().dutySelection.guardGroupId),'A');
   assert.match(await page.locator('.derived-guard').innerText(),/Guardia C/);
  });
  await check('persistencia, respaldo v2 y tamaños de pantalla',async()=>{
   await page.reload();await tab('guardias');assert.equal(await page.locator('#guard-count').inputValue(),'3');
   assert.equal(await page.evaluate(()=>RoleroUI.getState().mobileAssignments.matutino.length),2);
   await page.locator('[data-action="tools"]').click();await page.locator('[data-action="export"]').click();
   const backup=await page.evaluate(()=>JSON.parse(nativeCalls.find(c=>c.action==='backup').text));assert.equal(backup.schemaVersion,2);assert.equal(backup.guardGroups.length,3);
   for(const width of[360,390,768,1440]){
    await page.setViewportSize({width,height:900});
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    if(!fits){
     const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).map(el=>({tag:el.tagName,id:el.id,class:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,text:el.textContent.slice(0,100)})).filter(el=>el.right>innerWidth+1||el.left< -1).slice(0,30));
     fs.writeFileSync('qa/groups/overflow.json',JSON.stringify(overflow,null,2));await page.screenshot({path:'qa/groups/overflow.png',fullPage:true});
    }
    assert.ok(fits,'overflow '+width);
   }
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'qa/groups/guardias-mobile.png',fullPage:true});
   await tab('crear');await setDate('2026-10-26');await page.screenshot({path:'qa/groups/crear-mobile.png',fullPage:true});
   await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'qa/groups/crear-desktop.png',fullPage:true});
  });
  await check('actualización desde respaldo v1 conserva equipo, ausencias e historial',async()=>{
   await page.evaluate(()=>{const old=JSON.parse(JSON.stringify(ROLERO_DEFAULTS));old.schemaVersion=1;delete old.guardGroups;delete old.dutySelection;delete old.mobileAssignments;old.doctors[0].name='Nombre conservado';old.history=[{id:'previo',date:'2026-10-26',shift:'matutino',text:'Texto previo'}];old.guards={'2026-10':{confirmed:true,groups:{1:'A',2:'B',3:'C',4:'D'},days:{1:[{name:'Uno',grade:1}],2:[{name:'Dos',grade:2}],3:[{name:'Tres',grade:1}],4:[{name:'Cuatro',grade:2}]}}};old.manualGuards={};localStorage.setItem('rolero-state-v1',JSON.stringify(old));});
   await page.reload();assert.equal(await page.locator('.error-card').count(),0);
   const s=await page.evaluate(()=>RoleroUI.getState());assert.equal(s.schemaVersion,2);assert.equal(s.doctors[0].name,'Nombre conservado');assert.equal(s.history[0].text,'Texto previo');assert.equal(s.guardGroups[0].members[0].name,'Uno');
   await tab('guardias');assert.equal(await page.locator('input[type="month"], .calendar').count(),0);
  });
  assert.deepEqual(errors,[]);fs.writeFileSync('qa/groups/ui-results.json',JSON.stringify({passed,errors},null,2));console.log('UI groups checks passed:',passed.length);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
