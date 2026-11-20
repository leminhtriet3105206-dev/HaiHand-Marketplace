---
name: Warm Utilitarian C2C
colors:
  surface: '#fff8f5'
  surface-dim: '#e0d8d5'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf2ee'
  surface-container: '#f4ece8'
  surface-container-high: '#eee7e3'
  surface-container-highest: '#e9e1dd'
  on-surface: '#1e1b19'
  on-surface-variant: '#4d4632'
  inverse-surface: '#33302d'
  inverse-on-surface: '#f7efeb'
  outline: '#7f7660'
  outline-variant: '#d1c6ab'
  surface-tint: '#735c00'
  primary: '#735c00'
  on-primary: '#ffffff'
  primary-container: '#facc15'
  on-primary-container: '#6c5700'
  inverse-primary: '#eec200'
  secondary: '#a73a00'
  on-secondary: '#ffffff'
  secondary-container: '#fd651e'
  on-secondary-container: '#571a00'
  tertiary: '#805600'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffc772'
  on-tertiary-container: '#795100'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffe083'
  primary-fixed-dim: '#eec200'
  on-primary-fixed: '#231b00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#ffddb0'
  tertiary-fixed-dim: '#ffba46'
  on-tertiary-fixed: '#281800'
  on-tertiary-fixed-variant: '#614000'
  background: '#fff8f5'
  on-background: '#1e1b19'
  surface-variant: '#e9e1dd'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  price-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  price-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system blends the ultra-dense utility and transaction efficiency of Southeast Asian C2C marketplaces with the disciplined typography, crisp micro-borders, and restrained spatial rhythm of modern component design. It eliminates the visual chaos and flashing banners typically associated with classifieds, replacing them with warm, trustworthy clarity.

The aesthetic philosophy centers on **Warm Precision**:
- **Tone:** Transparent, thrifty yet premium, reliable, and approachable.
- **Visual Style:** Minimalist structure meets tactile warmth. Crisp neutral borders and stark white surfaces float over a delicate warm-cream foundation, preventing eye fatigue during lengthy browsing sessions.
- **Vietnamese Typographic Harmony:** Built around tall glyph metrics and generous line-heights to support stacking diacritics (dấu thanh) naturally without clipping or crowding.

## Colors

The palette delivers visual warmth alongside immediate commercial legibility.

- **Primary Canvas & Surfaces:** The page canvas is anchored on `#FFFBEB` (Warm Cream), establishing an organic, welcoming marketplace background. Surfaces, product cards, and modal sheets default to `#FFFFFF` (Pure White) to isolate product photography cleanly.
- **Primary Accent (`#FACC15` / `#FDE047`):** Represents optimism and neighborhood exchange. Used for high-level call-to-actions, cart badges, and selected navigation states. Primary interactive surfaces pair strictly with `#1C1917` text to maintain WCAG AA contrast.
- **Price & Urgency Accent (`#EA580C`):** Reserved exclusively for commercial pricing figures (₫ VND), flash discounts, and primary conversion triggers within the checkout flow.
- **Neutrals & Borders:** Body text leverages `#1C1917` (Stone 900) for sharp readability. Secondary labels use `#78716C` (Stone 500). Structural card borders employ `#E7E5E4` (Stone 200) with warm tinted variants (`#FEF08A` / Yellow 200) for active selection states and verified seller highlights.

## Typography

The typography relies entirely on **Inter** across all roles, configured with extended line heights (`1.4`–`1.6`) to prevent multi-level Vietnamese accents (e.g., ử, ể, ồ) from overlapping with preceding baselines or bounding containers.

- **Numbers & Currencies:** Tabular figures (`tnum`) must be enabled on all pricing displays (`price-lg`, `price-md`) to ensure aligned vertical scanning in checkout breakdowns and feeds.
- **Editorial vs Listing Hierarchy:** Product titles use `headline-sm` with a 2-line clamp (`-webkit-line-clamp: 2`). Badges and item status tags enforce `label-sm` with slightly widened letter-spacing for glanceable parsing.

## Layout & Spacing

The layout balances density with visual breathability through a structured fluid grid:
- **Desktop (1024px+):** 12-column layout, max container width of 1200px, 16px (`gutter`) column gaps, and 24px (`margin`) outer boundaries. Product listing matrices render strictly in 4 or 5 columns.
- **Mobile (<768px):** 2-column uniform product stream with compressed 8px gutters (`gutter-mobile`) and 12px horizontal canvas inset (`margin-mobile`), mirroring high-density C2C conversion layouts while keeping thumb-reach controls accessible.
- **Component Rhythms:** Internal card paddings follow `space-md` (12px), chip lists run with `space-xs` (4px) to `space-sm` (8px) gaps, and section blocks stack using `space-xl` (32px).

## Elevation & Depth

Visual hierarchy uses a refined hybrid of **low-contrast micro-outlines** and **warm ambient shadows**:

- **Level 0 (Flat / Canvas):** Applied to the `#FFFBEB` background and inline flat content areas.
- **Level 1 (Resting Cards):** Pure white background (`#FFFFFF`), bounded by a 1px border of `#E7E5E4`. Rendered with a warm, subtle shadow: `0 1px 3px 0 rgba(28, 25, 23, 0.04), 0 1px 2px -1px rgba(28, 25, 23, 0.04)`.
- **Level 2 (Hover & Floating Elements):** Active product cards on pointer hover and persistent quick-action bars transition to: `0 4px 12px -2px rgba(28, 25, 23, 0.08), 0 2px 6px -2px rgba(28, 25, 23, 0.04)` with a border shift to `#FEF08A`.
- **Level 3 (Overlays & Drawers):** Bottom checkout sheets, negotiation dialogs, and image lightboxes use an ambient drop shadow `0 20px 25px -5px rgba(28, 25, 23, 0.12)` accompanied by a backdrop blur (`backdrop-blur-sm`) over a 40% `#1C1917` scrim.

## Shapes

The design system standardizes on an 8px (`0.5rem`) base radius for structural containers and inputs, instilling a contemporary, tailored look.

- **Cards, Modals & Containers:** Standard 8px (`rounded-md` / base).
- **Secondary Actions & Inputs:** Standard 8px radius to keep form lines crisp and aligned.
- **Badges & Condition Tags:** Full pill radius (`9999px`) to immediately distinguish contextual metadata from clickable rect-linear action buttons.
- **Avatars:** Circular (`9999px`) for individual C2C sellers; rounded 8px for verified business/mall profiles.

## Components

### Buttons
- **Primary:** Background `#FACC15`, text `#1C1917`, font weight 600, border radius 8px. Subtle inner shadow highlight. Hover state shifts to `#FDE047`. Focus ring: 2px offset with `#CA8A04`.
- **Buy / Checkout (Urgent):** Background `#EA580C`, text `#FFFFFF`, font weight 600.
- **Outline / Ghost:** Background transparent, border 1px solid `#E7E5E4`, text `#1C1917`. On hover, background shifts to `#FEF9C3` with text `#854D0E`.
- **Icon Buttons:** Fixed 36x36px or 40x40px dimensions, rounded-md (8px), border 1px solid `#E7E5E4`, subtle hover fill with `#F5F5F4`.

### Condition Badges (Pills)
- Pill-shaped (`rounded-full`), padding 2px 10px, typography `label-sm`.
- **Mới 99% / Gần như mới:** Background `#ECFDF5`, text `#047857`, border 1px solid `#A7F3D0`.
- **Mới 90%:** Background `#EFF6FF`, text `#1D4ED8`, border 1px solid `#BFDBFE`.
- **Đã qua sử dụng:** Background `#F5F5F4`, text `#57534E`, border 1px solid `#E7E5E4`.

### Cards (Product Listing)
- Pure white background (`#FFFFFF`), 1px border `#E7E5E4`, 8px corner radius.
- Ratio-locked 1:1 image container with `overflow-hidden` and top-edge rounded framing.
- Image overlay hosts condition badge on top-left, location pill (e.g., 'TP. Hồ Chí Minh') on bottom-left.
- Content body: Item title (2 lines max), price display in `#EA580C` (`price-md`), relative post time (e.g., '2 giờ trước') in `#A8A29E`.

### Input Fields & Search
- Minimalist height: 40px (desktop), 44px (touch).
- Background `#FFFFFF`, border 1px solid `#E7E5E4`, 8px radius, text `body-md`.
- Focus ring: 2px border `#FACC15` without heavy outer glows.
- Search bar incorporates a leading search glyph in `#A8A29E` and an integrated quick-clear icon button.

### Checkboxes & Radios
- Checkbox: 18x18px, 4px radius, border 1px solid `#D6D3D1`. When checked, fills `#FACC15` with `#1C1917` checkmark icon.
- Radio: 18x18px circle, filled state features a 6px centered dot of `#1C1917` over `#FACC15`.

### Seller Profile Snippet & Chat Bar
- Seller Card: Horizontal dock featuring 44px avatar, seller star rating, response rate ('Phản hồi: 98%'), and a ghost 'Chat ngay' button.
- Floating Offer/Action Bar (Mobile): Fixed bottom dock with frosted glass backdrop (`rgba(255, 251, 235, 0.9)`), containing split actions: 1 icon button (Chat), 1 secondary outline button (Trả giá / Make Offer), and 1 expanded primary button (Mua ngay / Buy Now).