# Till · brand tokens

Proposal written 2026-10-31. Full guide: `brand-guide.html`.

**Name:** Till. **Tagline:** What's left till payday. **Descriptor:** Budget by pay cycle, cash and hours of work.
Alternative considered: Pace.

## Logo
- `till-mark.svg` · lowercase t whose crossbar is a budget bar (solid = spent, 30% = left). Stroke 14 on a 100 grid, bar fixed at 60%.
- `till-wordmark.svg` · "till" drawn with the same stroke; the i-dot is a coin in Plum. `-mono` versions use `currentColor`.
- `till-lockup.svg` · icon tile + wordmark, for store pages.
- `till-icon.svg` / `till-icon-dark.svg` · 512 app icon, rx 112, mark fills 52% (maskable-safe). `till-favicon.svg` · 100 grid.
- Clear space: one stroke width. Minimum: mark 20 px, wordmark 64 px, lockup 120 px. No gradients, shadows, outlines, rotation.

## Color
| Token | Hex | Role |
|---|---|---|
| Plum | `#5E2B7E` | Primary, used sparingly. 9.9:1 on white |
| Damson | `#1A1222` | Ink, the Worth-it card, wordmark. Dark canvas `#120C18` |
| Lilac | `#C9A0E0` | Accent on dark. 8.8:1 on `#120C18` |
| Petal | `#F0E6F5` | Tint, soft chips |
| Paper | `#F7F4F8` | Canvas; cards white; lines `#E4DDE8` |
| Mauve | `#6B5F73` | Muted text. 6.0:1 on white |

Dark theme: surface `#1C1424`, surface-2 `#261B30`, line `#352742`, ink `#EFE8F3`, ink-2 `#C8BBD0`, muted `#9A8DA3`, accent-soft `#2E1E3D`, on-accent `#120C18`.
No second brand hue: the hours-of-work card is Damson with Lilac figures.
Status (good / careful / over) and chart series stay as defined in `src/index.css`; they are functional, never brand.

## Type
Manrope only. Display 40/800/−0.03em · Title 24/800 · Heading 17/700 · Body 15/500 · Caption 12/600. Tabular figures for amounts. Arabic UI: pair with IBM Plex Sans Arabic.

## Voice
Calm, plain, second person, no exclamation marks. State the fact, say what it means, never scold.
"Shopping is 400 DA over budget." · "Left to spend: 9,700 DA · 10 days to payday." · "That's 9 h 20 min of work. Worth it?"

## To adopt in the app
Manifest name/short_name → Till · theme colors `#F7F4F8` / `#120C18` · accent token → Plum / Lilac · icons from `till-icon.svg` (192, 512, maskable, Apple 180) · favicon → `till-favicon.svg` · replace "Expense Tracker" in `src/i18n/en.ts` and `vite.config.ts`.
