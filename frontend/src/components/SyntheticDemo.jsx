import { useEffect, useRef, useState } from 'react';
import { postJson, uploadDataset } from '../api.js';
import sourceCsv from '../../../examples/source.csv?raw';
import targetCsv from '../../../examples/target.csv?raw';
import contract from '../../../examples/contract.json';

export default function SyntheticDemo({ onCreated }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function start() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setProjectId(null);
    setStatus('Creating a synthetic project…');
    try {
      const project = await postJson('/api/v1/projects', {
        name: 'Synthetic migration demo',
        description: 'Synthetic CRM exports: normalized email and stage values, one changed amount, one missing record, and one unexpected record.',
      }, controller.signal);
      if (controller.signal.aborted) return;
      setProjectId(project.id);
      setStatus('Uploading the source and target examples…');
      const source = await uploadDataset(project.id, 'source', new File([sourceCsv], 'source.csv', { type: 'text/csv' }), controller.signal);
      const target = await uploadDataset(project.id, 'target', new File([targetCsv], 'target.csv', { type: 'text/csv' }), controller.signal);
      setStatus('Submitting the declared comparison rules…');
      let audit;
      try {
        audit = await postJson(`/api/v1/projects/${project.id}/audits`, {
          source_dataset_id: source.id,
          target_dataset_id: target.id,
          contract,
        }, controller.signal);
      } catch (error) {
        // Dispatch failure still creates an audit; open it rather than hiding its state.
        if (error.status === 503 && error.detail?.audit_id) audit = { id: error.detail.audit_id };
        else throw error;
      }
      if (!controller.signal.aborted) onCreated(project, audit);
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setStatus('');
    }
  }

  return (
    <section className="panel" aria-labelledby="synthetic-demo-title">
      <div className="section-heading"><h2 id="synthetic-demo-title">Try a synthetic audit</h2><span className="eyebrow">Guided demo</span></div>
      <p>No files to prepare. Create a real project, upload the bundled example exports, and run the example contract through the same API as your own audits.</p>
      <p className="muted">Expected: completed execution with a failed verdict — one missing record, one unexpected record, and an amount changed from 200 to 250. Email normalization and stage translations pass. Each click creates a separate project.</p>
      <button type="button" disabled={Boolean(status)} onClick={start}>{status ? 'Preparing demo…' : 'Run synthetic demo'}</button>
      {status && <p role="status">{status}</p>}
      {error && <div className="stack"><p className="error" role="alert">{error}</p>{projectId && <p>The partially prepared project is retained. <a href={`#/projects/${projectId}`}>Open its datasets</a> to continue manually.</p>}</div>}
    </section>
  );
}
