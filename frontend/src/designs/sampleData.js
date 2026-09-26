// Design fixtures only: no API requests, customer data, or persisted audit runs.
export const sampleAudit = {
  project: 'Northstar CRM migration',
  source: 'Salesforce',
  target: 'HubSpot',
  sourceFile: 'salesforce_contacts.csv',
  targetFile: 'hubspot_contacts.csv',
  sourceRows: 240,
  targetRows: 240,
  matchedRecords: 239,
  unchangedRecords: 238,
  status: 'completed',
  verdict: 'failed',
  runId: 'DEMO-024',
  scope: 'Contacts · ID, email, annual revenue',
  createdAt: '26 Sep 2026 · 09:42 UTC',
};

export const sampleFindings = [
  {
    id: 'finding-01', record: '001', kind: 'changed',
    title: 'Annual revenue changed', field: 'AnnualRevenue → annual_revenue',
    source: '125000.00', target: '120000.00',
    explanation: 'The difference of 5000.00 exceeds the declared decimal tolerance of 0.01.',
  },
  {
    id: 'finding-02', record: '087', kind: 'missing',
    title: 'Contact missing from target', field: 'Id → LegacyId',
    source: '087', target: 'Not present',
    explanation: 'Source contact 087 has no matching LegacyId in the target export. Other records are not used as approximate matches.',
  },
  {
    id: 'finding-03', record: '241', kind: 'unexpected',
    title: 'Unexpected target contact', field: 'Id → LegacyId',
    source: 'Not present', target: '241',
    explanation: 'Target contact 241 has no matching Id in the source export. The report records it separately from missing source contacts.',
  },
];
