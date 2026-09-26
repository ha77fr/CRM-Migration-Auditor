export async function getJson(path, signal) {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Access denied. For local development, set API_PROXY_KEY in frontend/.env.local to match the backend API key, then restart Vite.',
      );
    }
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === 'string' ? `: ${body.detail}` : '';
    throw new Error(`Request failed (HTTP ${response.status})${detail}. Check that the FastAPI server is running and configured correctly.`);
  }

  return response.json();
}
