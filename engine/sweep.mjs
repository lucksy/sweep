#!/usr/bin/env node
// sweep: find and clean the storage Claude Code leaves behind.
// Zero dependencies. Dry run unless --yes is given.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createGuard } from './guard.mjs';

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const TMP_BASE = process.env.CLAUDE_CODE_TMPDIR || (process.platform === 'darwin' ? '/private/tmp' : '/tmp');
const TMP_ROOT = path.join(TMP_BASE, `claude-${process.getuid ? process.getuid() : 0}`);
const CLI_VERSIONS = path.join(HOME, '.local', 'share', 'claude', 'versions');
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ---------- arguments

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('-')));
const positional = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '--days');
const daysIdx = argv.indexOf('--days');
const DAYS_OVERRIDE = daysIdx >= 0 ? Number(argv[daysIdx + 1]) : null;
const FORCE = flags.has('--force');
const YES = flags.has('--yes') || flags.has('-y');
const JSON_OUT = flags.has('--json');
const DETAILS = flags.has('--details') || flags.has('-d');
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => c(2, s), bold = (s) => c(1, s), red = (s) => c(31, s), green = (s) => c(32, s), yellow = (s) => c(33, s);

// ---------- helpers

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim();
  } catch {
    return null;
  }
}
const stat = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const isDir = (p) => stat(p)?.isDirectory() ?? false;
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const encodeProject = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

function sizeOf(p) {
  const s = stat(p);
  if (!s) return 0;
  if (!s.isDirectory()) return s.size;
  const out = sh('du', ['-sk', p]);
  return out ? parseInt(out, 10) * 1024 : 0;
}

// Age by the newest mtime of the entry and its direct children.
function ageDays(p) {
  const s = stat(p);
  if (!s) return 0;
  let newest = s.mtimeMs;
  if (s.isDirectory()) for (const n of ls(p)) newest = Math.max(newest, stat(path.join(p, n))?.mtimeMs ?? 0);
  return (Date.now() - newest) / DAY;
}

function fmt(bytes) {
  const u = ['B', 'K', 'M', 'G', 'T'];
  let i = 0;
  while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++; }
  return `${bytes >= 10 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)}${u[i]}`;
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// ---------- shared context (computed lazily, once)

const memo = new Map();
const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };

const live = () => once('live', () => {
  const ids = new Set(), cwds = new Set(), sessions = [];
  for (const f of ls(path.join(CLAUDE_DIR, 'sessions'))) {
    const j = f.endsWith('.json') && readJson(path.join(CLAUDE_DIR, 'sessions', f));
    if (j?.pid && alive(j.pid)) {
      if (j.sessionId) ids.add(j.sessionId);
      if (j.cwd) { cwds.add(j.cwd); sessions.push({ cwd: j.cwd, startedAt: j.startedAt ?? 0, version: j.version }); }
    }
  }
  return { ids, cwds, sessions };
});

const claudeJson = () => once('claudeJson', () => readJson(path.join(HOME, '.claude.json')) ?? {});

// Every directory Claude Code has been opened in.
const projectPaths = () => once('projects', () => {
  const set = new Set(Object.keys(claudeJson().projects ?? {}));
  for (const cwd of live().cwds) set.add(cwd);
  return [...set];
});

const days = (dflt) => (Number.isFinite(DAYS_OVERRIDE) ? DAYS_OVERRIDE : dflt);

// ---------- git worktrees

function parseWorktrees(repo) {
  const out = sh('git', ['-C', repo, 'worktree', 'list', '--porcelain']);
  if (!out) return [];
  return out.split('\n\n').map((block) => {
    const wt = {};
    for (const line of block.split('\n')) {
      const [k, ...rest] = line.split(' ');
      wt[k] = rest.join(' ') || true;
    }
    return { path: wt.worktree, branch: typeof wt.branch === 'string' ? wt.branch.replace('refs/heads/', '') : null, locked: !!wt.locked, prunable: !!wt.prunable };
  });
}

// Repos that hold Claude worktrees, deduplicated by git common dir.
const repos = () => once('repos', () => {
  const byCommon = new Map();
  for (const p of projectPaths()) {
    if (!isDir(p)) continue;
    const common = sh('git', ['-C', p, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (!common || byCommon.has(common)) continue;
    const wts = parseWorktrees(p);
    if (!wts.length) continue;
    byCommon.set(common, { main: wts[0].path, worktrees: wts, projectDirs: [] });
  }
  for (const p of projectPaths()) {
    const common = isDir(p) && sh('git', ['-C', p, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (common && byCommon.has(common)) byCommon.get(common).projectDirs.push(p);
  }
  return [...byCommon.values()];
});

// Commits reachable from `ref` and from no ordinary branch or remote.
function uniqueCommits(cwd, ref) {
  const n = sh('git', ['-C', cwd, 'rev-list', '--count', ref, '--not', '--exclude=worktree-*', '--branches', '--remotes']);
  return n === null ? null : Number(n);
}

const isClaudeWorktree = (p) => p.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`);

const worktreeScan = () => once('worktrees', () => {
  const items = [];
  const { cwds, sessions } = live();
  for (const repo of repos()) {
    const registered = new Set();
    const inRepo = (cwd) => [repo.main, ...repo.projectDirs].some((d) => cwd === d || cwd.startsWith(d + path.sep));
    const repoSessions = sessions.filter((x) => inRepo(x.cwd));
    for (const wt of repo.worktrees) {
      if (!wt.path || !isClaudeWorktree(wt.path)) continue;
      registered.add(wt.path);
      if (wt.prunable || !isDir(wt.path)) continue;
      const item = { path: wt.path, repo: repo.main, branch: wt.branch, bytes: sizeOf(wt.path), age: ageDays(wt.path) };
      const inUse = [...cwds].some((cwd) => cwd === wt.path || cwd.startsWith(wt.path + path.sep));
      const status = sh('git', ['-C', wt.path, 'status', '--porcelain']);
      item.dirty = status === null ? null : status.split('\n').filter(Boolean).length;
      item.unique = uniqueCommits(wt.path, 'HEAD');
      const born = stat(wt.path)?.birthtimeMs || stat(wt.path)?.mtimeMs || 0;
      item.owned = repoSessions.some((x) => x.startedAt && x.startedAt <= born);
      const nm = sizeOf(path.join(wt.path, 'node_modules'));
      const parts = [wt.branch ?? 'detached'];
      if (wt.locked) parts.push('locked: an agent may be running');
      if (inUse) parts.push('a live session is working here');
      else if (item.owned) parts.push('made during a session still running in this repo: kept unless --force');
      if (item.dirty) parts.push(`${item.dirty} uncommitted change(s)`);
      if (item.unique) parts.push(`${item.unique} commit(s) on no other branch`);
      if (!item.dirty && !item.unique) parts.push('clean, nothing unsaved');
      if (nm) parts.push(`node_modules ${fmt(nm)}`);
      parts.push(`${Math.floor(item.age)}d old`);
      item.note = parts.join(' · ');
      item.locked = wt.locked;
      item.inUse = inUse;
      item.blocked = wt.locked || inUse || item.dirty !== 0 || item.unique === null;
      // A clean worktree with commits can go with --force: its branch is kept, so the commits stay.
      item.cleanable = !item.blocked && (item.unique === 0 || FORCE) && (!item.owned || FORCE);
      items.push(item);
    }
    // Directories under .claude/worktrees that git no longer knows about.
    for (const dir of repo.projectDirs) {
      const root = path.join(dir, '.claude', 'worktrees');
      for (const name of ls(root)) {
        const p = path.join(root, name);
        if (registered.has(p) || !isDir(p)) continue;
        items.push({ path: p, bytes: sizeOf(p), note: 'orphan directory: git has no worktree record for it', cleanable: true, orphan: true });
      }
    }
  }
  return items;
});

// ---------- categories

const CATEGORIES = [
  {
    id: 'worktrees',
    title: 'Agent and workflow worktrees',
    risk: 'caution',
    creates: 'Subagents with isolation: "worktree", Workflow agents, EnterWorktree and `claude --worktree` create a full checkout in <repo>/.claude/worktrees/<name> on a branch worktree-<name>. Agents often run npm install there, so each one carries its own node_modules.',
    claude: 'Removed when the agent finishes with no changes. A worktree with changes stays until the cleanupPeriodDays sweep (default 30 days), which still keeps any with changes, untracked files or unpushed commits. `claude -p --worktree` sessions and non-backgrounded --worktree sessions are never swept.',
    sweep: 'Removes worktrees that are clean, unlocked, not in use by a live session and have no commits missing from other branches, plus orphan directories. Deletes their worktree-* branch. With --force it also removes clean worktrees whose commits exist only on their branch, but keeps that branch so nothing is lost. Never removes a worktree with uncommitted changes.',
    scan: () => worktreeScan(),
    clean: (item) => {
      if (item.orphan) return rm(item.path);
      if (sh('git', ['-C', item.repo, 'worktree', 'remove', '--force', item.path]) === null) throw new Error('git worktree remove failed');
      if (item.unique === 0 && item.branch?.startsWith('worktree-')) sh('git', ['-C', item.repo, 'branch', '-D', item.branch]);
      sh('git', ['-C', item.repo, 'worktree', 'prune']);
    },
  },
  {
    id: 'worktree-deps',
    title: 'node_modules inside worktrees that hold work',
    risk: 'safe',
    creates: 'Agents install dependencies in their worktree. When the worktree has unsaved work it cannot be removed, but its node_modules can be rebuilt with npm install.',
    claude: 'Never cleaned on its own: it goes only when the whole worktree goes.',
    sweep: 'Deletes untracked node_modules folders inside worktrees that are kept because they hold work. Your changes and commits are not touched.',
    scan: () => worktreeScan().filter((w) => !w.orphan && !w.cleanable && w.dirty !== null && !w.locked && !w.inUse).flatMap((w) => {
      const found = sh('find', [w.path, '-name', 'node_modules', '-type', 'd', '-prune']);
      return (found ? found.split('\n') : []).filter((p) => !sh('git', ['-C', w.path, 'ls-files', '--', p])).map((p) => ({ path: p, bytes: sizeOf(p), note: `in ${path.basename(w.path)}`, cleanable: true }));
    }).filter((i) => i.bytes > 64 * 1024),
    clean: (item) => rm(item.path),
  },
  {
    id: 'worktree-branches',
    title: 'Leftover worktree-* branches and stale worktree records',
    risk: 'safe',
    creates: 'Each agent worktree gets a branch worktree-<name> (workflows: worktree-wf_<id>-<n>). Git also keeps a record in .git/worktrees for every worktree, even after its directory is gone.',
    claude: 'The branch is deleted only when Claude removes the worktree itself.',
    sweep: 'Deletes worktree-* branches that are not checked out anywhere and whose commits all exist on another branch or remote. Prunes records of Claude worktrees whose directory no longer exists. Branches with unique commits are listed but kept.',
    scan: () => repos().flatMap((repo) => {
      const checkedOut = new Set(repo.worktrees.map((w) => w.branch).filter(Boolean));
      const refs = sh('git', ['-C', repo.main, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-*']);
      const branches = (refs ? refs.split('\n').filter(Boolean) : []).filter((b) => !checkedOut.has(b)).map((b) => {
        const unique = uniqueCommits(repo.main, b);
        return { path: `${repo.main} → ${b}`, repo: repo.main, branch: b, bytes: 0, note: unique ? `${unique} commit(s) on no other branch: kept` : 'fully merged elsewhere', cleanable: unique === 0 };
      });
      const stale = repo.worktrees.filter((w) => w.prunable && isClaudeWorktree(w.path)).map((w) => ({ path: w.path, repo: repo.main, bytes: 0, note: 'stale git record: directory is gone', cleanable: true, prune: true }));
      return [...branches, ...stale];
    }),
    clean: (item) => {
      if (item.prune) sh('git', ['-C', item.repo, 'worktree', 'prune']);
      else if (sh('git', ['-C', item.repo, 'branch', '-D', item.branch]) === null) throw new Error('git branch -D failed');
    },
  },
  {
    id: 'tmp-sessions',
    title: 'Temp session folders (scratchpads, task output, images)',
    risk: 'safe',
    creates: `Every session gets ${TMP_ROOT}/<project>/<session-id>/ holding the scratchpad, background task .output files and pasted images. Agents often npm install inside scratchpads. GitHub issues report runaway .output files of 100-500 GB.`,
    claude: 'Deleted when the matching transcript ages out (cleanupPeriodDays), or when the OS clears /tmp on reboot. `claude purge` does not touch it.',
    sweep: `Deletes session folders of sessions that are not running and are older than ${days(1)} day(s). Also deletes stray claude-*-cwd files in ${TMP_BASE}.`,
    scan: () => {
      const { ids, sessions } = live();
      const runningVersions = new Set(sessions.map((x) => x.version).filter(Boolean));
      const items = [];
      for (const proj of ls(TMP_ROOT)) {
        const pdir = path.join(TMP_ROOT, proj);
        if (!isDir(pdir)) continue;
        // Project folders are named after the encoded cwd and start with "-"; the rest are CLI caches.
        const kind = proj.startsWith('-') ? 'session' : proj === 'bundled-skills' ? 'bundled skills of CLI' : `${proj} cache`;
        for (const sid of ls(pdir)) {
          const p = path.join(pdir, sid);
          if (!isDir(p) || ids.has(sid) || ageDays(p) < days(1)) continue;
          if (proj === 'bundled-skills' && runningVersions.has(sid)) continue;
          items.push({ path: p, bytes: sizeOf(p), note: `${kind}${proj === 'bundled-skills' ? ` ${sid}` : ''} · ${Math.floor(ageDays(p))}d old`, cleanable: true });
        }
      }
      for (const f of ls(TMP_BASE)) {
        const p = path.join(TMP_BASE, f);
        if (/^claude-[0-9a-f]+-cwd$/.test(f) && ageDays(p) >= 1) items.push({ path: p, bytes: sizeOf(p), note: 'stray cwd marker file', cleanable: true });
      }
      return items;
    },
    clean: (item) => {
      rm(item.path);
      const parent = path.dirname(item.path);
      if (parent !== TMP_ROOT && parent.startsWith(TMP_ROOT) && !ls(parent).length) fs.rmdirSync(parent);
    },
  },
  {
    id: 'plugin-versions',
    title: 'Superseded plugin versions in the plugin cache',
    risk: 'caution',
    creates: 'Every plugin install or update unpacks a full copy into ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>, including any bundled node_modules. Failed fetches leave temp_git_* / temp_github_* folders.',
    claude: 'Never removed: old versions pile up on every update (GitHub issues #36245, #81217).',
    sweep: 'Deletes versions that installed_plugins.json no longer points at, whose .in_use marker is empty, and that are over a day old, plus stale temp_* fetch folders. Sessions still running an old version keep working until restart; quit them first to be safe.',
    scan: () => {
      const cache = path.join(CLAUDE_DIR, 'plugins', 'cache');
      const installed = readJson(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))?.plugins ?? {};
      const keep = new Set(Object.values(installed).flat().map((e) => e.installPath).filter(Boolean));
      const items = [];
      for (const m of ls(cache)) {
        const mdir = path.join(cache, m);
        if (m.startsWith('temp_')) {
          if (ageDays(mdir) >= 1) items.push({ path: mdir, bytes: sizeOf(mdir), note: 'leftover fetch folder', cleanable: true });
          continue;
        }
        for (const p of ls(mdir)) for (const v of ls(path.join(mdir, p))) {
          const full = path.join(mdir, p, v);
          if (!isDir(full) || keep.has(full)) continue;
          const inUse = ls(path.join(full, '.in_use')).length > 0;
          const recent = ageDays(full) < 1;
          items.push({ path: full, bytes: sizeOf(full), note: inUse ? 'marked in use: kept' : recent ? 'changed today: kept' : `${p}@${m} ${v} (not installed)`, cleanable: !inUse && !recent });
        }
      }
      return items;
    },
    clean: (item) => rm(item.path),
  },
  {
    id: 'transcripts',
    title: 'Old session transcripts',
    risk: 'caution',
    creates: 'Every session writes ~/.claude/projects/<project>/<session>.jsonl plus a <session>/ folder with subagent transcripts and large tool results.',
    claude: 'Deleted after cleanupPeriodDays (default 30). The sweep is skipped for `claude -p --bare` and pauses when settings cannot be read.',
    sweep: `Deletes transcripts of sessions that are not running and are older than ${days(30)} day(s). Use --days to go shorter. You lose /resume and rewind for those sessions. Auto-memory (memory/) is never touched.`,
    scan: () => {
      const root = path.join(CLAUDE_DIR, 'projects');
      const orphans = new Set(orphanProjects().map((i) => i.path));
      const { ids } = live();
      const items = [];
      for (const proj of ls(root)) {
        const pdir = path.join(root, proj);
        if (orphans.has(pdir)) continue;
        for (const f of ls(pdir)) {
          const sid = f.match(UUID)?.[0];
          if (!sid || !f.includes('.jsonl') || ids.has(sid)) continue;
          const p = path.join(pdir, f);
          const age = ageDays(p);
          if (age < days(30)) continue;
          const companion = path.join(pdir, sid);
          items.push({ path: p, extra: isDir(companion) ? companion : null, bytes: sizeOf(p) + sizeOf(companion), note: `${proj} · ${Math.floor(age)}d old`, cleanable: true });
        }
      }
      return items;
    },
    clean: (item) => { rm(item.path); if (item.extra) rm(item.extra); },
  },
  {
    id: 'orphan-projects',
    title: 'Transcripts of projects whose folder no longer exists',
    risk: 'caution',
    creates: 'Transcript folders in ~/.claude/projects stay after you delete or move a project, including projects opened inside temp scratchpads.',
    claude: 'Only removed transcript by transcript as they age out.',
    sweep: 'Deletes the transcripts of projects whose path is gone. Keeps any memory/ folder. Folders whose original path cannot be worked out are listed but kept unless you pass --force.',
    scan: () => orphanProjects(),
    clean: (item) => {
      for (const n of ls(item.path)) if (n !== 'memory') rm(path.join(item.path, n));
      if (!ls(item.path).length) fs.rmdirSync(item.path);
    },
  },
  {
    id: 'file-history',
    title: 'Old checkpoint snapshots (file-history)',
    risk: 'caution',
    creates: 'Before every edit Claude stores a copy of the file in ~/.claude/file-history/<session>/ so /rewind can restore it.',
    claude: 'Deleted after cleanupPeriodDays. Capped at 100 checkpoints per session.',
    sweep: `Deletes snapshots of sessions that are not running and are older than ${days(30)} day(s). You lose rewind for those sessions.`,
    scan: () => {
      const root = path.join(CLAUDE_DIR, 'file-history');
      const { ids } = live();
      return ls(root).map((sid) => path.join(root, sid)).filter((p) => isDir(p) && !ids.has(path.basename(p)) && ageDays(p) >= days(30))
        .map((p) => ({ path: p, bytes: sizeOf(p), note: `${Math.floor(ageDays(p))}d old`, cleanable: true }));
    },
    clean: (item) => rm(item.path),
  },
  {
    id: 'session-leftovers',
    title: 'Session caches: shell snapshots, paste cache, debug logs, legacy dirs',
    risk: 'safe',
    creates: 'shell-snapshots/ (your shell env per session), paste-cache/, image-cache/ (older versions), debug/ (with --debug), session-env/, and legacy todos/, statsig/, logs/.',
    claude: 'Swept after cleanupPeriodDays; shell snapshots are removed on clean exit, so crashes leave them behind. The docs list all of these as safe to delete.',
    sweep: `Deletes entries older than ${days(7)} day(s) that do not belong to a running session.`,
    scan: () => {
      const { ids } = live();
      return ['shell-snapshots', 'paste-cache', 'image-cache', 'debug', 'session-env', 'todos', 'statsig', 'logs'].map((name) => {
        const dir = path.join(CLAUDE_DIR, name);
        const entries = ls(dir).map((n) => path.join(dir, n)).filter((p) => ageDays(p) >= days(7) && ![...ids].some((id) => p.includes(id)));
        return { path: dir, entries, bytes: entries.reduce((t, p) => t + sizeOf(p), 0), note: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`, cleanable: true };
      }).filter((i) => i.entries.length);
    },
    clean: (item) => item.entries.forEach(rm),
  },
  {
    id: 'old-cli',
    title: 'Old Claude Code binaries',
    risk: 'safe',
    creates: `The native installer keeps each version in ${CLI_VERSIONS}/ (about 200 MB each). Old installers can also sit in ~/.claude/downloads/.`,
    claude: 'The updater prunes some old versions itself; downloads/ is never cleaned.',
    sweep: 'Keeps the running version and the newest older one (for rollback), deletes the rest, and clears ~/.claude/downloads entries older than a day.',
    scan: () => {
      const current = sh('claude', ['--version'])?.split(' ')[0];
      const versions = ls(CLI_VERSIONS).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const older = versions.filter((v) => v !== current);
      const keep = new Set([current, older.at(-1)]);
      const items = current ? versions.filter((v) => !keep.has(v)).map((v) => ({ path: path.join(CLI_VERSIONS, v), bytes: sizeOf(path.join(CLI_VERSIONS, v)), note: `running ${current}`, cleanable: true })) : [];
      const dl = path.join(CLAUDE_DIR, 'downloads');
      for (const n of ls(dl)) if (ageDays(path.join(dl, n)) >= 1) items.push({ path: path.join(dl, n), bytes: sizeOf(path.join(dl, n)), note: 'old installer download', cleanable: true });
      return items;
    },
    clean: (item) => rm(item.path),
  },
  {
    id: 'config-backups',
    title: 'Stray ~/.claude.json backups and temp copies',
    risk: 'safe',
    creates: 'Writes to ~/.claude.json go through .tmp.* files and timestamped .backup.* copies; interrupted writes and corruption recovery leave them in your home folder.',
    claude: 'Newer versions keep 5 backups in ~/.claude/backups/ and sweep those; the older copies in your home folder are never removed.',
    sweep: 'Deletes ~/.claude.json.backup.<timestamp>, .tmp.* (over a day old) and .corrupted.* files. Keeps ~/.claude.json and the plain ~/.claude.json.backup.',
    scan: () => ls(HOME).filter((n) => /^\.claude\.json\.(backup\.\d+|tmp\..+|corrupted\..+)$/.test(n)).map((n) => path.join(HOME, n))
      .filter((p) => !p.includes('.tmp.') || ageDays(p) >= 1)
      .map((p) => ({ path: p, bytes: sizeOf(p), note: `${Math.floor(ageDays(p))}d old`, cleanable: true })),
    clean: (item) => rm(item.path),
  },
  {
    id: 'plugin-orphan-data',
    title: 'Data folders of plugins that are not installed',
    risk: 'review',
    creates: 'Plugins store persistent data (often their own node_modules) in ~/.claude/plugins/data/<plugin>-<marketplace>/. Plugins loaded with --plugin-dir or inline also get one.',
    claude: 'Deleted on `claude plugin uninstall` unless --keep-data. Never deleted for --plugin-dir or inline plugins.',
    sweep: 'Lists data folders that match no installed plugin. Deletes them only with --force, because a plugin you load with --plugin-dir may still use one.',
    scan: () => {
      const installed = Object.keys(readJson(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))?.plugins ?? {});
      const expected = new Set(installed.map((k) => k.replace('@', '-')));
      const root = path.join(CLAUDE_DIR, 'plugins', 'data');
      return ls(root).filter((n) => !expected.has(n)).map((n) => path.join(root, n))
        .map((p) => ({ path: p, bytes: sizeOf(p), note: 'no installed plugin matches', cleanable: FORCE }));
    },
    clean: (item) => rm(item.path),
  },
  {
    id: 'marketplace-deps',
    title: 'node_modules inside marketplace clones',
    risk: 'review',
    creates: 'Marketplaces are git clones in ~/.claude/plugins/marketplaces/. Some plugins run an install step there, which can add a large node_modules.',
    claude: 'Never cleaned.',
    sweep: 'Lists them. Deletes only with --force, because some plugins run from their marketplace folder; the plugin will reinstall what it needs, or you can reinstall it.',
    scan: () => {
      const root = path.join(CLAUDE_DIR, 'plugins', 'marketplaces');
      return ls(root).flatMap((m) => {
        const found = sh('find', [path.join(root, m), '-maxdepth', '3', '-name', 'node_modules', '-type', 'd', '-prune']);
        return found ? found.split('\n') : [];
      }).map((p) => ({ path: p, bytes: sizeOf(p), note: path.relative(root, p), cleanable: FORCE })).filter((i) => i.bytes > 64 * 1024);
    },
    clean: (item) => rm(item.path),
  },
];

// The working directory a transcript folder belongs to, read from its first session file.
function transcriptCwd(dir) {
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

function orphanProjects() {
  return once('orphanProjects', () => {
    const root = path.join(CLAUDE_DIR, 'projects');
    const known = new Map(projectPaths().map((p) => [encodeProject(p), p]));
    const { cwds } = live();
    const liveEncoded = new Set([...cwds].map(encodeProject));
    const items = [];
    for (const name of ls(root)) {
      const p = path.join(root, name);
      if (!isDir(p) || liveEncoded.has(name)) continue;
      const original = known.get(name) ?? transcriptCwd(p);
      if (original && fs.existsSync(original)) continue;
      if (!original && fs.existsSync(name.replace(/-/g, '/'))) continue;
      const hasMemory = ls(path.join(p, 'memory')).length > 0;
      const bytes = sizeOf(p) - sizeOf(path.join(p, 'memory'));
      if (bytes <= 0) continue;
      const note = (original ? `${original} (gone)` : 'original path unknown') + (hasMemory ? ' · memory/ kept' : '');
      items.push({ path: p, bytes, note, cleanable: !!original || FORCE });
    }
    return items;
  });
}

// ---------- deletion with guard rails

const guard = createGuard({ home: HOME, claudeDir: CLAUDE_DIR, tmpBase: TMP_BASE, tmpRoot: TMP_ROOT, cliVersions: CLI_VERSIONS });
const rm = (p) => guard.rm(p);

// ---------- report-only facts

function info() {
  const settings = readJson(path.join(CLAUDE_DIR, 'settings.json')) ?? {};
  const projects = Object.keys(claudeJson().projects ?? {});
  const missing = projects.filter((p) => !fs.existsSync(p));
  return [
    ['history.jsonl', fmt(sizeOf(path.join(CLAUDE_DIR, 'history.jsonl'))), 'Your prompt history (up-arrow). Never swept. `claude purge <path>` drops one project\'s lines.'],
    ['~/.claude.json', fmt(sizeOf(path.join(HOME, '.claude.json'))), `${projects.length} project entries, ${missing.length} for folders that no longer exist. Holds auth and MCP config; do not delete. \`claude purge <path>\` removes one entry.`],
    ['cleanupPeriodDays', String(settings.cleanupPeriodDays ?? '30 (default)'), 'Age at which Claude sweeps transcripts, file-history, temp scratchpads and idle agent worktrees. Lower it in ~/.claude/settings.json to keep less.'],
    ['plugins/', fmt(sizeOf(path.join(CLAUDE_DIR, 'plugins'))), 'Installed plugins and marketplaces. Clean through plugin-versions, plugin-orphan-data and marketplace-deps, never wholesale.'],
    ['kept on purpose', '', 'settings, credentials, CLAUDE.md, agent-memory/, jobs/, daemon/, skills/, projects/*/memory/. sweep never deletes these.'],
  ];
}

// ---------- commands

function scanAll(ids) {
  return CATEGORIES.filter((cat) => !ids || ids.includes(cat.id)).map((cat) => {
    let items = [];
    let error = null;
    try { items = cat.scan(); } catch (e) { error = e.message; }
    items.sort((a, b) => b.bytes - a.bytes);
    const cleanable = items.filter((i) => i.cleanable);
    return { ...cat, items, error, reclaimable: cleanable.reduce((t, i) => t + i.bytes, 0), cleanableCount: cleanable.length };
  });
}

const riskLabel = (r) => (r === 'safe' ? green('safe   ') : r === 'caution' ? yellow('caution') : red('review '));

function list() {
  const results = scanAll();
  if (JSON_OUT) {
    const strip = ({ scan, clean, ...rest }) => ({ ...rest, items: rest.items.map(({ entries, ...i }) => i) });
    console.log(JSON.stringify({ categories: results.map(strip), info: info() }, null, 2));
    return;
  }
  console.log(bold('\nsweep: storage Claude Code leaves behind\n'));
  console.log(dim('  ID                   RISK     RECLAIM  ITEMS  WHAT'));
  for (const r of results) {
    const items = `${r.cleanableCount}/${r.items.length}`;
    console.log(`  ${r.id.padEnd(20)} ${riskLabel(r.risk)}  ${fmt(r.reclaimable).padStart(7)}  ${items.padStart(5)}  ${r.title}${r.error ? red(` (scan error: ${r.error})`) : ''}`);
    if (DETAILS) {
      for (const i of r.items.slice(0, 12)) console.log(dim(`        ${i.cleanable ? '✓' : '·'} ${fmt(i.bytes).padStart(6)}  ${i.path}`) + dim(`  ${i.note ?? ''}`));
      if (r.items.length > 12) console.log(dim(`        … ${r.items.length - 12} more`));
    }
  }
  const total = results.reduce((t, r) => t + r.reclaimable, 0);
  const safe = results.filter((r) => r.risk === 'safe').reduce((t, r) => t + r.reclaimable, 0);
  console.log(`\n  ${bold('Reclaimable:')} ${fmt(total)} total, ${fmt(safe)} in safe categories. ITEMS = cleanable/found; ✓ = would be removed.`);
  console.log(bold('\n  Not cleaned by sweep\n'));
  for (const [k, v, d] of info()) console.log(`  ${k.padEnd(20)} ${v.padStart(10)}  ${dim(d)}`);
  console.log(dim(`\n  Next: sweep scan --details · sweep explain <id> · sweep clean safe · sweep clean <id> --yes\n`));
}

function explain(id) {
  const cat = CATEGORIES.find((x) => x.id === id);
  if (!cat) return fail(`unknown category "${id}". Known: ${CATEGORIES.map((x) => x.id).join(', ')}`);
  const [r] = scanAll([id]);
  console.log(`\n${bold(cat.title)}  (${cat.id}, ${cat.risk})\n`);
  console.log(`${bold('Where it comes from')}\n  ${cat.creates}\n`);
  console.log(`${bold('What Claude Code cleans itself')}\n  ${cat.claude}\n`);
  console.log(`${bold('What sweep removes')}\n  ${cat.sweep}\n`);
  console.log(`${bold('Found')}: ${r.items.length} item(s), ${r.cleanableCount} cleanable, ${fmt(r.reclaimable)} reclaimable\n`);
  for (const i of r.items) console.log(`  ${i.cleanable ? green('✓') : dim('·')} ${fmt(i.bytes).padStart(6)}  ${i.path}\n           ${dim(i.note ?? '')}`);
  console.log();
}

function clean(ids) {
  if (!ids.length) return fail('name what to clean: sweep clean <id...> | safe | all');
  const wanted = ids.includes('all') ? CATEGORIES.map((x) => x.id) : ids.includes('safe') ? CATEGORIES.filter((x) => x.risk === 'safe').map((x) => x.id) : ids;
  const unknown = wanted.filter((id) => !CATEGORIES.some((x) => x.id === id));
  if (unknown.length) return fail(`unknown category: ${unknown.join(', ')}`);
  const results = scanAll(wanted);
  let freed = 0, failed = 0;
  console.log(bold(`\nsweep clean ${YES ? '' : dim('(dry run: nothing is deleted; add --yes to delete)')}\n`));
  for (const r of results) {
    const todo = r.items.filter((i) => i.cleanable);
    if (!todo.length) { console.log(dim(`  ${r.id}: nothing to clean`)); continue; }
    console.log(`  ${bold(r.id)}: ${todo.length} item(s), ${fmt(r.reclaimable)}`);
    for (const i of todo) {
      if (!YES) { console.log(dim(`    would remove ${fmt(i.bytes).padStart(6)}  ${i.path}`)); continue; }
      try { r.clean(i); freed += i.bytes; console.log(green(`    removed ${fmt(i.bytes).padStart(6)}  ${i.path}`)); }
      catch (e) { failed++; console.log(red(`    failed          ${i.path}: ${e.message}`)); }
    }
    const kept = r.items.length - todo.length;
    if (kept) console.log(dim(`    kept ${kept} item(s) that hold work or are in use (see: sweep explain ${r.id})`));
  }
  const total = results.reduce((t, r) => t + r.reclaimable, 0);
  console.log(YES ? `\n  ${bold('Freed')} ${fmt(freed)}${failed ? red(`, ${failed} failed`) : ''}\n` : `\n  ${bold('Would free')} ${fmt(total)}. Run again with --yes to delete.\n`);
  if (failed) process.exitCode = 1;
}

function fail(msg) { console.error(red(`sweep: ${msg}`)); process.exitCode = 2; }

function help() {
  console.log(`sweep: list and clean storage Claude Code leaves behind

  sweep scan [--details] [--json]   scan and describe every category (default)
  sweep explain <id>                where it comes from, what Claude cleans itself, every item found
  sweep clean <id...|safe|all>      dry run; add --yes to delete

  --days N   override the age threshold of age-based categories
  --force    also clean review-risk items and clean worktrees whose commits live only on their branch (branch kept)

  Categories: ${CATEGORIES.map((x) => x.id).join(', ')}`);
}

const [cmd = 'scan', ...rest] = positional;
const commands = { scan: list, list, ls: list, explain: () => explain(rest[0]), clean: () => clean(rest), help };
if (flags.has('--help') || flags.has('-h')) help();
else if (flags.has('-list') || flags.has('--list')) list();
else if (commands[cmd]) commands[cmd]();
else fail(`unknown command "${cmd}". Try: sweep help`);
