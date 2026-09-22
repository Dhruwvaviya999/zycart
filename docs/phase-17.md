# Phase 17 — UI Excellence, Component Polish & Interaction Consistency

## Overview

Every phase since Phase 2 added surfaces. Phase 17 added none, and instead went
back over the ones that exist looking for the places where the product stopped
behaving like one design system and started behaving like fifteen pages that
happen to import the same primitives.

The audit found the same failure repeatedly, in four different disguises: **a
decision that belongs to a component had been pushed out to the pages that use
it.** Eleven call sites carried `className="h-11 rounded-xl"` to turn the dense
default `Input` into the storefront's field. Four places had each hand-rolled
the same native `<select>` with the same four utility classes. Four dialogs had
each written out the same 200-character class string to be a bottom sheet on a
phone and a centred dialog on a desktop. Two textareas had each restated the
input's border, focus ring and invalid state by hand. Each of those is correct
today and unmaintainable tomorrow, because nothing makes the twelfth one agree.

The rest of the phase is the five defects that prompted it, and the further
ones the audit turned up while it was there.

| Gap | What closes it |
| --- | --- |
| The homepage hero was a static composition | A scroll-snap rail of promotional banners, with the editorial band moved below the first product rail |
| Select options sat flush against the popup edge | An inset popup, comfortable rows, and a size ladder shared with `Input` |
| The scrollbar was the operating system's | Theme-aware scrollbars in both engines, suppressed on touch |
| Search showed a ⌘K chip and an Esc pill | Both gone; the shortcuts stay, and the overlay gains a real close button |
| The nav indicator did not follow the route | Route-driven matching, declared per destination, with no component state |
| Four native selects, eleven copied field heights, four copied dialog strings | `SelectField`, an `Input`/`Select`/`Textarea` size ladder, `Dialog` variants |
| The account rail unlit itself on every order and return detail page | The same matcher, shared |
| Cards misaligned when product names differed in length | Two title lines reserved, whatever the name |
| The sort control read `newest` | `items` on the Select root, so the trigger reads the label |

### What did not change

No API contract, no database schema, no payment, return, inventory,
notification or assistant behaviour. No new runtime dependency: the carousel,
the scrollbars and the dropdowns are built from Tailwind and the Base UI
primitives already in `package.json`. The backend was not touched at all — the
diff for this phase is entirely under `frontend/`.

---

## Contents

- [The design system](#the-design-system)
- [The hero banner rail](#the-hero-banner-rail)
- [Select](#select)
- [Scrollbars](#scrollbars)
- [Search](#search)
- [Navigation active state](#navigation-active-state)
- [Dialogs, sheets and overlays](#dialogs-sheets-and-overlays)
- [Product cards and touch targets](#product-cards-and-touch-targets)
- [What was verified, and how](#what-was-verified-and-how)
- [Known limitations](#known-limitations)

---

## The design system

### One size ladder for every field

`Input`, the `Select` trigger and the new `Textarea` share four steps, and they
are the same four:

| Size | Height | Radius | Where it is used |
| ---- | ------ | ------ | ---------------- |
| `sm` | 32px | 10px | Dense admin rows |
| `default` | 36px | 12px | The admin console generally |
| `lg` | 44px | 16px | Every storefront form — auth, account, address, checkout, returns, reviews |
| `xl` | 48px | 16px | Marketing bands, paired with the `cta-lg` button |

A select and a text field placed side by side now line up because they are
reading the same ladder, not because somebody matched them by eye.

One subtlety worth recording, because it will bite whoever adds the next step.
The shared base carries `md:text-sm` — the standard trick that keeps a field at
16px on a phone, where anything smaller makes iOS Safari zoom on focus, and
drops it to 14px on a desktop. A media-query utility beats an unprefixed one
whatever order the classes are written in, and `cn` cannot merge across
different modifiers, so a size that wants a different desktop size has to
restate it with the `md:` prefix. `sm` and `xl` both do.

### `SelectField`

The plain "here is a list of options" case, wrapping the design-system
`Select`. It replaces four native `<select>` elements: the admin filter bar,
the product form's taxonomy pickers, the inventory adjustment reason and the
return reason.

The comment those native selects carried was not wrong — a native select is
keyboard-accessible for free and opens as a proper picker on a phone. But it
cannot be styled past its border in Safari or on Windows, which made those four
the only controls in the product that still looked like the operating system
sitting next to the styled controls around them. Base UI's listbox keeps the
keyboard contract that made the native one attractive: type-ahead, the arrow
keys, Home and End, Enter, Escape, and a real `listbox`/`option` tree for
assistive technology.

`SelectField` also owns the translation Base UI needs and the callers do not
want to think about: Base UI models "nothing selected" as `null`, while a form
field and a URL search param both want the empty string. An empty string *is* a
value to Base UI, so passing one straight through suppresses the placeholder
and leaves the trigger blank — which is why the mapping happens in one place
rather than at four call sites.

### `Textarea`

New, and deliberately not clever: the `Input` treatment at the `lg` step, with
the height left to `rows`. It replaces two hand-rolled textareas whose borders,
focus rings and invalid states had been restated by hand, so the product form
and the review dialog no longer look assembled from two kits.

### Elevation, radius and colour

Unchanged. The token layer from earlier phases was already coherent; the audit's
finding was that components were bypassing it, not that it was wrong. The one
addition is a scrollbar pair, `--scrollbar-thumb` and `--scrollbar-thumb-hover`,
defined for both themes alongside the elevation scale.

---

## The hero banner rail

The homepage now opens on a horizontally scrolling row of wide promotional
cards — what is on offer today, scannable in one sweep, each card a link
somewhere specific. Five of them, with the next peeking past the right edge.

### Why a scroll container and not a track

It is a native `overflow-x: auto` element with `scroll-snap`, not a transform
track. Everything a carousel normally reimplements comes from the browser:
momentum scrolling, swipe, trackpad gestures, keyboard arrow scrolling, and the
peeking neighbour that tells a shopper the row moves. Autoplay is then a
`scrollTo`, which the same snap points bring to rest in the right place.

It also cannot widen the page. The overflow belongs to the rail, so a card
wider than its frame scrolls inside it rather than pushing the document
sideways — which is the failure mode of every hero built as a wide row that is
translated.

The active card is *observed* rather than calculated. Card width changes at
every breakpoint, so measuring one and dividing would be a second source of
truth that has to be kept in step with the CSS; an `IntersectionObserver`
rooted on the rail already knows which card is in view.

### The banners are ZyCart's own

The reference this was built from is an ad strip: third-party brand creatives
badged "AD". These are not that, and deliberately. Nothing here imitates a real
company's advertising, and nothing is badged "AD" — ZyCart sells no ad
inventory, so an ad slot would be a lie told to the shopper about why they are
being shown something. Each banner is a ZyCart promotion pointing at a real
filtered view of the real catalogue.

Copy sits over a gradient scrim rather than over the photograph, because a
merchandiser picks an image for the product in it, not for how much contrast it
leaves behind white text. Three scrim tones and two copy alignments, so five
consecutive cards read as five cards rather than as one long strip.

### Behaviour and accessibility

Autoplay every 5.5 seconds, and only while: more than one banner, the shopper
has not scrolled or used a control, the pointer is not over it, focus is not
inside it, the tab is visible, and reduced motion is not requested. Any
interaction — a pointer down on the rail, an arrow key, a dot, a chevron —
stops it for good.

The region is `aria-roledescription="carousel"`; each card is a labelled slide
of five; the rail is a focusable scroll container with its own label, so a
keyboard user scrolls it with the arrow keys as the browser intends; the dots
are buttons named "Go to offer 3: Headphones from ₹1,499" rather than "3", with
`aria-current`; the chevrons appear from `md` up, where there is a pointer to
aim them with. No `inert` is needed, because unlike a stacked carousel every
card here is genuinely reachable.

### The editorial band moved down

What was the hero is now `Showcase`, and it sits below the first product rail.
At the top of a storefront a shopper is looking for offers and a way into the
catalogue; a paragraph about the store's philosophy above the fold is the shop
talking about itself before it has shown anything. A few rails down, once the
offers and the first products have done their job, the same paragraph is a
reason to stay — and it breaks up what would otherwise be four product rails in
a row.

It is a server component again, and static. Its three slides were the right
answer while it was the hero; the rail above now does the rotating, and two
things rotating on one page is one too many. The other two slides' copy did not
go anywhere — it became banners.

Its heading dropped from `h1` to `h2`, and the rail carries the page's one `h1`
as a visually hidden line. The rail is images and links, so without that the
homepage would open on an `h2` and have no heading of its own.

---

## Select

### The reported defect

> The option list feels too close to the outer container.

It was, literally: the popup had no padding, so the first and last rows sat
against its edge and the rounded corners had nothing to round. The popup now
carries `p-1.5`, so every row is inset on all four sides, and the rows
themselves are `min-h-9` with `py-1.5 px-2.5` rather than the stock `py-1`.

`min-h` rather than a fixed height is the point: a row that wraps stays
readable, and a row that does not is still a comfortable target.

### The rest of it

- **The popup sits under its trigger.** Base UI's default, `alignItemWithTrigger`,
  is the iOS-style behaviour where the popup overlays the trigger with the
  selected row on top of it. That pins the popup to exactly the trigger's width
  and fights the inset. It is off; the popup is anchored below with a 6px offset
  and `collisionPadding: 12` so it never ends up flush against a small viewport.
- **`min-w-(--anchor-width)`** rather than `w-`: at least as wide as the
  trigger, wider when a label needs it.
- **Selected state** is a brand-coloured check and a medium weight, not just a
  tick.
- **Highlight** is styled on `data-highlighted` *and* `focus`, because Base UI
  marks the pointed-at row with the former and keyboard navigation moves real
  DOM focus.
- **The chevron rotates** on open, and is now the Icon's child rather than its
  `render`. Base UI defaults the Icon's children to a `▼` glyph, which a
  `render` element inherits — so the previous version was shipping a stray text
  node inside the `<svg>`.
- **`items` on the root.** Without it Base UI cannot map a value back to a
  label, and the shop's sort control was displaying `newest` instead of
  "Newest first". That one was a real, visible, shipped bug.

---

## Scrollbars

Two tokens, `--scrollbar-thumb` and `--scrollbar-thumb-hover`, defined per
theme; `scrollbar-width: thin` and `scrollbar-color` on `html` for Firefox; a
`::-webkit-scrollbar` block for Chromium and Safari.

The gutter is 10px but the thumb is drawn inside a 3px transparent border with
`background-clip: padding-box`, so what is visible is a 4px hairline that
thickens on hover. It is one treatment for the page and for every container
that scrolls, because a filter rail and the document disagreeing about what a
scrollbar looks like is exactly the kind of small incoherence this phase was
about.

Two deliberate exclusions:

- **Touch.** Under `@media (hover: none)` the scrollbar is zero-width. Styling
  `::-webkit-scrollbar` at all converts a mobile browser's transient overlay
  scrollbar into a classic one that permanently eats 10px from every scroll
  container, and a resting thumb on a phone is noise — the finger is the
  scrollbar.
- **`.no-scrollbar`** still opts out, and the horizontal product rails still
  use it.

`scrollbar-gutter: stable` was considered and rejected: Base UI's scroll lock
already compensates for the scrollbar when a dialog opens, and adding a
reserved gutter on top risks compensating twice.

---

## Search

The field carried a `⌘K` chip and the overlay an `Esc` pill. Both are gone.
Both shortcuts still work — the overlay still owns the Cmd/Ctrl-K handler and
Escape still closes — because the request was to remove the *indicators*, and
because a keyboard hint inside a search field is a developer-tool convention a
shopper reads as one more thing to decode before they can type.

Removing the Esc pill exposed something worse behind it. It was
`hidden sm:inline-flex`, and the overlay on a phone is full-screen with no
visible backdrop to tap — so on a phone there was no visible way out of search
at all. It is replaced by a labelled close button present at every width. The
clear-field control next to it became a filled chip, so the row is not two
copies of the same X.

While there: the results list now takes its height from the dialog (`flex-1
min-h-0`) instead of carrying its own `max-h-[70vh]`, and the shop's search
field moved to the 44px step, which is what the Filters button and the sort
select beside it already were.

---

## Navigation active state

### What was wrong

The rule was: *the item whose href contains no `?` or `#`, and whose href
equals the pathname.* One line, and wrong in four ways at once.

- **Deals** and **New Arrivals** are `/shop?sort=discount` and
  `/shop?sort=newest`. Both were excluded by the `?` test, so neither could ever
  light up, however a shopper reached them.
- **Categories** is `/#categories`. Excluded by the `#` test. Never lit.
- **A product page** matched nothing, so opening a product dropped the
  indicator entirely — even though a product is inside the shop.
- Nothing described what should happen when two items have a claim on the same
  URL, because under the old rule two never could.

### What replaced it

Each destination declares what it matches, in `data/navigation.ts` next to the
links themselves — because the answer is a property of the destination, not of
the component drawing it, and the desktop bar and the mobile sheet must not get
to disagree:

```ts
{ label: 'Shop', href: '/shop', match: { paths: ['/shop'], prefixes: ['/products'] } },
{ label: 'Deals', href: '/shop?sort=discount', match: { paths: ['/shop'], query: { sort: 'discount' } } },
```

`lib/nav-active.ts` scores every item against the location and takes the
highest: an exact pathname scores 4, a nested prefix scores 1, and each search
param or hash the item names adds 2 — but a named param that does not match
disqualifies the item outright.

So `/shop?sort=discount` scores Shop at 4 and Deals at 6, and Deals wins.
`/shop?category=shoes` scores Shop at 4 and disqualifies Deals, which asked for
a `sort` this URL does not have, so Shop stays lit — which is the behaviour the
brief asked for by name. `/products/anything` keeps Shop lit through the prefix.

There is no component state anywhere in this and nothing to keep in sync: the
location is the only input, so a client navigation, a refresh, a pasted URL,
`Back` and `Forward` all reach the same answer by the same route. No click
handler sets an active item. `aria-current="page"` now says what the underline
shows.

### The Suspense boundary

`useActiveNav` reads `useSearchParams`, which opts its subtree into client
rendering, so the nav list sits behind a `<Suspense>` whose fallback is the same
markup with nothing highlighted. The bar therefore never reflows while the
boundary resolves — and on a dynamic route the boundary resolves *on the
server*, so the correct item is in the streamed HTML rather than appearing after
hydration (verified below).

The hash case is the exception and cannot be otherwise: a fragment is never
sent to the server, so `Categories` lights up after hydration. It is read
through `useSyncExternalStore` with a server snapshot of `''`, so the server's
render and the client's first render agree and there is no hydration mismatch —
only a one-frame delay before a hash-only state appears.

---

### The same bug, in a second navigation

The audit then found the account rail doing exactly what the header used to:
`const active = pathname === href`. Which meant that opening an order —
`/account/orders/ZY-1024` — or a return, or a review, unlit *every* item in the
sidebar, and a customer reading their own order was shown an account section
with nothing selected at all.

It now declares `match` per destination and reads `activePathItem`, the
path-only entry point to the same scorer. `Orders`, `Returns` and `Reviews`
claim their detail pages by prefix; `Overview` matches `/account` exactly, or
it would own every page beneath it. No `useSearchParams` and therefore no
Suspense boundary, because none of those destinations is query-scoped.

`activeNavLabel` became a thin wrapper over a generic `activeNavItem`, so the
header and the rail draw themselves differently and key off different fields
while being unable to disagree about which item is current.

The admin console's `isActiveNav` was already correct about nesting and is left
where it is — it serves a different information architecture. Its `startsWith`
did gain a segment-boundary check, so a future `/admin/orders-archive` cannot
light `/admin/orders`.

---

## Dialogs, sheets and overlays

`DialogContent` gained `variant` and `size`.

- **`sheet`** — a bottom sheet on a phone, a centred dialog from `sm` up. The
  default for anything a shopper opens: a centred box on a 360px screen has its
  buttons in the middle of the viewport and its content squeezed, while a sheet
  rises from the thumb. This is the variant that replaced the same
  200-character class string in four files.
- **`centered`** — the plain dialog, for the admin console.
- **`command`** — top-anchored, for the search overlay, because a result list
  grows downwards and should not push its own input around as it does.

Every variant caps its height against the **dynamic** viewport (`100dvh`), so
no dialog can be taller than the screen it opened on, including mobile Safari
with its address bar showing.

The scrim went from `bg-black/10` to `bg-black/35`, and `bg-black/55` in dark —
10% was not enough to separate a white dialog from a white page, and in the
dark theme it was barely there at all. `Sheet` uses the identical value, because
a sheet and a dialog dimming the page by different amounts read as two different
weights of modal.

`Sheet` bottom panels also pick up the `rounded-t-3xl` and `max-h-[90dvh]` that
the shop's filter drawer had been specifying for itself.

---

## Product cards and touch targets

**Cards reserve two title lines.** `line-clamp-2` caps a long name at two lines
but does nothing for a short one, so in a grid of four a card with a one-line
name pulled its rating and price a line above the card beside it, and the row
read as misaligned rather than as products with different names. A `min-h` of
two lines costs 19px on short names and buys a grid whose ratings and prices sit
on shared baselines all the way across. `ProductCardSkeleton` mirrors it, so
nothing jumps when the products arrive.

**The cart row's actions grew.** Save-for-later and Remove were 28px controls
beside a 32px quantity stepper — three different heights, all under every
touch-target guideline, in the row a shopper taps most on a phone. All three are
now 36px; the icons did not change, only the targets.

**The product page's tabs grew.** Description / Specifications / Reviews was a
32px bar. It is the primary navigation within a product, so `TabsList` gained an
`lg` size at 44px, where the triggers size to their labels instead of dividing
the row.

---

## What was verified, and how

Run against the development server with the changes live, by fetching the
server-rendered HTML and asserting on it.

**Navigation, per route** — the resolved Suspense boundary, not the fallback:

| URL | Active item |
| --- | --- |
| `/shop` | Shop |
| `/shop?sort=discount` | Deals |
| `/shop?sort=newest` | New Arrivals |
| `/shop?category=footwear` | Shop |
| `/shop?sort=discount&category=footwear` | Deals |
| `/shop?q=shoes` | Shop |
| `/products/atelier-nord-teal-top-handle-bag` | Shop |
| `/`, `/cart`, `/wishlist` | none |

Two `aria-label="Primary"` blocks appear in each response — the Suspense
fallback and the resolved content — and the resolved one carries the correct
`aria-current="page"`. The indicator is therefore server-rendered, not
hydration-dependent.

**The matcher itself**, driven directly rather than through a page, because the
account rail's pages are behind a session and cannot be fetched anonymously.
Twenty-two cases, all passing: the twelve primary-nav ones above plus
`/#categories` → Categories and `/shopping` → none (the segment boundary that
stops a prefix matching a longer word), and ten account-rail ones including
`/account/orders/ZY-1024` → Orders and `/account/returns/RT-77` → Returns,
which is the case that was broken.

This ran as a throwaway script against `lib/nav-active.ts` and is not checked
in: the frontend has no test runner, and wiring one up for a single module —
or hanging a frontend check off the backend's `tsx` — would be more
infrastructure than the check is worth. It is recorded here so the next person
knows the cases and can re-run them.

**Hero rail** — five `aria-roledescription="slide"` groups labelled "1 of 5"
through "5 of 5"; five dots each naming its offer ("Go to offer 3: Headphones
from ₹1,499"); "Previous offers" and "Next offers" present and labelled; the
rail focusable with `tabindex="0"`; `snap-x`, `snap-mandatory`, `overflow-x-auto`
and `snap-start` all present, confirming a native scroll container rather than a
transform track; the first banner emitted as `<link rel="preload" as="image">`;
exactly one `<h1>` on the page, with the showcase now an `<h2>` further down;
and no `AD` badge anywhere.

**Search** — zero occurrences of `⌘K`, `<kbd>` or `>Esc<` anywhere in the
rendered storefront.

**Scrollbars** — the compiled stylesheet contains `scrollbar-width`,
`scrollbar-color: var(--scrollbar-thumb)`, the four `::-webkit-scrollbar*`
rules, the `@media (hover: none)` override, and both themes' tokens
(`#12161f38` light, `#ffffff2e` dark). `.no-scrollbar` survives.

**Select** — the shop's trigger renders `data-size="lg"` and the text
"Newest first" (it read `newest` before); the stray `▼` is gone; `p-1.5`,
`min-h-9`, `min-w-(--anchor-width)`, `data-highlighted` and `data-selected` are
all present in the compiled CSS.

**Suites**

| Check | Result |
| --- | --- |
| `pnpm -r typecheck` | Pass, both packages |
| `pnpm -r lint` | Pass, zero warnings |
| `frontend: pnpm build` | Pass, 40 routes |
| `backend: pnpm build` | Pass |
| `backend: pnpm test` | 652 of 656 pass |

The four failing backend tests are in `tests/smoke.test.ts`, in the "Running a
command" suite, and fail with `'C:\Program' is not recognized as an internal or
external command` — a Windows path-quoting problem in the test harness on this
machine. They are unrelated to this phase and pre-existing: the diff contains no
backend file.

---

## Known limitations

**No browser was driven.** This phase had no Playwright, Puppeteer or any other
automation available, so every claim above is about server-rendered markup and
compiled CSS, not about pixels. What that does *not* cover, and what a person
should look at before this ships:

- the carousel's crossfade, the swipe gesture and the pause control in a real
  browser, on a real touchscreen;
- the select popup's rendered spacing, and its flip behaviour when the trigger
  is near the bottom of a short viewport;
- the scrollbar in Chrome, Firefox and Safari, in both themes;
- every viewport from 320px to 1920px — the responsive work here is reasoned
  from the CSS, not measured;
- the client console, for hydration warnings. The server log is clean, which
  rules out server-side errors and nothing else.

**No toast system.** ZyCart has none, and the audit's brief asked for one to be
reviewed. Adding to cart confirms inline on the card, the cart page and the
purchase panel; errors surface in place. Base UI ships a `toast` primitive, so
it could be built without a new dependency, but wiring it into the cart and
wishlist stores touches paths this phase deliberately left alone. It is the
clearest remaining gap.

**`body { overflow-x: hidden }`** is unchanged. Because `html` has no explicit
overflow, the body's value propagates to the viewport, which is why the sticky
header still works — but it also means accidental horizontal overflow anywhere
in the product is hidden rather than visible. That is a safety net over a class
of bug, not an absence of it, and finding what it is hiding needs a browser.

**The `Categories` item lights up only on the homepage with `#categories`.**
That is the honest reading of a hash link, but it does mean the item is dark
on a plain visit to `/`. Pointing it at a real `/categories` route would be a
better answer, and is a routing change rather than a UI one.
