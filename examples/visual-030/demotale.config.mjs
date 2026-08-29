import { defineConfig } from '../../dist/index.js';

export default defineConfig({
  baseUrl: 'http://localhost:4174',
  scenarios: './demo',
  output: './output',

  webServer: {
    command: 'node serve.mjs',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
  },

  // The account line is the kind of detail a real demo would redact. Stills honour this too.
  redact: ['[data-testid="account"]'],

  video: { formats: ['mp4', 'gif'], gifWidth: 720, gifFps: 10 },
  captions: { vtt: true, transcript: true },
  theme: { base: 'dark', accent: '#38bdf8', captionPosition: 'top' },
  stills: { dir: './stills', number: true },
});
