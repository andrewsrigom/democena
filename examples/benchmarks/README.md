# Visual benchmarks

These four synthetic applications provide portable, deterministic inputs for Democena's visual review loop. They contain original fixture data and do not depend on a private product, browser session, or generated capture.

- `forma` exercises a light editorial catalog workflow.
- `catalogforge` exercises a dense branded catalog workflow.
- `northstar` exercises a dark technical dashboard.
- `relay` exercises an agent workflow with a verified result.

Run the complete benchmark suite from the repository root:

```sh
npm run benchmark:visual
```

Use `-- --output <directory>` to keep generated captures, rendered frames, contact sheets, quality reports, and review notes in a private review directory. Generated media is never a committed benchmark source.

Every project contains four required review roles: hook, product, proof, and close. The harness renders settled scene frames and before/midpoint/after frames for every transition.
