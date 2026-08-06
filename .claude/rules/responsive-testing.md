---
paths:
  - "public/css/**/*.css"
  - "public/*.html"
---

# Verifying responsive changes

There is no puppeteer/playwright dependency and no test runner, but responsive work must
not be shipped on inspection alone — every layout bug fixed so far (collapsed columns,
unreachable scroll, clipped panels, dropdowns off the edge) was invisible in the source
and obvious in a measurement.

Drive the installed Chrome directly:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --allow-file-access-from-files --hide-scrollbars \
  --virtual-time-budget=4000 --screenshot=out.png --window-size=1440,900 "file:///abs/path/page.html"
"$CHROME" --headless ... --dump-dom "file:///abs/path/page.html"   # read measurements back
```

Two things that will waste time otherwise:

- **Headless Chrome clamps the window to a 500 px minimum width** (`--headless=new` too).
  For phone widths, load the page in an `<iframe width="320">` inside a wrapper page and
  screenshot the wrapper — the iframe gets a true 320 px CSS viewport for media queries.
- **`file://` URLs drop a query string** (`page.html?x=1` fails to resolve). Use `#hash`
  to parameterise a harness, and always pass the absolute `file:///…` URL when the URL
  carries a fragment.

## Harness

Both pages need auth + MySQL, so build a static harness in the scratchpad instead:
copy `public/home.html` / `public/room.html`, insert `<base href="file:///…/public/">`,
replace the `<script type="module">` with a stub that unhides a view and fills the grids
with real markup (copy the shapes from the render functions — wrong class names produce
fake failures, e.g. an unstyled `<img>` reporting 1452 px wide). The real stylesheets are
then exercised unmodified.

## What to assert

Read measurements out via a `<pre>` the harness script fills, then `--dump-dom` + regex.

- **Horizontal overflow** — walk every element under the active view, flag
  `rect.right > viewportWidth` or `rect.left < 0`. Skip descendants of a scroll container
  (any ancestor with `overflow-x: auto|scroll|hidden`), or horizontal scrollers and
  clipped decoration (`.btn-shine`) show up as false positives.
- **Reachability, not just fit** — set `el.scrollTop = 99999` and check it lands at
  `scrollHeight - clientHeight`, then check the view's primary action (START DRAFT,
  CONFIRM BANS/PICKS, READY, Send) is inside the viewport afterwards. A page that renders
  everything but cannot scroll to it is the failure mode users actually report.
- **Squeezed, not overflowing** — compare each panel's `height` against its
  `scrollHeight`. Content spilling over the section below reads as "overlapping" and is
  never caught by an overflow check.
- Sweep widths **and** heights (320/390/430/620/900/1024/1440 × 676/768/900/1366), and
  both sides of every breakpoint you touch.

Per-element `scrollWidth > clientWidth` is **not** a useful signal on its own —
ellipsised text legitimately reports it.
