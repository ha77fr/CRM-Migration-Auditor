import { useApiResource } from '../hooks/useApiResource.js';

export default function BackendStatus({ refreshKey }) {
  const { status, data, error } = useApiResource('/health/ready', refreshKey);

  return (
    <section className="panel" aria-labelledby="backend-title" aria-busy={status === 'loading'}>
      <div className="section-heading">
        <h2 id="backend-title">Backend connection</h2>
        <span className={`badge badge--${status}`}>
          {status === 'loading' ? 'Checking' : status === 'success' ? 'Ready' : 'Unavailable'}
        </span>
      </div>
      <div aria-live="polite">
        {status === 'loading' && <p>Checking the API and database schema…</p>}
        {status === 'error' && <p role="alert" className="error">{error}</p>}
        {status === 'success' && (
          <p>API and database schema are ready. Task backend: <strong>{data.task_backend}</strong>.</p>
        )}
      </div>
      <p className="muted">Readiness does not check worker availability or certify migration results.</p>
    </section>
  );
}
