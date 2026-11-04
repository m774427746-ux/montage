import { database,migrate } from './db.mjs';
import { passwordHash } from './core.mjs';
import { randomUUID } from 'node:crypto';
import { open,mkdir,unlink,readFile } from 'node:fs/promises';
import path from 'node:path';
const pool=database(process.env.DATABASE_URL);
try {
  const command=process.argv[2];
  if(command==='migrate'){await migrate(pool);console.log('Migrations applied');}
  else if(command==='check'){
    const {rows:[r]}=await pool.query("SELECT current_user,current_database(),has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema");
    console.log(JSON.stringify(r));
    if(!process.env.STORAGE_ROOT||!path.isAbsolute(process.env.STORAGE_ROOT))throw Error('STORAGE_ROOT required');
    await mkdir(process.env.STORAGE_ROOT,{recursive:true});const file=path.join(process.env.STORAGE_ROOT,`.check-${randomUUID()}`);const f=await open(file,'wx');await f.write('probe');await f.sync();await f.close();await unlink(file);console.log('Storage write/sync verified');
  }else if(command==='create-admin'){
    const password=process.env.BOOTSTRAP_PASSWORD;
    await pool.query('INSERT INTO users VALUES($1,$2,$3,$4,\'admin\',true)',[randomUUID(),process.env.BOOTSTRAP_USER||'admin',process.env.BOOTSTRAP_NAME||'Administrator',passwordHash(password)]);console.log('Admin created; remove BOOTSTRAP_PASSWORD from environment');
  }else if(command==='import-cloud-material'){
    const [cloudId,machineId,localId]=process.argv.slice(3);
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(localId||''))throw Error('local material ID required');
    const {rows:[s]}=await pool.query("SELECT value FROM settings WHERE key='cloud-catalog'");
    const item=s?.value.items.find(x=>x.id===cloudId);if(!item)throw Error('Approved cloud catalog has not synced, or material missing');
    await pool.query('INSERT INTO materials(id,name,machine_id,unit,options,price) VALUES($1,$2,$3,$4,$5,$6)',[localId,item.name,machineId,item.unit,{}, {...item,source:'asbarix',policy:s.value.policy}]);console.log('Cloud material imported; review production options before use');
  }else throw Error('Commands: check, migrate, create-admin, import-cloud-material CLOUD_ID MACHINE_ID LOCAL_ID');
}catch(e){console.error(e.code||e.message);process.exitCode=1;}finally{await pool.end();}
