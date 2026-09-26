import { useApiResource } from '../hooks/useApiResource.js';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export default function ProjectList({ refreshKey }) {
  const { status, data: projects, error } = useApiResource('/api/v1/projects?limit=20&offset=0', refreshKey);

  return (
    <section className="panel" aria-labelledby="projects-title" aria-busy={status === 'loading'}>
      <div className="section-heading">
        <h2 id="projects-title">Projects</h2>
        <span className="eyebrow">Read-only overview</span>
      </div>
      <p className="muted">First 20 projects, oldest first. Use the API docs for the complete list and project actions.</p>
      <div aria-live="polite">
        {status === 'loading' && <p>Loading projects…</p>}
        {status === 'error' && <p role="alert" className="error">{error}</p>}
        {status === 'success' && projects.length === 0 && (
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>Create a project in the API docs or run the repository’s synthetic demo, then refresh this page.</p>
            <a href="/docs">Open API docs <span aria-hidden="true">→</span></a>
          </div>
        )}
        {status === 'success' && projects.length > 0 && (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <div className="project-heading">
                  <h3>{project.name}</h3>
                  <time dateTime={project.created_at}>{dateFormat.format(new Date(project.created_at))}</time>
                </div>
                {project.description && <p>{project.description}</p>}
                <code>{project.id}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
