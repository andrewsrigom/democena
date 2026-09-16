#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { inputs, errorResult, type Operation } from './contracts.js';
import { Workspace } from './storage.js';
import { AgentService } from './service.js';
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { workspace: { type: 'string' }, input: { type: 'string' } } });
  const name = positionals[0];
  if (!values.workspace || !name || !Object.hasOwn(inputs, name) || positionals.length !== 1) throw new Error('Usage: node mcp/dist/mcp/src/cli.js <operation> --workspace /absolute/path --input arguments.json. Discover operations with capabilities (no input needed).');
  const args = values.input ? JSON.parse(await readFile(values.input, 'utf8')) : {};
  const service = new AgentService(await Workspace.open(values.workspace));
  console.log(JSON.stringify({ ok: true, ...await service.call(name as Operation, args) }));
} catch (error) { console.log(JSON.stringify(errorResult(error))); process.exitCode = 1; }
