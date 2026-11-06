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

The nav and footer (`NAV`, `FOOTER_COLUMNS` in `assets/js/shell.js`) list **only pages that exist**. A page enters the nav when it has real content; until then it keeps its URL, uses the *In development* template and stays `noindex`. The test suite checks this.

Current nav: Products (KS_Link, Technical overview) · Downloads · Security · Company (About, Changelog) · Support (FAQ, System status, Contact) · Legal. Each dropdown label is a real link to a small overview page (`/products/`, `/company/`, `/support/`, `/legal/`): clicking it navigates on desktop, hover/focus opens the list; on phones the label expands the list and an "<Section> overview" row links to the page.

### Shell, pre-render and SEO

The header and footer are **in the HTML of every page**, not built in the browser: `assets/js/shell.js` holds the nav/footer data and pure render functions; `node scripts/prerender.mjs` (`npm run prerender`) writes them into each page between `<!-- shell:header -->` / `<!-- shell:footer -->` markers, and `main.js` only hydrates them (listeners, sign-in controls, the `is-auth-pending` reveal). After changing the nav, a page's `<title>` or `<meta name="description">`, or adding a page, run `npm run prerender`; `npm test` fails if any page is stale. The header collapses into the menu button at 1240 px (`style.css`, `components.css`, `motion.css`, `main.js`, `motion.js` must agree).

The same script also sets `?v=<content hash>` on every `/assets/js` and `/assets/css` URL (in the pages and in the script loaders inside `main.js`), so a changed file always has a new URL and a browser cannot keep running a stale copy next to new pages or API rules (a stale `auth.js`/`tos.js` once sent an old Terms version and broke registration). Never edit `?v=` numbers by hand; run `npm run prerender` after changing any script or stylesheet (`npm test` fails if it is out of date).

The same script maintains `<!-- seo -->` blocks (canonical, Open Graph, Twitter card, Organization JSON-LD on the home page; `assets/images/og-default.png`), `sitemap.xml` and the `Sitemap:` line in `robots.txt`. A page is *indexable* when it has a title and a 50-160 character description, no `noindex`, and is not an account/auth page or listed in `UNLISTED_PREFIXES` (`scripts/prerender.mjs`). `404.html` is a normal page (noindex) that Cloudflare Pages serves for unknown URLs.

New page checklist: copy a page skeleton, write a unique title and description, add `<div id="site-header"></div>` / `<div id="site-footer"></div>` slots (or copy the markers), add it to `NAV`/`FOOTER_COLUMNS` if it has real content, run `npm run prerender`, run `npm test`.

### Header on narrow screens

At 1240 px and below the nav collapses into the menu button, and so do the sign-in controls: `.header-auth` is hidden and the same controls (Log In / Register, or the account link when signed in) live inside the open menu as `.nav-account` (rendered by `shell.js`, kept in step with `.header-auth` by `main.js` `refreshHeader`). On phones (560 px and below) the header is one row (logo left, Search and the menu button right, ~67 px instead of ~118 px) and slides away while scrolling down, returning on scroll up, at the top, when the menu opens or when focus enters it (`initHeaderAutoHide` in `main.js`, `.is-hidden` in `style.css`).

## Motion

Everything animated is gated in one place, `assets/js/motion.js` + `assets/css/motion.css` (and `assets/js/motion-boot.js`, a tiny synchronous script that sets the same attributes before the first paint), by two attributes on `<html>`:

- `data-motion` = `full | reduced | off`: what the person/device allows. The OS "reduce motion" setting always forces `off`; otherwise the saved choice (Account > Customization > Motion: Automatic / Full / Reduced / Off, or the console); Automatic = full, except when data saver is on (core count/memory are not used: tablets and phones report small numbers while being fast, and every effect is compositor-only).
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
| Live HUD (UTC clock, session timer, viewport, NET state, motion level) | yes | page code ticks on load |
| KS_Site terminal (`//` in the header, Ctrl/Cmd+K, `/`) | yes | glitch on open/error; the `//` carries a blinking cursor |
| Hero: scan band | yes | tear bursts every 12-20 s |
| Grid floor (home), scan sweep (content pages), scanlines | yes | |
| Pointer light on cards/CTAs/features, product-strip hover (decode, reticle, scanlines) | yes | "COMING SOON" flicker |

The **KS_Site terminal** (`assets/js/console.js`, `assets/css/console.css`) opens from the `//_` with the word "Search" next to it in the header (or Ctrl/Cmd+K, or `/`). It is a search bar dressed as a cmd window (quiet title bar "KS_Site", `KSS:\>` prompt, in the page's own theme colours) over the site's real pages, which form its file system (`KSS:\products\ks-link`, from the same `NAV`/`FOOTER_COLUMNS` as the header and footer). Commands follow cmd: `help`, `dir`/`ls`, `cd` (`cd..`, `cd \`), `tree`, `start`/`open` (or just type a page name; unique names resolve anywhere, like a PATH search), `cls`, `ver`, `date`, `time`, `echo`, `whoami`, `exit`, plus `theme`, `motion`, `login`, `register`, `account`. It **recommends**: with an empty prompt it lists what you ran recently and pages related to the one you are on; while typing it ranks pages, commands and arguments (prefix > word > substring > loose letters, boosted by relatedness and history) and suggests the closest command for typos. Down/Up pick a suggestion, Tab fills it, Enter runs it (Up with nothing highlighted walks the history), Ctrl+L clears. It closes with its × button (or `exit`, or a click on the backdrop); there is no Esc or Ctrl+K close. **Keyboard shortcuts** (listed by the `keys` command; Ctrl + letter so plain keys stay free for typing; none of them act while the terminal is open, while a text field has focus, or while the boot overlay, terms overlay or auth modal is up): Ctrl/Cmd+K and `/` open the terminal, Ctrl+B replays the boot sequence (animation Full only), Ctrl+Y cycles the theme (dark, light, accent), Ctrl+H goes home, Ctrl+J goes to Downloads. Ctrl+Alt+letter is deliberately unused: on German layouts it is AltGr. **Boot**: the first-visit sequence is ~0.8 s; started on demand (`boot`, Ctrl+B) it runs a ~5 s variant with extra true-value lines (REV, BUILT, VIEWPORT, LANG, TZ, STORAGE, SESSION) and a progress bar that follows the sequence timeline. It only offers what the UI already offers: no admin or API actions, no network, no storage. The header and footer are mounted before the session check (sign-in controls stay hidden until known), which is also what makes page transitions look right.

### Cadence

The ASCII hero is **painted on a canvas**, not as DOM: each tick computes one glyph and one style per cell into two byte arrays and redraws only the cells that changed, from a pre-rendered glyph atlas (colours and opacities are read from the `.ha-a*` / `.ha-l*` classes in `home.css`, so the theme still drives them; the atlas is rebuilt on theme change, resize and DPR change). The `<pre id="ha-field">` stays as the font/cell-size reference and as the DOM-span fallback when no 2D canvas exists. (Rebuilding ~2000 spans per tick plus layout was more than a tablet could do inside one tick, which made the cost guard below stop the field.) The ASCII hero deliberately ticks at **15 Hz** (`TICK_MS` = 66 ms, the same on every device): it rewrites the field once per tick and every moving part steps on that tick (noise drift, hex flips, scan band, tear), and the text scramble in `motion.js` shares it (`KanasakaMotion.tickMs`). It reads as a terminal clock next to the display-rate, compositor-driven UI (strip, reveals, nav, sweeps). There is no adaptive rate, only a cost guard that is deliberately hard to trip (a false alarm freezes the hero): an up-front probe (best of three renders plus layout, must fit inside one tick) catches hopeless hardware; at runtime nothing is measured for the first 4 s or while the boot overlay, terms overlay or sign-in dialog is up, a window is the median of 30 samples (time from a render to the next frame, so layout and paint count), and it takes two bad windows (median > 90 % of the tick) in a row to act. The first action drops the field once to a fixed 7.5 Hz tick; two more bad windows there stop it on its current frame, and the next time the hero returns (tab shown, scrolled back into view) it gets one more try. The HUD `//TICK` readout shows `15HZ`, `8HZ` or `STATIC`. It never wanders between rates. **Diagnostics**: open `/?hero=debug` to get a panel on the hero with the median rAF interval, render time (compute + draw), frame time (what the guard judges), grid/canvas size and DPR, plus switches for the mask on the field, header backdrop blur, CSS animations and the guard, to find what a struggling device (e.g. iPad Safari) is choking on.

## Voice

Plain, specific, third person. Sentence-case headings, no hype. Claims must match what the product does today (source of truth: `legal/products`, privacy, terms). Alpha status is stated once, in a callout.

## Flourishes policy

- ASCII hero: home only. HUD footer line: every page. Vertical page code and the KANASAKA edge rail: content pages (open question: move them behind a console toggle for a calmer look).
- No new decorative effects without removing one.
