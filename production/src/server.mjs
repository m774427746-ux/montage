import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transaction, database } from './db.mjs';
import { digest, fail, uuid, safePath, passwordHash, verifyPassword, validateDetails, priceSnapshot, publicPricing, nextStatus, cleanupDay } from './core.mjs';
import { capacity, verifyFile, archiveFile } from './storage.mjs';

export async function createApp({pool, root, origin='http://127.0.0.1:3000', reserve=2*1024**3, maxFile=4*1024**3}) {
  await mkdir(root,{recursive:true});
  await mkdir(safePath(root,'incoming'),{recursive:true});
  const app=express(), clients=new Set();
  app.disable('x-powered-by');
  app.use(helmet({strictTransportSecurity:origin.startsWith('https:')?undefined:false,contentSecurityPolicy:{directives:{scriptSrc:["'self'","'wasm-unsafe-eval'"],upgradeInsecureRequests:origin.startsWith('https:')?[]:null}}}));
  app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.use(express.json({limit:'64kb'}));
  app.get('/health',async(req,res)=>{try {await pool.query('SELECT 1');await capacity(root,0,reserve);res.json({ok:true});}catch{res.status(503).json({ok:false});}});
  app.use('/api', (req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)return res.status(403).json({error:'origin_rejected'});next();});
  const dummyHash=passwordHash(randomBytes(24).toString('hex'));
  app.post('/api/login',rateLimit({windowMs:15*60000,limit:15,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
    const {username,password}=req.body||{};
    if(typeof username!=='string'||username.length>80)fail(401,'invalid_login');
    const {rows:[u]}=await pool.query('SELECT * FROM users WHERE username=$1 AND active=true',[username]);
    const valid=verifyPassword(password,u?.password_hash||dummyHash);
    if(!valid||!u)fail(401,'invalid_login');
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '12 hours')",[digest(token),u.id,csrf]);
    res.setHeader('Set-Cookie',`asb_local=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${origin.startsWith('https:')?'; Secure':''}`);
    res.json({csrf,role:u.role,name:u.display_name});
  });
  app.use('/api',async(req,res,next)=>{
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asb_local='))?.slice(10);
    if(!token||!/^[a-f0-9]{64}$/.test(token))fail(401,'unauthorized');
    const {rows:[u]}=await pool.query('SELECT u.id,u.role,u.display_name,s.csrf,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND u.active=true',[digest(token)]);
    if(!u)fail(401,'unauthorized');req.user=u;
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==u.csrf)fail(403,'csrf_rejected');
    next();
  });
  const role=(req,...roles)=>{if(!roles.includes(req.user.role))fail(403,'forbidden');};
  app.get('/api/me',(req,res)=>res.json({csrf:req.user.csrf,role:req.user.role,name:req.user.display_name}));
  app.post('/api/logout',async(req,res)=>{await pool.query('DELETE FROM sessions WHERE user_id=$1 AND csrf=$2',[req.user.id,req.user.csrf]);res.setHeader('Set-Cookie','asb_local=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({ok:true});});
  app.get('/api/catalog',async(req,res)=>{
    const machines=(await pool.query('SELECT * FROM machines WHERE active=true ORDER BY id')).rows;
    const materials=(await pool.query('SELECT * FROM materials ORDER BY name')).rows.map(m=>req.user.role==='admin'?m:({id:m.id,name:m.name,machine_id:m.machine_id,unit:m.unit,options:m.options}));
    res.json({machines,materials});
  });
  app.post('/api/users',async(req,res)=>{
    role(req,'admin');const b=req.body||{};
    if(!/^[a-zA-Z0-9_.-]{3,80}$/.test(b.username||'')||!['admin','designer','operator'].includes(b.role)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100)fail(400,'invalid_user');
    const id=randomUUID();await pool.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,true)',[id,b.username,b.name,passwordHash(b.password),b.role]);res.status(201).json({id});
  });
  app.put('/api/machines',async(req,res)=>{
    role(req,'admin');const b=req.body||{};
    if(!/^[a-z0-9-]{1,40}$/.test(b.id||'')||typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!Array.isArray(b.fields)||b.fields.some(f=>!['gsm','sides','mirror','color','thickness','cut'].includes(f)))fail(400,'invalid_machine');
    await pool.query('INSERT INTO machines(id,name,fields) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,fields=$3',[b.id,b.name,JSON.stringify(b.fields)]);res.json({ok:true});
  });
  app.put('/api/materials',async(req,res)=>{
    role(req,'admin');const b=req.body||{};
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(b.id||'')||typeof b.name!=='string'||!b.name.trim()||b.name.length>120||!['piece','cm2','m2'].includes(b.unit))fail(400,'invalid_material');
    const {rows:[machine]}=await pool.query('SELECT * FROM machines WHERE id=$1',[b.machine_id]);if(!machine)fail(400,'invalid_machine');
    if(!b.options||Array.isArray(b.options)||Object.entries(b.options).some(([k,v])=>!machine.fields.includes(k)||!Array.isArray(v)||!v.length||v.length>30||v.some(x=>typeof x!=='string'||x.length>80)))fail(400,'invalid_options');
    const price={};for(const k of ['retail','cost','operationCost']){const v=b.price?.[k]??null;if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e7))fail(400,'invalid_price');price[k]=v;}
    await pool.query('INSERT INTO materials(id,name,machine_id,unit,options,price) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=$2,machine_id=$3,unit=$4,options=$5,price=$6,updated_at=now()',[b.id,b.name,b.machine_id,b.unit,b.options,price]);res.json({ok:true});
  });
  app.post('/api/uploads',async(req,res)=>{
    role(req,'designer','admin');const b=req.body||{};
    if(typeof b.name!=='string'||b.name.length>180||/[\x00-\x1f/\\:]/.test(b.name)||! /\.(pdf|png|jpe?g|tiff?)$/i.test(b.name)||!Number.isSafeInteger(b.size)||b.size<8||b.size>maxFile||! /^[a-f0-9]{64}$/.test(b.sha256||''))fail(400,'invalid_upload');
    await capacity(root,b.size,reserve);const id=randomUUID(),relative=`incoming/${id}.bin`;
    const f=await open(safePath(root,relative),'wx');await f.close();
    await pool.query('INSERT INTO uploads(id,user_id,original_name,size,expected_hash,relative_path) VALUES($1,$2,$3,$4,$5,$6)',[id,req.user.id,b.name,b.size,b.sha256,relative]);res.status(201).json({id,offset:0});
  });
  app.get('/api/uploads/:id',async(req,res)=>{if(!uuid(req.params.id))fail(400,'invalid_id');const {rows:[u]}=await pool.query('SELECT id,offset_bytes,size,complete FROM uploads WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!u)fail(404,'not_found');res.json(u);});
  app.put('/api/uploads/:id',express.raw({type:'application/octet-stream',limit:'8mb'}),async(req,res)=>{
    role(req,'designer','admin');if(!uuid(req.params.id)||!Buffer.isBuffer(req.body)||!req.body.length)fail(400,'invalid_chunk');
    const result=await transaction(pool,async c=>{
      const {rows:[u]}=await c.query('SELECT * FROM uploads WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id]);if(!u)fail(404,'not_found');
      if(u.complete||Number(req.headers['upload-offset'])!==Number(u.offset_bytes))fail(409,'offset_conflict');
      const end=Number(u.offset_bytes)+req.body.length;if(end>Number(u.size))fail(413,'too_large');
      if(req.headers['chunk-sha256']!==digest(req.body))fail(422,'chunk_hash_mismatch');
      await capacity(root,req.body.length,reserve);
      const f=await open(safePath(root,u.relative_path),'r+');
      try {let n=0;while(n<req.body.length){const {bytesWritten}=await f.write(req.body,n,req.body.length-n,Number(u.offset_bytes)+n);if(!bytesWritten)throw Error('short_write');n+=bytesWritten;}await f.truncate(end);await f.sync();}finally{await f.close();}
      await c.query('UPDATE uploads SET offset_bytes=$2 WHERE id=$1',[u.id,end]);return {offset:end};
    });res.json(result);
  });
  app.post('/api/uploads/:id/complete',async(req,res)=>{
    if(!uuid(req.params.id))fail(400,'invalid_id');
    await transaction(pool,async c=>{const {rows:[u]}=await c.query('SELECT * FROM uploads WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id]);if(!u)fail(404,'not_found');if(u.offset_bytes!==u.size)fail(409,'incomplete_upload');await verifyFile(safePath(root,u.relative_path),u.original_name,u.expected_hash);await c.query('UPDATE uploads SET complete=true WHERE id=$1',[u.id]);});res.json({ok:true});
  });
  async function projection(c,id) {
    const {rows:[o]}=await c.query('SELECT o.*,u.display_name AS designer,p.display_name AS operator,i.pricing FROM orders o JOIN users u ON u.id=o.designer_id LEFT JOIN users p ON p.id=o.operator_id JOIN order_items i ON i.order_id=o.id WHERE o.id=$1',[id]);
    const payload={id:o.id,number:o.number,customer:o.customer,machine:o.machine_id,status:o.status,version:o.version,createdAt:o.created_at,updatedAt:o.updated_at,designer:o.designer,operator:o.operator,total:o.pricing.total??null,pricingError:o.pricing.error??null};
    await c.query('INSERT INTO outbox(order_id,version,payload) VALUES($1,$2,$3)',[id,o.version,payload]);
  }
  function emit(){for(const client of clients)client.res.write('event: changed\ndata: {}\n\n');}
  app.post('/api/orders',async(req,res)=>{
    role(req,'designer','admin');const b=req.body||{};
    if(!uuid(b.idempotencyKey)||!uuid(b.uploadId))fail(400,'invalid_id');
    const hash=digest(JSON.stringify(b));
    const id=await transaction(pool,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[req.user.id+b.idempotencyKey]);
      const {rows:[existing]}=await c.query('SELECT * FROM orders WHERE designer_id=$1 AND idempotency_key=$2',[req.user.id,b.idempotencyKey]);
      if(existing){if(existing.request_hash!==hash)fail(409,'idempotency_conflict');return existing.id;}
      const {rows:[u]}=await c.query('SELECT * FROM uploads WHERE id=$1 AND user_id=$2 AND complete=true FOR UPDATE',[b.uploadId,req.user.id]);if(!u)fail(400,'final_file_required');
      const {rows:[m]}=await c.query('SELECT * FROM machines WHERE id=$1 AND active=true',[b.machine]);
      const {rows:[material]}=await c.query('SELECT * FROM materials WHERE id=$1',[b.material]);if(!m||!material)fail(400,'invalid_catalog');
      const details=validateDetails(b,m,material),pricing=priceSnapshot(details,material),id=randomUUID();
      await c.query('INSERT INTO orders(id,designer_id,machine_id,customer,idempotency_key,request_hash,upload_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,req.user.id,m.id,b.customer.trim(),b.idempotencyKey,hash,u.id]);
      await c.query('INSERT INTO order_items VALUES($1,$2,$3,$4)',[id,material.id,details,pricing]);
      await c.query("INSERT INTO status_history(order_id,actor_id,to_status) VALUES($1,$2,'new')",[id,req.user.id]);await projection(c,id);return id;
    });emit();res.status(201).json({id});
  });
  app.get('/api/orders',async(req,res)=>{
    const {rows}=await pool.query(`SELECT o.*,d.display_name AS designer,p.display_name AS operator,i.details,i.pricing,m.name AS material_name FROM orders o JOIN order_items i ON i.order_id=o.id JOIN materials m ON m.id=i.material_id JOIN users d ON d.id=o.designer_id LEFT JOIN users p ON p.id=o.operator_id WHERE ($1::uuid IS NULL OR designer_id=$1) AND ($2='' OR o.machine_id=$2) AND ($3='' OR o.status=$3) AND ($4='' OR o.customer ILIKE '%'||$4||'%' OR o.number::text=$4) AND ($5='' OR (o.created_at AT TIME ZONE 'Asia/Riyadh')::date::text=$5) ORDER BY o.created_at DESC LIMIT 500`,[req.user.role==='designer'?req.user.id:null,String(req.query.machine||''),String(req.query.status||''),String(req.query.search||'').slice(0,200),String(req.query.date||'')]);
    res.json({orders:rows.map(o=>({...o,pricing:publicPricing(o.pricing,req.user.role)}))});
  });
  app.post('/api/orders/:id/status',async(req,res)=>{
    role(req,'admin','operator');if(!uuid(req.params.id)||!Number.isInteger(req.body?.version))fail(400,'invalid_request');
    await transaction(pool,async c=>{
      const {rows:[o]}=await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id]);if(!o)fail(404,'not_found');if(o.version!==req.body.version)fail(409,'version_conflict');
      nextStatus(o.status,req.body.status,req.user.role);
      if(o.operator_id&&o.operator_id!==req.user.id&&req.user.role!=='admin')fail(409,'claimed_by_other_operator');
      if(req.body.status==='archived'){
        const {rows:[u]}=await c.query('SELECT * FROM uploads WHERE id=$1',[o.upload_id]);const relative=await archiveFile(root,u,o,reserve);
        await c.query('INSERT INTO archives VALUES($1,$2,$3,$4,now()) ON CONFLICT(order_id) DO UPDATE SET relative_path=$2,sha256=$3,archived_by=$4,archived_at=now()',[o.id,relative,u.expected_hash,req.user.id]);
      }
      await c.query('UPDATE orders SET status=$2,version=version+1,updated_at=now(),operator_id=CASE WHEN $2=\'new\' THEN NULL ELSE $3::uuid END WHERE id=$1',[o.id,req.body.status,req.user.id]);
      await c.query('INSERT INTO status_history(order_id,actor_id,from_status,to_status) VALUES($1,$2,$3,$4)',[o.id,req.user.id,o.status,req.body.status]);await projection(c,o.id);
    });emit();res.json({ok:true});
  });
  app.get('/api/orders/:id/history',async(req,res)=>{
    if(!uuid(req.params.id))fail(400,'invalid_id');const {rows:[o]}=await pool.query('SELECT * FROM orders WHERE id=$1',[req.params.id]);if(!o||(req.user.role==='designer'&&o.designer_id!==req.user.id))fail(404,'not_found');
    res.json({history:(await pool.query('SELECT h.*,u.display_name FROM status_history h JOIN users u ON u.id=h.actor_id WHERE order_id=$1 ORDER BY at',[o.id])).rows});
  });
  app.get('/api/orders/:id/file',async(req,res)=>{
    if(!uuid(req.params.id))fail(400,'invalid_id');const {rows:[o]}=await pool.query('SELECT o.designer_id,u.*,a.relative_path AS archive_path FROM orders o JOIN uploads u ON u.id=o.upload_id LEFT JOIN archives a ON a.order_id=o.id WHERE o.id=$1',[req.params.id]);
    if(!o||(req.user.role==='designer'&&o.designer_id!==req.user.id))fail(404,'not_found');
    await pool.query("INSERT INTO audit(actor_id,action,entity_id) VALUES($1,'download',$2)",[req.user.id,req.params.id]);res.download(safePath(root,o.archive_path||o.relative_path),o.original_name);
  });
  app.get('/api/events',(req,res)=>{
    if(clients.size>=100)fail(503,'too_many_streams');
    res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('event: changed\ndata: {}\n\n');
    const client={res};clients.add(client);
    const timer=setInterval(async()=>{try{const {rowCount}=await pool.query('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.user_id=$1 AND csrf=$2 AND expires_at>now() AND u.active=true',[req.user.id,req.user.csrf]);if(!rowCount){res.end();return;}res.write(': heartbeat\n\n');}catch{res.end();}},20000);
    req.on('close',()=>{clearInterval(timer);clients.delete(client);});
  });
  app.get('/api/cleanup',async(req,res)=>{const day=cleanupDay();await pool.query('INSERT INTO notifications(user_id,day) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,day]);const {rows}=await pool.query('SELECT day FROM notifications WHERE user_id=$1 AND acknowledged_at IS NULL AND (snooze_until IS NULL OR snooze_until<=now()) ORDER BY day',[req.user.id]);res.json({pending:rows});});
  app.post('/api/cleanup',async(req,res)=>{if(!['done','later'].includes(req.body?.action))fail(400,'invalid_action');await pool.query(req.body.action==='done'?'UPDATE notifications SET acknowledged_at=now() WHERE user_id=$1 AND acknowledged_at IS NULL':"UPDATE notifications SET snooze_until=now()+interval '30 minutes' WHERE user_id=$1 AND acknowledged_at IS NULL",[req.user.id]);res.json({ok:true});});
  app.get('/sha256.js',(req,res)=>res.sendFile(fileURLToPath(new URL('../node_modules/hash-wasm/dist/sha256.umd.min.js',import.meta.url))));
  app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
  app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const status=err.status|| (err.code==='23505'?409:500);if(status===500)console.error(JSON.stringify({at:new Date().toISOString(),event:'request_failed',code:err.code||'internal_error'}));res.status(status).json({error:status===500?'internal_error':err.code==='23505'?'duplicate':err.message});});
  app.closeStreams=()=>{for(const c of clients)c.res.end();};return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const pool=database(process.env.DATABASE_URL),root=process.env.STORAGE_ROOT;
  if(!root||!path.isAbsolute(root))throw Error('Absolute STORAGE_ROOT required');
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000),origin=process.env.LOCAL_ORIGIN||`http://127.0.0.1:${port}`;
  if(!['127.0.0.1','localhost','::1'].includes(host)&&!origin.startsWith('https:'))throw Error('LAN binding requires trusted HTTPS origin and approved proxy/firewall configuration');
  const app=await createApp({pool,root,origin,reserve:Number(process.env.MIN_FREE_BYTES||2147483648),maxFile:Number(process.env.MAX_FILE_BYTES||4294967296)});
  const server=app.listen(port,host,()=>console.log(JSON.stringify({event:'listening',host,port})));
  const {startSync}=await import('./sync.mjs');const stopSync=startSync(pool);
  const shutdown=()=>{stopSync();app.closeStreams();server.close(async()=>{await pool.end();process.exit(0);});};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
