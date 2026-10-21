import { mkdir, writeFile } from 'node:fs/promises';
import { cases } from './cases.js';
import { analyzeLocal, makeBrief, parseConversation } from '../src/core.js';
const results = cases.map((item) => {
  const started = performance.now();
  const messages = parseConversation(item.conversation);
  const brief = makeBrief(analyzeLocal(messages), messages);
  const checks = {
    scopeCount: brief.requirements.length === item.requirements,
    exclusionCount: brief.outOfScope.length === item.outOfScope,
    budgetStatus: brief.budget.status === item.budget,
    timelineStatus: brief.timeline.status === item.timeline,
    expectedExcerpt:
      !item.contains ||
      brief.requirements.some((requirement) =>
        requirement.text.includes(item.contains!),
      ),
    evidenceIntegrity: [...brief.requirements, ...brief.outOfScope].every(
      (scope) =>
        scope.evidence.every((source) =>
          messages.some(
            (message) =>
              message.id === source.messageId &&
              message.text.includes(source.quote),
          ),
        ),
    ),
  };
  return {
    id: item.id,
    passed: Object.values(checks).every(Boolean),
    checks,
    latencyMs: Number((performance.now() - started).toFixed(3)),
  };
});
const report = {
  engine: 'local-rule-based',
  aiProviderEvaluated: false,
  recordedAt: new Date().toISOString(),
  caseCount: results.length,
  passed: results.filter((item) => item.passed).length,
  scope:
    'Synthetic fixed fixtures only; no general accuracy or production performance claim.',
  results,
};
await mkdir('public', { recursive: true });
await writeFile(
  'public/evaluation-results.json',
  JSON.stringify(report, null, 2) + '\n',
);
for (const item of results)
  console.log(
    `${item.passed ? 'PASS' : 'FAIL'} ${item.id}${item.passed ? '' : ': ' + JSON.stringify(item.checks)}`,
  );
console.log(
  `${report.passed}/${report.caseCount} local evaluation cases passed. AI provider not evaluated by this command.`,
);
if (report.passed !== report.caseCount) process.exitCode = 1;
