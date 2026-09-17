# Storyboard

Every scene needs a narrative role, reason, settled preview time, render scene and evidence list. Its Direction v2 beat also records one visual concept, focal action, primary subject, typographic role and density, transition intent, compatible recipe shortlist and deterministic fallback.

Use `authored-copy` evidence for framing, interpretation and approved product language. Use `capture` evidence for product behavior, timestamps and rectangles. Application scenes require capture evidence. A verified result uses evidence returned from an outcome assertion.

Default launch shape:

```text
hook -> product reveal -> product moment -> verified result -> closing
```

Default tour shape:

```text
problem -> chapter -> overview -> guided action -> explanation -> verified result -> summary
```

Transition presets compile to the current scene grammar:

- `hard-cut`: no overlap.
- `soft-crossfade`: short fade.
- `clean-slide`: restrained slide.
- `rise-cover`: the incoming scene covers upward.
- `drop-cover`: the incoming scene covers downward.

The retired Direction v1 `restrained-zoom` value migrates to `soft-crossfade`, matching its historical rendered output. Do not author it in Direction v2.

Keep the settled preview after entrance and before exit. The renderer clamps requested previews and posters past the shared 1.5-second entrance interval. Select poster `sceneId` and scene-local time inside that interval. Camera stop times are scene-local; source timestamps use the recording clock.
