# Visual benchmarks

These four synthetic applications provide portable, deterministic inputs for Democena's visual review loop. They contain original fixture data and do not depend on a private product, browser session, or generated capture.

- `forma` exercises a light editorial catalog workflow.
- `catalogforge` exercises a dense branded catalog workflow.
- `northstar` exercises a dark technical dashboard.
- `relay` exercises an agent workflow with a verified result.

Run the complete benchmark suite from the repository root:

```sh
npm run studio:install
npm run benchmark:visual
```

The Studio install is intentionally separate from the core package and is required for Remotion rendering.
Full generation also requires a clean Git working tree so every review bundle identifies the exact source revision that produced it. The validation-only mode remains available while editing.

Use `-- --output <directory>` to keep generated captures, rendered frames, contact sheets, quality reports, and review notes in a private review directory. Generated media is never a committed benchmark source.

Every project contains four required review roles: hook, product, proof, and close. The harness renders settled scene frames and before/midpoint/after frames for every transition.
