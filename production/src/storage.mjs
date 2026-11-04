import { createReadStream } from 'node:fs';
import { mkdir, open, statfs, copyFile, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { safePath, fail } from './core.mjs';
export async function capacity(root, needed, reserve) {
  const s = await statfs(root);
  if (s.bavail * s.bsize - needed < reserve) fail(507, 'storage_low');
}
export async function fileHash(file) {
  const h = createHash('sha256');
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest('hex');
}
export async function verifyFile(file, name, hash) {
  const ext = path.extname(name).toLowerCase();
  const f = await open(file, 'r'); const head = Buffer.alloc(8);
  try { await f.read(head,0,8,0); } finally { await f.close(); }
  const valid = ext === '.pdf' ? head.subarray(0,5).toString() === '%PDF-' : ext === '.png' ? head.toString('hex') === '89504e470d0a1a0a' : ['.jpg','.jpeg'].includes(ext) ? head[0] === 255 && head[1] === 216 && head[2] === 255 : ['.tif','.tiff'].includes(ext) && ['49492a00','4d4d002a'].includes(head.subarray(0,4).toString('hex'));
  if (!valid) fail(415, 'file_signature_invalid');
  if (await fileHash(file) !== hash) fail(422, 'file_hash_mismatch');
}
export async function archiveFile(root, upload, order, reserve) {
  const date = new Date(Date.now()+3*3600000).toISOString().slice(0,10).replaceAll('-','/');
  const relative = `archive/${date}/${order.machine_id}/${order.id}/${upload.id}.bin`;
  const source = safePath(root, upload.relative_path), destination = safePath(root, relative);
  await capacity(root, Number(upload.size), reserve);
  await mkdir(path.dirname(destination), { recursive: true });
  try { await copyFile(source, destination, constants.COPYFILE_EXCL); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  if (!(await lstat(destination)).isFile() || await fileHash(destination) !== upload.expected_hash) fail(500, 'archive_verification_failed');
  const handle = await open(destination,'r+'); try { await handle.sync(); } finally { await handle.close(); }
  return relative;
}
