# AI Instructions & Architecture Map
**Project**: WooCommerce Point Of Sale (POS) MVP
**Stack**: React, Vite, Zustand (State), React Router DOM
**Design Language**: Custom Inline CSS + Minimal CSS resets. True Dark Mode (Black/Zinc/Slate backgrounds) with Striking Emerald Green (`#10b981`, `#059669`) accents.

---

## 🏗️ System Architecture

This application is a highly-optimized, client-side Point of Sale terminal designed to connect directly to a WooCommerce store via the REST API. 

### 1. State Management & Persistence (`src/store/`)
- **IndexedDB over LocalStorage**: WooCommerce catalogs can have thousands of products, which easily exceed the 5MB `localStorage` limit. We implemented `idb-storage.js` (an IndexedDB adapter wrapper) to provide unlimited, fast, asynchronous offline caching for the Zustand stores.
- `useAuthStore.js`: Manages the API keys (`wcConsumerKey`, `wcConsumerSecret`) and `storeUrl`. It applies a basic `btoa` obfuscation layer to prevent keys from sitting in plain text in browser dev tools.
- `usePosStore.js`: Manages the POS state—the `products` catalog cache, the active `cart`, the currently selected customer, and cart totals. 

### 2. WooCommerce API Layer (`src/api/wc-client.js`)
- Interfaces directly with `/wp-json/wc/v3`.
- **Concurrent Catalog Loading**: The `fetchProducts` function calculates the total pages of products via the `X-WP-TotalPages` header, and then fires concurrent `Promise.all` requests to fetch the entire store catalog in parallel. This reduces sync time from 15+ seconds down to ~1-2 seconds.
- Uses `btoa(consumerKey + ':' + consumerSecret)` for HTTP Basic Auth headers.

### 3. Application Flow & Routing (`src/App.jsx`)
- **`/login` (`Login.jsx`)**: Minimalist, dark-mode connection screen. Validates the WooCommerce URL and API credentials before allowing entry.
- **`/` (`PosDashboard.jsx`)**: The high-level dashboard. Displays "Revenue Today", a snapshot of the 24 most recently added products (sorted locally by `date_created`), and a feed of recent orders (with time & date). Contains buttons to "Sync Data" and start a "New Sale".
- **`/sale` (`PosTerminal.jsx`)**: The core checkout terminal.

### 4. POS Terminal Core (`PosTerminal.jsx`)
- **Barcode & Search Logic**: Handles barcode scanning natively by searching the `sku` field. It supports a pure WooCommerce architecture (using Barcode Studio to assign physical barcodes to the SKU field). The search engine uses a fallback WooCommerce REST API query for variations (which are not loaded upfront to save memory).
- **Variations**: Fully supports WooCommerce Variable Products. Selecting a variable product opens a modal displaying real-time stock and the specific variation SKU/Barcode.
- **Checkout Execution**: Posts orders directly to `/wc/v3/orders`. Supports custom POS discount amounts (submitted as negative fee lines). Automatically sets the channel to `pos`, processes the payment (cash/bank), applies a generic `pos-customer` if no customer is selected, and updates local state to trigger the receipt modal.
- **Keyboard Shortcuts**: `F1` focuses search, `F2` for Cash Payment, `F3` for Bank Transfer, `F9` to Execute Checkout.

### 5. Layout & UI (`src/components/Layout.jsx`)
- Wraps the Dashboard.
- Features a highly minimalist header containing the Store Name, a "Toggle Fullscreen" button (using native `document.documentElement.requestFullscreen()`), a Settings modal, and a Sign Out button (with a browser `confirm` prompt to prevent accidental logouts).
- Unused screens (Inventory, Sales History) have been strictly eradicated to keep the MVP lean and fast.

### 6. Architectural Roadmap (SaaS Transition)
- **Supabase Standalone Mode**: Future architecture will decouple the UI from WooCommerce entirely, using Supabase as the Single Source of Truth (SSOT).
- WooCommerce will be treated as an optional sync engine via Edge Functions/Webhooks, rather than a direct UI dependency.
- **Offline-First Resilience**: Imminent upgrades include WebSocket-based stock sync and background worker pre-fetching for variations to eliminate all server-side latency during barcode scans.

---

## 🚨 AI Coding Rules & Context for this project

When assisting with this codebase, adhere strictly to the following rules:

1. **NO UI BLOAT**: This is an MVP. Do not add complex navigation menus, sidebars, or additional screens unless explicitly requested by the user. The UI must remain focused exclusively on the Dashboard and the Terminal.
2. **MAINTAIN DESIGN SYSTEM**: We are using custom Inline CSS and a dark-mode theme. Do not install TailwindCSS or MaterialUI. Stick to the `T` object theme tokens (e.g., `T.surface`, `T.accent`, `T.ink`) defined locally in the files.
3. **NO LOCALSTORAGE**: Never use `localStorage` or `sessionStorage`. All persistent data must go through the Zustand stores which are wired to IndexedDB (`idb-storage.js`) to prevent quota limits.
4. **OPTIMIZE FOR SPEED**: The POS is designed for cashiers. It must feel instantaneous. Avoid unnecessary re-renders, use `useMemo` for heavy catalog filtering, and avoid making blocking network requests on every keystroke. 
5. **KEEP IT STANDALONE**: The React app should remain a completely decoupled SPA that communicates via the REST API. Do not write WordPress/PHP code unless modifying the Barcode Bridge plugin specifically.

---

## 🕒 Recent Updates & Architecture Evolutions (July 2026)

- **Sync Architecture**: The single "Sync" button has been deprecated in favor of a dual-button cluster logic: **Sync Stock** (Delta Sync) and **Sync Inventory** (Full catalog rebuild). 
- **Dashboard Consistency**: The POS Dashboard now fully leverages the Delta Sync engine to quickly fetch stock updates without blocking or re-fetching the entire catalog.
- **Checkout Refinements**: The POS now supports manual Discount injections during checkout (mapped to WC Fee Lines). The customer details pane was fixed to prevent input overflow (`box-sizing`).
- **Barcode Workflow Shift**: The `woocommerce-pos-barcode-bridge` PHP plugin was permanently deleted. The architecture shifted to natively support "Barcode Studio" workflows where generated barcode numbers are saved directly into the WooCommerce `sku` field, which the POS queries natively.
- **Variations API Optimization**: Added `sku` to the allowed `_fields` payload when fetching variations, ensuring SKUs render correctly in the variations popup.
- **Search Fallback Engine**: Updated the real-time search bar to support "Enter to Server Search" for variation SKUs (since variations are not cached locally upfront).
- **Repository Documentation & Presentation**: Generated a comprehensive `README.md` containing feature breakdowns, tech stack badge summaries, system architecture diagrams (Mermaid), keyboard shortcut mappings, and installation guides for external developers & recruiters.

