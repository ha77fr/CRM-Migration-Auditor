import { useState } from 'react';
import { useApiResource } from '../hooks/useApiResource.js';
import Pagination from './Pagination.jsx';
import './AuditPage.css';

const PAGE_SIZE = 20;

export default function AuditHistory({ projectId, refreshKey }) {
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const { status, data: audits, error } = useApiResource(
    `/api/v1/projects/${encodeURIComponent(projectId)}/audits?limit=${PAGE_SIZE + 1}&offset=${offset}`,
    `${refreshKey}:${reload}`,
  );

  return (
    <section className="panel audit-history" aria-labelledby="audit-history-title" aria-busy={status === 'loading'}>
      <div className="section-heading">
        <h2 id="audit-history-title">Audit history</h2>
        <button type="button" className="secondary" disabled={status === 'loading'} onClick={() => setReload((value) => value + 1)}>
          Refresh audit history
        </button>
      </div>
      <p className="muted">Oldest first. Up to 20 runs per page. Execution status is separate from the comparison verdict; open a completed run to see its report.</p>
      {status === 'loading' && <p role="status">Loading audit history…</p>}
      {status === 'error' && <p role="alert" className="error">{error} Use Refresh audit history to try again.</p>}
      {status === 'success' && audits.length === 0 && (
        <p>{offset === 0 ? 'No audits yet. Submit an audit using the datasets in this project.' : 'No audits on this page. Return to the previous page or refresh.'}</p>
      )}
      {status === 'success' && audits.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <caption className="muted">Historical audit runs</caption>
            <thead><tr><th scope="col">Audit ID</th><th scope="col">Created</th><th scope="col">Execution status</th></tr></thead>
            <tbody>
              {audits.slice(0, PAGE_SIZE).map((audit) => (
                <tr key={audit.id}>
                  <td><a href={`#/projects/${encodeURIComponent(projectId)}/audits/${encodeURIComponent(audit.id)}`}><code className="audit-exact">{audit.id}</code></a></td>
                  <td><time dateTime={audit.created_at}>{audit.created_at}</time></td>
                  <td><span className="badge">{audit.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={offset} pageSize={PAGE_SIZE} hasNext={status === 'success' && audits.length > PAGE_SIZE} onChange={setOffset} disabled={status === 'loading'} label="Audit history" />
    </section>
  );
}
