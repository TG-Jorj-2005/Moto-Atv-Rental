# Design system

The interface has one theme: dark. There is no light theme and no toggle.

## Tokens
All colours are defined once, in the `@theme` block of `src/app/globals.css`, and used through Tailwind utilities
(`bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-danger`, ...). Components never contain raw colour values.

| Group | Tokens |
|---|---|
| Surfaces | `canvas` (page), `surface` (cards), `surface-2`, `surface-3` (inputs, hover) |
| Borders | `line`, `line-strong` |
| Text | `fg`, `fg-soft`, `muted`, `subtle` |
| Accent (motorsport orange) | `accent` (fill, with `on-accent` text), `accent-hover`, `accent-fg` (text/icons on dark), `accent-soft` |
| Status | `success`, `warning`, `danger`, `info`, each with a `-soft` fill; `danger-solid` for destructive buttons |

Text/background pairs keep at least 4.5:1 contrast. Status is always shown with text and an icon, never by colour alone.
`prefers-reduced-motion` switches animations and smooth scrolling off.

## Logo
- `src/components/brand/logo.tsx`: `Logo` (mark + wordmark, or `variant="mark"`) and `LogoMark`. Used by the public header,
  the dashboard shell (customer, provider, admin), the footer and the login/register pages through `Brand`.
- `public/brand/logo.svg` (full) and `public/brand/logo-mark.svg` (symbol only) are standalone vector files.
- `src/app/icon.svg` is the favicon (Next.js serves it automatically).
- The symbol is a wheel (ring) and a trail climbing away from it; it is original and uses no manufacturer mark.

## Components
`src/components/ui/*` (button, badge, card, form, alert, table, misc: PageHeader, Section, Stat, EmptyState, Skeleton,
LinkTabs) and `src/components/layout/*` (header, footer, dashboard shell, `MobileMenu`, `NavLinks`).
