import { useId, useState } from 'react'
import { sampleAudit, sampleFindings } from './sampleData.js'
import './AtlasTemplate.css'

const findingLabels = {
  changed: 'Value changed',
  missing: 'Missing in target',
  unexpected: 'Unexpected in target',
}

function displayValue(value) {
  return value === null || value === undefined || value === '' ? 'Not present' : String(value)
}

export default function AtlasTemplate() {
  const instanceId = useId()
  const overviewId = `${instanceId}-overview`
  const findingsId = `${instanceId}-findings`
  const evidenceId = `${instanceId}-evidence`
  const searchId = `${instanceId}-search`
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(sampleFindings[0]?.id)
  const query = search.trim().toLowerCase()
  const visibleFindings = sampleFindings.filter((finding) =>
    [finding.record, finding.title, finding.field, finding.kind, findingLabels[finding.kind], finding.source, finding.target]
      .some((value) => String(value ?? '').toLowerCase().includes(query)),
  )
  const selectedFinding = visibleFindings.find((finding) => finding.id === selectedId) ?? visibleFindings[0]

  return (
    <div className="atlas-template">
      <aside className="atlas-sidebar" aria-label="Atlas workspace">
        <a className="atlas-brand" href={`#${overviewId}`}>
          <span className="atlas-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="m5 18 7-13 7 13M8 14h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span>atlas<span className="atlas-brand-caption">MIGRATION AUDITOR</span></span>
        </a>
        <div className="atlas-workspace">
          <span className="atlas-workspace-avatar" aria-hidden="true">N</span>
          <div><strong>Northstar</strong><span>Migration workspace</span></div>
        </div>
        <p className="atlas-eyebrow atlas-nav-label">Workspace</p>
        <nav className="atlas-nav" aria-label="Sample audit sections">
          <a href={`#${overviewId}`}><span aria-hidden="true">01</span>Overview</a>
          <a href={`#${findingsId}`}><span aria-hidden="true">02</span>Findings<span className="atlas-nav-count">{sampleFindings.length}</span></a>
          <a href={`#${evidenceId}`}><span aria-hidden="true">03</span>Record evidence</a>
        </nav>
        <div className="atlas-sidebar-note">
          <span className="atlas-eyebrow">Built for the handoff</span>
          <p>Know what moved.<br />See what changed.</p>
          <span className="atlas-sample-label">Sample audit · Design preview</span>
        </div>
      </aside>

      <div className="atlas-main">
        <header className="atlas-topbar">
          <p>Workspace <span aria-hidden="true">/</span> Migration overview</p>
          <span className="atlas-demo-pill"><span aria-hidden="true" />Sample audit</span>
        </header>

        <section className="atlas-overview" id={overviewId} aria-labelledby={`${overviewId}-title`}>
          <div className="atlas-heading-row">
            <div>
              <p className="atlas-eyebrow">Clarity before cutover</p>
              <h2 id={`${overviewId}-title`}>A clearer view of your migration.</h2>
              <p className="atlas-subtitle">Every record accounted for. Every difference in view.</p>
            </div>
            <span className="atlas-run-id">{sampleAudit.runId}</span>
          </div>

          <div className="atlas-audit-card">
            <div className="atlas-audit-summary">
              <span className="atlas-eyebrow">Sample audit</span>
              <h3>{sampleAudit.project}</h3>
              <p>{sampleAudit.scope}</p>
              <div className="atlas-system-route"><span>{sampleAudit.source}</span><span className="atlas-route-arrow" aria-label="to">→</span><span>{sampleAudit.target}</span></div>
            </div>
            <div className="atlas-audit-status">
              <div><span className="atlas-eyebrow">Execution</span><strong className="atlas-complete"><span aria-hidden="true">✓</span> {sampleAudit.status === 'completed' ? 'Completed' : sampleAudit.status}</strong></div>
              <div><span className="atlas-eyebrow">Audit verdict</span><strong className="atlas-failed">{sampleAudit.verdict === 'failed' ? 'Failed · Review required' : sampleAudit.verdict}</strong></div>
              <p>{sampleAudit.createdAt}</p>
            </div>
          </div>

          <div className="atlas-metrics" aria-label="Sample audit totals">
            <div className="atlas-metric"><span className="atlas-eyebrow">Source records</span><strong>{sampleAudit.sourceRows}</strong><span>{sampleAudit.source} export</span></div>
            <div className="atlas-metric"><span className="atlas-eyebrow">Target records</span><strong>{sampleAudit.targetRows}</strong><span>{sampleAudit.target} export</span></div>
            <div className="atlas-metric"><span className="atlas-eyebrow">Matched by ID</span><strong>{sampleAudit.matchedRecords}</strong><span>Records paired for comparison</span></div>
            <div className="atlas-metric atlas-metric-accent"><span className="atlas-eyebrow">Unchanged records</span><strong>{sampleAudit.unchangedRecords}</strong><span>No compared field differences</span></div>
          </div>
        </section>

        <div className="atlas-review-grid">
          <section className="atlas-findings-panel" id={findingsId} aria-labelledby={`${findingsId}-title`}>
            <div className="atlas-panel-heading"><div><p className="atlas-eyebrow">The review queue</p><h3 id={`${findingsId}-title`}>Findings <span>{sampleFindings.length}</span></h3></div><span className="atlas-small-label">Sample results</span></div>
            <div className="atlas-search-wrap">
              <label htmlFor={searchId}>Search findings</label>
              <div className="atlas-search-input"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg><input id={searchId} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Record ID, field, or value…" /></div>
            </div>
            <div className="atlas-list-header" aria-hidden="true"><span>Record / finding</span><span>Difference</span><span /></div>
            {visibleFindings.length > 0 ? (
              <ul className="atlas-finding-list">
                {visibleFindings.map((finding) => (
                  <li key={finding.id}>
                    <button type="button" className={`atlas-finding-row${selectedFinding?.id === finding.id ? ' atlas-finding-selected' : ''}`} onClick={() => setSelectedId(finding.id)} aria-pressed={selectedFinding?.id === finding.id} aria-controls={evidenceId}>
                      <span className="atlas-record-copy"><strong>{finding.record}</strong><span>{finding.title}</span></span>
                      <span className={`atlas-kind atlas-kind-${finding.kind}`}>{findingLabels[finding.kind] ?? finding.kind}</span>
                      <span className="atlas-row-arrow" aria-hidden="true">↗</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="atlas-empty"><h4>No matching findings</h4><p>Try a different record ID, field, or value.</p><button type="button" onClick={() => setSearch('')}>Clear search</button></div>
            )}
            <div className="atlas-list-footer"><span role="status">Showing {visibleFindings.length} of {sampleFindings.length} findings</span><span>Select a record to inspect</span></div>
          </section>

          <section className="atlas-evidence-panel" id={evidenceId} aria-labelledby={`${evidenceId}-title`}>
            <div className="atlas-panel-heading"><div><p className="atlas-eyebrow">Side by side</p><h3 id={`${evidenceId}-title`}>Record evidence</h3></div><span className="atlas-evidence-marker" aria-hidden="true">↗</span></div>
            {selectedFinding ? (
              <div className="atlas-evidence-content" aria-live="polite" aria-atomic="true">
                <div className="atlas-evidence-record"><span className="atlas-eyebrow">Record ID</span><strong>{selectedFinding.record}</strong><span className={`atlas-kind atlas-kind-${selectedFinding.kind}`}>{findingLabels[selectedFinding.kind] ?? selectedFinding.kind}</span></div>
                <div className="atlas-field-name"><span className="atlas-eyebrow">Compared field</span><strong>{selectedFinding.field}</strong></div>
                <dl className="atlas-value-comparison">
                  <div><dt><span className="atlas-value-dot" />Source <span>{sampleAudit.source}</span></dt><dd>{displayValue(selectedFinding.source)}</dd></div>
                  <div className="atlas-target-value"><dt><span className="atlas-value-dot" />Target <span>{sampleAudit.target}</span></dt><dd>{displayValue(selectedFinding.target)}</dd></div>
                </dl>
                <div className="atlas-explanation"><h4>What to review</h4><p>{selectedFinding.explanation}</p></div>
              </div>
            ) : <div className="atlas-evidence-empty"><p>No record selected</p><span>Matching record evidence will appear here when you adjust your search.</span></div>}
          </section>
        </div>

        <footer className="atlas-footer"><span>Sample audit · Synthetic data only</span><span>Source: {sampleAudit.sourceFile}<span aria-hidden="true"> / </span>Target: {sampleAudit.targetFile}</span></footer>
      </div>
    </div>
  )
}
