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
- **Barcode & Search Logic**: Handles barcode scanning natively. When a user types or a scanner inputs a string, it checks the local catalog array against `sku`, `id`, and custom meta fields.
- **Variations**: Fully supports WooCommerce Variable Products. Selecting a variable product opens a modal allowing the cashier to select the specific size/color before it enters the cart.
- **Checkout Execution**: Posts orders directly to `/wc/v3/orders`. Automatically sets the channel to `pos` or `in-store`, processes the payment (cash/bank), applies a generic `pos-customer` if no customer is selected, and updates the local state to trigger a success modal.
- **Keyboard Shortcuts**: `F2` for Cash Payment, `F3` for Bank Transfer, `F9` to Execute Checkout.

### 5. Layout & UI (`src/components/Layout.jsx`)
- Wraps the Dashboard.
- Features a highly minimalist header containing the Store Name, a "Toggle Fullscreen" button (using native `document.documentElement.requestFullscreen()`), a Settings modal, and a Sign Out button (with a browser `confirm` prompt to prevent accidental logouts).
- Unused screens (Inventory, Sales History) have been strictly eradicated to keep the MVP lean and fast.

### 6. WordPress Barcode Bridge Plugin
- Located in `woocommerce-pos-barcode-bridge/`. 
- This is a custom PHP plugin for the WordPress backend. It hooks into the WooCommerce REST API to ensure that custom fields (like `_barcode` or specialized SKU fields) are returned in the API responses so the React frontend can index and search them instantly.

---

## 🚨 AI Coding Rules & Context for this project

When assisting with this codebase, adhere strictly to the following rules:

1. **NO UI BLOAT**: This is an MVP. Do not add complex navigation menus, sidebars, or additional screens unless explicitly requested by the user. The UI must remain focused exclusively on the Dashboard and the Terminal.
2. **MAINTAIN DESIGN SYSTEM**: We are using custom Inline CSS and a dark-mode theme. Do not install TailwindCSS or MaterialUI. Stick to the `T` object theme tokens (e.g., `T.surface`, `T.accent`, `T.ink`) defined locally in the files.
3. **NO LOCALSTORAGE**: Never use `localStorage` or `sessionStorage`. All persistent data must go through the Zustand stores which are wired to IndexedDB (`idb-storage.js`) to prevent quota limits.
4. **OPTIMIZE FOR SPEED**: The POS is designed for cashiers. It must feel instantaneous. Avoid unnecessary re-renders, use `useMemo` for heavy catalog filtering, and avoid making blocking network requests on every keystroke. 
5. **KEEP IT STANDALONE**: The React app should remain a completely decoupled SPA that communicates via the REST API. Do not write WordPress/PHP code unless modifying the Barcode Bridge plugin specifically.
