// Modified for Democena (2026): independent fork naming and configuration.
import { definePlaywrightConfig } from 'democena';
import config from './democena.config.js';

// Do not hand-write this. definePlaywrightConfig pins the settings a recording depends on:
// bypassCSP for the overlay, no retries so there is only ever one video, and one worker.
export default definePlaywrightConfig(config);
