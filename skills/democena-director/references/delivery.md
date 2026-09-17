# Delivery

The final local bundle contains:

- `democena.mp4`;
- `review/poster.jpg`;
- `review/contact-sheet.jpg`;
- `review/transitions/`;
- `review/quality.json`;
- individual scene previews and `storyboard.json`.

Verify H.264, yuv420p, 1920×1080, 30 fps, expected duration and absence of an audio stream. The quality report must not contain blocking findings.

After those checks pass, save the current direction as `delivered` with the compiled project revision unchanged. If either revision moved during rendering, keep the completed artifact but report the conflict and do not mark a different direction as delivered.

Generated artifacts inherit the capture's sensitivity. Return local paths. Do not publish, upload, embed in a public repository or send share copy without explicit authorization.
