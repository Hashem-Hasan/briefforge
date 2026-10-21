import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { analyzeAI } from '../src/provider.js';
import { analyzeLocal, parseConversation } from '../src/core.js';
import { createApp } from '../src/server.js';
const messages = parseConversation('Client: We need a product catalog.');
const envelope = (draft = analyzeLocal(messages)) => ({
  status: 'completed',
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(draft) }],
    },
  ],
  usage: { input_tokens: 100, output_tokens: 200 },
});
test('provider uses strict Responses schema, server-side credentials and validated evidence', async () => {
  let observed: Record<string, unknown> | null = null;
  const fetcher: typeof fetch = async (_url, init) => {
    observed = JSON.parse(String(init?.body));
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Bearer test-key',
    );
    return Response.json(envelope());
  };
  const brief = await analyzeAI(messages, {
    apiKey: 'test-key',
    model: 'test-model',
    fetcher,
  });
  assert.equal(brief.engine, 'ai');
  assert.deepEqual(brief.usage, { inputTokens: 100, outputTokens: 200 });
  assert.equal((observed as unknown as { store: boolean }).store, false);
  assert.equal(
    (observed as unknown as { text: { format: { strict: boolean } } }).text
      .format.strict,
    true,
  );
});
test('HTTP errors, refusal, incomplete responses and malformed grounding never silently fall back', async () => {
  const bad = analyzeLocal(messages);
  bad.requirements[0].evidence[0].messageId = 'M999';
  for (const response of [
    new Response('private upstream detail', { status: 429 }),
    Response.json({ status: 'incomplete', output: [] }),
    Response.json({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] },
      ],
    }),
    Response.json(envelope(bad)),
    Response.json({ status: 'completed', output: [] }),
  ])
    await assert.rejects(() =>
      analyzeAI(messages, {
        apiKey: 'x',
        model: 'test-model',
        fetcher: async () => response,
      }),
    );
});
test('real HTTP provider timeout is enforced', async () => {
  const provider = createServer((_req, res) => {
    setTimeout(() => res.end('{}'), 100);
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, '127.0.0.1', resolve),
  );
  try {
    await assert.rejects(
      () =>
        analyzeAI(messages, {
          apiKey: 'x',
          model: 'test-model',
          apiUrl: `http://127.0.0.1:${(provider.address() as { port: number }).port}`,
          timeoutMs: 20,
        }),
      { name: 'TimeoutError' },
    );
  } finally {
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  }
});
test('server requires consent, enforces origin, and never exposes provider key', async () => {
  let calls = 0;
  const app = createApp({
    apiKey: 'PRIVATE_TEST_KEY',
    model: 'test-model',
    fetcher: async () => {
      calls++;
      return Response.json(envelope());
    },
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, '127.0.0.1', resolve),
  );
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const config = await (await fetch(origin + '/api/config')).text();
    assert.ok(!config.includes('PRIVATE_TEST_KEY'));
    const send = (consent: boolean, headers: Record<string, string> = {}) =>
      fetch(origin + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          conversation: 'Client: We need a product catalog.',
          consent,
        }),
      });
    assert.equal((await send(false)).status, 400);
    assert.equal(calls, 0);
    assert.equal(
      (await send(true, { Origin: 'https://untrusted.example' })).status,
      403,
    );
    assert.equal((await send(true)).status, 200);
    assert.equal(calls, 1);
  } finally {
    await app.close();
  }
});
