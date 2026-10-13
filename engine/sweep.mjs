#!/usr/bin/env node
// sweep: find and clean the storage Claude Code leaves behind.
// Zero dependencies. Dry run unless --yes is given. Stores nothing.

import { createContext } from './context.mjs';
import { fmt } from './fsx.mjs';
import { clean as cleanItems } from './clean.mjs';
import { categoryIds, scan } from './scan.mjs';

// ---------- arguments

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('-')));
const valueOf = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
const positional = argv.filter((a, i) => !a.startsWith('-') && !['--days', '--only'].includes(argv[i - 1]));
const DAYS = valueOf('--days') === null ? null : Number(valueOf('--days'));
const ONLY = valueOf('--only')?.split(',').filter(Boolean) ?? null;
const PROGRESS = flags.has('--progress');
const FORCE = flags.has('--force');
const YES = flags.has('--yes') || flags.has('-y');
const JSON_OUT = flags.has('--json');
const DETAILS = flags.has('--details') || flags.has('-d');
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => c(2, s), bold = (s) => c(1, s), red = (s) => c(31, s), green = (s) => c(32, s), yellow = (s) => c(33, s);

const ctx = createContext({ days: DAYS, force: FORCE });
// NDJSON progress on stderr, so stdout stays the JSON result.
const onProgress = PROGRESS ? (event) => process.stderr.write(`${JSON.stringify(event)}\n`) : () => {};
const run = async (ids) => {
  const result = await scan(ctx, { ids, options: { days: DAYS }, onProgress });
  onProgress({ event: 'done' });
  return result;
};

// ---------- commands

const riskLabel = (r) => (r === 'safe' ? green('safe   ') : r === 'caution' ? yellow('caution') : red('review '));

async function list() {
  const result = await run();
  if (JSON_OUT) return console.log(JSON.stringify(result, null, 2));
  console.log(bold('\nsweep: storage Claude Code leaves behind\n'));
  console.log(dim('  ID                   RISK     RECLAIM  ITEMS  WHAT'));
  for (const r of result.categories) {
    const items = `${r.cleanable}/${r.found}`;
    console.log(`  ${r.id.padEnd(20)} ${riskLabel(r.risk)}  ${fmt(r.reclaimableBytes).padStart(7)}  ${items.padStart(5)}  ${r.title}${r.error ? red(` (scan error: ${r.error})`) : ''}`);
    if (DETAILS) {
      for (const i of r.items.slice(0, 12)) console.log(dim(`        ${i.cleanable ? '✓' : '·'} ${fmt(i.bytes).padStart(6)}  ${i.path}`) + dim(`  ${i.note}`));
      if (r.items.length > 12) console.log(dim(`        … ${r.items.length - 12} more`));
    }
  }
  console.log(`\n  ${bold('Reclaimable:')} ${fmt(result.totals.reclaimableBytes)} total, ${fmt(result.totals.safeBytes)} in safe categories. ITEMS = cleanable/found; ✓ = would be removed.`);
  console.log(bold('\n  Not cleaned by sweep\n'));
  for (const { key, value, text } of result.info) console.log(`  ${key.padEnd(20)} ${value.padStart(10)}  ${dim(text)}`);
  console.log(dim(`\n  Next: sweep scan --details · sweep explain <id> · sweep clean safe · sweep clean <id> --yes\n`));
}

async function explain(id) {
  if (!categoryIds().includes(id)) return fail(`unknown category "${id}". Known: ${categoryIds().join(', ')}`);
  const [r] = (await run([id])).categories;
  if (JSON_OUT) return console.log(JSON.stringify(r, null, 2));
  console.log(`\n${bold(r.title)}  (${r.id}, ${r.risk})\n`);
  console.log(`${bold('Where it comes from')}\n  ${r.text.creates}\n`);
  console.log(`${bold('What Claude Code cleans itself')}\n  ${r.text.claude}\n`);
  console.log(`${bold('What sweep removes')}\n  ${r.text.sweep}\n`);
  console.log(`${bold('Found')}: ${r.found} item(s), ${r.cleanable} cleanable, ${fmt(r.reclaimableBytes)} reclaimable\n`);
  for (const i of r.items) console.log(`  ${i.cleanable ? green('✓') : dim('·')} ${fmt(i.bytes).padStart(6)}  ${i.path}\n           ${dim(i.note)}`);
  console.log();
}

async function clean(ids) {
  if (!ids.length) return fail(`name what to clean: sweep clean <id...> | safe | all. Categories: ${categoryIds().join(', ')}`);
  const unknown = ids.filter((id) => !['all', 'safe', ...categoryIds()].includes(id));
  if (unknown.length) return fail(`unknown category: ${unknown.join(', ')}. Categories: ${categoryIds().join(', ')}`);
  const { CATEGORIES } = await import('./categories/index.mjs');
  const wanted = ids.includes('all') ? categoryIds() : [...new Set(ids.flatMap((id) => (id === 'safe' ? CATEGORIES.filter((x) => x.risk === 'safe').map((x) => x.id) : [id])))];
  const result = await cleanItems(ctx, { categories: wanted, only: ONLY, dryRun: !YES, onProgress });
  if (result.failed.length) process.exitCode = 1;
  if (JSON_OUT) return console.log(JSON.stringify(result, null, 2));

  console.log(bold(`\nsweep clean ${YES ? '' : dim('(dry run: nothing is deleted; add --yes to delete)')}\n`));
  for (const id of wanted) {
    const removed = result.removed.filter((r) => r.category === id);
    const failed = result.failed.filter((r) => r.category === id);
    const kept = result.kept.filter((r) => r.category === id);
    if (!removed.length && !failed.length) { console.log(dim(`  ${id}: nothing to clean`)); continue; }
    console.log(`  ${bold(id)}: ${removed.length} item(s), ${fmt(removed.reduce((t, r) => t + r.bytes, 0))}`);
    for (const r of removed) console.log((YES ? green : dim)(`    ${YES ? 'removed' : 'would remove'} ${fmt(r.bytes).padStart(6)}  ${r.path}`));
    for (const r of failed) console.log(red(`    failed          ${r.path}: ${r.error}`));
    if (kept.length) console.log(dim(`    kept ${kept.length} item(s) that hold work or are in use (see: sweep explain ${id})`));
  }
  for (const s of result.skipped) console.log(dim(`  skipped ${s.id}: ${s.reason}`));
  console.log(YES
    ? `\n  ${bold('Freed')} ${fmt(result.freedBytes)}${result.failed.length ? red(`, ${result.failed.length} failed`) : ''}\n`
    : `\n  ${bold('Would free')} ${fmt(result.freedBytes)}. Run again with --yes to delete.\n`);
}

function fail(msg) { console.error(red(`sweep: ${msg}`)); process.exitCode = 2; }

function help() {
  console.log(`sweep: list and clean storage Claude Code leaves behind

  sweep scan [--details] [--json]   scan and describe every category (default)
  sweep explain <id> [--json]       where it comes from, what Claude cleans itself, every item found
  sweep clean <id...|safe|all>      dry run; add --yes to delete
                [--only <itemId,...>] [--json] [--progress]

  --days N   override the age threshold of age-based categories
  --force    also clean review-risk items and clean worktrees whose commits live only on their branch (branch kept)

  Categories: ${categoryIds().join(', ')}`);
}

const [cmd = 'scan', ...rest] = positional;
const commands = { scan: list, list, ls: list, explain: () => explain(rest[0]), clean: () => clean(rest), help };
if (flags.has('--help') || flags.has('-h')) help();
else if (flags.has('-list') || flags.has('--list')) await list();
else if (commands[cmd]) await commands[cmd]();
else fail(`unknown command "${cmd}". Try: sweep help`);
