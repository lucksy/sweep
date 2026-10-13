// Moving to the user's Trash instead of deleting (SPEC-engine §Additions).
// The guard checks every path before it gets here.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Into a folder, under a name not taken yet; across disks it fails rather than copies.
function moveInto(abs, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(abs);
  let target = path.join(dir, base);
  for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `${base} ${n}`);
  try {
    fs.renameSync(abs, target);
  } catch (e) {
    throw new Error(e.code === 'EXDEV' ? 'the Trash is on another disk' : `the Trash refused it: ${e.code ?? e.message}`);
  }
}

/** Moves one path to the Trash: SWEEP_TRASH_DIR (tests), macOS `trash`, ~/.Trash, or Linux `gio trash`. */
export function moveToTrash(abs, { home, dir = null, platform = process.platform }) {
  if (dir) return moveInto(abs, dir);
  if (platform === 'darwin') {
    if (fs.existsSync('/usr/bin/trash')) {
      try {
        execFileSync('/usr/bin/trash', ['-s', abs], { stdio: 'pipe' });
        return;
      } catch (e) {
        throw new Error(`the Trash refused it: ${String(e.stderr || e.message).trim()}`);
      }
    }
    return moveInto(abs, path.join(home, '.Trash'));
  }
  try {
    execFileSync('gio', ['trash', abs], { stdio: 'pipe' });
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'no Trash on this system (gio is missing)' : `the Trash refused it: ${String(e.stderr || e.message).trim()}`);
  }
}
