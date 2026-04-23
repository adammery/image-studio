import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS, dispatchTool } from './tools.js';

export async function runServer(): Promise<void> {
  const server = new Server(
    { name: 'image-studio-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS as unknown as Array<{
      name: string;
      description: string;
      inputSchema: unknown;
    }>
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    return dispatchTool(name, (args ?? {}) as Record<string, unknown>);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
