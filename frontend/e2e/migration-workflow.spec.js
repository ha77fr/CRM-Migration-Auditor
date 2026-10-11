import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const sourceCsv = fileURLToPath(new URL('../../examples/source.csv', import.meta.url));
const targetCsv = fileURLToPath(new URL('../../examples/target.csv', import.meta.url));

function definition(container, term) {
  return container.locator('dt').filter({ hasText: new RegExp(`^${term}$`) }).locator('..').locator('dd');
}

async function downloadText(page, testInfo, format, auditId) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `Download ${format.toUpperCase()}`, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`audit-report-${auditId}.${format}`);
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  return readFile(path, 'utf8');
}

test('create, compare, reopen and export a synthetic migration audit', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Project name', { exact: true }).fill('Synthetic migration browser review');
  await page.getByLabel('Description (optional)', { exact: true }).fill('Synthetic CSV evidence only.');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Synthetic migration browser review' })).toBeVisible();

  await page.getByLabel('Source CSV', { exact: true }).setInputFiles(sourceCsv);
  await page.getByRole('button', { name: 'Upload source', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Uploaded source.csv: 3 records.' })).toBeVisible();
  await page.getByLabel('Target CSV', { exact: true }).setInputFiles(targetCsv);
  await page.getByRole('button', { name: 'Upload target', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Uploaded target.csv: 3 records.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Uploaded snapshots (2)', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Configure an audit', exact: true }).click();
  const builder = page.getByRole('region', { name: 'Create an audit', exact: true });
  await expect(builder).toBeVisible();
  const uppercaseProjectUrl = new URL(page.url());
  uppercaseProjectUrl.hash = uppercaseProjectUrl.hash.replace(
    /^(#\/projects\/)([0-9a-f-]{36})/,
    (_, prefix, id) => prefix + id.toUpperCase(),
  );
  await page.goto(uppercaseProjectUrl.href);
  await expect(builder).toBeVisible();
  const sourceSelect = builder.getByRole('combobox', { name: 'Primary source dataset', exact: true });
  const targetSelect = builder.getByRole('combobox', { name: 'Primary target dataset', exact: true });
  await sourceSelect.selectOption(await sourceSelect.locator('option').filter({ hasText: /^source\.csv/ }).getAttribute('value'));
  await targetSelect.selectOption(await targetSelect.locator('option').filter({ hasText: /^target\.csv/ }).getAttribute('value'));
  await builder.getByRole('combobox', { name: 'Primary source key', exact: true }).selectOption('Id');
  await builder.getByRole('combobox', { name: 'Primary target key', exact: true }).selectOption('LegacyId');

  await builder.getByRole('button', { name: 'Add field mapping', exact: true }).click();
  const email = builder.getByRole('group', { name: 'Field mapping 1', exact: true });
  await email.getByRole('combobox', { name: 'Field 1 source column', exact: true }).selectOption('Email');
  await email.getByRole('combobox', { name: 'Field 1 target column', exact: true }).selectOption('email');
  await email.getByRole('button', { name: 'Add strip normalizer', exact: true }).click();
  await email.getByRole('button', { name: 'Add casefold normalizer', exact: true }).click();

  await builder.getByRole('button', { name: 'Add field mapping', exact: true }).click();
  const stage = builder.getByRole('group', { name: 'Field mapping 2', exact: true });
  await stage.getByRole('combobox', { name: 'Field 2 source column', exact: true }).selectOption('Stage');
  await stage.getByRole('combobox', { name: 'Field 2 target column', exact: true }).selectOption('stage');
  await stage.getByText('Field 2 value map (0)', { exact: true }).click();
  const translations = [
    ['Negotiation', 'negotiation'],
    ['Closed Won', 'won'],
    ['Prospecting', 'prospecting'],
  ];
  for (const [index, [source, target]] of translations.entries()) {
    await stage.getByRole('button', { name: 'Add field 2 value map row', exact: true }).click();
    await stage.getByLabel(`Field 2 value map ${index + 1}: source value`, { exact: true }).fill(source);
    await stage.getByLabel(`Field 2 value map ${index + 1}: target value`, { exact: true }).fill(target);
  }

  await builder.getByRole('button', { name: 'Add field mapping', exact: true }).click();
  const amount = builder.getByRole('group', { name: 'Field mapping 3', exact: true });
  await amount.getByRole('combobox', { name: 'Field 3 source column', exact: true }).selectOption('Amount');
  await amount.getByRole('combobox', { name: 'Field 3 target column', exact: true }).selectOption('amount');
  await amount.getByRole('combobox', { name: 'Field 3 comparison', exact: true }).selectOption('decimal');
  const toleranceInput = amount.getByLabel(/^Field 3 tolerance/);
  const previewSummary = builder.getByText('Read-only contract JSON preview', { exact: true });
  await previewSummary.click();
  const preview = previewSummary.locator('..').locator('pre');
  for (const tolerance of ['1e-18', '1e19', '0.010000000000000000000', '-0']) {
    await toleranceInput.fill(tolerance);
    await expect(preview).toContainText(`"tolerance": "${tolerance}"`);
    expect(JSON.parse(await preview.textContent()).fields[2].tolerance).toBe(tolerance);
  }
  let auditRequests = 0;
  const countAuditRequests = (request) => {
    if (request.method() === 'POST' && /\/audits$/.test(new URL(request.url()).pathname)) auditRequests += 1;
  };
  page.on('request', countAuditRequests);
  for (const tolerance of ['1e-19', '1e20', '0.0000000000000000001']) {
    await toleranceInput.fill(tolerance);
    await expect(preview).toHaveCount(0);
    await builder.getByRole('button', { name: 'Create audit', exact: true }).click();
    await expect(builder.getByRole('alert')).toBeVisible();
    await expect(builder).toBeVisible();
    expect(auditRequests).toBe(0);
  }
  await toleranceInput.fill('0.01');
  await builder.getByRole('button', { name: 'Create audit', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Audit details', exact: true })).toBeVisible();
  expect(auditRequests).toBe(1);
  page.off('request', countAuditRequests);
  const execution = page.getByRole('region', { name: 'Execution', exact: true });
  await expect(execution.getByText('Execution status: completed', { exact: true })).toBeVisible();
  const report = page.getByRole('region', { name: 'Comparison report', exact: true });
  await expect(report.getByText('Comparison verdict: failed', { exact: true })).toBeVisible();
  for (const [term, value] of Object.entries({
    'Source rows': '3',
    'Target rows': '3',
    'Matched records': '2',
    'Compared fields': '6',
    'Total findings': '3',
    'Retained findings': '3',
    'Findings truncated': 'No',
    field_mismatch: '1',
    missing_record: '1',
    unexpected_record: '1',
  })) {
    await expect(definition(report, term)).toHaveText(value);
  }

  const findingType = report.getByRole('combobox', { name: 'Finding type', exact: true });
  await findingType.selectOption('missing_record');
  await expect(report.getByRole('listitem')).toHaveCount(1);
  await expect(definition(report.getByRole('listitem'), 'Record key')).toHaveText('003');
  await findingType.selectOption('unexpected_record');
  await expect(report.getByRole('listitem')).toHaveCount(1);
  await expect(definition(report.getByRole('listitem'), 'Record key')).toHaveText('004');
  await findingType.selectOption('field_mismatch');
  const mismatch = report.getByRole('listitem');
  await expect(mismatch).toHaveCount(1);
  for (const [term, value] of Object.entries({
    'Record key': '002', Field: 'amount', Expected: '200', Actual: '250', 'Record number': '2',
  })) {
    await expect(definition(mismatch, term)).toHaveText(value);
  }

  const auditUrl = page.url();
  const auditId = new URL(auditUrl).hash.split('/').at(-1);
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(auditUrl);
  await expect(page.getByRole('main')).toBeFocused();
  await expect(findingType).toHaveValue('field_mismatch');
  await expect(report.getByRole('status')).toHaveText('1 of 3 retained findings match.');

  await page.context().setOffline(true);
  try {
    await execution.getByRole('button', { name: 'Refresh audit', exact: true }).click();
    await expect(execution.getByRole('alert')).toBeVisible();
    await expect(report.getByText('Comparison verdict: failed', { exact: true })).toBeVisible();
    await expect(findingType).toHaveValue('field_mismatch');
    await expect(report.getByRole('status')).toHaveText('1 of 3 retained findings match.');
  } finally {
    await page.context().setOffline(false);
  }
  await execution.getByRole('button', { name: 'Retry loading audit', exact: true }).click();
  await expect(execution.getByRole('alert')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Audit navigation', exact: true })
    .getByRole('link', { name: 'Audit history', exact: true }).click();
  await page.reload();
  const history = page.getByRole('table', { name: 'Historical audit runs', exact: true });
  const savedRun = history.getByRole('row').filter({ has: page.getByRole('link', { name: auditId, exact: true }) });
  await expect(savedRun).toHaveCount(1);
  await expect(savedRun.getByRole('cell').last()).toHaveText('completed');
  await savedRun.getByRole('link', { name: auditId, exact: true }).click();
  await expect(page).toHaveURL(auditUrl);
  await expect(report.getByText('Comparison verdict: failed', { exact: true })).toBeVisible();

  // A filtered view must still download the complete persisted report.
  await findingType.selectOption('field_mismatch');
  const json = JSON.parse(await downloadText(page, testInfo, 'json', auditId));
  expect(json).toMatchObject({
    verdict: 'failed', source_rows: 3, target_rows: 3, matched_records: 2,
    compared_fields: 6, compared_relationships: 0, findings_truncated: false,
  });
  expect(json.finding_counts).toEqual({ field_mismatch: 1, missing_record: 1, unexpected_record: 1 });
  expect(json.findings).toHaveLength(3);
  expect(json.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'field_mismatch', record_key: '002', field: 'amount', expected: '200', actual: '250' }),
    expect.objectContaining({ code: 'missing_record', record_key: '003', expected: '003' }),
    expect.objectContaining({ code: 'unexpected_record', record_key: '004' }),
  ]));
  const inputHashes = {
    source: createHash('sha256').update(await readFile(sourceCsv)).digest('hex'),
    target: createHash('sha256').update(await readFile(targetCsv)).digest('hex'),
  };
  expect(json.input_sha256).toEqual(inputHashes);

  const csv = await downloadText(page, testInfo, 'csv', auditId);
  expect(csv).toMatch(/^row_type,key,value,code,side,record_key,field,expected,actual,record_number/);
  expect(csv).toMatch(/^summary,verdict,failed,/m);
  expect(csv).toMatch(/^summary,matched_records,2,/m);
  expect(csv).toMatch(/^summary,compared_fields,6,/m);
  for (const code of ['field_mismatch', 'missing_record', 'unexpected_record']) {
    expect(csv).toMatch(new RegExp(`^finding_count,${code},1,`, 'm'));
  }
  expect(csv).toMatch(/^finding,,,field_mismatch,target,002,amount,200,250,2,/m);
  expect(csv).toMatch(/^finding,,,missing_record,target,003,,003,,/m);
  expect(csv).toMatch(/^finding,,,unexpected_record,target,004,,,,/m);
  expect(csv.split(/\r?\n/).filter((line) => line.startsWith('finding,'))).toHaveLength(3);
  for (const [side, digest] of Object.entries(inputHashes)) {
    expect(csv).toMatch(new RegExp(`^input_sha256,${side},${digest},`, 'm'));
  }
});
