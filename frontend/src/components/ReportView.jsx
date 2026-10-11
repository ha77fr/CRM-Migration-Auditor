import { useEffect, useRef, useState } from 'react';
import { downloadReport } from '../api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import Pagination from './Pagination.jsx';

const PAGE_SIZE = 20;
const FINDING_FIELDS = [
  ['side', 'Side'],
  ['record_key', 'Record key'],
  ['field', 'Field'],
  ['record_number', 'Record number'],
  ['relationship', 'Relationship'],
  ['dataset_pair', 'Dataset pair'],
  ['expected', 'Expected'],
  ['actual', 'Actual'],
];

function ExactValue({ value }) {
  if (value === null || value === undefined) return <span className="muted">null (not supplied)</span>;
  if (value === '') return <span className="muted">&quot;&quot; (empty string)</span>;
  return <code className="audit-exact">{String(value)}</code>;
}

export default function ReportView({ projectId, auditId }) {
  const [reload, setReload] = useState(0);
  const [findingType, setFindingType] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [downloading, setDownloading] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const mounted = useRef(false);
  const downloadInFlight = useRef(false);
  const { status, data: report, error } = useApiResource(
    `/api/v1/projects/${encodeURIComponent(projectId)}/audits/${encodeURIComponent(auditId)}/report`, reload,
  );

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function download(format) {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    setDownloading(format);
    setDownloadError(null);
    try {
      await downloadReport(projectId, auditId, format);
    } catch (requestError) {
      if (mounted.current) setDownloadError(requestError.message);
    } finally {
      downloadInFlight.current = false;
      if (mounted.current) setDownloading(null);
    }
  }

  const findings = report?.findings ?? [];
  const types = [...new Set([...Object.keys(report?.finding_counts ?? {}), ...findings.map((finding) => finding.code)])].sort();
  const needle = search.toLocaleLowerCase();
  const filtered = findings.filter((finding) => (
    (!findingType || finding.code === findingType)
    && (!needle || Object.entries(finding).some(([key, value]) => (
      `${key}: ${value === null ? 'null' : value === '' ? '""' : String(value)}`.toLocaleLowerCase().includes(needle)
    )))
  ));

  return (
    <section className="panel audit-report" aria-labelledby="audit-report-title" aria-busy={status === 'loading'}>
      <div className="section-heading">
        <h2 id="audit-report-title">Comparison report</h2>
        <button type="button" className="secondary" disabled={status === 'loading'} onClick={() => setReload((value) => value + 1)}>Reload report</button>
      </div>
      {status === 'loading' && <p role="status">Loading report…</p>}
      {status === 'error' && <p className="error" role="alert">{error} Use Reload report to try again.</p>}
      {status === 'success' && (
        <div className="stack">
          <div>
            <p>Comparison verdict: <strong className={`badge${report.verdict === 'passed' ? ' badge--success' : report.verdict === 'failed' ? ' badge--error' : ''}`}>{report.verdict}</strong></p>
            {report.verdict === 'failed' && <p>The execution completed and found comparison problems. This is not an execution failure; review the findings and submit a new audit if the data or contract changes.</p>}
            {report.verdict === 'not_verified' && <p>The available evidence did not establish verification. Review the findings and submitted contract before drawing a conclusion.</p>}
            <h3>Report scope</h3>
            <p className="audit-exact">{report.scope}</p>
            <p className="notice">Limited evidence: this report covers only the submitted contract and uploaded snapshots. A passed verdict is not proof that an entire migration or live system is correct.</p>
          </div>
          <dl className="audit-metrics">
            <div><dt>Source rows</dt><dd>{report.source_rows}</dd></div>
            <div><dt>Target rows</dt><dd>{report.target_rows}</dd></div>
            <div><dt>Matched records</dt><dd>{report.matched_records}</dd></div>
            <div><dt>Compared fields</dt><dd>{report.compared_fields}</dd></div>
            <div><dt>Compared relationships</dt><dd>{report.compared_relationships}</dd></div>
            <div><dt>Total findings</dt><dd>{Object.values(report.finding_counts).reduce((sum, count) => sum + count, 0)}</dd></div>
            <div><dt>Retained findings</dt><dd>{findings.length}</dd></div>
            <div><dt>Findings truncated</dt><dd>{report.findings_truncated ? 'Yes' : 'No'}</dd></div>
          </dl>
          {report.findings_truncated && <p className="notice" role="status">Evidence is truncated. Finding counts include all detected findings, but only the retained evidence is available to inspect, filter, or export. An empty filter result does not establish that no such finding exists.</p>}
          <div>
            <h3>Finding counts by type</h3>
            {Object.keys(report.finding_counts).length === 0 ? <p>No findings counted.</p> : (
              <dl className="audit-metrics">
                {Object.entries(report.finding_counts).map(([code, count]) => <div key={code}><dt className="audit-exact">{code}</dt><dd>{count}</dd></div>)}
              </dl>
            )}
          </div>
          <div>
            <h3>Provenance</h3>
            <p>Engine version: <code className="audit-exact">{report.engine_version}</code></p>
            {Object.keys(report.input_sha256).length === 0 ? <p className="muted">No input hashes supplied by this report.</p> : (
              <dl className="audit-provenance">
                {Object.entries(report.input_sha256).map(([name, digest]) => <div key={name}><dt className="audit-exact">{name} SHA-256</dt><dd><code className="audit-exact">{digest}</code></dd></div>)}
              </dl>
            )}
          </div>
          <div>
            <div className="actions">
              <button type="button" disabled={downloading !== null} onClick={() => download('json')}>{downloading === 'json' ? 'Downloading JSON…' : 'Download JSON'}</button>
              <button type="button" className="secondary" disabled={downloading !== null} onClick={() => download('csv')}>{downloading === 'csv' ? 'Downloading CSV…' : 'Download CSV'}</button>
            </div>
            <p className="muted">Downloads contain the report, not just filtered findings. JSON preserves null versus empty string; CSV renders both as blank and protects spreadsheet-like values.</p>
            {downloadError && <p className="error" role="alert">Download failed: {downloadError} Try the download again.</p>}
          </div>
          <div className="stack">
            <h3>Inspect retained findings</h3>
            <p className="muted">Expected and actual are engine-reported values and may be normalized; they do not always mean source and target. Record numbers are one-based data-record indices, excluding headers and skipped blank records. Expand Exact finding JSON to distinguish whitespace and escaped characters.</p>
            <div className="form-grid">
              <label className="field" htmlFor="finding-type">Finding type
                <select id="finding-type" value={findingType} onChange={(event) => { setFindingType(event.target.value); setOffset(0); }}>
                  <option value="">All finding types</option>
                  {types.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label className="field" htmlFor="finding-search">Search retained finding fields
                <input id="finding-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} placeholder="Key, field, value, relationship…" />
              </label>
            </div>
            <p role="status">{filtered.length} of {findings.length} retained findings match.</p>
            {findings.length === 0 && <p>{report.findings_truncated ? 'No finding evidence was retained. Consult the total counts above; this does not mean there were no findings.' : 'No findings in this report. Interpret this together with the verdict and limited scope above.'}</p>}
            {findings.length > 0 && filtered.length === 0 && <p>No retained findings match these filters. Change the finding type or clear the search.</p>}
            <ol className="audit-findings" start={offset + 1}>
              {filtered.slice(offset, offset + PAGE_SIZE).map((finding, index) => (
                <li key={offset + index}>
                  <h4 className="audit-exact">{finding.code}</h4>
                  <dl className="audit-finding-fields">
                    {FINDING_FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd><ExactValue value={finding[key]} /></dd></div>)}
                  </dl>
                  <details><summary>Exact finding JSON</summary><pre className="audit-json">{JSON.stringify(finding, null, 2)}</pre></details>
                </li>
              ))}
            </ol>
            {filtered.length > 0 && <Pagination offset={offset} pageSize={PAGE_SIZE} hasNext={offset + PAGE_SIZE < filtered.length} onChange={setOffset} label="Retained findings" />}
          </div>
        </div>
      )}
    </section>
  );
}
