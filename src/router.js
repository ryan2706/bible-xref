// Hash-based routing so every view has a shareable link, e.g. #/verse/John.3.16.
const DEFAULT_HASH = '#/verse/John.3.16';

const routes = [
  { pattern: /^#\/verse\/([^/]+)$/, view: 'verse' },
  { pattern: /^#\/arcs(?:\?(.*))?$/, view: 'arcs' }, // ?min=30&book=Isa
  { pattern: /^#\/books$/, view: 'books' },
  { pattern: /^#\/about$/, view: 'about' },
];

export function matchRoute(hash) {
  for (const { pattern, view } of routes) {
    const m = pattern.exec(hash);
    if (m) return { view, params: m.slice(1).map((p) => (p === undefined ? '' : decodeURIComponent(p))) };
  }
  return { view: 'not-found', params: [hash] };
}

export function startRouter(onRoute) {
  const handle = () => {
    if (location.hash === '' || location.hash === '#' || location.hash === '#/') {
      history.replaceState(null, '', DEFAULT_HASH);
    }
    onRoute(matchRoute(location.hash));
  };
  window.addEventListener('hashchange', handle);
  handle();
}
