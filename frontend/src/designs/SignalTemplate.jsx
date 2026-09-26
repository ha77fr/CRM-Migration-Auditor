import { useState } from 'react'
import { sampleAudit, sampleFindings } from './sampleData.js'
import './SignalTemplate.css'

const filters = [
  { value: 'all', label: 'All findings' },
  { value: 'changed', label: 'Changed' },
  { value: 'missing', label: 'Missing' },
  { value: 'unexpected', label: 'Unexpected' },
]

function EvidenceValue({ value }) {
  return <pre>{value === null || value === undefined ? 'Not present' : String(value)}</pre>
}

export default function SignalTemplate() {
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(sampleFindings[0]?.id)
  const visibleFindings = sampleFindings.filter((finding) => filter === 'all' || finding.kind === filter)
  const selectedFinding = visibleFindings.find((finding) => finding.id === selectedId) || visibleFindings[0]

  function changeFilter(value) {
    setFilter(value)
    const nextFindings = sampleFindings.filter((finding) => value === 'all' || finding.kind === value)
    if (!nextFindings.some((finding) => finding.id === selectedId)) {
      setSelectedId(nextFindings[0]?.id)
    }
  }

  return (
    <div className="signal-template">
      <header className="signal-topbar">
        <a className="signal-brand" href="#signal-overview" aria-label="Signal audit overview">
          <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true">
            <path d="M3 18h5l4-11 5 17 3-11h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          SIGNAL <span>/ migration auditor</span>
        </a>
        <nav className="signal-navigation" aria-label="Signal sample audit sections">
          <a href="#signal-overview">Overview</a>
          <a href="#signal-findings">Findings <span>{sampleFindings.length}</span></a>
          <a href="#signal-evidence">Evidence</a>
        </nav>
        <span className="signal-preview-label">Sample audit</span>
      </header>

      <div className="signal-content">
        <section id="signal-overview" className="signal-overview" aria-labelledby="signal-heading">
          <div className="signal-heading-row">
            <div>
              <p className="signal-eyebrow">Audit report <span>/ {sampleAudit.runId}</span></p>
              <h2 id="signal-heading">Trust the evidence.<br /><span>Not the migration.</span></h2>
              <p className="signal-project-name">{sampleAudit.project}</p>
            </div>
            <div className="signal-run-meta">
              <span className="signal-execution"><span aria-hidden="true" />Execution completed</span>
              <span>{sampleAudit.createdAt}</span>
              <span>Static sample · no live connection</span>
            </div>
          </div>

          <div className="signal-verdict">
            <div className="signal-verdict-icon" aria-hidden="true">!</div>
            <div>
              <p className="signal-eyebrow">Audit verdict</p>
              <h3>Failed — discrepancies detected</h3>
              <p>The audit finished successfully. The records did not reconcile.</p>
            </div>
            <a href="#signal-findings" className="signal-review-link">Inspect {sampleFindings.length} findings <span aria-hidden="true">↗</span></a>
          </div>

          <div className="signal-metrics" aria-label="Audit record counts">
            <div><span>Source records</span><strong>{sampleAudit.sourceRows}</strong><small>{sampleAudit.source}</small></div>
            <div><span>Target records</span><strong>{sampleAudit.targetRows}</strong><small>{sampleAudit.target}</small></div>
            <div><span>Matched by ID</span><strong>{sampleAudit.matchedRecords}</strong><small>Present in both exports</small></div>
            <div className="signal-clean-metric"><span>Unchanged records</span><strong>{sampleAudit.unchangedRecords}</strong><small>All compared fields agree</small></div>
          </div>

          <section className="signal-reconciliation" aria-labelledby="signal-reconciliation-heading">
            <div className="signal-section-heading">
              <div><p className="signal-eyebrow">01 / Reconciliation</p><h3 id="signal-reconciliation-heading">Same count. Different records.</h3></div>
              <span className="signal-scope">{sampleAudit.scope}</span>
            </div>
            <div className="signal-flow">
              <div className="signal-flow-end"><span>Source / {sampleAudit.source}</span><strong>{sampleAudit.sourceRows}<small>records</small></strong></div>
              <div className="signal-flow-middle">
                <div className="signal-track" role="img" aria-label="240 source records: 238 unchanged, 1 changed, and 1 missing from the target">
                  <span className="signal-track-unchanged" /><span className="signal-track-changed" /><span className="signal-track-missing" />
                </div>
                <div className="signal-legend">
                  <span><i className="signal-dot-unchanged" />238 unchanged</span>
                  <span><i className="signal-dot-changed" />1 changed</span>
                  <span><i className="signal-dot-missing" />1 missing in target</span>
                </div>
              </div>
              <div className="signal-flow-end signal-flow-target"><span>Target / {sampleAudit.target}</span><strong>{sampleAudit.targetRows}<small>records</small></strong></div>
            </div>
            <div className="signal-reconciliation-note"><span className="signal-unexpected-tag">+1 unexpected in target</span><p>239 shared IDs + 1 target-only record. Equal row counts do not mean an identical migration.</p></div>
          </section>
        </section>

        <section id="signal-findings" className="signal-investigation" aria-labelledby="signal-findings-heading">
          <div className="signal-section-heading">
            <div><p className="signal-eyebrow">02 / Investigation</p><h3 id="signal-findings-heading">Follow the differences.</h3></div>
            <span className="signal-section-note">Select a finding to compare its evidence</span>
          </div>
          <div className="signal-filters" role="group" aria-label="Filter findings by kind">
            {filters.map(({ value, label }) => (
              <button type="button" key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>
                {label}<span>{value === 'all' ? sampleFindings.length : sampleFindings.filter((finding) => finding.kind === value).length}</span>
              </button>
            ))}
          </div>
          <div className="signal-workspace">
            <div className="signal-finding-list">
              <div className="signal-list-heading"><span>Finding index</span><span aria-live="polite">{visibleFindings.length} visible</span></div>
              {visibleFindings.length === 0 && <p className="signal-empty">No findings match this filter.</p>}
              {visibleFindings.map((finding) => (
                <button type="button" key={finding.id} className={`signal-finding ${selectedFinding?.id === finding.id ? 'is-selected' : ''}`} aria-pressed={selectedFinding?.id === finding.id} aria-controls="signal-evidence" onClick={() => setSelectedId(finding.id)}>
                  <span className="signal-finding-top"><span className={`signal-kind signal-kind-${finding.kind}`}>{finding.kind}</span><span className="signal-finding-id">{finding.id}</span></span>
                  <strong>{finding.title}</strong>
                  <span className="signal-finding-bottom"><span>{finding.record}</span><span aria-hidden="true">→</span></span>
                </button>
              ))}
              <p className="signal-list-footnote">Export comparison · read-only evidence</p>
            </div>

            <section id="signal-evidence" className="signal-evidence" aria-labelledby="signal-evidence-heading" aria-live="polite">
              <div className="signal-evidence-header"><p className="signal-eyebrow">03 / Evidence inspector</p><span>Source ↔ Target</span></div>
              {selectedFinding ? (
                <>
                  <div className="signal-evidence-title"><span className={`signal-kind signal-kind-${selectedFinding.kind}`}>{selectedFinding.kind}</span><h3 id="signal-evidence-heading">{selectedFinding.title}</h3><p>Record <code>{selectedFinding.record}</code></p></div>
                  <div className="signal-field"><span>Compared field</span><code>{selectedFinding.field}</code></div>
                  <div className="signal-evidence-values">
                    <div className="signal-value-source"><div className="signal-value-heading"><span>Source</span><strong>{sampleAudit.source}</strong></div><EvidenceValue value={selectedFinding.source} /><p>{sampleAudit.sourceFile}</p></div>
                    <div className="signal-value-target"><div className="signal-value-heading"><span>Target</span><strong>{sampleAudit.target}</strong></div><EvidenceValue value={selectedFinding.target} /><p>{sampleAudit.targetFile}</p></div>
                  </div>
                  <div className="signal-explanation"><span className="signal-eyebrow">What the evidence shows</span><p>{selectedFinding.explanation}</p></div>
                  <div className="signal-evidence-footer"><span>Evidence / {selectedFinding.id}</span><span>Sample data only</span></div>
                </>
              ) : <h3 id="signal-evidence-heading" className="signal-empty">No finding selected</h3>}
            </section>
          </div>
        </section>
        <footer className="signal-footer"><span>SIGNAL / CRM MIGRATION AUDITOR</span><span>Design preview · synthetic records · no data is uploaded</span></footer>
      </div>
    </div>
  )
}
