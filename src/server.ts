import { createServer, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeAI, type ProviderConfig } from './provider.js';
import { parseConversation } from './core.js';
const json = (res: ServerResponse, status: number, value: unknown) =>
  res
    .writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    .end(JSON.stringify(value));
export function createApp(config: Partial<ProviderConfig> = {}) {
  let inFlight = false;
  let recent: number[] = [];
  const available =
    !!config.apiKey && !!config.model && !config.model.startsWith('replace-');
  const server = createServer(async (req, res) => {
    try {
      const address = server.address();
      const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4204}`;
      if (req.headers.host !== new URL(origin).host) {
        json(res, 403, { error: 'Use the loopback server URL.' });
        return;
      }
      const url = new URL(req.url ?? '/', origin);
      if (
        req.method === 'POST' &&
        req.headers.origin &&
        req.headers.origin !== origin
      ) {
        json(res, 403, { error: 'Cross-origin requests are not allowed.' });
        return;
      }
      if (url.pathname === '/api/config' && req.method === 'GET') {
        json(res, 200, {
          aiAvailable: available,
          model: available ? config.model : null,
        });
        return;
      }
      if (url.pathname === '/api/analyze' && req.method === 'POST') {
        if (!available) {
          json(res, 503, {
            error:
              'AI provider is not configured. Local mode remains available in the browser.',
          });
          return;
        }
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 256000) {
            json(res, 413, { error: 'Request is too large.' });
            return;
          }
        }
        const value = JSON.parse(raw);
        if (value.consent !== true) {
          json(res, 400, {
            error:
              'Explicit consent to send this conversation to the provider is required.',
          });
          return;
        }
        const messages = parseConversation(value.conversation);
        recent = recent.filter((time) => time > Date.now() - 600000);
        if (inFlight || recent.length >= 10) {
          json(res, 429, {
            error: 'Local AI rate limit reached. Wait before retrying.',
          });
          return;
        }
        recent.push(Date.now());
        inFlight = true;
        try {
          const brief = await analyzeAI(messages, config as ProviderConfig);
          json(res, 200, { brief });
        } catch (error) {
          const e = error as Error;
          json(res, 502, {
            error:
              e.name === 'TimeoutError'
                ? 'Provider timed out. No draft was accepted.'
                : e.message,
          });
        } finally {
          inFlight = false;
        }
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        json(res, 404, { error: 'Unknown API route.' });
        return;
      }
      if (req.method !== 'GET') {
        json(res, 405, { error: 'Method not allowed.' });
        return;
      }
      let root = path.dirname(fileURLToPath(import.meta.url));
      while (
        !existsSync(path.join(root, 'package.json')) &&
        path.dirname(root) !== root
      )
        root = path.dirname(root);
      root = path.join(root, 'dist');
      const file = path.resolve(
        root,
        '.' +
          decodeURIComponent(
            url.pathname === '/' ? '/index.html' : url.pathname,
          ),
      );
      if (!file.startsWith(root + path.sep)) {
        json(res, 403, { error: 'Invalid path.' });
        return;
      }
      try {
        const data = await readFile(file);
        res
          .writeHead(200, {
            'Content-Type':
              (
                {
                  '.html': 'text/html; charset=utf-8',
                  '.js': 'text/javascript',
                  '.css': 'text/css',
                  '.svg': 'image/svg+xml',
                  '.json': 'application/json',
                  '.png': 'image/png',
                } as Record<string, string>
              )[path.extname(file)] ?? 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
          })
          .end(data);
      } catch {
        json(res, 404, { error: 'Asset unavailable. Build the app first.' });
      }
    } catch (error) {
      json(res, 400, { error: (error as Error).message });
    }
  });
  return {
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
