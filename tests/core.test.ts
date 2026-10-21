import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases } from '../evals/cases.js';
import {
  analyzeLocal,
  makeBrief,
  parseConversation,
  toMarkdown,
  validateDraft,
} from '../src/core.js';
test('all fixed bilingual evaluation cases preserve scope and unknown/conflicting details', () => {
  for (const item of cases) {
    const messages = parseConversation(item.conversation);
    const draft = analyzeLocal(messages);
    validateDraft(draft, messages);
    assert.equal(draft.requirements.length, item.requirements, item.id);
    assert.equal(draft.outOfScope.length, item.outOfScope, item.id);
    assert.equal(draft.budget.status, item.budget, item.id);
    assert.equal(draft.timeline.status, item.timeline, item.id);
    if (item.contains)
      assert.ok(
        draft.requirements.some((requirement) =>
          requirement.text.includes(item.contains!),
        ),
        item.id,
      );
  }
});
test('source bounds and message IDs are deterministic', () => {
  const messages = parseConversation(
    '[21/10/2026 10:00] Client: Need a site.\n\nالعميل: بدنا كتالوج.',
  );
  assert.equal(messages[0].id, 'M001');
  assert.equal(messages[1].line, 3);
  assert.equal(messages[1].speaker, 'العميل');
  assert.throws(() => parseConversation('x'.repeat(60001)));
  assert.throws(() =>
    parseConversation(Array.from({ length: 301 }, () => 'message').join('\n')),
  );
  assert.throws(() => parseConversation(''));
});
test('fabricated quotes, invented requirement wording and unsupported commercial claims are rejected', () => {
  const messages = parseConversation(
    'Client: We need a catalog.\nClient: The budget is not decided.',
  );
  const badQuote = analyzeLocal(messages);
  badQuote.requirements[0].evidence[0].quote = 'made up';
  assert.throws(() => validateDraft(badQuote, messages), /exact source quote/);
  const badText = analyzeLocal(messages);
  badText.requirements[0].text = 'We need a payment gateway.';
  assert.throws(() => validateDraft(badText, messages), /exact excerpt/);
  const badFact = analyzeLocal(messages);
  badFact.budget = {
    status: 'stated',
    value: 'The budget is not decided.',
    evidence: [{ messageId: 'M002', quote: 'The budget is not decided.' }],
  };
  assert.throws(
    () => validateDraft(badFact, messages),
    /unknown or conflicting/,
  );
});
test('Markdown keeps human edits and review status separate from original evidence', () => {
  const messages = parseConversation('Client: We need a catalog.');
  const brief = makeBrief(analyzeLocal(messages), messages);
  const result = toMarkdown(brief, [0], { 0: 'Human revised scope <script>' });
  assert.ok(result.includes('[x]'));
  assert.ok(result.includes('human edited'));
  assert.ok(result.includes('M001'));
  assert.ok(result.includes('We need a catalog.'));
  assert.ok(!result.includes('<script>'));
});
