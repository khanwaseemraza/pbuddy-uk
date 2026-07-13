# ADR 0008: Palette v2 — enterprise grade (supersedes ADR 0007 colours)

**Status:** accepted · 2026-07-12 (founder feedback: "colour schemes are not
enterprise grade"). Name stays **ParcelBuddy**; ADR 0007's naming stands.

## Decision
Restraint over vibrancy: a deep navy anchor carries the interface; orange
becomes a *signal* accent (routes, progress, highlights) used sparingly,
never as wallpaper. Cool neutrals replace the warm cream.

| Token | Hex | Use |
|---|---|---|
| ink (primary) | `#0E1B2C` | filled buttons, tint, headings, hero base |
| ink-light | `#1E3A5C` | hero gradient partner, pressed states |
| signal | `#E8590C` | route badges, progress fill, accents — sparingly |
| paper | `#F6F7F9` | page/screen background (cool, not cream) |
| border | `#E2E8F0` | hairlines, table rules |
| eco | `#0A7A4F` | CO₂e/impact ONLY (unchanged rule from ADR 0007) |
| danger | `#B3261E` | destructive, errors |

## Rationale
Enterprise-grade = one authoritative dark anchor + controlled accent +
generous neutral space (Stripe/Monzo/Wise grammar). The InPost/Airbnb
energy survives in the signal orange, but it accents rather than floods.

## Consequences
- iOS global tint = ink; hero card = navy gradient with white CTA; progress
  and route chips = signal orange; delivered = eco green.
- Web (shop/ops): buttons ink, background paper, wordmark ink.
- Status pages keep semantic greens/reds for outcomes.
