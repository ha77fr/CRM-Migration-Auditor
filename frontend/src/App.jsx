import { useState } from 'react';
import BackendStatus from './components/BackendStatus.jsx';
import ProjectList from './components/ProjectList.jsx';
import ProjectCreate from './components/ProjectCreate.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import AuditPage from './components/AuditPage.jsx';
import SyntheticDemo from './components/SyntheticDemo.jsx';
import { useRoute } from './hooks/useRoute.js';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const route = useRoute();

  return (
    <>
      <a className="skip-link" href="#main" onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById('main');
        main.focus();
        main.scrollIntoView();
      }}>Skip to content</a>
      <div className="workspace-layout">
        <aside className="sidebar" aria-label="Workspace navigation">
          <a className="brand" href="#/" aria-label="CRM Migration Auditor home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="m5 18 7-13 7 13M8 14h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>CRM Auditor<small>Migration workspace</small></span>
          </a>
          <div className="workspace-label"><span className="workspace-avatar" aria-hidden="true">L</span><div><strong>Local workspace</strong><span>Single-user development</span></div></div>
          <p className="eyebrow nav-label">Workspace</p>
          <nav className="sidebar-nav" aria-label="Main navigation">
            <a href="#/" aria-current={route.page === 'home' ? 'page' : undefined}><span aria-hidden="true">01</span>Projects</a>
            {route.projectId && <>
              <a href={`#/projects/${route.projectId}?view=datasets`} aria-current={route.page === 'project' && route.view === 'datasets' ? 'page' : undefined}><span aria-hidden="true">02</span>Datasets</a>
              <a href={`#/projects/${route.projectId}?view=audit`} aria-current={route.page === 'project' && route.view === 'audit' ? 'page' : undefined}><span aria-hidden="true">03</span>New audit</a>
              <a href={`#/projects/${route.projectId}?view=history`} aria-current={route.page === 'project' && route.view === 'history' ? 'page' : undefined}><span aria-hidden="true">04</span>Audit history</a>
            </>}
          </nav>
          <div className="sidebar-note">
            <p className="eyebrow">Clarity before cutover</p>
            <p>Know what moved.<br />See what changed.</p>
            <a href="/designs.html?design=atlas">Design previews <span aria-hidden="true">↗</span></a>
          </div>
        </aside>
        <div className="workspace-content">
          <header className="workspace-topbar">
            <p>Workspace <span aria-hidden="true">/</span> {route.page === 'home' ? 'Projects' : route.page === 'audit' ? 'Audit review' : 'Project'}</p>
            <a href="/docs">API docs <span aria-hidden="true">↗</span></a>
          </header>
          <main id="main" tabIndex={-1}>
            {route.page === 'home' && <>
              <section className="intro" aria-labelledby="page-title">
                <div>
                  <p className="eyebrow">Clarity before cutover</p>
                  <h1 id="page-title">A clearer view of your migration.</h1>
                  <p>Create a project, upload your exports, declare the rules, and review the evidence.</p>
                </div>
                <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Refresh workspace</button>
              </section>
              <div className="workspace-grid">
                <div className="workspace-main">
                  <BackendStatus refreshKey={refreshKey} />
                  <SyntheticDemo onCreated={(project, audit) => { window.location.hash = `/projects/${project.id}/audits/${audit.id}`; }} />
                  <ProjectList refreshKey={refreshKey} />
                </div>
                <ProjectCreate onCreated={(project) => { window.location.hash = `/projects/${project.id}`; }} />
              </div>
            </>}
            {route.page === 'project' && <ProjectPage key={route.projectId} projectId={route.projectId} view={route.view} refreshKey={refreshKey} />}
            {route.page === 'audit' && <AuditPage key={`${route.projectId}:${route.auditId}`} projectId={route.projectId} auditId={route.auditId} />}
            {route.page === 'not-found' && <section className="panel page-heading"><h1>Page not found</h1><p>This workspace link is not recognized.</p><a href="#/">Return to projects</a></section>}
          </main>
          <footer className="workspace-footer">
            <span>Local, single-user development. Use synthetic data.</span>
            <span>Results cover only the declared audit scope.</span>
          </footer>
        </div>
      </div>
    </>
  );
}
