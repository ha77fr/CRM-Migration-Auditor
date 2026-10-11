import { useEffect, useRef, useState } from 'react';
import { getJson, postJson } from '../api.js';
import ReportView from './ReportView.jsx';
import './AuditPage.css';

const FAILURE_REASONS = {
  dispatch_unavailable: 'The worker queue was unavailable. No comparison verdict can be inferred from this execution failure. Retry once the queue is available.',
  input_unavailable_or_invalid: 'The engine could not read or validate an input. Check the uploaded snapshots and server storage before retrying; use a new audit for changed inputs or contract.',
  audit_execution_failed: 'The engine encountered an execution error. No comparison verdict was produced. Check server diagnostics before retrying.',
};

function Timestamp({ value }) {
  return value ? <time dateTime={value}>{value}</time> : <span className="muted">Not recorded</span>;
}

export default function AuditPage({ projectId, auditId }) {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/audits/${encodeURIComponent(auditId)}`;
  const projectRoute = `#/projects/${encodeURIComponent(projectId)}`;
  const [reload, setReload] = useState(0);
  const [resource, setResource] = useState({ path, audit: null, loading: true, error: null });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const retryController = useRef(null);
  const current = resource.path === path ? resource : { audit: null, loading: true, error: null };
  const { audit, loading, error } = current;

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    setResource((previous) => ({ path, audit: previous.path === path ? previous.audit : null, loading: true, error: null }));

    async function load() {
      try {
        const data = await getJson(path, controller.signal);
        if (controller.signal.aborted) return;
        setResource({ path, audit: data, loading: false, error: null });
        if (data.status === 'queued' || data.status === 'running') {
          timer = setTimeout(load, 1500);
        }
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setResource((previous) => ({ ...previous, loading: false, error: requestError.message }));
      }
    }

    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, reload]);

  useEffect(() => () => retryController.current?.abort(), [path]);

  async function retryExecution() {
    if (audit?.status !== 'failed' || retryController.current || loading) return;
    const controller = new AbortController();
    retryController.current = controller;
    setRetrying(true);
    setRetryError(null);
    try {
      const data = await postJson(`${path}/retry`, undefined, controller.signal);
      if (!controller.signal.aborted) setResource({ path, audit: data, loading: false, error: null });
    } catch (requestError) {
      if (!controller.signal.aborted) {
        const explanation = requestError.status === 409
          ? 'The run is no longer eligible for execution retry. Reloading its current state.'
          : requestError.status === 503
            ? 'The worker queue could not confirm dispatch. Reloading the run before another retry; it may already have been claimed.'
            : 'The retry outcome could not be confirmed. Reloading the run before another attempt.';
        setRetryError(`${requestError.message} ${explanation}`);
      }
    } finally {
      if (!controller.signal.aborted) {
        retryController.current = null;
        setRetrying(false);
        setReload((value) => value + 1);
      }
    }
  }

  return (
    <div className="stack audit-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Audit run</p>
          <h1>Audit details</h1>
          <p><code className="audit-exact">{auditId}</code></p>
        </div>
        <nav className="actions" aria-label="Audit navigation">
          <a href={projectRoute}>Back to project</a>
          <a href={`${projectRoute}?view=history`}>Audit history</a>
          <a href={`${projectRoute}?view=audit`}>New audit</a>
        </nav>
      </header>
      <section className="panel" aria-labelledby="audit-execution-title" aria-busy={loading || retrying}>
        <div className="section-heading">
          <h2 id="audit-execution-title">Execution</h2>
          <button type="button" className="secondary" disabled={loading || retrying} onClick={() => setReload((value) => value + 1)}>
            {error ? 'Retry loading audit' : 'Refresh audit'}
          </button>
        </div>
        {loading && <p role="status">{audit ? 'Refreshing audit…' : 'Loading audit…'}</p>}
        {error && <p className="error" role="alert">{error} Automatic updates have stopped. {audit ? 'The last successfully loaded execution state is shown below. ' : ''}Use Retry loading audit, or return to the project to check the audit ID.</p>}
        {retryError && <p className="error" role="alert">{retryError}</p>}
        {audit && (
          <div className="stack">
            <div aria-live="polite">
              <p>Execution status: <strong className={`badge${audit.status === 'failed' ? ' badge--error' : ''}`}>{audit.status}</strong></p>
              {audit.status === 'queued' && <p>{error ? 'Last known state: queued.' : 'Waiting for a worker. Status updates automatically about every 1.5 seconds.'} No comparison verdict is available yet.</p>}
              {audit.status === 'running' && <p>{error ? 'Last known state: running.' : 'The engine is running. Status updates automatically about every 1.5 seconds.'} No completion percentage is supplied by the server.</p>}
              {audit.status === 'completed' && <p>The execution completed. Its comparison verdict is shown separately in the report.</p>}
            </div>
            <dl className="audit-metrics">
              <div><dt>Created</dt><dd><Timestamp value={audit.created_at} /></dd></div>
              <div><dt>Started</dt><dd><Timestamp value={audit.started_at} /></dd></div>
              <div><dt>Finished</dt><dd><Timestamp value={audit.finished_at} /></dd></div>
            </dl>
            <dl className="audit-provenance">
              <div><dt>Audit ID</dt><dd><code className="audit-exact">{audit.id}</code></dd></div>
              <div><dt>Project ID</dt><dd><code className="audit-exact">{audit.project_id}</code></dd></div>
              <div><dt>Source dataset ID</dt><dd><code className="audit-exact">{audit.source_dataset_id}</code></dd></div>
              <div><dt>Target dataset ID</dt><dd><code className="audit-exact">{audit.target_dataset_id}</code></dd></div>
            </dl>
            {audit.status === 'failed' && (
              <div>
                <h3>Execution failed</h3>
                <p>Error code: <code className="audit-exact">{audit.error_code ?? 'Not supplied'}</code></p>
                <p>{FAILURE_REASONS[audit.error_code] ?? 'The execution failed before a comparison report became available. This is not a failed comparison verdict. Check server diagnostics before retrying.'}</p>
                <p className="muted">Retry reuses this audit’s exact dataset IDs and immutable contract. It does not change inputs or comparison rules.</p>
                <button type="button" disabled={retrying || loading || Boolean(error)} onClick={retryExecution}>{retrying ? 'Retrying execution…' : 'Retry failed execution'}</button>
              </div>
            )}
            <details>
              <summary>Submitted immutable contract (read-only JSON)</summary>
              <p className="muted">This is the stored contract for this run, including any parent dataset IDs and exact mapping keys. To change it, submit a new audit.</p>
              <pre className="audit-json">{JSON.stringify(audit.contract, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>
      {audit?.status === 'completed' && <ReportView key={path} projectId={projectId} auditId={auditId} />}
    </div>
  );
}
