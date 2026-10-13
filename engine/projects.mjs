// Transcript folders in ~/.claude/projects and the project each belongs to.

import fs from 'node:fs';
import path from 'node:path';

import { ageDays, encodeProject, isDir, ls } from './fsx.mjs';

// The working directory a transcript folder belongs to, read from its first session file.
export function transcriptCwd(dir) {
  for (const f of ls(dir).filter((n) => n.endsWith('.jsonl'))) {
    let fd;
    try {
      fd = fs.openSync(path.join(dir, f), 'r');
      const buf = Buffer.alloc(65536);
      const text = buf.toString('utf8', 0, fs.readSync(fd, buf, 0, buf.length, 0));
      const m = text.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
      if (m) return JSON.parse(`"${m[1]}"`);
    } catch {} finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  return null;
}

// The original path of a transcript folder: known from ~/.claude.json, else read from a transcript.
export const originalPath = (ctx, dir) => ctx.knownProjects().get(path.basename(dir)) ?? transcriptCwd(dir);

// Transcript folders whose project folder no longer exists.
export const orphanProjects = (ctx) => ctx.once('orphanProjects', async () => {
  const root = path.join(ctx.claudeDir, 'projects');
  const liveEncoded = new Set([...ctx.live().cwds].map(encodeProject));
  const items = [];
  for (const name of ls(root)) {
    const p = path.join(root, name);
    if (!isDir(p) || liveEncoded.has(name)) continue;
    const original = originalPath(ctx, p);
    if (original && fs.existsSync(original)) continue;
    if (!original && fs.existsSync(name.replace(/-/g, '/'))) continue;
    const hasMemory = ls(path.join(p, 'memory')).length > 0;
    const bytes = (await ctx.size(p)) - (await ctx.size(path.join(p, 'memory')));
    if (bytes <= 0) continue;
    const reason = original || ctx.force ? null : 'unknown-origin';
    items.push({
      path: p, label: name, project: original, bytes, ageDays: ageDays(p),
      cleanable: reason === null, reason,
      note: (original ? `${original} (gone)` : 'original path unknown') + (hasMemory ? ' · memory/ kept' : ''),
      detail: { hasMemory },
    });
  }
  return items;
});
