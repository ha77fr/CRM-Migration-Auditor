import { useState } from 'react';
import { sampleAudit, sampleFindings } from './sampleData.js';
import './FieldworkTemplate.css';

const steps = [
  { title: 'The exports', description: 'Know what you are comparing.' },
  { title: 'The rules', description: 'Make every assumption explicit.' },
  { title: 'The evidence', description: 'Understand what changed.' },
];

export default function FieldworkTemplate() {
  const [step, setStep] = useState(2);

  return (
    <div className="fieldwork-template">
      <header className="fw-header">
        <div className="fw-wordmark"><span className="fw-mark" aria-hidden="true">f.</span>fieldwork<span className="fw-product"> / migration auditor</span></div>
        <span className="fw-edition">A sample review · No. 024</span>
      </header>
      <div className="fw-layout">
        <aside className="fw-guide">
          <p className="fw-kicker">A little clarity goes a long way</p>
          <h2>Your data moved.<br />Did the details?</h2>
          <p className="fw-introduction">A thoughtful review of the records, rules, and relationships that matter.</p>
          <nav className="fw-steps" aria-label="Sample review steps">
            {steps.map((item, index) => (
              <button key={item.title} type="button" aria-pressed={step === index} onClick={() => setStep(index)}>
                <span className="fw-step-number">0{index + 1}</span>
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
                <span className="fw-step-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </nav>
          <div className="fw-margin-note">
            <span className="fw-note-line" aria-hidden="true" />
            <p>Not a guess. Not a blanket approval.<br />Evidence, within the scope you declare.</p>
          </div>
        </aside>
        <section className="fw-paper" aria-labelledby="fw-sheet-title">
          <div className="fw-paper-heading">
            <span className="fw-kicker">{sampleAudit.project}</span>
            <span className="fw-sheet-number">0{step + 1} / 03</span>
          </div>
          {step === 0 && (
            <div>
              <h3 id="fw-sheet-title">Two snapshots.<br />One starting point.</h3>
              <p className="fw-lead">These example exports cover contacts only. No live CRM connection is involved.</p>
              <div className="fw-export-grid">
                {[['Source export', sampleAudit.source, sampleAudit.sourceFile], ['Target export', sampleAudit.target, sampleAudit.targetFile]].map(([label, system, file]) => (
                  <article className="fw-export" key={label}>
                    <span className="fw-kicker">{label}</span><h4>{system}</h4>
                    <p className="fw-row-count">240 <span>records</span></p><code>{file}</code>
                  </article>
                ))}
              </div>
              <div className="fw-observation"><strong>Same count does not mean same data.</strong><p>Both exports have 240 records, but one source contact is missing and one unexpected target contact takes its place.</p></div>
              <p className="fw-footnote">Illustrative fixtures only. Nothing has been uploaded or stored.</p>
            </div>
          )}
          {step === 1 && (
            <div>
              <h3 id="fw-sheet-title">Be precise about<br />what “equal” means.</h3>
              <p className="fw-lead">The sample contract checks these fields. Anything outside this scope is not verified.</p>
              <dl className="fw-rules">
                <div><dt><span>01</span> Record identity</dt><dd><code>Id → LegacyId</code><p>Exact string matching. Leading zeros are preserved.</p></dd></div>
                <div><dt><span>02</span> Email address</dt><dd><code>Email → email</code><p>Strip surrounding whitespace, then compare case-insensitively.</p></dd></div>
                <div><dt><span>03</span> Annual revenue</dt><dd><code>AnnualRevenue → annual_revenue</code><p>Decimal comparison with an absolute tolerance of 0.01.</p></dd></div>
              </dl>
              <p className="fw-footnote">No relationship rules are declared in this sample. The preview does not edit a real audit contract.</p>
            </div>
          )}
          {step === 2 && (
            <div>
              <h3 id="fw-sheet-title">Small differences.<br />Worth a closer look.</h3>
              <p className="fw-lead">The sample audit finished. Three findings need your attention before this declared scope can pass.</p>
              <div className="fw-verdict"><span className="fw-verdict-dot" aria-hidden="true" /><strong>Verdict: failed</strong><span>Execution: completed</span></div>
              <div className="fw-summary">
                <div><strong>240</strong><span>source records</span></div>
                <div><strong>239</strong><span>matched IDs</span></div>
                <div><strong>03</strong><span>findings</span></div>
              </div>
              <div className="fw-findings">
                {sampleFindings.map((finding, index) => (
                  <details key={finding.id}>
                    <summary><span className="fw-finding-number">0{index + 1}</span><span>{finding.title}<small>Record {finding.record}</small></span><span className="fw-expand" aria-hidden="true">+</span></summary>
                    <div className="fw-finding-body">
                      <p>{finding.explanation}</p>
                      <dl className="fw-values"><div><dt>Source</dt><dd>{finding.source}</dd></div><div><dt>Target</dt><dd>{finding.target}</dd></div></dl>
                    </div>
                  </details>
                ))}
              </div>
              <p className="fw-footnote">All 3 sample findings shown. Expand a finding to inspect its evidence.</p>
            </div>
          )}
          <div className="fw-page-actions">
            <span>Sample review · Read only</span>
            <button type="button" onClick={() => setStep((step + 1) % steps.length)}>{step === 2 ? 'Revisit the exports' : step === 0 ? 'Explore the rules' : 'Read the findings'} <span aria-hidden="true">→</span></button>
          </div>
        </section>
      </div>
      <footer className="fw-footer"><span>Make the move. Keep the meaning.</span><span>Synthetic data · {sampleAudit.runId}</span></footer>
    </div>
  );
}
