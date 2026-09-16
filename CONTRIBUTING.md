# Contributing to Democena

Issues and pull requests are welcome. Read `docs/architecture.md` for the project direction.

Use English for code, comments, documentation, commits and issues. Prefer a small change with a reproducible failure or a clearly inspectable visual improvement.

## Set up

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm run test:browser
```

Node 22.12+, FFmpeg, and Chromium system dependencies are required. The optional Remotion prototype has its own lockfile and setup instructions in `studio/README.md`.

## Reporting problems

Include expected/actual behavior, `democena doctor` output, the smallest relevant scenario, and a public or synthetic frame when useful. Never attach credentials or private browser traces.

Tests should catch observable failures rather than merely match source strings. In particular, overlay changes must work during real navigation and before DOMContentLoaded, not only in a mocked DOM.

Contributions to this repository are under Apache-2.0. Preserve upstream copyright and third-party notices.
