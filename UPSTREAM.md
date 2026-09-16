# Origin and changes

Democena is an independent fork of [Demotale](https://github.com/pesuto-dev/demotale), created from version 0.3.0 at commit `4f1f656ec088b08e3ed92ac06e8089ce4f4a1090`.

The complete upstream Git history is preserved. `LICENSE` and `NOTICE` retain the original author's copyright and attribution. `CHANGELOG.md` records upstream releases before the fork; Democena starts at `0.1.0-alpha.1`.

The initial Democena changes are:

- Package, CLI, configuration, generated templates, and environment variables renamed to Democena.
- Project guidance and documentation replaced with the fork's own direction.
- Upstream publishing workflow removed; creating the repository does not publish an npm or GitHub package.
- Overlay initialization waits for the document root using a MutationObserver, preserving the pre-DOMContentLoaded cover. Browser checks cover navigation, delayed scripts, dismissal, and idempotence.
- Development test runner updated to Vitest 4.1.11, which resolves the inherited mocker advisory.
- Optional, separate Remotion prototype with a synthetic example, clean browser video, scene data, typography, framing, and focus animation.

General fixes may be contributed upstream. See the original [overlay report](https://github.com/pesuto-dev/demotale/issues/3). Remotion presentation work follows Democena's own direction.
