import { useEffect, useState } from 'react';
import { getAllDatasets } from '../api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import DatasetPanel from './DatasetPanel.jsx';
import ContractBuilder from './ContractBuilder.jsx';
import AuditHistory from './AuditHistory.jsx';

export default function ProjectPage({ projectId, view, refreshKey }) {
  const [reload, setReload] = useState(0);
  const project = useApiResource(`/api/v1/projects/${projectId}`, `${refreshKey}:${reload}`);
  const [datasets, setDatasets] = useState([]);
  const [datasetState, setDatasetState] = useState({ status: 'loading', error: null });

  useEffect(() => {
    const controller = new AbortController();
    setDatasetState({ status: 'loading', error: null });
    getAllDatasets(projectId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setDatasets(data);
          setDatasetState({ status: 'success', error: null });
        }
      },
      (error) => { if (!controller.signal.aborted) setDatasetState({ status: 'error', error: error.message }); },
    );
    return () => controller.abort();
  }, [projectId, refreshKey, reload]);

  function uploaded(dataset) {
    setDatasets((current) => [...current, dataset]);
  }

  if (project.status === 'loading') return <p role="status" className="panel">Loading project…</p>;
  if (project.status === 'error') return <section className="panel"><h1>Project unavailable</h1><p className="error" role="alert">{project.error}</p><div className="actions"><button onClick={() => setReload((value) => value + 1)}>Try again</button><a href="#/">All projects</a></div></section>;

  return (
    <div className="stack">
      <header className="page-heading"><a href="#/">← All projects</a><p className="eyebrow">Project workspace</p><h1>{project.data.name}</h1>{project.data.description && <p>{project.data.description}</p>}<code>{project.data.id}</code></header>
      <nav className="project-tabs" aria-label="Project sections">
        {[['datasets', '1. Datasets'], ['audit', '2. New audit'], ['history', '3. Audit history']].map(([id, title]) => <a key={id} href={`#/projects/${projectId}?view=${id}`} aria-current={view === id ? 'page' : undefined}>{title}</a>)}
      </nav>
      {datasetState.status === 'loading' && <p role="status">Loading dataset metadata…</p>}
      {datasetState.status === 'error' && <div className="panel"><p className="error" role="alert">{datasetState.error}</p><button type="button" onClick={() => setReload((value) => value + 1)}>Reload datasets</button></div>}
      {datasetState.status === 'success' && <>
        <div hidden={view !== 'datasets'}><DatasetPanel projectId={projectId} datasets={datasets} onUploaded={uploaded} /></div>
        <div hidden={view !== 'audit'}><ContractBuilder projectId={projectId} datasets={datasets} onCreated={(audit) => { window.location.hash = `/projects/${projectId}/audits/${audit.id}`; }} /></div>
      </>}
      {view === 'history' && <AuditHistory projectId={projectId} refreshKey={refreshKey} />}
    </div>
  );
}
