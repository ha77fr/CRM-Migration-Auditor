import { useState } from 'react';
import { useApiResource } from '../hooks/useApiResource.js';
import Pagination from './Pagination.jsx';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export default function ProjectList({ refreshKey }) {
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const { status, data, error } = useApiResource(`/api/v1/projects?limit=21&offset=${offset}`, `${refreshKey}:${reload}`);
  const projects = data?.slice(0, 20) || [];

  return (
    <section className="panel" aria-labelledby="projects-title" aria-busy={status === 'loading'}>
      <div className="section-heading">
        <h2 id="projects-title">Projects</h2>
        <span className="eyebrow">Your workspaces</span>
      </div>
      <p className="muted">Projects are listed oldest first. Open a project to upload datasets, configure audits, and review reports.</p>
      <div aria-live="polite">
        {status === 'loading' && <p>Loading projects…</p>}
        {status === 'error' && <div><p role="alert" className="error">{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}>Reload projects</button></div>}
        {status === 'success' && projects.length === 0 && (
          <div className="empty-state">
            <h3>{offset ? 'No more projects' : 'No projects yet'}</h3>
            <p>{offset ? 'Return to the previous page.' : 'Create your first project using the form on this page.'}</p>
          </div>
        )}
        {status === 'success' && projects.length > 0 && (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <div className="project-heading">
                  <h3><a href={`#/projects/${project.id}`}>{project.name}</a></h3>
                  <time dateTime={project.created_at}>{dateFormat.format(new Date(project.created_at))}</time>
                </div>
                {project.description && <p>{project.description}</p>}
                <code>{project.id}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination offset={offset} pageSize={20} hasNext={data?.length > 20} onChange={setOffset} disabled={status === 'loading'} label="Projects" />
    </section>
  );
}
