import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { inputs, descriptions, errorResult, guide, capabilities, type Operation } from './contracts.js';
import { AgentService } from './service.js';

export function createServer(service: AgentService) {
  const server = new McpServer({ name: 'democena', version: '0.1.0-alpha.1' }, { instructions: guide });
  for (const name of Object.keys(inputs) as Operation[]) {
    const readOnly = ['capabilities', 'list_projects', 'list_jobs', 'get_project', 'get_direction', 'validate_project', 'get_job', 'read_preview'].includes(name);
    server.registerTool(`democena_${name}`, { description: descriptions[name], inputSchema: inputs[name].shape, annotations: { readOnlyHint: readOnly, destructiveHint: ['save_project', 'save_direction', 'compile_direction', 'merge_scene_drafts', 'import_media', 'import_brand_logo', 'use_capture', 'start_capture'].includes(name), idempotentHint: readOnly || name === 'prepare_scene_packets', openWorldHint: name === 'start_capture' } }, async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const result = await service.call(name, args);
        if (name === 'read_preview') {
          const { data, ...metadata } = result;
          return { structuredContent: { ok: true, ...metadata }, content: [{ type: 'text', text: JSON.stringify({ ok: true, ...metadata }) }, { type: 'image', mimeType: String(metadata.mimeType), data: String(data) }] };
        }
        const output = { ok: true, ...result };
        return { structuredContent: output, content: [{ type: 'text', text: JSON.stringify(output) }] };
      } catch (error) { const output = errorResult(error); return { isError: true, structuredContent: output, content: [{ type: 'text', text: JSON.stringify(output) }] }; }
    });
  }
  server.registerResource('agent-guide', 'democena://guide', { mimeType: 'text/plain', description: 'Recommended agent workflow and rendering limitations.' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: guide }] }));
  server.registerResource('scene-catalog', 'democena://scenes', { mimeType: 'application/json', description: 'All eight scene examples and editable project schema.' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(capabilities()) }] }));
  return server;
}
