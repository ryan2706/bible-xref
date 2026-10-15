# Fonts

`newsreader-figures.woff2` holds only the digits 0–9 of Newsreader (wght 400–700, opsz fixed at 14).
`style.css` puts it first in `--font-ui` with `unicode-range: U+0030-0039`, so every number in the
interface, canvas labels included, uses Newsreader's lining, tabular figures instead of Atkinson
Hyperlegible Next's slashed zero (Google Fonts' copy of Atkinson has no unslashed alternate).
Both fonts have the same cap height, so no size adjustment is needed.

Made with fontTools from the Latin file Google Fonts serves for Newsreader:
subset to U+0030–0039 (keeping `tnum`, `lnum`, `pnum`), then
`instancer.instantiateVariableFont(font, {"opsz": 14, "wght": (400, 700)})`, saved as WOFF2.

Newsreader is licensed under the SIL Open Font License 1.1 (`Newsreader-OFL.txt`), which allows
subsetting and redistribution; it has no Reserved Font Name.
