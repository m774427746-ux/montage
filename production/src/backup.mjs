import { spawn } from 'node:child_process';
import { mkdir,readdir,copyFile,writeFile,readFile,stat } from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileHash} from './storage.mjs';
const pgBin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/16/bin';
function connectionEnv(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1))};}
async function run(bin,args,url){await new Promise((resolve,reject)=>{const child=spawn(path.join(pgBin,bin+'.exe'),args,{env:connectionEnv(url),windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.resume();child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(bin+'_failed_'+code)));});}
async function inventory(root,relative=''){let result=[];for(const e of await readdir(path.join(root,relative),{withFileTypes:true})){const p=path.join(relative,e.name);if(e.isSymbolicLink())throw Error('Symlinks are not supported in storage backups');if(e.isDirectory())result.push(...await inventory(root,p));else if(e.isFile())result.push({path:p,sha256:await fileHash(path.join(root,p)),size:(await stat(path.join(root,p))).size});}return result;}
async function copyVerified(from,to,files){for(const f of files){const source=path.resolve(from,f.path),target=path.resolve(to,f.path);if(!source.startsWith(path.resolve(from)+path.sep)||!target.startsWith(path.resolve(to)+path.sep))throw Error('unsafe_manifest');await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target,1);if(await fileHash(target)!==f.sha256)throw Error('backup_checksum_mismatch');}}
try{
 if(process.argv[2]==='backup'){
  if(path.resolve(process.env.STORAGE_ROOT)!==path.resolve(process.env.EXPECTED_STORAGE_ROOT||''))throw Error('storage_configuration_mismatch');
  const folder=path.join(process.env.BACKUP_ROOT,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());await mkdir(folder);
  await run('pg_dump',['--format=custom','--schema=production','--no-owner','--file='+path.join(folder,'database.dump')],process.env.DATABASE_URL);
  const files=await inventory(process.env.STORAGE_ROOT);await copyVerified(process.env.STORAGE_ROOT,path.join(folder,'files'),files);
  await writeFile(path.join(folder,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),databaseHash:await fileHash(path.join(folder,'database.dump')),files},null,2),{flag:'wx'});console.log('Verified backup: '+folder);
 }else if(process.argv[2]==='restore'){
  // Never restores into a running production database. Target must be a pre-created empty drill database.
  const folder=process.env.RESTORE_BACKUP,root=process.env.RESTORE_STORAGE_ROOT,url=process.env.RESTORE_DATABASE_URL;
  if(!folder||!root||!url||url===process.env.DATABASE_URL)throw Error('Separate restore database and empty storage required');
  const {database}=await import('./db.mjs');const pool=database(url);try{const {rows:[r]}=await pool.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')");if(r.n)throw Error('Restore database is not empty');}finally{await pool.end();}
  await mkdir(root,{recursive:false});const m=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
  if(await fileHash(path.join(folder,'database.dump'))!==m.databaseHash)throw Error('dump_checksum_mismatch');
  await copyVerified(path.join(folder,'files'),root,m.files);
  await run('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname='+new URL(url).pathname.slice(1),path.join(folder,'database.dump')],url);console.log('Restore completed into isolated target; run integrity and download checks before any cutover');
 }else throw Error('Use backup or restore');
}catch(e){console.error(e.code||e.message);process.exitCode=1;}
