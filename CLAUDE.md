# KiddieSketch — Shopify Store Toolkit

This repo is NOT the Shopify theme. It's the management toolkit for the KiddieSketch Shopify store.

## What this repo holds
- `/theme-customizations/` — Custom Liquid snippets and CSS overrides for the store
- `/scripts/` — Automation scripts (inventory, pricing, SEO, analytics)
- `/assets/` — Brand assets, image templates, marketing materials
- `/docs/` — Store documentation, SOPs, operational guides

## The actual store
- Platform: Shopify
- Managed through: Shopify Admin
- Theme sync: Use Shopify CLI (`shopify theme pull` / `shopify theme push`)

## How this repo works with the store
1. Pull current theme with Shopify CLI into a local working copy
2. Make customizations here (Liquid snippets, CSS)
3. Test changes with `shopify theme dev`
4. Push approved changes back to the live theme
5. Scripts in `/scripts/` automate recurring store tasks

## Codex Bridge Protocol

Claude is the ARCHITECT. Codex is the REVIEWER.

### When to hand off to Codex:
- Before pushing theme changes to production
- After writing automation scripts
- Any code that touches inventory or pricing
