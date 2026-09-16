#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Workspace } from './storage.js';
import { AgentService } from './service.js';
import { createServer } from './server.js';
try {
  const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
  if (!values.workspace) throw new Error('Usage: node mcp/dist/mcp/src/index.js --workspace /absolute/path/to/demos');
  const server = createServer(new AgentService(await Workspace.open(values.workspace)));
  await server.connect(new StdioServerTransport());
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
