# Direction brief

`direction.json` is the canonical editorial plan. `BRIEF.md` and `STORYBOARD.md` are generated views. `project.json` remains the render contract.

Record one audience and one primary message, plus story mode, motion language, tone, locale, visual direction, brand source, authorized target, verified facts, exclusions and privacy constraints. Select `plan-only`, `collaborative` or `autonomous` explicitly. Direction v2 is canonical; v1 inputs are migrated in memory and written as v2 on their next save.

Lifecycle:

- `draft`: editable and not approved for compilation.
- `reviewed`: accepted by the user or reviewed by the Director in autonomous mode.
- `compiled`: linked to the exact project revision produced by compilation.
- `stale`: capture evidence changed after review.
- `diverged`: the active project was edited after compilation.
- `delivered`: final artifacts passed review.

Every reviewed state records `reviewedBy` and `reviewedAt`. A new direction revision or capture requires review again. Never treat generated Markdown edits as canonical; apply accepted feedback to direction data and regenerate the views.
