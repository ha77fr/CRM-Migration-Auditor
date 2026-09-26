import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AtlasTemplate from './AtlasTemplate.jsx';
import SignalTemplate from './SignalTemplate.jsx';
import FieldworkTemplate from './FieldworkTemplate.jsx';
import './gallery.css';

const designs = [
  { id: 'atlas', number: '01', name: 'Atlas', label: 'The operations dashboard', description: 'Light, structured, and familiar. A clear overview with evidence one click away.', detail: 'Try searching the findings and selecting a record to inspect its evidence.', palette: ['#4459db', '#e8edff', '#f7f8fc'], Component: AtlasTemplate },
  { id: 'signal', number: '02', name: 'Signal', label: 'The technical console', description: 'Dark, precise, and information-dense. Built around reconciliation and investigation.', detail: 'Try filtering by finding type, then inspect source and target values side by side.', palette: ['#69dfc7', '#233248', '#0c1320'], Component: SignalTemplate },
  { id: 'fieldwork', number: '03', name: 'Fieldwork', label: 'The guided review', description: 'Warm, calm, and editorial. A step-by-step story from exports to evidence.', detail: 'Explore the three review steps and expand findings to see the sample evidence.', palette: ['#344e3f', '#bbc9a2', '#f5f2e9'], Component: FieldworkTemplate },
];

function DesignGallery() {
  const requestedDesign = new URLSearchParams(window.location.search).get('design');
  const selected = designs.find((design) => design.id === requestedDesign) || designs[0];
  const Template = selected.Component;

  return (
    <>
      <a className="studio-skip" href="#design-preview">Skip to selected design</a>
      <header className="studio-header">
        <a className="studio-brand" href="/">CRM Migration Auditor <span>/ Design studio</span></a>
        <a className="studio-return" href="/">Back to working app <span aria-hidden="true">↗</span></a>
      </header>
      <main className="studio-main">
        <div className="studio-intro">
          <div><p className="studio-kicker">Three directions. One product.</p><h1>Find your workspace.</h1></div>
          <p>Compare layouts, not just colors.<br />Choose a direction before we connect the full workflow.</p>
        </div>
        <nav className="studio-options" aria-label="Design concepts">
          {designs.map((design) => (
            <a key={design.id} className={`studio-option studio-option--${design.id}`} href={`/designs.html?design=${design.id}`} aria-current={selected.id === design.id ? 'page' : undefined}>
              <div className="studio-option-top"><span className="studio-number">{design.number}</span><strong>{design.name}</strong><span className="studio-palette" aria-hidden="true">{design.palette.map((color) => <span key={color} style={{ background: color }} />)}</span></div>
              <span className="studio-option-label">{design.label}</span>
              <span className="studio-option-description">{design.description}</span>
              <span className="studio-option-state">{selected.id === design.id ? 'Currently previewing' : 'Explore this direction'} <span aria-hidden="true">→</span></span>
            </a>
          ))}
        </nav>
        <div className="studio-preview-meta">
          <p><span className="studio-sample-dot" aria-hidden="true" />Design preview · Synthetic data only · No API calls</p>
          <span>{selected.number} / 03 — {selected.name}</span>
        </div>
        <section id="design-preview" aria-label={`${selected.name} design preview`} tabIndex={-1}>
          <Template />
        </section>
        <footer className="studio-footer">
          <p><strong>Take it for a spin.</strong> {selected.detail}</p>
          <p>These are interactive visual concepts, not live audit results. Choosing a preview does not change your application or save any project data.</p>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><DesignGallery /></StrictMode>);
