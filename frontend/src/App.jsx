import { useState } from 'react';
import BackendStatus from './components/BackendStatus.jsx';
import ProjectList from './components/ProjectList.jsx';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="workspace-layout">
        <aside className="sidebar" aria-label="Workspace navigation">
          <a className="brand" href="/" aria-label="CRM Migration Auditor home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="m5 18 7-13 7 13M8 14h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>CRM Auditor<small>Migration workspace</small></span>
          </a>
          <div className="workspace-label"><span className="workspace-avatar" aria-hidden="true">L</span><div><strong>Local workspace</strong><span>Single-user development</span></div></div>
          <p className="eyebrow nav-label">Workspace</p>
          <nav className="sidebar-nav" aria-label="Main navigation">
            <a href="#overview"><span aria-hidden="true">01</span>Overview</a>
            <a href="#projects"><span aria-hidden="true">02</span>Projects</a>
            <a href="#workflow"><span aria-hidden="true">03</span>Audit workflow</a>
          </nav>
          <div className="sidebar-note">
            <p className="eyebrow">Clarity before cutover</p>
            <p>Know what moved.<br />See what changed.</p>
            <a href="/designs.html?design=atlas">Design previews <span aria-hidden="true">↗</span></a>
          </div>
        </aside>
        <div className="workspace-content">
          <header className="workspace-topbar">
            <p>Workspace <span aria-hidden="true">/</span> Migration overview</p>
            <a href="/docs">API docs <span aria-hidden="true">↗</span></a>
          </header>
          <main id="main" tabIndex={-1}>
            <section id="overview" className="intro" aria-labelledby="page-title">
              <div>
                <p className="eyebrow">Clarity before cutover</p>
                <h1 id="page-title">A clearer view of your migration.</h1>
                <p>Check your connection, find your projects, and audit CRM exports against explicit rules.</p>
              </div>
              <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Refresh workspace</button>
            </section>
            <div className="workspace-grid">
              <div className="workspace-main">
                <BackendStatus refreshKey={refreshKey} />
                <div id="projects"><ProjectList refreshKey={refreshKey} /></div>
              </div>
              <aside id="workflow" className="panel workflow" aria-labelledby="workflow-title">
                <p className="eyebrow">Your next steps</p>
                <h2 id="workflow-title">From export to evidence</h2>
                <p className="workflow-intro">The workspace is read-only. Use the API docs to complete the audit workflow.</p>
                <ol>
                  <li><strong>Create a project</strong><p>Keep the exports and audit runs together.</p></li>
                  <li><strong>Upload source and target CSVs</strong><p>Preserve the original data as immutable snapshots.</p></li>
                  <li><strong>Declare a contract</strong><p>Choose keys, field rules, and relationships explicitly.</p></li>
                  <li><strong>Run and review</strong><p>Inspect the verdict and download JSON or CSV evidence.</p></li>
                </ol>
                <a className="workflow-link" href="/docs">Continue in API docs <span aria-hidden="true">→</span></a>
              </aside>
            </div>
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
