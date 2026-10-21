export interface Message {
  id: string;
  speaker: string;
  text: string;
  line: number;
}
export interface Evidence {
  messageId: string;
  quote: string;
}
export interface ScopeItem {
  text: string;
  evidence: Evidence[];
  acceptanceCriteria: string[];
}
export interface Fact {
  status: 'unknown' | 'stated' | 'conflict';
  value: string | null;
  evidence: Evidence[];
}
export interface Draft {
  title: string;
  requirements: ScopeItem[];
  outOfScope: ScopeItem[];
  budget: Fact;
  timeline: Fact;
  questions: string[];
  risks: string[];
}
export interface Brief extends Draft {
  schemaVersion: 1;
  messages: Message[];
  engine: 'local' | 'ai';
  model: string | null;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
  createdAt: string;
}
export const bounds = { characters: 60000, messages: 300, items: 40 };
export function parseConversation(text: string): Message[] {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('Paste a conversation first.');
  if (text.length > bounds.characters)
    throw new Error('Conversations are limited to 60,000 characters.');
  const result: Message[] = [];
  for (const [index, line] of text.replace(/\r/g, '').split('\n').entries()) {
    if (!line.trim()) continue;
    const match = line.match(
      /^(?:\[[^\]]{1,60}\]\s*)?([^:：]{1,50})[:：]\s*(.+)$/,
    );
    result.push({
      id: `M${String(result.length + 1).padStart(3, '0')}`,
      speaker: match ? match[1].trim() : 'Speaker',
      text: match ? match[2].trim() : line.trim(),
      line: index + 1,
    });
  }
  if (result.length > bounds.messages)
    throw new Error('Conversations are limited to 300 nonempty message lines.');
  return result;
}
const missing =
  /not\s+(?:decided|set|sure|confirmed|agreed)|unknown|\btbd\b|no fixed|haven.t decided|don.t know|لم نحدد|غير محدد|مش محدد|لسا|لسه|لاحق[ًاا]|ما حددنا|بعدنا/i;
const injection =
  /ignore (?:all |the )?(?:previous|prior|system) instructions|system prompt|تجاهل التعليمات|reveal.*secret|(?:print|send|show).*(?:api.?key|secret)/i;
const topic = {
  budget: /budget|ميزاني[ةه]|الميزانية/i,
  timeline:
    /deadline|launch date|timeline|delivery date|موعد|تسليم|الإطلاق|الاطلاق/i,
};
const amount =
  /(?:USD|JOD|EUR|GBP|\$|€|£|دينار|دولار)\s*[\d٠-٩۰-۹]|[\d٠-٩۰-۹][\d٠-٩۰-۹.,٬٫]*\s*(?:USD|JOD|EUR|GBP|دينار|دولار)/i;
const dateValue =
  /[\d٠-٩۰-۹]{1,4}[\/-][\d٠-٩۰-۹]{1,2}|\b(?:week|month|day|january|february|march|april|may|june|july|august|september|october|november|december)\b|أسبوع|اسبوع|شهر|أيام|ايام/iu;
const unknown = (): Fact => ({ status: 'unknown', value: null, evidence: [] });
function fact(messages: Message[], kind: 'budget' | 'timeline'): Fact {
  const candidates = messages.filter(
    (message) =>
      topic[kind].test(message.text) &&
      !missing.test(message.text) &&
      !injection.test(message.text) &&
      !/[?؟]\s*$/.test(message.text) &&
      !(kind === 'budget' && /\bnot\b|ليس|مش/.test(message.text)) &&
      (kind === 'budget' ? amount : dateValue).test(message.text),
  );
  if (!candidates.length) return unknown();
  const values = [...new Set(candidates.map((message) => message.text))];
  return {
    status: values.length > 1 ? 'conflict' : 'stated',
    value: values.length > 1 ? null : values[0].slice(0, 800),
    evidence: candidates.slice(0, 10).map((message) => ({
      messageId: message.id,
      quote: message.text.slice(0, 800),
    })),
  };
}
function criteria(text: string): string[] {
  if (/arabic|english|عربي|إنجليزي|انجليزي|لغتين/i.test(text))
    return [
      'Proposed check: switch between the agreed languages and review labels, layout and mixed-direction identifiers on mobile and desktop.',
    ];
  if (/login|sign.in|تسجيل دخول|دخول/i.test(text))
    return [
      'Proposed check: agree who may sign in, then test valid credentials, rejected credentials and access to protected pages.',
    ];
  if (/catalog|products|كتالوج|منتجات/i.test(text))
    return [
      'Proposed check: use an agreed sample product and verify the required information is displayed correctly.',
    ];
  if (/booking|appointment|حجز|مواعيد/i.test(text))
    return [
      'Proposed check: select an available slot, complete the agreed booking steps and verify the resulting confirmation/state.',
    ];
  if (/mobile|responsive|موبايل|جوال/i.test(text))
    return [
      'Proposed check: complete the agreed main flow at 375px and 1440px without unintended horizontal overflow.',
    ];
  return [
    'Proposed check: agree one concrete input, action and expected result with the client before implementation.',
  ];
}
export function analyzeLocal(messages: Message[]): Draft {
  const requirements: ScopeItem[] = [];
  const outOfScope: ScopeItem[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (injection.test(message.text)) continue;
    for (const text of message.text.split(
      /(?<=[.!?؟;؛])\s+|\s+(?:but|ولكن|لكن)\s+/iu,
    )) {
      const excerpt = text.trim();
      if (
        !excerpt ||
        excerpt.length > 800 ||
        /[?؟]\s*$/.test(excerpt) ||
        seen.has(excerpt) ||
        topic.budget.test(excerpt) ||
        topic.timeline.test(excerpt)
      )
        continue;
      const excluded =
        /don.t need|do not need|no (?:online |payment|integration)|without|out of scope|بدون|ما بدنا|لا نحتاج|خارج النطاق/i.test(
          excerpt,
        );
      const requested =
        /\b(?:need|want|must|should|include|require|support|provide|build|create|add)\b|نحتاج|بدي|بدنا|لازم|يكون|يدعم|أريد|اريد|إضافة|اضافة|نريد|يرجى/i.test(
          excerpt,
        );
      if (!excluded && !requested) continue;
      seen.add(excerpt);
      const item = {
        text: excerpt,
        evidence: [{ messageId: message.id, quote: excerpt }],
        acceptanceCriteria: excluded ? [] : criteria(excerpt),
      };
      if (excluded && outOfScope.length < bounds.items) outOfScope.push(item);
      else if (!excluded && requirements.length < bounds.items)
        requirements.push(item);
    }
  }
  const budget = fact(messages, 'budget'),
    timeline = fact(messages, 'timeline');
  const questions: string[] = [];
  const risks: string[] = [];
  if (budget.status !== 'stated')
    questions.push(
      budget.status === 'conflict'
        ? 'Which budget statement is authoritative? Resolve the conflicting messages.'
        : 'What is the approved budget and currency?',
    );
  if (timeline.status !== 'stated')
    questions.push(
      timeline.status === 'conflict'
        ? 'Which delivery date is authoritative? Resolve the conflicting messages.'
        : 'What is the agreed delivery date or timeline?',
    );
  questions.push(
    'Who approves the scope and final acceptance criteria?',
    'Which content, assets, credentials and external integrations will the client provide?',
  );
  if (!requirements.length)
    questions.unshift(
      'What should the product allow its users to do? Provide concrete requirements.',
    );
  if (budget.status === 'conflict' || timeline.status === 'conflict')
    risks.push(
      'Conflicting commercial statements need human resolution; later messages are not automatically treated as approval.',
    );
  if (messages.some((message) => injection.test(message.text)))
    risks.push(
      'An instruction-like source message was excluded by the local heuristic. Review the original conversation.',
    );
  risks.push(
    'Acceptance checks are proposals. They require client review before becoming delivery commitments.',
  );
  return {
    title: 'Project scope draft',
    requirements,
    outOfScope,
    budget,
    timeline,
    questions,
    risks,
  };
}
export function validateDraft(
  value: unknown,
  messages: Message[],
): asserts value is Draft {
  if (!value || typeof value !== 'object')
    throw new Error('The draft must be an object.');
  const draft = value as Draft;
  const string = (value: unknown, max = 2000) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!string(draft.title, 150))
    throw new Error('Draft title is missing or too long.');
  const evidence = (items: Evidence[]) => {
    if (!Array.isArray(items) || items.length > 10)
      throw new Error('Invalid evidence list.');
    for (const item of items) {
      if (
        !item ||
        !string(item.messageId, 20) ||
        !string(item.quote, 800) ||
        !messages.some(
          (message) =>
            message.id === item.messageId && message.text.includes(item.quote),
        )
      )
        throw new Error(
          'Evidence must reference an existing message and an exact source quote.',
        );
    }
  };
  for (const list of [draft.requirements, draft.outOfScope]) {
    if (!Array.isArray(list) || list.length > bounds.items)
      throw new Error('Too many or invalid scope items.');
    for (const item of list) {
      if (
        !item ||
        !string(item.text, 800) ||
        !Array.isArray(item.acceptanceCriteria) ||
        item.acceptanceCriteria.length > 8 ||
        item.acceptanceCriteria.some((text) => !string(text, 1000))
      )
        throw new Error('Malformed scope item.');
      evidence(item.evidence);
      if (!item.evidence.some((source) => source.quote.includes(item.text)))
        throw new Error(
          'Scope text must be an exact excerpt of its cited source.',
        );
    }
  }
  for (const item of [draft.budget, draft.timeline]) {
    if (!item || !['unknown', 'stated', 'conflict'].includes(item.status))
      throw new Error('Malformed commercial fact.');
    evidence(item.evidence);
    if (
      item.status === 'stated' &&
      (!string(item.value, 800) ||
        !item.evidence.some((source) => source.quote.includes(item.value!)))
    )
      throw new Error('A stated fact needs an exact supported value.');
    if (item.status !== 'stated' && item.value !== null)
      throw new Error('Unknown/conflicting facts must have null values.');
    if (item.status === 'conflict' && item.evidence.length < 2)
      throw new Error('A conflict needs at least two cited statements.');
    if (item.status === 'unknown' && item.evidence.length)
      throw new Error('Unknown facts must not present unsupported evidence.');
  }
  for (const list of [draft.questions, draft.risks])
    if (
      !Array.isArray(list) ||
      list.length > 30 ||
      list.some((text) => !string(text, 1000))
    )
      throw new Error('Invalid question or risk list.');
  for (const kind of ['budget', 'timeline'] as const) {
    if (
      draft[kind].status === 'stated' &&
      fact(messages, kind).status !== 'stated'
    )
      throw new Error(
        `The ${kind} is unknown or conflicting under the conservative source checks. Ask for clarification.`,
      );
  }
}
export function makeBrief(
  draft: Draft,
  messages: Message[],
  metadata: Partial<
    Pick<Brief, 'engine' | 'model' | 'latencyMs' | 'usage'>
  > = {},
): Brief {
  validateDraft(draft, messages);
  return {
    ...draft,
    schemaVersion: 1,
    messages,
    engine: metadata.engine ?? 'local',
    model: metadata.model ?? null,
    latencyMs: metadata.latencyMs ?? 0,
    usage: metadata.usage ?? null,
    createdAt: new Date().toISOString(),
  };
}
export function toMarkdown(
  brief: Brief,
  reviewed: number[] = [],
  edits: Record<number, string> = {},
): string {
  const clean = (value: string) =>
    value
      .replaceAll('\r', '')
      .replaceAll('\n', ' ')
      .replace(/[\\`*_[\]<>#|]/g, '\\$&');
  const source = (items: Evidence[]) =>
    items.map((item) => `${item.messageId}: “${clean(item.quote)}”`).join('; ');
  return `# ${clean(brief.title)}\n\nDraft for human review · ${brief.engine === 'ai' ? 'AI-assisted' : 'Local rule-based analysis'} · ${brief.createdAt}\n\n## Scope\n\n${brief.requirements.map((item, index) => `- [${reviewed.includes(index) ? 'x' : ' '}] ${clean(edits[index] ?? item.text)}${edits[index] ? ' (human edited; review against original evidence)' : ''}\n  - Evidence: ${source(item.evidence)}\n${item.acceptanceCriteria.map((check) => `  - ${clean(check)}`).join('\n')}`).join('\n\n')}\n\n## Out of scope\n\n${brief.outOfScope.map((item) => `- ${clean(item.text)}\n  - Evidence: ${source(item.evidence)}`).join('\n')}\n\n## Commercial details\n\n- Budget: ${clean(brief.budget.value ?? brief.budget.status)}\n- Timeline: ${clean(brief.timeline.value ?? brief.timeline.status)}\n\n## Questions\n\n${brief.questions.map((item) => '- ' + clean(item)).join('\n')}\n\n## Risks and review notes\n\n${brief.risks.map((item) => '- ' + clean(item)).join('\n')}\n\nNo estimate, approval or delivery commitment is implied by this draft.\n`;
}
