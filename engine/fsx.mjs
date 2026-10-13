// Small file-system and process helpers shared by the engine.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';

export const DAY = 86_400_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim();
  } catch {
    return null;
  }
}

// The same as sh(), without blocking: resolves stdout, or null on failure.
export function shAsync(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

// At most `n` promises from `fn` in flight at once.
export function limit(n) {
  let active = 0;
  const queue = [];
  const next = () => { if (active < n && queue.length) { active++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject).finally(() => { active--; next(); }));
    next();
  });
}

export const stat = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
export const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
export const isDir = (p) => stat(p)?.isDirectory() ?? false;
export const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
export const encodeProject = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

// Size on disk: the file's size, or `du -sk` for a folder.
export function sizeOf(p) {
  const s = stat(p);
  if (!s) return 0;
  if (!s.isDirectory()) return s.size;
  const out = sh('du', ['-sk', p]);
  return out ? parseInt(out, 10) * 1024 : 0;
}

// Age by the newest mtime of the entry and its direct children.
export function ageDays(p) {
  const s = stat(p);
  if (!s) return 0;
  let newest = s.mtimeMs;
  if (s.isDirectory()) for (const n of ls(p)) newest = Math.max(newest, stat(path.join(p, n))?.mtimeMs ?? 0);
  return (Date.now() - newest) / DAY;
}

export function fmt(bytes) {
  const u = ['B', 'K', 'M', 'G', 'T'];
  let i = 0;
  while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++; }
  return `${bytes >= 10 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)}${u[i]}`;
}

export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Stable across scans of the same path: the category and path, hashed.
export const itemId = (category, p) => `i_${crypto.createHash('sha1').update(`${category}\0${p}`).digest('hex').slice(0, 10)}`;
