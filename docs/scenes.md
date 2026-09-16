# Authoring motion scenes

Run `npm run studio:capture` for an editable `studio/project.json` with all eight scene types. Then edit the JSON and run `npm run studio:preview`, `npm run studio:render`, or `npm run studio:dev`. Text, duration, focus and framing edits reuse the recording. Changes to the application's actions require another capture.

## Project and clocks

```json
{
  "version": 2,
  "title": "Parcel Desk",
  "accent": "#28584c",
  "video": "captures/parcel.webm",
  "sourceDuration": 20,
  "trimBefore": 0.5,
  "viewport": { "width": 1280, "height": 800 },
  "scenes": []
}
```

This skeleton needs at least one scene. `video` is a relative path inside `studio/public`. `sourceDuration` is the full file duration in seconds, before trimming; export checks it against ffprobe. Studio uses the value in the manifest. The viewport must match the captured page.

There are two independent clocks:

- **Presentation:** array order and each scene's `duration` determine when a scene appears in the final video.
- **Recording:** `source.from` is seconds after `trimBefore`. Normal clips advance from that point. `source.freeze: true` holds the same source frame for the whole scene, while text and camera animations continue.

Inserting a text card never skips forward in the recording. For example, a 5-second opening followed by an overview with `source.from: 0` still starts the recording from its beginning. To resume after a paused annotation, set the next clip's `source.from` to the desired resume time.

Seconds are rounded to frames at 30 fps. Every scene has a unique `id`, a `type`, positive `duration`, and string `eyebrow`, `title` and `body`. Use `\n` inside titles for intentional line breaks. Text can be in any language supported by the system font.

### Transitions

```json
"transition": { "type": "slide", "duration": 0.5 }
```

Transitions are incoming and overlap the previous scene. They do not add runtime. Two 5-second scenes with a 0.5-second incoming transition have a total duration of 9.5 seconds. Supported types are `fade`, `slide` and `none`; default is a 0.4-second fade. Use `{ "type": "none", "duration": 0 }` for a cut. The first scene has no incoming overlap. Transition duration must be shorter than half of both neighboring scenes, preventing triple overlaps.

Durations include transition time. Allow enough settled time to read the title, body and any note; the example uses longer holds for explanations. Keep titles and notes concise and inspect the generated stills for your copy.

## Text and chapter

```json
{
  "id": "opening", "type": "text", "duration": 5,
  "eyebrow": "A little clarity goes a long way",
  "title": "Every workflow\nhas a story.",
  "body": "Make the next step clear.",
  "reveal": "words", "highlight": "story."
}
```

`reveal` accepts `words` (default) or `lines`. `highlight` must be a phrase appearing within a single line of the title; its marker animates after the text enters.

```json
{
  "id": "chapter-01", "type": "chapter", "duration": 4,
  "number": "01", "eyebrow": "Find a parcel",
  "title": "From a question\nto a clear answer.",
  "body": "One simple journey through Parcel Desk.",
  "transition": { "type": "slide", "duration": 0.5 }
}
```

## Overview and focus

```json
{
  "id": "overview", "type": "overview", "duration": 4,
  "source": { "from": 0 },
  "eyebrow": "The workspace", "title": "A clear view.", "body": "Everything in one place."
}
```

```json
{
  "id": "field", "type": "focus", "duration": 4,
  "source": { "from": 4 },
  "focus": { "x": 133, "y": 574, "width": 320, "height": 45 },
  "dim": 0.4, "zoom": 1.35,
  "eyebrow": "Start here", "title": "Find your parcel.", "body": "Enter its code in this field."
}
```

Rectangles use the original viewport's pixels, not output-video pixels. The capture adapter uses Playwright's `boundingBox()` so the effect targets a real element. `dim` is between 0 and 0.85 (default 0.38); `zoom` is between 1 and 3 (default 1.35). Camera positioning clamps to the recorded image and reduces zoom when necessary to keep the target visible. The mask and recording move together.

## Camera path

```json
{
  "id": "follow", "type": "camera", "duration": 5,
  "source": { "from": 8 },
  "eyebrow": "Follow the action", "title": "From input to action.", "body": "A camera that guides attention.",
  "path": [
    { "at": 0 },
    { "at": 0.8, "focus": { "x": 133, "y": 574, "width": 320, "height": 45 }, "zoom": 1.65 },
    { "at": 2, "focus": { "x": 133, "y": 574, "width": 320, "height": 45 }, "zoom": 1.65 },
    { "at": 3, "focus": { "x": 473, "y": 574, "width": 75, "height": 45 }, "zoom": 1.6 },
    { "at": 4.5 }
  ]
}
```

`path.at` is seconds inside this scene, starting at zero, increasing on distinct frames and ending before scene duration. A stop specifies the camera pose to reach at that time. Duplicate a pose at a later time to hold it. Omit `focus` to return to the full viewport. Smooth interpolation connects stops; the last pose holds until the scene ends. Default targeted zoom is 1.8. A frozen source can also be used for an animated tour of one still frame.

## Paused annotation

```json
{
  "id": "explain", "type": "annotation", "duration": 6,
  "source": { "from": 13, "freeze": true },
  "focus": { "x": 133, "y": 635, "width": 1014, "height": 23 },
  "note": { "text": "Destination and status appear together.", "x": 680, "y": 350, "width": 470 },
  "eyebrow": "A moment to explain", "title": "Pause here.", "body": "Keep the result in view."
}
```

Annotations require `freeze: true`. The note position and width also use viewport pixels. Leave room for a short note (at least 140 viewport pixels vertically), and place it away from the target. A drawn connector points to the focus rectangle. Only the video freezes; the connector and note continue animating.

## Result and comparison

Use a `result` with `source` and optional `focus` for one final state. Add `comparison` to show two actual frames, with the same crop, stacked for readability:

```json
{
  "id": "result", "type": "result", "duration": 5.5,
  "source": { "from": 13, "freeze": true },
  "eyebrow": "The result", "title": "From a code\nto certainty.", "body": "The form before and after the lookup.",
  "comparison": {
    "before": 8, "after": 13,
    "crop": { "x": 112, "y": 526, "width": 1056, "height": 155 },
    "beforeLabel": "BEFORE · A PARCEL TO FIND", "afterLabel": "AFTER · AN ANSWER IN SIGHT"
  }
}
```

Comparison times follow the same trimmed recording clock as `source.from`. The comparison replaces the normal source view; its two frames remain frozen throughout the scene. Pick timestamps safely before/after the action and crop the meaningful region. No application state or result text is fabricated by the renderer.

## Closing

```json
{
  "id": "closing", "type": "outro", "duration": 5,
  "eyebrow": "Less searching. More knowing.",
  "title": "Every parcel.\nA clearer journey.",
  "body": "A simple workflow, explained through text and motion.",
  "reveal": "lines", "highlight": "clearer journey.",
  "cta": "Make the next step clear"
}
```

The CTA is optional. It is a visual closing message in the video, not an interactive button.

## Validation and older projects

Studio and export share validation for scene types, required fields, unique IDs, transitions, recording bounds, rectangles, camera stops and paused annotations. Invalid values report the scene index and affected field. Out-of-range clips are rejected instead of silently showing the final frame forever. Text-only projects do not need an existing video file.

The previous manifest format (`duration` on the project, scenes with increasing `at` timestamps) is accepted and converted in memory to overview/focus scenes with cuts. The original file is never modified by preview or render. Running the capture command generates version 2.

Capture timestamps still use an estimated video offset. Verify fast actions in the exported video; the scene engine does not claim frame-perfect Playwright event synchronization. See [architecture](architecture.md) for that planned work.
