# Design Guidelines — Amethyst Nexus Theme

## Core Rules
- Dark-only UI — no light mode, no flat white surfaces
- Glass-morphism panels (backdrop-blur, semi-transparent backgrounds)
- Purple/violet primary accents — never use default Tailwind blues
- OKLCH color space for all custom colors
- Threat-level semantic colors: critical (red), high (orange), medium (yellow), low (blue), info (gray)

## Fonts
- Space Grotesk — headings and titles
- Inter — body text and UI labels
- JetBrains Mono — hashes, agent IDs, JSON, rule IDs, code blocks

## Layout
- Optimized for ultrawide SOC monitors (up to 2400px)
- Dense but readable dashboards
- DashboardLayout with sidebar navigation (client/src/components/DashboardLayout.tsx)
- GlassPanel component for all card/panel containers (client/src/components/shared/GlassPanel.tsx)

## Component Library
- shadcn/ui components in client/src/components/ui/
- Shared components: PageHeader, StatCard, ChartSkeleton, TableSkeleton, RawJsonViewer, ThreatBadge, ExportButton, RefreshControl
- Always check existing components before creating new ones

## Do NOT
- Invent new colors or themes
- Use bright colors or flat white surfaces
- Use default Tailwind blues
- Hardcode light theme styles
- If styling is unclear, reuse Amethyst Nexus tokens verbatim from index.css