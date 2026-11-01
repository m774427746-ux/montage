import { randomBytes,scryptSync,timingSafeEqual } from 'node:crypto';
import { pipeline } from './_redis.js';
export const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
export async function credential(role){const [raw]=await pipeline([['GET','montage:auth:'+role]]);return raw?JSON.parse(raw):null;}
export function matches(role,password,saved){
 if(typeof password!=='string'||!password||password.length>256)return false;
 if(saved)return same(scryptSync(password,saved.salt,64).toString('hex'),saved.hash);
 const initial=role==='admin'?process.env.ADMIN_KEY:process.env.TEAM_CODE;
 return Boolean(initial)&&same(password,initial);
}
export async function issue(res,role,version='initial'){
 const token=randomBytes(32).toString('hex'),seconds=role==='admin'?28800:43200;
 await pipeline([['SET','montage:session:'+token,JSON.stringify({role,version,expires:Date.now()+seconds*1000}),'EX',seconds]]);
 res.setHeader('Set-Cookie',`${role==='admin'?'asb_admin':'asb_session'}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`);
}
export async function saveCredential(role,password){
 const salt=randomBytes(16).toString('hex'),version=randomBytes(16).toString('hex');
 await pipeline([['SET','montage:auth:'+role,JSON.stringify({salt,version,hash:scryptSync(password,salt,64).toString('hex')})]]);
 return version;
}
