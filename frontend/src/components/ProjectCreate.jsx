import { useEffect, useRef, useState } from 'react';
import { postJson } from '../api.js';

export default function ProjectCreate({ onCreated }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (request.current) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
    if (!name) { setError('Enter a project name, not only whitespace.'); return; }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const project = await postJson('/api/v1/projects', { name, description: String(data.get('description')) }, controller.signal);
      if (!controller.signal.aborted) onCreated(project);
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="create-project-title">
      <div className="section-heading"><h2 id="create-project-title">Create a project</h2><span className="eyebrow">Start here</span></div>
      <p className="muted">Keep related exports and audit runs together. Use synthetic data in this local workspace.</p>
      <form className="stack" onSubmit={submit}>
        <fieldset disabled={busy} className="form-fields">
          <label className="field">Project name<input name="name" required maxLength={120} autoComplete="off" placeholder="CRM migration review" /></label>
          <label className="field">Description (optional)<textarea name="description" maxLength={2000} rows={3} /></label>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="submit" disabled={busy}>{busy ? 'Creating project…' : 'Create project'}</button></div>
      </form>
    </section>
  );
}
