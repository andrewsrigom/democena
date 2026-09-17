# Storyboard

Every scene needs a narrative role, reason, settled preview time, render scene and evidence list.

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
- `restrained-zoom`: short fade combined with motion authored inside the product scene.

Keep the settled preview after entrance and before exit. Select poster `sceneId` and scene-local time inside that interval. Camera stop times are scene-local; source timestamps use the recording clock.
