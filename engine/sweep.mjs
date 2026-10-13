#!/usr/bin/env node
// sweep: find and clean the storage Claude Code leaves behind.
// Zero dependencies. Dry run unless --yes is given. Stores nothing.

import { createContext } from './context.mjs';
import { supported } from './platform.mjs';
import { renderClean, renderExplain, renderScan } from './text.mjs';
import { clean as cleanItems } from './clean.mjs';
import { categoryIds, scan } from './scan.mjs';

// ---------- arguments

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('-')));
const valueOf = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
const positional = argv.filter((a, i) => !a.startsWith('-') && !['--days', '--only', '--roots'].includes(argv[i - 1]));
const DAYS = valueOf('--days') === null ? null : Number(valueOf('--days'));
const ONLY = valueOf('--only')?.split(',').filter(Boolean) ?? null;
const PROGRESS = flags.has('--progress');
const ROOTS = valueOf('--roots');
const FORCE = flags.has('--force');
const YES = flags.has('--yes') || flags.has('-y');
const JSON_OUT = flags.has('--json');
const DETAILS = flags.has('--details') || flags.has('-d');
const color = !!process.stdout.isTTY && !process.env.NO_COLOR;
const width = process.stdout.columns || Number(process.env.COLUMNS) || 100;
const view = { color, width, details: DETAILS };
const red = (s) => (color ? `\x1b[31m${s}\x1b[0m` : s);

const ctx = createContext({ days: DAYS, force: FORCE, roots: ROOTS });
// NDJSON progress on stderr, so stdout stays the JSON result.
const onProgress = PROGRESS ? (event) => process.stderr.write(`${JSON.stringify(event)}\n`) : () => {};
const run = async (ids) => {
  const result = await scan(ctx, { ids, options: { days: DAYS }, onProgress });
  onProgress({ event: 'done' });
  return result;
};

// ---------- commands

async function list() {
  const result = await run();
  console.log(JSON_OUT ? JSON.stringify(result, null, 2) : renderScan(result, view));
}

async function explain(id) {
  if (!categoryIds().includes(id)) return fail(`unknown category "${id}". Categories: ${categoryIds().join(', ')}`);
  const [category] = (await run([id])).categories;
  console.log(JSON_OUT ? JSON.stringify(category, null, 2) : renderExplain(category, view));
}

async function clean(ids) {
  if (!ids.length) return fail(`name what to clean: sweep clean <id...> | safe | all. Categories: ${categoryIds().join(', ')}`);
  const unknown = ids.filter((id) => !['all', 'safe', ...categoryIds()].includes(id));
  if (unknown.length) return fail(`unknown category: ${unknown.join(', ')}. Categories: ${categoryIds().join(', ')}`);
  const { CATEGORIES } = await import('./categories/index.mjs');
  const wanted = ids.includes('all') ? categoryIds() : [...new Set(ids.flatMap((id) => (id === 'safe' ? CATEGORIES.filter((x) => x.risk === 'safe').map((x) => x.id) : [id])))];
  const result = await cleanItems(ctx, { categories: wanted, only: ONLY, dryRun: !YES, onProgress });
  if (result.failed.length) process.exitCode = 1;
  console.log(JSON_OUT ? JSON.stringify(result, null, 2) : renderClean(result, wanted, view));
}

function fail(msg) { console.error(red(`sweep: ${msg}`)); process.exitCode = 2; }

function help() {
  console.log(`sweep: list and clean storage Claude Code leaves behind

  sweep scan [--details] [--json]   scan and describe every category (default)
  sweep explain <id> [--json]       where it comes from, what Claude cleans itself, every item found
  sweep clean <id...|safe|all>      dry run; add --yes to delete
                [--only <itemId,...>] [--json] [--progress]

  --days N   override the age threshold of age-based categories
  --roots a,b  folders searched for worktrees Claude no longer lists ('' turns it off)
  --force    also clean review-risk items and clean worktrees whose commits live only on their branch (branch kept)

  Categories: ${categoryIds().join(', ')}`);
}

const [cmd = 'scan', ...rest] = positional;
if (!supported(process.platform)) {
  console.error(`sweep: ${process.platform} is not supported yet (macOS and Linux only).`);
  process.exit(3);
}
const commands = { scan: list, list, ls: list, explain: () => explain(rest[0]), clean: () => clean(rest), help };
if (flags.has('--help') || flags.has('-h')) help();
else if (flags.has('-list') || flags.has('--list')) await list();
else if (commands[cmd]) await commands[cmd]();
else fail(`unknown command "${cmd}". Try: sweep help. Categories: ${categoryIds().join(', ')}`);
