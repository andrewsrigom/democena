// Modified for Democena (2026): serve the original Forma example.
import { startExample } from './app.mjs';
const app = await startExample(Number(process.env.PORT ?? 4173));
console.log(`Forma example on ${app.url}`);
