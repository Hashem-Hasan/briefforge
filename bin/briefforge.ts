#!/usr/bin/env node
import { createApp } from '../src/server.js';
const port = Number(process.env.PORT ?? 4204);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535.');
const app = createApp({
  apiKey: process.env.BRIEFFORGE_API_KEY ?? process.env.OPENAI_API_KEY,
  model: process.env.BRIEFFORGE_MODEL,
  apiUrl: process.env.BRIEFFORGE_API_URL,
});
app.server.listen(port, '127.0.0.1', () =>
  console.log(
    `BriefForge ready at http://127.0.0.1:${port}. Provider credentials stay on the server.`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
