async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...options.headers },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the API. Check the connection and that FastAPI is running.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    let message;
    if (response.status === 401 || response.status === 403) {
      message = 'Access denied. For local development, set API_PROXY_KEY in frontend/.env.local to match the backend API key, then restart Vite.';
    } else if (Array.isArray(detail)) {
      message = detail.map((issue) => `${(issue.loc || []).join('.')}: ${issue.msg}`).join('\n');
    } else if (typeof detail === 'string') {
      message = detail;
    } else if (typeof detail?.message === 'string') {
      message = detail.message;
    } else {
      message = 'Check that FastAPI is running and configured correctly.';
    }
    const error = new Error(`Request failed (HTTP ${response.status}): ${message}`);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return response;
}

export async function getJson(path, signal) {
  return (await request(path, { signal })).json();
}

export async function postJson(path, payload, signal) {
  return (await request(path, {
    method: 'POST', signal,
    ...(payload !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  })).json();
}

export async function uploadDataset(projectId, side, file, signal) {
  const data = new FormData();
  data.append('file', file);
  return (await request(`/api/v1/projects/${projectId}/datasets?side=${side}`, {
    method: 'POST', body: data, signal,
  })).json();
}

export async function getAllDatasets(projectId, signal) {
  const datasets = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getJson(`/api/v1/projects/${projectId}/datasets?limit=100&offset=${offset}`, signal);
    datasets.push(...page);
    if (page.length < 100) return datasets;
  }
}

export async function downloadReport(projectId, auditId, format) {
  if (!['json', 'csv'].includes(format)) throw new Error('Unsupported report format.');
  const response = await request(`/api/v1/projects/${projectId}/audits/${auditId}/report.${format}`, {
    headers: { Accept: format === 'json' ? 'application/json' : 'text/csv' },
  });
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-report-${auditId}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  // Keep the URL alive long enough for the browser to begin the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
