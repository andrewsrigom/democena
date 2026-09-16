// Modified for Democena (2026): independent fork naming and configuration.
import { defineConfig } from 'democena';

export default defineConfig({
  baseUrl: 'http://127.0.0.1:4173',
  scenarios: './demo',
  output: './output',

  // Started fresh for every recording, so the video can never be of somebody's leftover state.
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },

  // The example is public, but the redaction is real: the account line is the kind of thing that
  // should not be in a video, and this proves the mechanism outside a test.
  redact: ['[data-testid="account"]'],

  // Keep the optional GIF compact enough to share alongside the full-resolution MP4.
  video: { formats: ['mp4', 'gif'], gifWidth: 720, gifFps: 10 },
  captions: { vtt: true, transcript: true },
  theme: { base: 'light', accent: '#215acb' },
  stills: { dir: './stills', number: true },
});
