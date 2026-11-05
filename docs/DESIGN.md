# KANASAKA design system

Direction: **disciplined deep-tech**. Keep the angular KS logo, Tektur and the black/white identity; run it like an institution: one grid, a strict type scale, one accent, real content, sci-fi flourishes only as rare accents. Information first, flourish second.

## Where things live

| File | Holds |
|---|---|
| `assets/css/tokens.css` | every number shared by all pages: type scale, tracking, space, radius, motion, container, status colours |
| `assets/css/style.css` | theme colours (dark / light / accent), base elements, older page-specific components |
| `assets/css/redesign.css` | glass header, motion, text-only buttons |
| `assets/css/components.css` | the reusable building blocks below |
| `assets/css/home.css` | home page only |

`tests/static-policy.test.mjs` fails on off-scale font sizes, letter-spacing, radii and literal status colours. If you need a new value, add a token here first.

## Foundations

- **Type:** Inter (self-hosted variable, `assets/fonts/`) for everything; Tektur 600 for display headings, nav, labels and buttons; mono only for ids/versions/hashes.
  Scale: `--text-2xs 11 / xs 12 / sm 14 / md 16 / lg 18 / xl 24 / 2xl 32` + `--text-display-1 / -2` (fluid). Body line-height 1.6, display 1.15.
  Uppercase text uses `--tracking-label` (0.08em) or `--tracking-wide` (0.16em); large display type uses `--tracking-display` (-0.01em).
- **Space:** 4 px base (`--space-1` ... `--space-32`). One container (`--container`, 1280 px) with `--gutter` side padding; sections use `--section-pad`. Header, content and footer share the same left and right edges (on pages with the vertical wordmark rail all three get the same right padding).
- **Colour:** neutral ramp per theme + status colours (`--color-ok / warn / danger`, darker in the light theme). Dark is the default; light and accent are user options built from the same variables. Body text >= 4.5:1 in every theme (checked when tokens change). The KS colour is **KS purple `#3e0958`** (`--ks-purple`): the normal themes use no colour except the Alpha tag (`.badge--alpha`, purple fill, white text); the accent theme is the dark theme with near-black neutrals and almost no purple: the Alpha tag plus a dim tint (`--color-focus`, #7d4f9f) for focus rings, selected borders and active bars, because the brand purple itself is too dark to see on near-black. Glow, wordmark, borders and text stay neutral.
- **Shape:** `--radius` 2 px everywhere (avatars `--radius-round`). Hairline borders instead of shadows. Signature motif: the chamfered corner (`.card--chamfer`), echoing the logo; use sparingly.
- **Motion:** `--duration-fast` 150 ms, `--duration-base` 300 ms, one easing. Ambient motion only in the home hero and the product strip.

## Components (`components.css`)

`.container`, `.page-header` (+ `.breadcrumb`, `.page-lead`, `.page-actions`), `.section`, `.section-header` (`.kicker`), `.statement`, `.feature-list` / `.feature`, `.spec-list`, `.badge` (`--alpha`, `--ok`), `.callout`, `.card` (`--chamfer`), `.data-table`, `.cta-band`, `.prose`, footer columns.

## Templates

| Template | Used for |
|---|---|
| Home | `index.html`: ASCII hero, statement, product strip, CTA band |
| Product | `products/ks-link/`: page header, feature list, platform spec list, alpha callout, CTA band |
| Listing | `downloads/`: page header, data table, prose notes |
| Prose | `legal/security/`, install notes: `.container.prose` |
| Statement | `company/about/` |
| In development | every unfinished page: page header + callout, `noindex`, not linked from nav/footer |

## Information architecture

The nav and footer (`NAV`, `FOOTER_COLUMNS` in `assets/js/main.js`) list **only pages that exist**. A page enters the nav when it has real content; until then it keeps its URL, uses the *In development* template and stays `noindex`. The test suite checks this.

Current nav: Products (KS_Link, Technical overview) · Downloads · Security · Company (About, Contact) · Legal. Each dropdown label is a real link to a small overview page (`/products/`, `/company/`, `/legal/`): clicking it navigates on desktop, hover/focus opens the list; on phones the label expands the list and an "<Section> overview" row links to the page.

## Motion

Everything animated is gated in one place, `assets/js/motion.js` + `assets/css/motion.css` (and `assets/js/motion-boot.js`, a tiny synchronous script that sets the same attributes before the first paint), by two attributes on `<html>`:

- `data-motion` = `full | reduced | off`: what the person/device allows. The OS "reduce motion" setting always forces `off`; otherwise the saved choice (Account > Customization > Motion: Automatic / Full / Reduced / Off, or the console); Automatic = full, except data-saver and weak touch devices = reduced.
- `data-fx` = `0 | 1 | 2`: `1` = every animation (Dark **and** Light), `2` = the same plus the **glitch** effects (Accent only); reduced/off force `0`.

With `off` the page is completely static and no motion code runs. Rules: animate only `transform`/`opacity` continuously; one-shot wipes may use `clip-path`; effects pause offscreen / in hidden tabs; JS effects share one rAF loop (`KanasakaMotion.raf`); no inline styles (classes + `style.setProperty`); at most two continuous effects visible at once (home: ASCII hero + grid floor; content pages: scan sweep). Tests lint keyframe properties, require every animation in `motion.css` to be gated by `data-motion`, and require every glitch rule to be keyed to `data-fx="2"`.

| Effect | Dark + Light (fx 1) | Accent only (fx 2, glitch) |
|---|---|---|
| Reveal choreography (section rules draw, items rise in a stagger) | yes | |
| Heading decode (hex scramble resolves into the text; page H1, statement, section/CTA h2) | yes | re-scrambles on hover |
| Bracket reticles on cards, callouts, CTA bands; `[ LABEL ]` button brackets | yes | idle tick flicker; 1-beat tear on button/nav/logo hover |
| Nav: sliding indicator, stepped dropdown | yes | |
| Scroll-progress hairline, status pulse on Alpha tags, theme-change wipe | yes | |
| Page transitions (cross-document View Transitions, stepped wipe) | yes | + 1-frame tear |
| Boot sequence (first view per session; true values; any key skips) | yes | lines arrive corrupted, then resolve |
| Live HUD (UTC clock, session timer, viewport, NET state, motion level) | yes | page code ticks on load; pointer readout over the hero |
| Command console (Ctrl/Cmd+K or `/`; menu entry on phones) | yes | glitch on open/error |
| Hero: scan band, pointer interference (fine pointer) | yes | tear bursts every 12-20 s |
| Grid floor (home), scan sweep (content pages), scanlines | yes | |
| Pointer light on cards/CTAs/features, product-strip hover (decode, reticle, scanlines) | yes | "COMING SOON" flicker |

The command console (`assets/js/console.js`) only offers what the UI already offers (pages from the same `NAV`/`FOOTER_COLUMNS` as the header and footer, `theme ...`, `motion ...`, `login`, `register`, `account`, `help`, `clear`); no admin or API actions, no network, no storage. The header and footer are mounted before the session check (sign-in controls stay hidden until known), which is also what makes page transitions look right.

## Voice

Plain, specific, third person. Sentence-case headings, no hype. Claims must match what the product does today (source of truth: `legal/products`, privacy, terms). Alpha status is stated once, in a callout.

## Flourishes policy

- ASCII hero: home only. HUD footer line: every page. Vertical page code and the KANASAKA edge rail: content pages (open question: move them behind a console toggle for a calmer look).
- No new decorative effects without removing one.
