// The text report: pure functions from the contract to lines. Color only when
// asked (a TTY without NO_COLOR); width at least 80.

import { fmt } from './fsx.mjs';

export const REASONS = {
  dirty: 'uncommitted changes',
  'unique-commits': 'commits on no other branch (--force removes the folder, keeps the branch)',
  locked: 'locked by a running agent',
  'live-session': 'belongs to a running session',
  'owned-by-live-session': 'created during a session still running in this repo (--force)',
  'git-error': 'git could not read it',
  'running-version': 'used by the running CLI version',
  'in-use': 'marked in use by a session',
  recent: 'changed in the last day',
  'unknown-origin': 'original folder unknown (--force)',
  review: 'needs review (--force)',
};

const GLYPHS = ['█', '▓', '▒', '░'];
const PART_COLORS = [36, 33, 34, 35, 32, 37, 31, 90];

function painter(color) {
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return { c, dim: (s) => c(2, s), bold: (s) => c(1, s), red: (s) => c(31, s), green: (s) => c(32, s), yellow: (s) => c(33, s) };
}

// Keep the start and the end of a long path, losing the middle.
export function truncateMiddle(text, max) {
  if (text.length <= max) return text;
  const keep = max - 1;
  return `${text.slice(0, Math.ceil(keep / 2))}…${text.slice(text.length - Math.floor(keep / 2))}`;
}

// Keep the start of a sentence, losing its end.
export const truncateEnd = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// One bar across the width, a run of cells per footprint part, in the parts' order.
export function footprintBar(parts, width, { color = false } = {}) {
  const { c, dim } = painter(color);
  const total = parts.reduce((t, p) => t + p.bytes, 0);
  if (!total) return [];
  let used = 0;
  const cells = parts.map((p, i) => {
    const n = i === parts.length - 1 ? width - used : Math.round((p.bytes / total) * width);
    used += n;
    return { n: Math.max(0, n), i };
  });
  const bar = cells.map(({ n, i }) => (color ? c(PART_COLORS[i % PART_COLORS.length], '█'.repeat(n)) : GLYPHS[i % GLYPHS.length].repeat(n))).join('');
  // Legend entries wrapped to the width; lengths counted without color codes.
  const lines = [bar];
  let line = '', shown = 0;
  for (const part of parts.filter((x) => x.bytes > 0)) {
    const i = parts.indexOf(part);
    const label = `${part.label} ${fmt(part.bytes)}`;
    const mark = color ? c(PART_COLORS[i % PART_COLORS.length], '█') : GLYPHS[i % GLYPHS.length];
    const length = 2 + label.length + (shown ? 2 : 0);
    if (shown && shown + length > width) {
      lines.push(line);
      line = '';
      shown = 0;
    }
    line += `${shown ? '  ' : ''}${mark} ${dim(label)}`;
    shown += shown ? length : length;
  }
  if (line) lines.push(line);
  return lines;
}

export function keptSummary(items) {
  const counts = new Map();
  for (const i of items) if (!i.cleanable) counts.set(i.reason, (counts.get(i.reason) ?? 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${REASONS[reason] ?? reason}`);
}

const riskLabel = (risk, p) => (risk === 'safe' ? p.green('safe   ') : risk === 'caution' ? p.yellow('caution') : p.red('review '));

export function renderScan(result, { width = 100, color = false, details = false } = {}) {
  const p = painter(color);
  const w = Math.max(80, width);
  const lines = [''];
  lines.push(p.bold('sweep: storage Claude Code leaves behind'));
  const { disk, footprint, totals } = result;
  lines.push(`Claude Code uses ${fmt(footprint.totalBytes)} on this disk · ${fmt(totals.reclaimableBytes)} reclaimable · ${fmt(disk.freeBytes)} free (${percent(disk.freeBytes, disk.totalBytes)}%)`);
  for (const warning of result.warnings) lines.push(p.red(`⚠ ${warning.text}`));
  lines.push('');
  lines.push(...footprintBar(footprint.parts, w - 2, { color }));
  lines.push('');
  lines.push(p.dim('  ID                   RISK     RECLAIM    ITEMS  WHAT'));
  for (const cat of result.categories) {
    const items = `${cat.cleanable}/${cat.found}`;
    const room = w - 50;
    const title = truncateEnd(cat.title, room);
    lines.push(`  ${cat.id.padEnd(20)} ${riskLabel(cat.risk, p)}  ${fmt(cat.reclaimableBytes).padStart(7)}  ${items.padStart(7)}  ${title}${cat.error ? p.red(` (scan error: ${cat.error})`) : ''}`);
    if (!details) continue;
    for (const item of cat.items.slice(0, 12)) {
      lines.push(p.dim(`        ${item.cleanable ? '✓' : '·'} ${fmt(item.bytes).padStart(6)}  ${truncateMiddle(item.path, w - 18)}`));
      if (item.note) lines.push(p.dim(`                  ${truncateEnd(item.note, w - 18)}`));
    }
    if (cat.items.length > 12) lines.push(p.dim(`        … ${cat.items.length - 12} more`));
    const kept = keptSummary(cat.items);
    if (kept.length) lines.push(p.dim(`        kept: ${kept.join(' · ')}`));
  }
  lines.push('');
  lines.push(`  ${p.bold('Reclaimable:')} ${fmt(totals.reclaimableBytes)} total, ${fmt(totals.safeBytes)} in safe categories.`);
  lines.push(p.dim('  ITEMS = cleanable/found; ✓ = would be removed.'));
  lines.push('');
  lines.push(p.bold('  Not cleaned by sweep'));
  lines.push('');
  for (const { key, value, text } of result.info) lines.push(`  ${key.padEnd(20)} ${value.padStart(12)}  ${p.dim(truncateEnd(text, Math.max(20, w - 38)))}`);
  lines.push('');
  lines.push(p.dim('  Next: sweep explain <id> · sweep clean safe · sweep clean <id> --yes'));
  lines.push('');
  return lines.join('\n');
}

export function renderExplain(cat, { width = 100, color = false } = {}) {
  const p = painter(color);
  const w = Math.max(80, width);
  const lines = ['', `${p.bold(cat.title)}  (${cat.id}, ${cat.risk})`, ''];
  lines.push(p.bold('Where it comes from'), `  ${cat.text.creates}`, '');
  lines.push(p.bold('What Claude Code cleans itself'), `  ${cat.text.claude}`, '');
  lines.push(p.bold('What sweep removes'), `  ${cat.text.sweep}`, '');
  lines.push(`${p.bold('Found')}: ${cat.found} item(s), ${cat.cleanable} cleanable, ${fmt(cat.reclaimableBytes)} reclaimable`, '');
  for (const item of cat.items) {
    lines.push(`  ${item.cleanable ? p.green('✓') : p.dim('·')} ${fmt(item.bytes).padStart(6)}  ${truncateMiddle(item.path, w - 12)}`);
    lines.push(`           ${p.dim(truncateEnd(item.cleanable ? item.note : `kept: ${REASONS[item.reason] ?? item.reason} · ${item.note}`, w - 12))}`);
  }
  const kept = keptSummary(cat.items);
  if (kept.length) lines.push('', p.dim(`Kept: ${kept.join(' · ')}`));
  lines.push('');
  return lines.join('\n');
}

export function renderClean(result, categoryIds, { width = 100, color = false } = {}) {
  const p = painter(color);
  const w = Math.max(80, width);
  const lines = ['', p.bold(`sweep clean ${result.dryRun ? p.dim('(dry run: nothing is deleted; add --yes to delete)') : ''}`.trimEnd()), ''];
  for (const id of categoryIds) {
    const removed = result.removed.filter((r) => r.category === id);
    const failed = result.failed.filter((r) => r.category === id);
    const kept = result.kept.filter((r) => r.category === id);
    if (!removed.length && !failed.length) {
      lines.push(p.dim(`  ${id}: nothing to clean`));
    } else {
      lines.push(`  ${p.bold(id)}: ${removed.length} item(s), ${fmt(removed.reduce((t, r) => t + r.bytes, 0))}`);
      const verb = result.dryRun ? 'would remove' : result.mode === 'trash' ? 'trashed' : 'removed';
      for (const r of removed) lines.push((result.dryRun ? p.dim : p.green)(`    ${verb} ${fmt(r.bytes).padStart(6)}  ${truncateMiddle(r.path, w - 26)}`));
      for (const r of failed) lines.push(p.red(`    failed          ${truncateMiddle(r.path, w - 40)}: ${r.error}`));
    }
    if (kept.length) lines.push(p.dim(`    kept: ${keptSummary(kept.map((k) => ({ ...k, cleanable: false }))).join(' · ')}`));
  }
  for (const s of result.skipped) lines.push(p.dim(`  skipped ${s.id}: ${s.reason}`));
  lines.push('');
  lines.push(result.dryRun
    ? `  ${p.bold('Would free')} ${fmt(result.freedBytes)}. Run again with --yes to delete.`
    : result.mode === 'trash'
      ? `  ${p.bold('Moved')} ${fmt(result.freedBytes)} to the Trash${result.failed.length ? p.red(`, ${result.failed.length} failed`) : ''}. Empty the Trash to free the space.`
      : `  ${p.bold('Freed')} ${fmt(result.freedBytes)}${result.failed.length ? p.red(`, ${result.failed.length} failed`) : ''}`);
  lines.push('');
  return lines.join('\n');
}
