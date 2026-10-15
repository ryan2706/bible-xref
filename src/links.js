// The links a verse's connections graph draws: its strongest by votes, in both
// directions. No DOM code, so scripts/build-thumbs.mjs uses it for the About thumbnail.
export const GRAPH_LINKS = 15;

// out/incoming are a verse's links from xrefs/<abbr>.json: [fromId, toStartId, toEndId, votes].
// Returns [{ dir: 'out' | 'in', other, end, votes }], strongest first.
export function strongestLinks(out, incoming, max = GRAPH_LINKS) {
  return [
    ...out.map(([, start, end, votes]) => ({ dir: 'out', other: start, end, votes })),
    ...incoming.map(([from, , , votes]) => ({ dir: 'in', other: from, end: from, votes })),
  ]
    .sort((a, b) => b.votes - a.votes || a.other - b.other)
    .slice(0, max);
}
