import { useEffect, useState } from 'react';
import { getJson } from '../api.js';

export function useApiResource(path, refreshKey) {
  const [resource, setResource] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setResource({ status: 'loading', data: null, error: null });

    getJson(path, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResource({ status: 'success', data, error: null });
        }
      },
      (error) => {
        if (!controller.signal.aborted) {
          setResource({ status: 'error', data: null, error: error.message });
        }
      },
    );

    return () => controller.abort();
  }, [path, refreshKey]);

  return resource;
}
