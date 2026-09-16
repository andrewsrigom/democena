# Working on Democena

Democena is an independent Demotale fork for silent product demos with real browser capture, explanatory text, and expressive motion. Read `docs/architecture.md` and `UPSTREAM.md` before changing capture or rendering.

- Keep code, comments, docs, commits and public issues in English.
- Preserve `LICENSE`, original attribution in `NOTICE`, and upstream Git history. Mark modified upstream source files.
- Never create or use a branch beginning with `codex/`.
- Use only public or synthetic data in examples and committed media. Do not commit browser sessions, credentials, private applications, or generated captures by default.
- Keep the core CLI usable without installing the optional Remotion prototype.
- A rendered effect must be based on the recorded interface. Preserve sufficient reading time and verify the actual application outcome.
- Existing source/tests were adapted from Demotale. Run `npm run typecheck`, `npm test`, and `npm run build` for core changes. Run `npm run test:browser` for overlay behavior and inspect frames for visual changes.
- For studio changes, run `npm --prefix studio run typecheck`, capture the synthetic example, render it, and inspect the output. Generated media stays ignored unless explicitly selected as public documentation.
- Do not publish packages or deploy services without a user request. A request to create the public Git repository authorizes pushing its reviewed project files.

To author a core scenario, run `node dist/cli/index.js agent-guide`; explore the target application before choosing its click path.
