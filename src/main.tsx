import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FilePenLine,
  FileText,
  Github,
  Link2,
  Loader2,
  LockKeyhole,
  MessageSquare,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  analyzeLocal,
  makeBrief,
  parseConversation,
  toMarkdown,
  type Brief,
  type Evidence,
} from './core.js';
import { samples } from './samples.js';
import './style.css';
function App() {
  const [text, setText] = useState(samples.bilingual.text);
  const [selectedSample, setSelectedSample] =
    useState<keyof typeof samples>('bilingual');
  const [brief, setBrief] = useState<Brief | null>(null);
  const [mode, setMode] = useState<'local' | 'ai'>('local');
  const [ai, setAI] = useState<{ aiAvailable: boolean; model: string | null }>({
    aiAvailable: false,
    model: null,
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [sourceEdit, setSourceEdit] = useState(false);
  const [sourceSnapshot, setSourceSnapshot] = useState('');
  const [activeSource, setActiveSource] = useState('');
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const sourceRefs = useRef<Record<string, HTMLElement | null>>({});
  const dirty = !!brief && text !== sourceSnapshot;
  useEffect(() => {
    if (location.hostname.endsWith('.github.io')) return;
    fetch('/api/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value && typeof value.aiAvailable === 'boolean') setAI(value);
      })
      .catch(() => {});
  }, []);
  async function generate() {
    setError('');
    setBusy(true);
    try {
      const messages = parseConversation(text);
      let value: Brief;
      if (mode === 'local') {
        const started = performance.now();
        const draft = analyzeLocal(messages);
        value = makeBrief(draft, messages, {
          latencyMs: Math.round(performance.now() - started),
        });
      } else {
        if (!consent)
          throw new Error(
            'Confirm that this conversation may be sent to the configured provider.',
          );
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: text, consent: true }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'AI request failed.');
        value = data.brief;
      }
      setBrief(value);
      setTitle(value.title);
      setReviewed([]);
      setEdits({});
      setEditing(null);
      setNotes('');
      setSourceSnapshot(text);
      setSourceEdit(false);
      setActiveSource('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cite(item: Evidence) {
    setSourceEdit(false);
    setActiveSource(item.messageId);
    setTimeout(
      () =>
        sourceRefs.current[item.messageId]?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'center',
        }),
      0,
    );
  }
  function download(kind: 'markdown' | 'json') {
    if (!brief || dirty) return;
    if (Object.values(edits).some((value) => !value.trim())) {
      setError(
        'Give each edited requirement meaningful text before exporting.',
      );
      return;
    }
    const value = { ...brief, title: title.trim() || brief.title };
    const content =
      kind === 'markdown'
        ? toMarkdown(value, reviewed, edits) +
          (notes ? `\n## Human review notes\n\n${notes}\n` : '')
        : JSON.stringify(
            {
              brief: value,
              review: {
                reviewedRequirementIndexes: reviewed,
                editedRequirementText: edits,
                notes,
              },
              sourceConversation: sourceSnapshot,
            },
            null,
            2,
          );
    const url = URL.createObjectURL(
      new Blob([content], {
        type:
          kind === 'markdown'
            ? 'text/markdown;charset=utf-8'
            : 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `project-brief.${kind === 'markdown' ? 'md' : 'json'}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function evidence(items: Evidence[]) {
    return (
      <div className="evidence-links">
        {items.map((item, index) => (
          <button
            key={index}
            onClick={() => cite(item)}
            aria-label={`Show source ${item.messageId}`}
          >
            <Link2 size={11} />
            {item.messageId}
          </button>
        ))}
      </div>
    );
  }
  function sample(key: keyof typeof samples) {
    setSelectedSample(key);
    setText(samples[key].text);
    setSourceEdit(true);
    setConsent(false);
  }
  return (
    <>
      <a className="skip" href="#workspace">
        Skip to workspace
      </a>
      <nav>
        <a href="#" className="brand">
          <span>
            <FilePenLine size={23} />
          </span>
          briefforge<span className="version">0.1</span>
        </a>
        <div>
          <a href="https://github.com/Hashem-Hasan/briefforge#quick-start">
            Documentation <ExternalLink size={12} />
          </a>
          <a
            href="https://github.com/Hashem-Hasan/briefforge"
            className="source-link"
          >
            <Github size={16} />
            View source <ArrowRight size={14} />
          </a>
        </div>
      </nav>
      <main>
        <header className="hero">
          <div>
            <span className="eyebrow">
              <span />A CLEARER START TO CLIENT WORK
            </span>
            <h1>
              Good projects begin
              <br />
              with <em>shared understanding.</em>
            </h1>
            <p>
              Turn a client conversation into a scope you can question,
              <br />
              review and trace back to what was actually said.
            </p>
          </div>
          <div className="hero-note">
            <span className="note-pin" />
            <BookOpen size={25} />
            <p>
              “Where did this
              <br />
              requirement come from?”
            </p>
            <span>Now there's a source for that.</span>
            <div>
              <Link2 size={13} /> Evidence before assumptions.
            </div>
          </div>
        </header>
        <div className="promise-strip">
          <span>
            <MessageSquare size={16} />
            Arabic & English source text
          </span>
          <span>
            <Link2 size={16} />
            Exact source excerpts
          </span>
          <span>
            <ShieldCheck size={16} />
            Unknowns stay visible
          </span>
          <span>
            <PenLine size={16} />
            Human review stays in control
          </span>
        </div>
        <section id="workspace" className="workspace">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">01 / THE WORKSPACE</span>
              <h2>A draft with receipts.</h2>
            </div>
            <span className="draft-badge">
              <span />
              DRAFT / FOR HUMAN REVIEW
            </span>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="workbench">
            <aside className="conversation">
              <div className="panel-heading">
                <div>
                  <span className="panel-index">A</span>
                  <h3>The conversation</h3>
                </div>
                <span>SOURCE MATERIAL</span>
              </div>
              <div className="source-options">
                <label htmlFor="sample">
                  Try a synthetic conversation
                  <select
                    id="sample"
                    value={selectedSample}
                    disabled={busy}
                    onChange={(e) =>
                      sample(e.target.value as keyof typeof samples)
                    }
                  >
                    {Object.entries(samples).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.name}
                      </option>
                    ))}
                  </select>
                </label>
                {brief && (
                  <button
                    className="text-button"
                    onClick={() => setSourceEdit(!sourceEdit)}
                  >
                    {sourceEdit ? 'Show captured sources' : 'Edit conversation'}{' '}
                    <PenLine size={12} />
                  </button>
                )}
              </div>
              {!brief || sourceEdit ? (
                <div className="conversation-editor">
                  <label htmlFor="conversation-text">
                    One message per line. Speaker labels are optional.
                  </label>
                  <textarea
                    id="conversation-text"
                    dir="auto"
                    spellCheck={false}
                    value={text}
                    maxLength={60000}
                    disabled={busy}
                    onChange={(e) => {
                      setText(e.target.value);
                      setConsent(false);
                    }}
                  />
                  <div>
                    <span>
                      {text.length.toLocaleString()} / 60,000 characters
                    </span>
                    <span>Up to 300 messages</span>
                  </div>
                </div>
              ) : (
                <div className="source-messages">
                  {brief.messages.map((message) => (
                    <article
                      tabIndex={-1}
                      ref={(el) => {
                        sourceRefs.current[message.id] = el;
                      }}
                      className={
                        activeSource === message.id ? 'highlighted' : ''
                      }
                      key={message.id}
                    >
                      <div>
                        <strong>{message.speaker}</strong>
                        <code>{message.id}</code>
                      </div>
                      <p dir="auto">{message.text}</p>
                    </article>
                  ))}
                </div>
              )}
              <div className="analysis-controls">
                <label htmlFor="analysis-mode">
                  Analysis mode
                  <select
                    id="analysis-mode"
                    value={mode}
                    disabled={busy}
                    onChange={(e) => {
                      setMode(e.target.value as 'local' | 'ai');
                      setConsent(false);
                    }}
                  >
                    <option value="local">Local · rule-based analysis</option>
                    <option value="ai" disabled={!ai.aiAvailable}>
                      AI ·{' '}
                      {ai.aiAvailable
                        ? ai.model
                        : 'configure local server first'}
                    </option>
                  </select>
                </label>
                <p>
                  {mode === 'local'
                    ? 'Runs in your browser. Extractive rules and proposed checks; no language model or uploads.'
                    : 'Sends the conversation to the server-configured provider. Usage may incur provider charges.'}
                </p>
                {mode === 'ai' && (
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      I agree to send this conversation to the configured AI
                      provider.
                    </span>
                  </label>
                )}
                <button
                  className="primary wide"
                  disabled={busy || !text.trim() || (mode === 'ai' && !consent)}
                  onClick={() => void generate()}
                >
                  {busy ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <FileText size={16} />
                  )}{' '}
                  {busy
                    ? 'Preparing your draft…'
                    : brief
                      ? 'Regenerate draft'
                      : 'Prepare a scope draft'}
                  <ArrowRight size={15} />
                </button>
                <div className="privacy-note">
                  <LockKeyhole size={12} />
                  <span>No automatic saves. Export to keep your work.</span>
                </div>
              </div>
            </aside>
            <div className="brief-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-index">B</span>
                  <h3>The reviewable brief</h3>
                </div>
                <span>
                  {brief
                    ? brief.engine === 'ai'
                      ? 'AI-ASSISTED'
                      : 'LOCAL RULES'
                    : 'AWAITING SOURCE'}
                </span>
              </div>
              {!brief ? (
                <div className="empty-brief">
                  <div className="paper-illustration">
                    <div className="paper-heading" />
                    <div className="paper-line" />
                    <div className="paper-line short" />
                    <div className="paper-check">
                      <Check size={13} />
                      <span />
                    </div>
                    <div className="paper-check">
                      <Check size={13} />
                      <span />
                    </div>
                    <div className="paper-callout">
                      <Link2 size={13} />
                      M001
                    </div>
                  </div>
                  <span className="eyebrow">A CLEARER FIRST DRAFT</span>
                  <h3>
                    The useful questions
                    <br />
                    belong in the brief.
                  </h3>
                  <p>
                    Scope excerpts with sources. Proposed acceptance checks.
                    Visible gaps in budget and timeline.
                  </p>
                  <div className="empty-checks">
                    <span>
                      <Check size={13} />
                      Original wording preserved
                    </span>
                    <span>
                      <Check size={13} />
                      Unknowns never become estimates
                    </span>
                    <span>
                      <Check size={13} />
                      Your review, before any commitment
                    </span>
                  </div>
                </div>
              ) : (
                <div className="brief-content">
                  {dirty && (
                    <div className="dirty-note" role="status">
                      The conversation changed. Regenerate the draft before
                      reviewing or exporting it.
                    </div>
                  )}
                  <div className="brief-meta">
                    <span>
                      <Clock3 size={12} />
                      {brief.latencyMs}ms{' '}
                      {brief.engine === 'local'
                        ? 'local analysis'
                        : 'provider request'}
                    </span>
                    <span>
                      {brief.usage
                        ? `${brief.usage.inputTokens + brief.usage.outputTokens} tokens · cost not calculated`
                        : brief.engine === 'local'
                          ? 'No provider cost in local mode'
                          : 'Provider usage unavailable · cost not calculated'}
                    </span>
                  </div>
                  <label className="title-label">
                    PROPOSED PROJECT TITLE
                    <input
                      value={title}
                      maxLength={150}
                      aria-label="Project title"
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={dirty}
                    />
                  </label>
                  <div className="brief-stats">
                    <div>
                      <strong>{brief.requirements.length}</strong>
                      <span>scope excerpts</span>
                    </div>
                    <div>
                      <strong>{brief.questions.length}</strong>
                      <span>open questions</span>
                    </div>
                    <div>
                      <strong>
                        {reviewed.length}/{brief.requirements.length}
                      </strong>
                      <span>reviewed by you</span>
                    </div>
                  </div>
                  <div className="brief-section-title">
                    <h4>Scope to review</h4>
                    <span>EXTRACTED / NOT CLIENT APPROVAL</span>
                  </div>
                  {brief.requirements.length ? (
                    brief.requirements.map((item, index) => (
                      <article
                        className={`requirement ${reviewed.includes(index) ? 'reviewed' : ''}`}
                        key={index}
                      >
                        <div className="requirement-top">
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Mark requirement ${index + 1} reviewed`}
                              checked={reviewed.includes(index)}
                              disabled={dirty}
                              onChange={(e) =>
                                setReviewed(
                                  e.target.checked
                                    ? [...reviewed, index]
                                    : reviewed.filter((i) => i !== index),
                                )
                              }
                            />
                            <span>R{String(index + 1).padStart(2, '0')}</span>
                            {reviewed.includes(index) && (
                              <small>Reviewed by you</small>
                            )}
                            {edits[index] !== undefined && (
                              <small className="edited">Human edited</small>
                            )}
                          </label>
                          <button
                            className="icon-button"
                            aria-label={`Edit requirement ${index + 1}`}
                            disabled={dirty}
                            onClick={() =>
                              setEditing(editing === index ? null : index)
                            }
                          >
                            <PenLine size={13} />
                          </button>
                        </div>
                        {editing === index ? (
                          <textarea
                            dir="auto"
                            aria-label={`Requirement ${index + 1} text`}
                            maxLength={2000}
                            value={edits[index] ?? item.text}
                            onChange={(e) => {
                              setEdits({ ...edits, [index]: e.target.value });
                              setReviewed(reviewed.filter((i) => i !== index));
                            }}
                          />
                        ) : (
                          <p dir="auto">{edits[index] ?? item.text}</p>
                        )}
                        {evidence(item.evidence)}
                        <details>
                          <summary>
                            Proposed acceptance checks <ChevronDown size={13} />
                          </summary>
                          <ul>
                            {item.acceptanceCriteria.map((check, i) => (
                              <li key={i}>{check}</li>
                            ))}
                          </ul>
                        </details>
                      </article>
                    ))
                  ) : (
                    <p className="inline-note">
                      No explicit requirement excerpts were found. Clarify the
                      intended user flow.
                    </p>
                  )}
                  {!!brief.outOfScope.length && (
                    <>
                      <div className="brief-section-title">
                        <h4>Explicit exclusions</h4>
                        <span>SOURCE EXCERPTS</span>
                      </div>
                      {brief.outOfScope.map((item, index) => (
                        <div className="exclusion" key={index}>
                          <p dir="auto">{item.text}</p>
                          {evidence(item.evidence)}
                        </div>
                      ))}
                    </>
                  )}
                  <div className="brief-section-title">
                    <h4>Commercial details</h4>
                    <span>NO INVENTED ESTIMATES</span>
                  </div>
                  <div className="commercial">
                    {(['budget', 'timeline'] as const).map((key) => (
                      <div key={key} className={brief[key].status}>
                        <span>{key === 'budget' ? 'BUDGET' : 'TIMELINE'}</span>
                        <strong>
                          {brief[key].status === 'unknown'
                            ? 'Not established'
                            : brief[key].status === 'conflict'
                              ? 'Conflicting statements'
                              : 'Stated in source'}
                        </strong>
                        {brief[key].value && (
                          <p dir="auto">{brief[key].value}</p>
                        )}
                        {evidence(brief[key].evidence)}
                      </div>
                    ))}
                  </div>
                  <div className="brief-section-title">
                    <h4>Questions before a commitment</h4>
                  </div>
                  <ol className="questions">
                    {brief.questions.map((question, index) => (
                      <li key={index}>{question}</li>
                    ))}
                  </ol>
                  <details className="risks">
                    <summary>
                      Risks & review boundaries <ChevronDown size={14} />
                    </summary>
                    <ul>
                      {brief.risks.map((risk, index) => (
                        <li key={index}>{risk}</li>
                      ))}
                    </ul>
                  </details>
                  <label className="human-notes">
                    Your review notes
                    <textarea
                      value={notes}
                      disabled={dirty}
                      maxLength={10000}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Decisions to confirm, edits to discuss, or your own observations…"
                    />
                  </label>
                  <div className="export-bar">
                    <span>Draft only. Your review is not client approval.</span>
                    <div>
                      <button
                        className="secondary"
                        disabled={dirty}
                        onClick={() => download('json')}
                      >
                        JSON
                      </button>
                      <button
                        className="primary"
                        disabled={dirty}
                        onClick={() => download('markdown')}
                      >
                        <ArrowDownToLine size={15} />
                        Export Markdown
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="principles">
          <div>
            <span className="eyebrow">WHAT MAKES THE DRAFT USEFUL</span>
            <h2>
              Trace the statement.
              <br />
              <em>Keep the uncertainty.</em>
            </h2>
            <p>
              Exact excerpts make the source inspectable. Human edits stay
              labeled. Proposed checks stay proposals, and missing commercial
              details become questions.
            </p>
            <a href="https://github.com/Hashem-Hasan/briefforge/blob/main/docs/architecture.md">
              Read the engineering decisions <ArrowRight size={15} />
            </a>
          </div>
          <div className="principle-cards">
            <article>
              <Link2 size={19} />
              <h3>Evidence integrity</h3>
              <p>
                AI output is rejected when a quote or message reference does not
                match the supplied conversation.
              </p>
            </article>
            <article>
              <ShieldCheck size={19} />
              <h3>Deliberate boundaries</h3>
              <p>
                No automatic pricing, client approval, emails or project
                creation. You decide what happens next.
              </p>
            </article>
            <article>
              <CheckCircle2 size={19} />
              <h3>Inspectable evaluations</h3>
              <p>
                Synthetic Arabic and English fixtures cover missing details,
                conflicting statements and source integrity.
              </p>
              <a href="./evaluation-results.json">
                View recorded local evaluation results <ArrowRight size={12} />
              </a>
            </article>
          </div>
        </section>
      </main>
      <footer>
        <span>
          <FilePenLine size={18} />
          BriefForge{' '}
          <span>
            by <a href="https://www.tarneebtech.com/">Hashem Hasan</a>
          </span>
        </span>
        <a href="https://github.com/Hashem-Hasan/briefforge">
          Source & documentation <ArrowRight size={14} />
        </a>
      </footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
