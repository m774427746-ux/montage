import { configured, pipeline } from './_redis.js';
export const readCookie = (req, name) => {
 const header=typeof req.headers.get==='function'?req.headers.get('cookie')||'':req.headers.cookie||'';
 return header.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
};
export const parseBody=req=>{try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;return body&&typeof body==='object'&&!Array.isArray(body)?body:{};}catch{return {};}};
export async function session(req, onlyRole) {
 if(!configured()) return null;
 const candidates=['admin','team'].filter(role=>!onlyRole||onlyRole===role).map(role=>({role,token:readCookie(req,role==='admin'?'asb_admin':'asb_session')})).filter(x=>/^[a-f0-9]{64}$/.test(x.token));
 if(!candidates.length)return null;
 const values=await pipeline(candidates.map(x=>['GET','montage:session:'+x.token]));
 for(let i=0;i<values.length;i++){
  const value=values[i]?JSON.parse(values[i]):null;
  if(!value||value.role!==candidates[i].role||value.expires<=Date.now())continue;
  const [raw]=await pipeline([['GET','montage:auth:'+value.role]]);
  const version=raw?JSON.parse(raw).version:'initial';
  if(value.version===version)return {...value,token:candidates[i].token};
 }
 return null;
}
export const isAdmin=async req=>Boolean(await session(req,'admin'));
export const isTeam=async req=>Boolean(await session(req,'team'));
