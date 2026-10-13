// clean(): re-scan the requested categories and remove what is cleanable now,
// optionally only the named item ids. A dry run reports the same without
// deleting. No lock file: a fresh scan, idempotent deletes and git's own
// locks make two cleans at once safe (SPEC-engine §Behavior 4).

import { stat } from './fsx.mjs';
import { SCHEMA, scan } from './scan.mjs';

// Whether the thing an item names is still there to remove.
const present = (category, item) => category.id === 'worktree-branches' || stat(item.path) !== null;

export async function clean(ctx, { categories, only = null, dryRun = true, onProgress = () => {} }) {
  const started = Date.now();
  const fresh = await scan(ctx, { ids: categories, lean: true, onProgress });
  const wanted = only ? new Set(only) : null;
  const out = {
    schema: SCHEMA, dryRun, mode: ctx.trash ? 'trash' : 'delete', startedAt: new Date(started).toISOString(), durationMs: 0,
    requested: { categories, only, force: !!ctx.force },
    freedBytes: 0, removed: [], kept: [], skipped: [], failed: [],
  };
  const seen = new Set();

  for (const category of fresh.categories) {
    for (const item of category.items) {
      if (wanted && !wanted.has(item.id)) continue;
      seen.add(item.id);
      const row = { id: item.id, category: category.id, path: item.path };
      if (!item.cleanable) {
        if (wanted) out.skipped.push({ id: item.id, reason: 'no-longer-cleanable', kept: item.reason });
        else out.kept.push({ ...row, reason: item.reason });
        continue;
      }
      if (!dryRun) {
        if (!present(category, item)) {
          out.skipped.push({ id: item.id, reason: 'already-gone' });
          continue;
        }
        try {
          category.clean(item, ctx);
        } catch (e) {
          out.failed.push({ ...row, error: e.message });
          onProgress({ event: 'failed', id: item.id, error: e.message });
          continue;
        }
      }
      out.removed.push({ ...row, bytes: item.bytes });
      out.freedBytes += item.bytes;
      onProgress({ event: 'removed', id: item.id, bytes: item.bytes });
    }
  }
  for (const id of only ?? []) if (!seen.has(id)) out.skipped.push({ id, reason: 'unknown-id' });
  out.durationMs = Date.now() - started;
  onProgress({ event: 'done' });
  return out;
}
