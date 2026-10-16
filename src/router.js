// Hash-based routing so every view has a shareable link, e.g. #/verse/John.3.16.
const DEFAULT_HASH = '#/verse/John.3.16';

// `query: true` marks a part that is a query string (?min=30&book=Isa). It is passed on
// still encoded, for URLSearchParams to decode; other parts are decoded here. Either
// way each part is decoded exactly once.
const routes = [
  { pattern: /^#\/verse\/([^/]+)$/, view: 'verse' },
  { pattern: /^#\/arcs(?:\?(.*))?$/, view: 'arcs', query: true }, // ?min=30&book=Isa
  { pattern: /^#\/books(?:\?(.*))?$/, view: 'books', query: true }, // ?book=Isa or ?pair=Isa-Matt, &self=1
  { pattern: /^#\/about(?:\?(.*))?$/, view: 'about', query: true }, // ?s=arcs scrolls to a section
];

// The decoded text, or null for a malformed escape (a hand-edited or truncated link).
function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

export function matchRoute(hash) {
  const notFound = { view: 'not-found', params: [hash] };
  for (const { pattern, view, query } of routes) {
    const m = pattern.exec(hash);
    if (!m) continue;
    const params = [];
    for (const part of m.slice(1)) {
      const decoded = decode(part ?? '');
      if (decoded === null) return notFound;
      params.push(query ? (part ?? '') : decoded);
    }
    return { view, params };
  }
  return notFound;
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
