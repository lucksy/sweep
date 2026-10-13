---
status: approved
created: 2026-10-13
approved: 2026-10-13
module: engine
---

# Spec: engine

## Objective

The only code that reads sizes or deletes files. It finds every kind of storage Claude Code leaves behind, explains it, measures the total footprint, and cleans what is safe. It hands every other module one versioned JSON contract. It stores nothing: no cache, history, lock or log file. It starts from the clearx prototype (`clearx/scripts/clearx.mjs`), which works and was tested in a sandbox; this module splits it into files, makes it faster, and adds the contract, footprint, item selection and progress.

## Scope

**In:**
- the 13 categories (below)
- the footprint, i.e. what Claude Code uses in total, not only what is reclaimable
- free disk space
- per-project rollup
- `scan`, `explain`, `clean` as functions
- the JSON contract
- NDJSON progress
- the guard rails

**Out:**
- text rendering and argument parsing (module cli)
- any persistence (sweep stores no data)
- any UI

## Categories

These carry over from clearx unchanged in behavior. The full descriptions (`creates`, `claude`, `sweep` texts) are in the prototype and the README.

| id | group | risk | Cleanable when | Kept (reason code) |
|---|---|---|---|---|
| worktrees | worktrees | caution | registered in `<repo>/.claude/worktrees/`, `git status` clean, 0 commits not on another branch/remote, not locked, no live session inside, not created during a live session in the same repo; or an orphan dir with no git record | `dirty`, `unique-commits` (cleanable with `--force`, branch kept), `locked`, `live-session`, `owned-by-live-session` (`--force`), `git-error` |
| worktree-deps | worktrees | safe | untracked `node_modules` (> 64 KB) inside a worktree kept for `dirty`/`unique-commits` | — |
| worktree-branches | worktrees | safe | `worktree-*` branch not checked out and 0 unique commits; stale Claude worktree record | `unique-commits` |
| tmp-sessions | temp | safe | `<tmp>/claude-<uid>/<project>/<session>/` of a non-live session, age ≥ 1 d; CLI caches there (`bash-edit-diff/`, `bundled-skills/<ver>` unless a live session runs that version); `claude-*-cwd` files | `live-session`, `running-version` |
| plugin-versions | plugins | caution | cache version not in `installed_plugins.json`, empty `.in_use/`, age ≥ 1 d; `temp_*` dirs age ≥ 1 d | `in-use`, `recent` |
| transcripts | history | caution | `projects/<p>/<uuid>*.jsonl` (+ `<uuid>/`) of a non-live session, age ≥ 30 d | `live-session` |
| orphan-projects | history | caution | project dir whose original path (from `~/.claude.json` or the transcript's `cwd`) no longer exists; `memory/` kept | `unknown-origin` (`--force`) |
| file-history | history | caution | `file-history/<session>` of a non-live session, age ≥ 30 d | `live-session` |
| session-leftovers | caches | safe | entries in `shell-snapshots`, `paste-cache`, `image-cache`, `debug`, `session-env`, `todos`, `statsig`, `logs`, age ≥ 7 d, not of a live session | — |
| old-cli | cli | safe | `~/.local/share/claude/versions/*` except the running version and the newest older one; `~/.claude/downloads/*` age ≥ 1 d | — |
| config-backups | config | safe | `~/.claude.json.backup.<ts>`, `.tmp.*` (age ≥ 1 d), `.corrupted.*` | — |
| plugin-orphan-data | plugins | review | `plugins/data/<id>` matching no installed plugin | `review` (`--force`) |
| marketplace-deps | plugins | review | `node_modules` (> 64 KB) in `plugins/marketplaces/*` | `review` (`--force`) |

`--days N` overrides the age of every age-based category. Per-category ages come from options: `transcriptDays`, `tmpDays`, `leftoverDays` (SPEC-pane userConfig).

**Change from clearx:** each item gets a machine-readable `reason`, so the pane can group kept items and the alerts can tell "runaway output" apart from ordinary leftovers.

## Footprint

Total space Claude Code uses, whether reclaimable or not, so charts can show the share that is waste.

| key | path |
|---|---|
| `claude.projects`, `claude.plugins`, `claude.fileHistory`, `claude.other` | `~/.claude` split by subdir (`claude.other` = the rest) |
| `claudeJson` | `~/.claude.json` plus stray copies |
| `tmp` | `<tmp>/claude-<uid>` |
| `worktrees` | the sum of every `<repo>/.claude/worktrees` |
| `cli` | `~/.local/share/claude` |

Plus `disk: { path, totalBytes, freeBytes }` for the volume that holds HOME (`df -k`).

## Contract (schema 1)

`scan()` returns, and `sweep scan --json` prints, exactly this shape. Additive changes keep `schema: 1`; renames or removals bump it.

```jsonc
{
  "schema": 1,
  "tool": { "name": "sweep", "version": "0.2.0" },
  "scannedAt": "2026-10-13T12:00:00.000Z",
  "durationMs": 12840,
  "options": { "days": null, "force": false },
  "host": { "platform": "darwin", "claudeDir": "/Users/x/.claude", "tmpRoot": "/private/tmp/claude-501", "cliVersion": "2.1.296" },
  "disk": { "path": "/", "totalBytes": 494384795648, "freeBytes": 61203001344 },
  "footprint": { "totalBytes": 9123456789, "parts": [{ "key": "worktrees", "label": "Agent worktrees", "bytes": 2899102105 }] },
  "totals": { "reclaimableBytes": 3758096384, "safeBytes": 633339904, "keptBytes": 16777216 },
  "categories": [{
    "id": "worktrees", "title": "Agent and workflow worktrees", "group": "worktrees", "risk": "caution",
    "text": { "creates": "…", "claude": "…", "sweep": "…" },
    "foundBytes": 2916000000, "reclaimableBytes": 2899102105, "found": 8, "cleanable": 2,
    "error": null,
    "items": [{
      "id": "wt_3f9a1c2e",                       // stable: hash of category + path
      "path": "/Users/x/Projects/Tree-Testing /.claude/worktrees/agent-a7224a15e5bfcd682",
      "label": "agent-a7224a15e5bfcd682",
      "bytes": 1503238553, "ageDays": 23,
      "project": "/Users/x/Projects/Tree-Testing ",
      "cleanable": true, "reason": null,
      "note": "worktree-agent-a7224a15e5bfcd682 · clean, nothing unsaved · node_modules 1.0G",
      "detail": { "branch": "worktree-agent-a7224a15e5bfcd682", "dirty": 0, "unique": 0, "nodeModulesBytes": 1073741824 }
    }]
  }],
  "projects": [{ "path": "/Users/x/Projects/Tree-Testing ", "exists": true, "bytes": 2950000000, "reclaimableBytes": 2899102105,
                 "byCategory": { "worktrees": 2899102105, "tmp-sessions": 21000000 } }],
  "ageBuckets": [{ "label": "< 1 d", "bytes": 0 }, { "label": "1–7 d", "bytes": 0 }, { "label": "7–30 d", "bytes": 0 }, { "label": "30–90 d", "bytes": 0 }, { "label": "> 90 d", "bytes": 0 }],
  "info": [{ "key": "cleanupPeriodDays", "value": "30 (default)", "text": "…" }],
  "warnings": [{ "code": "runaway-output", "path": "…/tasks/b1.output", "bytes": 6442450944 }]
}
```

**Warnings** (consumed by alerts):
- `runaway-output`: any file in the tmp root ≥ 5 GB.
- `low-disk`: free space < 10%.
- `sweep-paused`: `cleanupPeriodDays` can't be read, so Claude's own sweep is off.
- `many-worktrees`: ≥ 10 Claude worktrees in one repo.

`clean()` returns, and `sweep clean … --json` prints:

```jsonc
{ "schema": 1, "dryRun": false, "startedAt": "…", "durationMs": 2100,
  "requested": { "categories": ["worktrees"], "only": ["wt_3f9a1c2e"], "force": false },
  "freedBytes": 2899102105,
  "removed": [{ "id": "wt_3f9a1c2e", "category": "worktrees", "path": "…", "bytes": 1503238553 }],
  "kept":    [{ "id": "wt_77…", "category": "worktrees", "path": "…", "reason": "owned-by-live-session" }],
  "skipped": [{ "id": "wt_99…", "reason": "no-longer-cleanable" }],
  "failed":  [{ "id": "…", "path": "…", "error": "git worktree remove failed" }] }
```

**Progress.** With `--progress`, the engine writes NDJSON to stderr while it works:
- `{"event":"category","id":"worktrees","index":1,"total":13}`
- `{"event":"removed","id":"wt_…","bytes":…}`
- `{"event":"done"}`

Stdout keeps only the final JSON.

## Behavior

1. **Speed.**
   - Sizes are measured with async `du -sk` at concurrency 8, one call per item.
   - Each path is measured once per scan (memoized), so a worktree's `node_modules` isn't measured twice.
   - Git calls per repo run in parallel.
   - Target: a full scan of the author's machine in ≤ 15 s (baseline 28–43 s).
2. **Item selection.** `clean(categories, { only: [itemIds] })` cleans only the named items within those categories. Unknown ids are reported in `skipped` with reason `unknown-id`.
3. **Re-scan before delete.** `clean` always re-scans the requested categories and deletes only items that are cleanable now. An item that changed since the caller's scan goes to `skipped` with reason `no-longer-cleanable`.
4. **No lock file.** Two cleans at once (pane and skill) are safe without one:
   - each re-scans before deleting
   - deletes are idempotent (`rm` with `force`)
   - git takes its own index locks
   - a worktree the other clean already removed lands in `skipped` (`no-longer-cleanable`) or `failed`, never in a wrong deletion
5. **Guard rails** (`guard.rm`). These carry over from clearx and are tested by trying to break them. A path may be deleted only if it is inside one of:
   - `~/.claude`
   - `<tmp>/claude-<uid>`
   - `~/.local/share/claude/versions`
   - a `*/.claude/worktrees/*` path
   - a `claude-*-cwd` file directly in the tmp base
   - a `~/.claude.json.*` copy in HOME

   And never if it is a protected path: settings, credentials, `CLAUDE.md`, `history.jsonl`, `agent-memory/`, `jobs/`, `daemon/`, `skills/`, `commands/`, `agents/`, `plugins/installed_plugins.json`, `plugins/known_marketplaces.json`, `projects/*/memory/`, `~/.claude.json`.
   - Worktrees are removed only with `git worktree remove --force` after the clean check, then `git branch -D` only when there are 0 unique commits, then `git worktree prune`.
6. **Live sessions.** These come from `~/.claude/sessions/*.json` whose `pid` is alive. Their session ids, working directories, start times and CLI versions protect their transcripts, temp folders, checkpoints, worktrees and bundled skills.
7. **Stores nothing.** The engine writes no file of its own, and has no data dir. Its only writes are the deletions it was asked for. A test runs scan and clean in the sandbox and asserts that no new path appeared.
8. **Environment.** Honours `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_TMPDIR`. Exits with a message on Windows.
9. **Errors.** A category whose scan throws reports `error` and an empty list, and the scan goes on. A failed delete goes to `failed`; the clean goes on, and the exit code is 1.

## Acceptance Criteria

- [ ] Output of `scan --json` validates against the schema-1 shape above (a test asserts every key and type).
- [ ] Sandbox: each of the 13 categories finds a cleanable item, and every "kept" row in the table has a test that keeps it.
- [ ] Item ids are stable across two scans of unchanged files.
- [ ] `clean --only` deletes exactly the named items; an item made dirty between scan and clean lands in `skipped`.
- [ ] Two `clean --yes` runs started together on the same fixture both finish; every item is removed exactly once, and nothing outside the selection is touched.
- [ ] Scan and clean create no new files (sandbox before/after listing).
- [ ] `guard.rm` refuses every protected path, and every path outside the allowlist, in a table-driven test.
- [ ] `--force` never removes a dirty worktree, and keeps the branch of a worktree with unique commits.
- [ ] Footprint parts add up to `footprint.totalBytes`, and `disk` is present on macOS and Linux.
- [ ] A full scan of the author's machine takes ≤ 15 s, measured three times and reported in the task.

## Boundaries (module)

- **Always:** keep the engine free of run-time dependencies.
- **Ask first:** a schema-2 change, or a new category.
- **Never:** print anything except the final JSON to stdout in `--json` mode.
