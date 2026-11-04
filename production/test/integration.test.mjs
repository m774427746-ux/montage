import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {database,migrate} from '../src/db.mjs';
import {createApp} from '../src/server.mjs';
import {passwordHash,digest,safePath,cleanupDay,priceSnapshot} from '../src/core.mjs';
import {syncOnce} from '../src/sync.mjs';
import {spawn} from 'node:child_process';
if(!process.env.TEST_DATABASE_URL)throw Error('Use an isolated test database; TEST_DATABASE_URL required');
const pool=database(process.env.TEST_DATABASE_URL),root=await mkdtemp(path.join(os.tmpdir(),'asbarix-test-'));
const origin='http://127.0.0.1:55440';let server,app,admin,designer,operator,other,orderId,uploadId;
const file=Buffer.from('%PDF-1.7\nSynthetic integration fixture\n%%EOF\n');
async function call(route,{method='GET',body,session,headers={}}={}){
  const response=await fetch(origin+route,{method,headers:{Origin:origin,...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...(body!==undefined?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{}),...headers},...(body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
}
before(async()=>{
 await migrate(pool);await migrate(pool);
 for(const [username,role] of [['admin','admin'],['designer','designer'],['operator','operator'],['other','operator']])await pool.query('INSERT INTO users VALUES($1,$2,$2,$3,$4,true)',[randomUUID(),username,passwordHash('test-only-password-123'),role]);
 app=await createApp({pool,root,origin,reserve:0,maxFile:1024*1024});server=app.listen(55440,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 for(const name of ['admin','designer','operator','other']){const r=await call('/api/login',{method:'POST',body:{username:name,password:'test-only-password-123'}});assert.equal(r.status,200);const session={cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf};if(name==='admin')admin=session;if(name==='designer')designer=session;if(name==='operator')operator=session;if(name==='other')other=session;}
});
after(async()=>{app?.closeStreams();if(server)await new Promise(r=>server.close(r));await pool.end();});
test('database permissions, repeatable migration, health and exact machine seed',async()=>{
 assert.equal((await call('/health')).status,200);const c=await call('/api/catalog',{session:admin});assert.deepEqual(c.data.machines.map(x=>x.id),['canon','laser','skycolor']);
});
test('authentication, origin, CSRF and role checks reject unauthorized mutations',async()=>{
 assert.equal((await call('/api/orders')).status,401);
 assert.equal((await call('/api/users',{method:'POST',session:designer,body:{}})).status,403);
 assert.equal((await call('/api/uploads',{method:'POST',session:designer,body:{},headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await call('/api/uploads',{method:'POST',session:designer,body:{},headers:{'X-CSRF-Token':'bad'}})).status,403);
 assert.throws(()=>safePath(root,'../secret'));assert.throws(()=>safePath(root,'C:/secret'));
});
test('admin configures conditional approved material; designers cannot see cost',async()=>{
 const r=await call('/api/materials',{method:'PUT',session:admin,body:{id:'paper',name:'Test paper',machine_id:'canon',unit:'piece',options:{gsm:['250GSM'],sides:['one','two']},price:{cost:2,retail:5,operationCost:1}}});assert.equal(r.status,200);
 const c=await call('/api/catalog',{session:designer});assert.equal(c.data.materials[0].price,undefined);
});
test('upload resumes, checks offsets and chunk digests, then verifies final bytes',async()=>{
 const r=await call('/api/uploads',{method:'POST',session:designer,body:{name:'final.pdf',size:file.length,sha256:digest(file)}});assert.equal(r.status,201);uploadId=r.data.id;
 assert.equal((await call('/api/uploads/'+uploadId,{method:'PUT',session:designer,body:file.subarray(0,8),headers:{'Upload-Offset':'0','Chunk-SHA256':'bad'}})).status,422);
 assert.equal((await call('/api/uploads/'+uploadId,{method:'PUT',session:designer,body:file.subarray(0,8),headers:{'Upload-Offset':'0','Chunk-SHA256':digest(file.subarray(0,8))}})).status,200);
 assert.equal(Number((await call('/api/uploads/'+uploadId,{session:designer})).data.offset_bytes),8);
 assert.equal((await call('/api/uploads/'+uploadId,{method:'PUT',session:designer,body:file,headers:{'Upload-Offset':'0','Chunk-SHA256':digest(file)}})).status,409);
 const remaining=file.subarray(8);assert.equal((await call('/api/uploads/'+uploadId,{method:'PUT',session:designer,body:remaining,headers:{'Upload-Offset':'8','Chunk-SHA256':digest(remaining)}})).status,200);
 assert.equal((await call('/api/uploads/'+uploadId+'/complete',{method:'POST',session:designer,body:{}})).status,200);
});
test('required fields and idempotent concurrent submissions; server computes immutable price',async()=>{
 const body={customer:'Integration client',product:'Card',machine:'canon',material:'paper',quantity:10,copies:2,width:5,height:9,unit:'cm',options:{gsm:'250GSM',sides:'one'},uploadId,idempotencyKey:randomUUID()};
 assert.equal((await call('/api/orders',{method:'POST',session:designer,body:{...body,options:{}}})).status,400);
 const [a,b]=await Promise.all([call('/api/orders',{method:'POST',session:designer,body}),call('/api/orders',{method:'POST',session:designer,body})]);assert.equal(a.status,201);assert.equal(a.data.id,b.data.id);orderId=a.data.id;
 assert.equal((await call('/api/orders',{method:'POST',session:designer,body:{...body,customer:'Changed'}})).status,409);
 let rows=(await call('/api/orders',{session:admin})).data.orders;assert.equal(rows[0].pricing.total,100);assert.equal(rows[0].pricing.cost,60);assert.equal(rows[0].pricing.margin,40);
 await pool.query("UPDATE materials SET price='{}' WHERE id='paper'");rows=(await call('/api/orders',{session:operator})).data.orders;assert.equal(rows[0].pricing.total,100);assert.equal(rows[0].pricing.cost,undefined);
});
test('live SSE, exclusive claims, history, download and verified daily archive',async()=>{
 const abort=new AbortController();const events=await fetch(origin+'/api/events',{headers:{Cookie:operator.cookie},signal:abort.signal});assert.equal(events.headers.get('content-type').includes('text/event-stream'),true);const reader=events.body.getReader();await reader.read();
 const received=await call('/api/orders/'+orderId+'/status',{method:'POST',session:operator,body:{version:1,status:'received'}});assert.equal(received.status,200);assert.match(new TextDecoder().decode((await reader.read()).value),/changed/);abort.abort();
 assert.equal((await call('/api/orders/'+orderId+'/status',{method:'POST',session:other,body:{version:1,status:'received'}})).status,409);
 assert.equal((await call('/api/orders/'+orderId+'/status',{method:'POST',session:other,body:{version:2,status:'running'}})).status,409);
 for(const [version,status] of [[2,'running'],[3,'completed'],[4,'archived']])assert.equal((await call('/api/orders/'+orderId+'/status',{method:'POST',session:operator,body:{version,status}})).status,200);
 const history=await call('/api/orders/'+orderId+'/history',{session:operator});assert.equal(history.data.history.length,5);
 const {rows:[a]}=await pool.query('SELECT * FROM archives WHERE order_id=$1',[orderId]);assert.match(a.relative_path,/archive\/\d{4}\/\d{2}\/\d{2}\/canon\//);assert.equal(digest(await readFile(safePath(root,a.relative_path))),digest(file));
 assert.equal((await call('/api/orders/'+orderId+'/file',{session:operator})).data,file.toString());
 assert.equal((await call('/api/orders/'+orderId+'/status',{method:'POST',session:operator,body:{version:5,status:'new'}})).status,409);
 assert.equal((await call('/api/orders/'+orderId+'/status',{method:'POST',session:admin,body:{version:5,status:'new'}})).status,200);
});
test('offline sync retains events and recovery acknowledges only accepted versions',async()=>{
 const config={url:'https://example.test/api/production',secret:'x'.repeat(40)};
 await assert.rejects(syncOnce(pool,{...config,fetcher:async()=>{throw Error('offline');}}));
 assert.equal((await pool.query('SELECT * FROM outbox WHERE delivered_at IS NULL')).rowCount,6);
 const result=await syncOnce(pool,{...config,fetcher:async(url,opts)=>{const {events}=JSON.parse(opts.body);assert.equal(events.length,6);assert.equal(events.some(e=>'cost' in e||'relative_path' in e),false);return {ok:true,json:async()=>({ok:true,accepted:events.map(e=>({id:e.id,version:e.version}))})};}});assert.equal(result.delivered,6);
});
test('Riyadh cleanup catch-up, snooze, acknowledge, and unknown costs stay unknown',async()=>{
 assert.equal(cleanupDay(new Date('2026-11-04T18:59:59Z')),'2026-11-03');assert.equal(cleanupDay(new Date('2026-11-04T19:00:00Z')),'2026-11-04');
 assert.equal((await call('/api/cleanup',{session:operator})).data.pending.length,1);
 await call('/api/cleanup',{method:'POST',session:operator,body:{action:'later'}});assert.equal((await call('/api/cleanup',{session:operator})).data.pending.length,0);
 await call('/api/cleanup',{method:'POST',session:operator,body:{action:'done'}});
 const p=priceSnapshot({quantity:1,copies:1,width:1,height:1,unit:'cm'},{unit:'piece',price:{retail:5}});assert.equal(p.cost,null);assert.equal(p.margin,null);assert.equal(p.error,'cost_missing');
});
test('backup restore drill uses a separate empty database and verifies archived bytes',async()=>{
 const {readdir}=await import('node:fs/promises');
 const backupRoot=await mkdtemp(path.join(os.tmpdir(),'asbarix-backup-test-'));
 const restoredRoot=path.join(backupRoot,'restored-files');
 const targetURL=new URL(process.env.TEST_DATABASE_URL);targetURL.pathname='/restore_drill';
 await pool.query('CREATE DATABASE restore_drill');
 const run=async(command,extra)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[new URL('../src/backup.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),command],{windowsHide:true,env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,STORAGE_ROOT:root,...extra},stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);p.on('exit',code=>code===0?resolve():reject(Error(text)));p.on('error',reject);});
 await run('backup',{BACKUP_ROOT:backupRoot,EXPECTED_STORAGE_ROOT:root});
 const [folder]=await readdir(backupRoot);
 await run('restore',{RESTORE_BACKUP:path.join(backupRoot,folder),RESTORE_STORAGE_ROOT:restoredRoot,RESTORE_DATABASE_URL:targetURL.toString()});
 const restored=database(targetURL.toString());try{
  const {rows:[o]}=await restored.query('SELECT * FROM orders WHERE id=$1',[orderId]);assert.equal(o.status,'new');
  const {rows:[a]}=await restored.query('SELECT * FROM archives WHERE order_id=$1',[orderId]);assert.equal(digest(await readFile(safePath(restoredRoot,a.relative_path))),digest(file));
 }finally{await restored.end();}
});
test('real Edge browser submits a file, switches RTL/LTR and downloads',async()=>{
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('#login input[name=username]').fill('designer');await page.locator('#login input[name=password]').fill('test-only-password-123');await page.locator('#login button').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('#language').click();assert.equal(await page.locator('html').getAttribute('dir'),'ltr');
  await page.locator('#order-form input[name=customer]').fill('Browser acceptance fixture');await page.locator('#order-form input[name=product]').fill('Business card');await page.locator('#machine').selectOption('canon');await page.locator('#material').selectOption('paper');await page.locator('#order-form input[name=width]').fill('9');await page.locator('#order-form input[name=height]').fill('5');
  await page.locator('#file').setInputFiles({name:'browser.pdf',mimeType:'application/pdf',buffer:file});await page.locator('#submit-order').click();
  await page.waitForFunction(()=>document.getElementById('upload-state').textContent==='Order submitted');assert.match(await page.locator('#orders').innerText(),/Browser acceptance fixture/);
  const downloadPromise=page.waitForEvent('download');await page.locator('.job').filter({hasText:'Browser acceptance fixture'}).locator('a.download').click();const download=await downloadPromise;assert.equal(digest(await readFile(await download.path())),digest(file));
  await page.locator('#language').click();assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
test('service restart preserves sessions, order history and upload resume offsets',async()=>{
 const r=await call('/api/uploads',{method:'POST',session:designer,body:{name:'restart.pdf',size:file.length,sha256:digest(file)}});const id=r.data.id;
 await call('/api/uploads/'+id,{method:'PUT',session:designer,body:file.subarray(0,8),headers:{'Upload-Offset':'0','Chunk-SHA256':digest(file.subarray(0,8))}});
 app.closeStreams();await new Promise(r=>server.close(r));
 app=await createApp({pool,root,origin,reserve:0,maxFile:1024*1024});server=app.listen(55440,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 assert.equal(Number((await call('/api/uploads/'+id,{session:designer})).data.offset_bytes),8);
 assert.equal((await call('/api/orders/'+orderId+'/history',{session:operator})).data.history.length,6);
 const remaining=file.subarray(8);assert.equal((await call('/api/uploads/'+id,{method:'PUT',session:designer,body:remaining,headers:{'Upload-Offset':'8','Chunk-SHA256':digest(remaining)}})).status,200);
 assert.equal((await call('/api/uploads/'+id+'/complete',{method:'POST',session:designer,body:{}})).status,200);
});
test('low disk headroom rejects uploads without accepting a partial order',async()=>{
 app.closeStreams();await new Promise(r=>server.close(r));
 app=await createApp({pool,root,origin,reserve:Number.MAX_SAFE_INTEGER});server=app.listen(55440,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 assert.equal((await call('/health')).status,503);
 assert.equal((await call('/api/uploads',{method:'POST',session:designer,body:{name:'low-space.pdf',size:file.length,sha256:digest(file)}})).status,507);
});
