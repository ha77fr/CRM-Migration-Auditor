import { useEffect, useState } from 'react';
import { getJson } from '../api.js';

export function useApiResource(path, refreshKey) {
  const [resource, setResource] = useState({ path: null, refreshKey: null, status: 'loading', data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setResource({ path, refreshKey, status: 'loading', data: null, error: null });

    getJson(path, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResource({ path, refreshKey, status: 'success', data, error: null });
        }
      },
      (error) => {
        if (!controller.signal.aborted) {
          setResource({ path, refreshKey, status: 'error', data: null, error: error.message });
        }
      },
    );

    return () => controller.abort();
  }, [path, refreshKey]);

  return resource.path === path && resource.refreshKey === refreshKey
    ? resource
    : { status: 'loading', data: null, error: null };
}
