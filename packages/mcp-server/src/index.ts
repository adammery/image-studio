#!/usr/bin/env node
import { runServer } from './server.js';

runServer().catch((err) => {
  console.error('image-studio-mcp failed to start:', err);
  process.exit(1);
});
