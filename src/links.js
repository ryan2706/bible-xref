// The links a verse's connections graph draws. No DOM code, so scripts/build-thumbs.mjs
// uses it for the About thumbnail.
export const GRAPH_PLACES = 15; // linked verses drawn
export const OUT_PLACES = 8; // of which, at most, verses this one references (the rest reference it)

// The strongest version of each linked verse in one direction, strongest first.
function byVerse(links) {
  const best = new Map();
  for (const l of links) if (!best.has(l.other) || l.votes > best.get(l.other).votes) best.set(l.other, l);
  return [...best.values()].sort((a, b) => b.votes - a.votes || a.other - b.other);
}

// out/incoming are a verse's links from xrefs/<abbr>.json: [fromId, toStartId, toEndId, votes].
// Picks up to OUT_PLACES verses it references and the rest of GRAPH_PLACES that reference
// it, each by votes; a side with fewer gives its unused places to the other. A verse linked
// both ways takes one place and keeps both links.
// Returns [{ dir: 'out' | 'in', other, end, votes }], strongest first.
export function strongestLinks(out, incoming, places = GRAPH_PLACES, outPlaces = OUT_PLACES) {
  const outs = byVerse(out.map(([, start, end, votes]) => ({ dir: 'out', other: start, end, votes })));
  const ins = byVerse(incoming.map(([from, , , votes]) => ({ dir: 'in', other: from, end: from, votes })));

  const chosen = new Set();
  const take = (list, quota) => {
    for (const l of list) {
      if (chosen.size >= places || quota <= 0) break;
      if (chosen.has(l.other)) continue;
      chosen.add(l.other);
      quota--;
    }
  };
  take(outs, outPlaces);
  take(ins, places - outPlaces);
  // Unused places go to whichever side still has links, strongest first.
  take([...outs, ...ins].sort((a, b) => b.votes - a.votes || a.other - b.other), places);

  return [...outs, ...ins].filter((l) => chosen.has(l.other)).sort((a, b) => b.votes - a.votes || a.other - b.other);
}
