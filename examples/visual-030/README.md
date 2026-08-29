# Visual review for demotale 0.3.0

Hand-run showcase for the features shipped in 0.3.0. Nothing here is meant for CI or for the public
README — it exists so you can eyeball the new behaviour before release.

## Run

From the repository root, after `npm run build`:

```bash
npm run visual-030
```

That plays the scenario once for video, reuses the raw recording for gif, writes three docs stills,
and runs check for frame-by-frame review.

## What to open

| Output | Path | What to verify |
| --- | --- | --- |
| mp4 | `output/*.mp4` | Full recording with overlay; spotlight on the orange panel should flip the subtitle to the bottom |
| gif | `output/*.gif` | Same tour, gif-sized; only this file was asked for by `demotale gif` |
| stills | `stills/01-form-saved.png` … `03-redaction-check.png` | Application only — no subtitle, ring, or cursor; account line redacted |
| check frames | `output/check/**/frame*.png` | One frame per subtitle; compare the top-panel step (caption at bottom) with the middle step (caption at top) |
| check report | `output/check/**/report.txt` | Dry-run summary; confirms which frames belong to which step |

After `demotale video`, there should be an mp4 but no new gif unless you also ran `demotale gif`.
After `demotale images 3`, exactly three png files land in `stills/` — not two, not four.

## Scenario highlights

- **Caption flip** — spotlight on `[data-testid="top-target"]` while the theme prefers top captions.
- **`demo.still()`** — three named moments, written only by `demotale images 3`.
- **Redaction in stills** — `[data-testid="account"]` is hidden in video and in png stills.
- **Separate commands** — `video`, `gif`, and `images` each write only what was asked for.

## Re-run one command

```bash
cd examples/visual-030
node ../../dist/cli/index.js video
node ../../dist/cli/index.js gif          # reuses the last raw recording
node ../../dist/cli/index.js images 3
node ../../dist/cli/index.js check
```
