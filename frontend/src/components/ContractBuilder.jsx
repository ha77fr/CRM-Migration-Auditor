import { useEffect, useRef, useState } from 'react';
import { postJson } from '../api.js';
import './ContractBuilder.css';

const PAIR_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
// Match Python's blank-ID check while preserving BOM as an exact ID character.
const BLANK_ID = /^[\p{White_Space}\u001c-\u001f]*$/u;
const emptyContract = () => ({
  source_dataset_id: '', target_dataset_id: '', source_key: '', target_key: '',
  fields: [], key_map: [], parent_pairs: [], relationships: [],
});
const replaceRow = (rows, id, change) => rows.map((row) => row.id === id ? { ...row, ...change } : row);
const mapObject = (rows) => Object.fromEntries(rows.map((row) => [row.source, row.target]));

function validTolerance(value) {
  if (!DECIMAL.test(value)) return false;
  const [coefficient, exponent = '0'] = value.replace(/^[+-]/, '').split(/[eE]/);
  const [whole, fraction = ''] = coefficient.split('.');
  const significant = (whole + fraction).replace(/^0+/, '');
  if (!significant) return true; // Signed zero is non-negative.
  if (value.startsWith('-')) return false;
  const digits = significant.replace(/0+$/, '');
  const scale = Number(exponent) - fraction.length + significant.length - digits.length;
  // Match the backend's normalized Decimal bounds without rounding through Number.
  const wholeDigits = Math.max(digits.length + scale, 0);
  const fractionalDigits = Math.max(-scale, 0);
  return wholeDigits <= 20 && fractionalDigits <= 18;
}

function DatasetSelect({ label, value, datasets, onChange }) {
  return (
    <label className="field">{label}
      <select required value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a dataset</option>
        {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename} · {dataset.row_count} rows · {dataset.id}</option>)}
      </select>
    </label>
  );
}

function HeaderSelect({ label, value, dataset, onChange }) {
  return (
    <label className="field">{label}
      <select required value={value} disabled={!dataset} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a column</option>
        {(dataset?.headers ?? []).map((header) => <option key={header} value={header}>{JSON.stringify(header)}</option>)}
      </select>
    </label>
  );
}

function StringMap({ label, rows, onChange, newId, ids = false }) {
  const limit = ids ? 25000 : 1000;
  return (
    <details className="contract-map">
      <summary>{label} ({rows.length})</summary>
      <p className="muted">{ids
        ? 'Optional one-to-one ID translations. IDs must be non-blank. Whitespace and leading zeros are preserved.'
        : 'Optional source-value translations. Empty strings are allowed. Keys are matched after the selected normalizers; mapped values are normalized again.'}</p>
      <div className="stack">
        {rows.map((row, index) => (
          <div className="contract-map-row" key={row.id}>
            <label className="field">{label} {index + 1}: source {ids ? 'ID' : 'value'}
              <input type="text" value={row.source} required={ids} onChange={(event) => onChange(replaceRow(rows, row.id, { source: event.target.value }))} />
            </label>
            <label className="field">{label} {index + 1}: target {ids ? 'ID' : 'value'}
              <input type="text" value={row.target} required={ids} onChange={(event) => onChange(replaceRow(rows, row.id, { target: event.target.value }))} />
            </label>
            <button className="secondary" type="button" aria-label={`Remove ${label} row ${index + 1}`} onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>Remove row</button>
          </div>
        ))}
        <div><button className="secondary" type="button" disabled={rows.length >= limit} onClick={() => onChange([...rows, { id: newId(), source: '', target: '' }])}>Add {label.toLowerCase()} row</button></div>
      </div>
    </details>
  );
}

function Normalizers({ value, onChange, label }) {
  return (
    <div className="contract-normalizers">
      <p className="muted">Normalizers run in the order shown on both sides. None are selected automatically.</p>
      {value.map((normalizer, index) => (
        <div className="actions" key={index}>
          <label className="field">{label} normalizer {index + 1}
            <select value={normalizer} onChange={(event) => onChange(value.map((item, position) => position === index ? event.target.value : item))}>
              <option value="strip">strip — remove surrounding whitespace</option>
              <option value="casefold">casefold — compare without case distinctions</option>
            </select>
          </label>
          {index > 0 && <button type="button" className="secondary" onClick={() => onChange([value[1], value[0]])}>Move normalizer up</button>}
          <button type="button" className="secondary" aria-label={`Remove ${label} normalizer ${index + 1}`} onClick={() => onChange(value.filter((_, position) => position !== index))}>Remove normalizer</button>
        </div>
      ))}
      <div className="actions">
        <button type="button" className="secondary" disabled={value.length >= 2} onClick={() => onChange([...value, 'strip'])}>Add strip normalizer</button>
        <button type="button" className="secondary" disabled={value.length >= 2} onClick={() => onChange([...value, 'casefold'])}>Add casefold normalizer</button>
      </div>
    </div>
  );
}

function prepareContract(state, datasets, projectId) {
  const errors = [];
  const findDataset = (id, side) => datasets.find((dataset) => dataset.id === id && dataset.side === side && dataset.project_id === projectId);
  const source = findDataset(state.source_dataset_id, 'source');
  const target = findDataset(state.target_dataset_id, 'target');
  if (!source) errors.push('Select a primary source dataset from this project.');
  if (!target) errors.push('Select a primary target dataset from this project.');
  const checkHeader = (header, dataset, label) => {
    if (!dataset?.headers.includes(header)) errors.push(`${label}: select a valid column from the chosen dataset.`);
  };
  const checkMap = (rows, label, ids = false) => {
    if (rows.length > (ids ? 25000 : 1000)) errors.push(`${label}: too many mapping rows.`);
    const sources = new Set();
    const targets = new Set();
    let duplicateSource = false;
    let duplicateTarget = false;
    let emptyId = false;
    for (const row of rows) {
      if (sources.has(row.source)) duplicateSource = true;
      if (targets.has(row.target)) duplicateTarget = true;
      if (ids && (BLANK_ID.test(row.source) || BLANK_ID.test(row.target))) emptyId = true;
      sources.add(row.source);
      targets.add(row.target);
    }
    if (duplicateSource) errors.push(`${label}: duplicate source mapping keys are not allowed (keys are exact strings).`);
    if (ids && duplicateTarget) errors.push(`${label}: target IDs must be unique; ID maps must be one-to-one.`);
    if (emptyId) errors.push(`${label}: source and target IDs must not be blank.`);
  };
  checkHeader(state.source_key, source, 'Primary source key');
  checkHeader(state.target_key, target, 'Primary target key');
  checkMap(state.key_map, 'Primary ID map', true);
  if (!state.fields.length && !state.relationships.length) errors.push('Add at least one field mapping or relationship rule.');
  if (state.fields.length > 50 || state.relationships.length > 50 || state.parent_pairs.length > 10) errors.push('Limit the contract to 50 fields, 50 relationships, and 10 parent pairs.');
  const checkRulePairs = (rules, label) => {
    const seen = new Set();
    rules.forEach((rule, index) => {
      checkHeader(rule.source, source, `${label} ${index + 1} source column`);
      checkHeader(rule.target, target, `${label} ${index + 1} target column`);
      const pair = JSON.stringify([rule.source, rule.target]);
      if (seen.has(pair)) errors.push(`${label} ${index + 1}: duplicate source/target column pair.`);
      seen.add(pair);
    });
  };
  checkRulePairs(state.fields, 'Field mapping');
  checkRulePairs(state.relationships, 'Relationship');
  state.fields.forEach((field, index) => {
    checkMap(field.value_map, `Field mapping ${index + 1} value map`);
    if (!validTolerance(field.tolerance)) errors.push(`Field mapping ${index + 1}: tolerance must be a non-negative decimal with at most 20 whole and 18 fractional digits.`);
  });
  const names = new Set();
  const usedPairs = new Set(state.relationships.map((rule) => rule.parent_pair));
  state.parent_pairs.forEach((pair, index) => {
    const label = `Parent pair ${index + 1}`;
    if (!PAIR_NAME.test(pair.name)) errors.push(`${label}: name must start with a letter and contain only letters, digits, underscores or hyphens (maximum 64 characters).`);
    if (names.has(pair.name)) errors.push(`${label}: parent pair names must be unique.`);
    names.add(pair.name);
    const parentSource = findDataset(pair.source_dataset_id, 'source');
    const parentTarget = findDataset(pair.target_dataset_id, 'target');
    if (!parentSource || !parentTarget) errors.push(`${label}: select both source and target datasets from this project with the correct sides.`);
    checkHeader(pair.source_key, parentSource, `${label} source key`);
    checkHeader(pair.target_key, parentTarget, `${label} target key`);
    checkMap(pair.key_map, `${label} ID map`, true);
    if (!usedPairs.has(pair.id)) errors.push(`${label}: use this pair in a relationship rule or remove it.`);
  });
  state.relationships.forEach((rule, index) => {
    if (!state.parent_pairs.some((pair) => pair.id === rule.parent_pair)) errors.push(`Relationship ${index + 1}: select an existing parent pair.`);
  });
  // Do not turn rows into objects until duplicate keys and pair names have been checked.
  if (errors.length) return { errors, contract: null };
  return {
    errors,
    contract: {
      version: '1', source_key: state.source_key, target_key: state.target_key,
      fields: state.fields.map(({ source: sourceColumn, target: targetColumn, normalizers, value_map, comparison, tolerance }) => ({
        source: sourceColumn, target: targetColumn, normalizers, value_map: mapObject(value_map), comparison, tolerance,
      })),
      key_map: mapObject(state.key_map),
      parent_pairs: Object.fromEntries(state.parent_pairs.map((pair) => [pair.name, {
        source_dataset_id: pair.source_dataset_id, target_dataset_id: pair.target_dataset_id,
        source_key: pair.source_key, target_key: pair.target_key, key_map: mapObject(pair.key_map),
      }])),
      relationships: state.relationships.map(({ source: sourceColumn, target: targetColumn, parent_pair, allow_empty }) => ({
        source: sourceColumn, target: targetColumn,
        parent_pair: state.parent_pairs.find((pair) => pair.id === parent_pair).name, allow_empty,
      })),
    },
  };
}

function changePrimary(state, side, datasetId) {
  return {
    ...state, [`${side}_dataset_id`]: datasetId, [`${side}_key`]: '', key_map: [],
    fields: state.fields.map((field) => ({ ...field, [side]: '', value_map: [] })),
    relationships: state.relationships.map((rule) => ({ ...rule, [side]: '' })),
  };
}

function reconcileDatasets(state, datasets, projectId) {
  let next = state;
  for (const side of ['source', 'target']) {
    const dataset = datasets.find((item) => item.id === next[`${side}_dataset_id`] && item.side === side && item.project_id === projectId);
    if (next[`${side}_dataset_id`] && !dataset) {
      next = changePrimary(next, side, '');
      continue;
    }
    if (next[`${side}_key`] && !dataset?.headers.includes(next[`${side}_key`])) next = { ...next, [`${side}_key`]: '', key_map: [] };
    for (const collection of ['fields', 'relationships']) {
      if (next[collection].some((rule) => rule[side] && !dataset?.headers.includes(rule[side]))) {
        next = { ...next, [collection]: next[collection].map((rule) => rule[side] && !dataset?.headers.includes(rule[side])
          ? { ...rule, [side]: '', ...(collection === 'fields' ? { value_map: [] } : {}) } : rule) };
      }
    }
  }
  const pairs = next.parent_pairs.map((pair) => {
    let updated = pair;
    for (const side of ['source', 'target']) {
      const dataset = datasets.find((item) => item.id === pair[`${side}_dataset_id`] && item.side === side && item.project_id === projectId);
      if ((pair[`${side}_dataset_id`] && !dataset) || (pair[`${side}_key`] && !dataset?.headers.includes(pair[`${side}_key`]))) {
        updated = { ...updated, [`${side}_dataset_id`]: dataset?.id ?? '', [`${side}_key`]: '', key_map: [] };
      }
    }
    return updated;
  });
  return pairs.some((pair, index) => pair !== next.parent_pairs[index]) ? { ...next, parent_pairs: pairs } : next;
}

export default function ContractBuilder({ projectId, datasets, onCreated }) {
  const [state, setState] = useState(emptyContract);
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const request = useRef(null);
  const sequence = useRef(0);
  const errorRef = useRef(null);
  const newId = () => `contract-row-${++sequence.current}`;
  const sources = datasets.filter((dataset) => dataset.side === 'source' && dataset.project_id === projectId);
  const targets = datasets.filter((dataset) => dataset.side === 'target' && dataset.project_id === projectId);
  const source = sources.find((dataset) => dataset.id === state.source_dataset_id);
  const target = targets.find((dataset) => dataset.id === state.target_dataset_id);
  const prepared = prepareContract(state, datasets, projectId);
  const patch = (changes) => setState((current) => ({ ...current, ...changes }));
  const patchRow = (collection, id, changes) => setState((current) => ({ ...current, [collection]: replaceRow(current[collection], id, changes) }));
  const removeRow = (collection, id) => setState((current) => ({ ...current, [collection]: current[collection].filter((row) => row.id !== id) }));

  useEffect(() => { setState((current) => reconcileDatasets(current, datasets, projectId)); }, [datasets, projectId]);
  useEffect(() => { if (errors.length) errorRef.current?.focus(); }, [errors]);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    const validation = prepareContract(state, datasets, projectId);
    if (validation.errors.length || !event.currentTarget.checkValidity()) {
      setErrors(validation.errors.length ? validation.errors : ['Complete all required controls with valid values.']);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErrors([]);
    const controller = new AbortController();
    request.current = controller;
    let audit;
    try {
      audit = await postJson(`/api/v1/projects/${projectId}/audits`, {
        source_dataset_id: state.source_dataset_id, target_dataset_id: state.target_dataset_id,
        contract: validation.contract,
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 503 && error.detail?.audit_id) audit = { id: error.detail.audit_id };
      else {
        setErrors([error.message]);
        submittingRef.current = false;
        setSubmitting(false);
        request.current = null;
        return;
      }
    }
    // Keep the submit lock until navigation: a record already exists, including dispatch failures.
    if (!controller.signal.aborted) onCreated(audit);
  }

  return (
    <section className="panel contract-builder" aria-labelledby="contract-builder-title">
      <div className="section-heading"><h2 id="contract-builder-title">Create an audit</h2><span className="badge">Contract version 1</span></div>
      <p>Choose the datasets and configure field comparisons, relationship checks, or both. Column labels are quoted to make whitespace visible; submitted headers and values stay unchanged.</p>
      {(!sources.length || !targets.length) && <p className="notice">Upload {sources.length ? 'a target' : targets.length ? 'a source' : 'a source and a target'} CSV in <a href={`#/projects/${projectId}?view=datasets`}>Datasets</a> before creating an audit.</p>}
      <form className="stack" onSubmit={submit} noValidate>
        {errors.length > 0 && <div ref={errorRef} className="error" role="alert" tabIndex={-1}><strong>Audit could not be created</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
        <fieldset className="contract-controls stack" disabled={submitting}>
          <legend>Primary records</legend>
          <div className="form-grid">
            <DatasetSelect label="Primary source dataset" value={state.source_dataset_id} datasets={sources} onChange={(id) => setState((current) => changePrimary(current, 'source', id))} />
            <DatasetSelect label="Primary target dataset" value={state.target_dataset_id} datasets={targets} onChange={(id) => setState((current) => changePrimary(current, 'target', id))} />
            <HeaderSelect label="Primary source key" value={state.source_key} dataset={source} onChange={(value) => patch({ source_key: value, key_map: [] })} />
            <HeaderSelect label="Primary target key" value={state.target_key} dataset={target} onChange={(value) => patch({ target_key: value, key_map: [] })} />
          </div>
          <p className="muted">Changing a primary dataset clears that side’s column selections and the affected value and ID maps. Changing a key clears its ID map.</p>
          <StringMap label="Primary ID map" rows={state.key_map} onChange={(rows) => patch({ key_map: rows })} newId={newId} ids />
          <section className="stack" aria-labelledby="contract-fields-title">
            <div className="section-heading"><h3 id="contract-fields-title">Field mappings</h3><span className="muted">{state.fields.length} / 50</span></div>
            {state.fields.length === 0 && <p className="muted">No fields configured. You can run a relationship-only audit by adding a relationship rule below.</p>}
            {state.fields.map((field, index) => <fieldset className="contract-rule stack" key={field.id}>
              <legend>Field mapping {index + 1}</legend>
              <div className="form-grid">
                <HeaderSelect label={`Field ${index + 1} source column`} value={field.source} dataset={source} onChange={(value) => patchRow('fields', field.id, { source: value, value_map: [] })} />
                <HeaderSelect label={`Field ${index + 1} target column`} value={field.target} dataset={target} onChange={(value) => patchRow('fields', field.id, { target: value, value_map: [] })} />
                <label className="field">Field {index + 1} comparison
                  <select value={field.comparison} onChange={(event) => patchRow('fields', field.id, { comparison: event.target.value })}><option value="text">Text</option><option value="decimal">Decimal</option></select>
                </label>
                <label className="field">Field {index + 1} tolerance
                  <input type="text" inputMode="decimal" required value={field.tolerance} onChange={(event) => patchRow('fields', field.id, { tolerance: event.target.value })} />
                  <span className="muted">Non-negative decimal; used only for decimal comparisons. Up to 20 whole and 18 fractional digits after removing insignificant zeros.</span>
                </label>
              </div>
              <Normalizers label={`Field ${index + 1}`} value={field.normalizers} onChange={(normalizers) => patchRow('fields', field.id, { normalizers })} />
              <StringMap label={`Field ${index + 1} value map`} rows={field.value_map} onChange={(value_map) => patchRow('fields', field.id, { value_map })} newId={newId} />
              <div><button type="button" className="secondary" aria-label={`Remove field mapping ${index + 1}`} onClick={() => removeRow('fields', field.id)}>Remove field mapping</button></div>
            </fieldset>)}
            <div><button type="button" className="secondary" disabled={state.fields.length >= 50 || !source || !target} onClick={() => patch({ fields: [...state.fields, { id: newId(), source: '', target: '', normalizers: [], value_map: [], comparison: 'text', tolerance: '0' }] })}>Add field mapping</button></div>
          </section>
          <section className="stack" aria-labelledby="contract-parents-title">
            <div className="section-heading"><h3 id="contract-parents-title">Parent dataset pairs</h3><span className="muted">{state.parent_pairs.length} / 10</span></div>
            <p className="muted">For relationship checks, name each pair of parent datasets and choose its ID columns. Every parent pair must be used by a relationship rule.</p>
            {state.parent_pairs.map((pair, index) => <fieldset className="contract-rule stack" key={pair.id}>
              <legend>Parent pair {index + 1}</legend>
              <label className="field">Parent pair {index + 1} name
                <input type="text" required maxLength={64} pattern="[A-Za-z][A-Za-z0-9_\-]{0,63}" value={pair.name} onChange={(event) => patchRow('parent_pairs', pair.id, { name: event.target.value })} />
                <span className="muted">Start with a letter; use only letters, digits, underscores or hyphens. Names are case-sensitive.</span>
              </label>
              <div className="form-grid">
                {['source', 'target'].map((side) => <DatasetSelect key={side} label={`Parent ${index + 1} ${side} dataset`} value={pair[`${side}_dataset_id`]} datasets={side === 'source' ? sources : targets} onChange={(id) => patchRow('parent_pairs', pair.id, { [`${side}_dataset_id`]: id, [`${side}_key`]: '', key_map: [] })} />)}
                {['source', 'target'].map((side) => <HeaderSelect key={side} label={`Parent ${index + 1} ${side} key`} value={pair[`${side}_key`]} dataset={(side === 'source' ? sources : targets).find((item) => item.id === pair[`${side}_dataset_id`])} onChange={(value) => patchRow('parent_pairs', pair.id, { [`${side}_key`]: value, key_map: [] })} />)}
              </div>
              <StringMap label={`Parent ${index + 1} ID map`} rows={pair.key_map} onChange={(key_map) => patchRow('parent_pairs', pair.id, { key_map })} newId={newId} ids />
              <div><button type="button" className="secondary" aria-label={`Remove parent pair ${index + 1}`} onClick={() => setState((current) => ({ ...current, parent_pairs: current.parent_pairs.filter((item) => item.id !== pair.id), relationships: current.relationships.map((rule) => rule.parent_pair === pair.id ? { ...rule, parent_pair: '' } : rule) }))}>Remove parent pair</button></div>
            </fieldset>)}
            <div><button type="button" className="secondary" disabled={state.parent_pairs.length >= 10 || !sources.length || !targets.length} onClick={() => patch({ parent_pairs: [...state.parent_pairs, { id: newId(), name: '', source_dataset_id: '', target_dataset_id: '', source_key: '', target_key: '', key_map: [] }] })}>Add parent pair</button></div>
          </section>
          <section className="stack" aria-labelledby="contract-relationships-title">
            <div className="section-heading"><h3 id="contract-relationships-title">Relationship rules</h3><span className="muted">{state.relationships.length} / 50</span></div>
            <p className="muted">Select reference columns on the primary records, then the parent pair those references should resolve to.</p>
            {state.relationships.map((rule, index) => <fieldset className="contract-rule stack" key={rule.id}>
              <legend>Relationship {index + 1}</legend>
              <div className="form-grid">
                <HeaderSelect label={`Relationship ${index + 1} source reference`} value={rule.source} dataset={source} onChange={(value) => patchRow('relationships', rule.id, { source: value })} />
                <HeaderSelect label={`Relationship ${index + 1} target reference`} value={rule.target} dataset={target} onChange={(value) => patchRow('relationships', rule.id, { target: value })} />
                <label className="field">Relationship {index + 1} parent pair
                  <select required value={rule.parent_pair} onChange={(event) => patchRow('relationships', rule.id, { parent_pair: event.target.value })}>
                    <option value="">Choose a parent pair</option>
                    {state.parent_pairs.map((pair, position) => <option key={pair.id} value={pair.id}>{pair.name || `Unnamed parent pair ${position + 1}`}</option>)}
                  </select>
                </label>
                <label className="contract-checkbox"><input type="checkbox" checked={rule.allow_empty} onChange={(event) => patchRow('relationships', rule.id, { allow_empty: event.target.checked })} />Relationship {index + 1}: allow both references to be empty</label>
              </div>
              <div><button type="button" className="secondary" aria-label={`Remove relationship ${index + 1}`} onClick={() => removeRow('relationships', rule.id)}>Remove relationship rule</button></div>
            </fieldset>)}
            <div><button type="button" className="secondary" disabled={state.relationships.length >= 50 || !source || !target} onClick={() => patch({ relationships: [...state.relationships, { id: newId(), source: '', target: '', parent_pair: '', allow_empty: false }] })}>Add relationship rule</button></div>
          </section>
          <details className="contract-preview"><summary>Read-only contract JSON preview</summary>{prepared.contract ? <pre>{JSON.stringify(prepared.contract, null, 2)}</pre> : <p className="muted">Complete a valid contract to see its JSON preview. Submit to see any remaining validation errors.</p>}</details>
          <div className="actions"><button type="submit" disabled={submitting || !sources.length || !targets.length}>{submitting ? 'Creating audit…' : 'Create audit'}</button></div>
        </fieldset>
      </form>
    </section>
  );
}
