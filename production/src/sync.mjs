import { createHmac, randomBytes } from 'node:crypto';
export async function syncOnce(pool,{url,secret,fetcher=fetch}) {
  if(!url||!secret)return {disabled:true};
  if(new URL(url).protocol!=='https:'||secret.length<32)throw Error('secure_sync_configuration_required');
  const {rows}=await pool.query('SELECT id,payload FROM outbox WHERE delivered_at IS NULL ORDER BY id LIMIT 100');
  const body=JSON.stringify({events:rows.map(r=>r.payload)}),time=String(Date.now()),nonce=randomBytes(16).toString('hex');
  const signature=createHmac('sha256',secret).update(time+'.'+nonce+'.'+body).digest('hex');
  const r=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Production-Time':time,'X-Production-Nonce':nonce,'X-Production-Signature':signature},body});
  if(!r.ok)throw Error('sync_http_'+r.status);const data=await r.json();if(!data.ok||!Array.isArray(data.accepted))throw Error('sync_invalid_ack');
  const ids=rows.filter(r=>data.accepted.some(a=>a.id===r.payload.id&&a.version===r.payload.version)).map(r=>r.id);
  if(ids.length)await pool.query('UPDATE outbox SET delivered_at=now() WHERE id=ANY($1::bigint[])',[ids]);
  if(data.catalog)await pool.query("INSERT INTO settings(key,value) VALUES('cloud-catalog',$1) ON CONFLICT(key) DO UPDATE SET value=$1",[data.catalog]);
  return {delivered:ids.length};
}
export function startSync(pool) {
  let stopped=false,timer,failures=0;
  const run=async()=>{try{await syncOnce(pool,{url:process.env.SYNC_URL,secret:process.env.SYNC_SECRET});failures=0;}catch{failures++;console.error(JSON.stringify({event:'sync_retry',attempt:failures}));}if(!stopped)timer=setTimeout(run,Math.min(300000,15000*2**Math.min(failures,5)));};
  if(process.env.SYNC_URL)run();return()=>{stopped=true;clearTimeout(timer);};
}
