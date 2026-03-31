# KiddieSketch Store Toolkit

Management toolkit for the KiddieSketch Shopify store. Theme customizations, automation scripts, brand assets, and operational docs.

## Structure

```
KiddieSketch/
├── theme-customizations/    # Liquid snippets and CSS overrides
│   ├── liquid-snippets/     # Custom .liquid files
│   └── css-overrides/       # Custom CSS
├── scripts/                 # Automation (inventory, pricing, SEO)
├── assets/                  # Brand materials and templates
│   ├── brand/               # Logos, colors, fonts
│   └── templates/           # Image and marketing templates
├── docs/                    # SOPs and documentation
└── .handoff/                # Codex Bridge protocol
```

## Getting Started

### Prerequisites
- [Shopify CLI](https://shopify.dev/docs/themes/tools/cli)
- Node.js 18+
- Store access

### Theme Development
```bash
# Pull current live theme
shopify theme pull --store kiddiesketch.myshopify.com

# Start local dev server
shopify theme dev

# Push changes to live
shopify theme push
```

## Scripts

Scripts in `/scripts/` automate store operations. Run with Node.js:

```bash
node scripts/seo-audit.js
node scripts/inventory-check.js
```
