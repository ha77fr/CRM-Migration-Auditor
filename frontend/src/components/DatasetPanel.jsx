import { useEffect, useRef, useState } from 'react';
import { uploadDataset } from '../api.js';
import Pagination from './Pagination.jsx';

function UploadForm({ projectId, side, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const title = side === 'source' ? 'Source' : 'Target';

  async function submit(event) {
    event.preventDefault();
    if (request.current) return;
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    setError(null);
    setMessage('');
    if (!(file instanceof File) || !file.name) { setError('Select a CSV file first.'); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Select a .csv file.'); return; }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const dataset = await uploadDataset(projectId, side, file, controller.signal);
      if (!controller.signal.aborted) {
        onUploaded(dataset);
        form.reset();
        setMessage(`Uploaded ${dataset.filename}: ${dataset.row_count} records.`);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="upload-card">
      <h3>{title} export</h3>
      <p className="muted">{side === 'source' ? 'The original records before migration.' : 'The migrated records to check against the source.'}</p>
      <label className="field">{title} CSV<input name="file" type="file" accept=".csv,text/csv" required disabled={busy} /></label>
      <button type="submit" disabled={busy}>{busy ? `Uploading ${side}…` : `Upload ${side}`}</button>
      <p className="muted" role="status">{message}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

export default function DatasetPanel({ projectId, datasets, onUploaded }) {
  const [side, setSide] = useState('all');
  const [offset, setOffset] = useState(0);
  const visible = datasets.filter((dataset) => side === 'all' || dataset.side === side);
  return (
    <section className="panel stack" aria-labelledby="datasets-title">
      <div><p className="eyebrow">Step 1 / Immutable exports</p><h2 id="datasets-title">Upload source and target datasets</h2></div>
      <p className="muted">UTF-8 CSV with unique column headers. Default server limits: 5 MiB, 25,000 data records, and 200 columns per file; your server configuration may differ. Each upload creates a new immutable snapshot. Upload parent exports here too if you want relationship checks.</p>
      <div className="form-grid">
        <UploadForm projectId={projectId} side="source" onUploaded={onUploaded} />
        <UploadForm projectId={projectId} side="target" onUploaded={onUploaded} />
      </div>
      <div className="section-heading"><h3>Uploaded snapshots ({datasets.length})</h3><label className="field">Filter datasets<select value={side} onChange={(event) => { setSide(event.target.value); setOffset(0); }}><option value="all">All sides</option><option value="source">Source</option><option value="target">Target</option></select></label></div>
      {visible.length === 0 ? <p className="empty-state">No {side === 'all' ? '' : `${side} `}datasets yet. Upload an export above to begin.</p> : (
        <ul className="dataset-list">
          {visible.slice(offset, offset + 10).map((dataset) => (
            <li key={dataset.id}>
              <div className="section-heading"><h3>{dataset.filename}</h3><span className={`badge badge--${dataset.side}`}>{dataset.side}</span></div>
              <p className="muted">{dataset.row_count} records · {dataset.headers.length} columns · {new Date(dataset.created_at).toLocaleString()}</p>
              <details><summary>Columns and snapshot identity</summary><p className="column-list">{dataset.headers.map((header) => <code key={header}>{JSON.stringify(header)}</code>)}</p><dl className="metadata"><dt>Dataset ID</dt><dd><code>{dataset.id}</code></dd><dt>SHA-256</dt><dd><code>{dataset.sha256}</code></dd></dl></details>
            </li>
          ))}
        </ul>
      )}
      {visible.length > 10 && <Pagination offset={offset} pageSize={10} hasNext={offset + 10 < visible.length} onChange={setOffset} label="Datasets" />}
      <div className="actions"><a className="button-link" href={`#/projects/${projectId}?view=audit`}>Configure an audit <span aria-hidden="true">→</span></a></div>
    </section>
  );
}
