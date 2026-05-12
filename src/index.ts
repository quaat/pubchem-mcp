import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';
import { createServer, PACKAGE_VERSION } from './server/createServer.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  logger.info(
    { version: PACKAGE_VERSION, baseUrl: config.baseUrl, rps: config.rps, rpm: config.rpm },
    'starting pubchem-mcp server (stdio)',
  );

  const { server } = createServer({ config, logger });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('pubchem-mcp ready');
}

main().catch((err) => {
  process.stderr.write(`pubchem-mcp fatal: ${err?.stack ?? String(err)}\n`);
  process.exit(1);
});
