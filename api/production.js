import { createHmac, timingSafeEqual } from 'node:crypto';
import { pipeline, configured } from './_redis.js';
import { isAdmin } from './_session.js';
import { catalog } from './_pricing.js';
const prefix='montage:production:v1:';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    if(!configured())return res.status(503).json({error:'storage_unavailable'});
    if(req.method==='GET') {
      if(!await isAdmin(req))return res.status(401).json({error:'unauthorized'});
      const [rows,lastSync]=await pipeline([['HVALS',prefix+'orders'],['GET',prefix+'last-sync']]);
      return res.status(200).json({orders:(rows||[]).map(JSON.parse),lastSync:lastSync||null});
    }
    if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
    const key=process.env.PRODUCTION_SYNC_SECRET;
    if(!key||key.length<32)return res.status(503).json({error:'sync_not_configured'});
    const timestamp=req.headers['x-production-time'],nonce=req.headers['x-production-nonce'],signature=req.headers['x-production-signature'];
    if(!/^\d{13}$/.test(timestamp||'')||Math.abs(Date.now()-Number(timestamp))>300000||! /^[a-f0-9]{32}$/.test(nonce||'')||! /^[a-f0-9]{64}$/.test(signature||''))return res.status(401).json({error:'invalid_signature'});
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if(typeof raw!=='string'||Buffer.byteLength(raw)>262144)return res.status(413).json({error:'too_large'});
    const expected=createHmac('sha256',key).update(timestamp+'.'+nonce+'.'+raw).digest();
    if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return res.status(401).json({error:'invalid_signature'});
    const b=JSON.parse(raw);
    if(!Array.isArray(b.events)||b.events.length>100)return res.status(400).json({error:'invalid_events'});
    const allowed=['id','number','customer','machine','status','version','createdAt','updatedAt','designer','operator','total','pricingError'];
    for(const e of b.events){
      if(!e||Object.keys(e).some(k=>!allowed.includes(k))||! /^[0-9a-f-]{36}$/.test(e.id||'')||!Number.isInteger(e.version)||e.version<1||!['new','received','running','completed','archived'].includes(e.status)||typeof e.customer!=='string'||e.customer.length>200||typeof e.machine!=='string'||e.machine.length>40||!Number.isFinite(Date.parse(e.createdAt))||!Number.isFinite(Date.parse(e.updatedAt))||! /^\d+$/.test(String(e.number))||[e.designer,e.operator].some(v=>v!==null&&(typeof v!=='string'||v.length>100))||(e.total!==null&&(typeof e.total!=='number'||!Number.isFinite(e.total)||e.total<0))||(e.pricingError!==null&&(typeof e.pricingError!=='string'||e.pricingError.length>80)))return res.status(400).json({error:'invalid_event'});
    }
    const [fresh]=await pipeline([['SET',prefix+'nonce:'+nonce,'1','NX','EX',600]]);
    if(!fresh)return res.status(409).json({error:'replay_rejected'});
    const lua="local old=redis.call('HGET',KEYS[1],ARGV[1]); if not old or tonumber(cjson.decode(old).version)<tonumber(ARGV[2]) then redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); end; return 1";
    await pipeline([...b.events.map(e=>['EVAL',lua,1,prefix+'orders',e.id,e.version,JSON.stringify(e)]),['SET',prefix+'last-sync',new Date().toISOString()]]);
    // Returned only to the authenticated local server. Never rendered to the designer.
    return res.status(200).json({ok:true,accepted:b.events.map(e=>({id:e.id,version:e.version})),catalog:await catalog()});
  }catch{return res.status(503).json({error:'production_unavailable'});}
}
