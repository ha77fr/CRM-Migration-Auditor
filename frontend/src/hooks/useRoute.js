import { useEffect, useState } from 'react';

function readRoute() {
  const [path, query = ''] = (window.location.hash.slice(1) || '/').split('?');
  if (path === '/') return { page: 'home' };
  const match = path.match(/^\/projects\/([0-9a-f-]{36})(?:\/audits\/([0-9a-f-]{36}))?\/?$/i);
  if (!match) return { page: 'not-found' };
  if (match[2]) return { page: 'audit', projectId: match[1].toLowerCase(), auditId: match[2].toLowerCase() };
  const requestedView = new URLSearchParams(query).get('view');
  return { page: 'project', projectId: match[1].toLowerCase(), view: ['datasets', 'audit', 'history'].includes(requestedView) ? requestedView : 'datasets' };
}

export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    function navigate() {
      setRoute(readRoute());
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  return route;
}
