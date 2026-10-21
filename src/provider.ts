import { makeBrief, type Brief, type Draft, type Message } from './core.js';
import { draftSchema, instructions } from './schema.js';
export interface ProviderConfig {
  apiKey: string;
  model: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}
export async function analyzeAI(
  messages: Message[],
  config: ProviderConfig,
): Promise<Brief> {
  if (!config.apiKey || !config.model || config.model.startsWith('replace-'))
    throw new Error(
      'Configure a server-side API key and a structured-output model first.',
    );
  const url = new URL(config.apiUrl ?? 'https://api.openai.com/v1/responses');
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
  )
    throw new Error(
      'Provider URL requires HTTPS, except for loopback test servers.',
    );
  if (url.username || url.password)
    throw new Error('Provider URL must not contain credentials.');
  const started = performance.now();
  const response = await (config.fetcher ?? fetch)(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs ?? 45000),
    headers: {
      Authorization: 'Bearer ' + config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      store: false,
      max_output_tokens: 6000,
      input: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify({ messages }) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'project_brief',
          strict: true,
          schema: draftSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Provider returned HTTP ${response.status}. Check credentials, model access or limits. No local fallback was substituted.`,
    );
  }
  const raw = await response.text();
  if (raw.length > 250000)
    throw new Error('Provider response exceeded the allowed size.');
  const data = JSON.parse(raw) as {
    status?: string;
    output?: {
      type: string;
      content?: { type: string; text?: string; refusal?: string }[];
    }[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  if (data.status !== 'completed')
    throw new Error('Provider response was incomplete. No draft was accepted.');
  const parts = (data.output ?? []).flatMap((item) => item.content ?? []);
  if (parts.some((part) => part.type === 'refusal'))
    throw new Error(
      'The provider declined this request. No draft was accepted.',
    );
  const text = parts
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');
  if (!text) throw new Error('Provider did not return a structured draft.');
  const draft: Draft = JSON.parse(text);
  const usage =
    data.usage &&
    Number.isSafeInteger(data.usage.input_tokens) &&
    data.usage.input_tokens >= 0 &&
    Number.isSafeInteger(data.usage.output_tokens) &&
    data.usage.output_tokens >= 0
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        }
      : null;
  return makeBrief(draft, messages, {
    engine: 'ai',
    model: config.model,
    latencyMs: Math.round(performance.now() - started),
    usage,
  });
}
