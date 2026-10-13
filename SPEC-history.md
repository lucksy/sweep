---
status: draft
created: 2026-10-13
module: history
---

# Spec: history (removed)

**Removed 2026-10-13 by the user's decision: sweep stores no data.** Every number and chart is computed from a scan made now. Nothing is written to disk between scans: no history file, no cached scan, no lock file.

What this removes from the other modules:
- the trend chart and sparkline (charts)
- the History view (pane)
- freed-to-date and growth per week
- the `sweep history` command (cli)
- hide-for-N-days and once-ever toasts (alerts, now per session)

The module id `history` stays reserved, so ids in the capability map never change meaning.
