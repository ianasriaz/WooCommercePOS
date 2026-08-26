# WooCommerce POS Constitution

## Project Identity & Scope

This repository implements a client-side, offline-first WooCommerce Point of Sale (POS) web terminal designed for retail operations in a browser-first environment. The application is intended to act as a lightning-fast cashier interface connected to a WooCommerce store via the WooCommerce REST API v3.

### In Scope
- Browser-based point-of-sale workflow for cashier operations
- Product catalog browsing and fast search
- Barcode-first product lookup and item addition
- Cart management and quantity updates
- Local persistence for offline resilience using IndexedDB
- Order checkout via WooCommerce REST API
- Dashboard metrics such as revenue, stock alerts, and recent sales
- PWA installation support for kiosk-like usage

### Out of Scope
- Full ERP backend replacement
- Native mobile app packaging
- WordPress plugin development unless explicitly requested
- Non-essential UI frameworks or heavy component libraries

---

## Core Architecture Principles

### 1. Separation of concerns
The codebase must preserve a clear separation between:
- API integration layer
- state management and persistence
- UI components and pages
- utility and formatting helpers

### 2. API client responsibility
The WooCommerce client is the only layer allowed to speak directly to the WordPress/WooCommerce REST API. UI components and stores should not embed endpoint logic directly.

### 3. Zustand with IndexedDB persistence
State must be stored in Zustand stores and persisted through IndexedDB (via `idb-keyval`) rather than browser `localStorage`. This is required because catalog sizes exceed typical local storage limits and the POS requires reliable offline operation.

### 4. Single-responsibility hooks and modules
Custom hooks and helper modules must remain narrowly focused. For example, barcode scanning should not mix checkout logic, catalog sync logic, or persistence concerns.

### 5. Performance-first retail UX
The app is optimized for cashier speed and transactional clarity. Any work must prioritize responsive interactions, rapid catalog sync, low re-render churn, and minimal blocking network operations.

---

## Strict Styling & UX Rules

### 1. Tokenized inline styling
The design language is intentionally custom and dark-mode-first. Styling must use local token objects rather than external UI systems.

Example patterns consistent with the project:
- `T.surface`
- `T.accent`
- `T.ink`
- `T.line`
- `T.inkSoft`

### 2. High-speed cashier accessibility
The POS must remain fast to operate in physical retail environments:
- use keyboard shortcuts for common actions
- maintain direct focus behavior for search and barcode input
- avoid unnecessary overlays and multi-step flows
- surface status clearly without visual clutter

### 3. Barcode scanner input handling
Barcode entry must be treated as a primary input path. The scanner should resolve product and variation lookup as quickly as possible, without routing through heavy UI states or unnecessary fetch loops.

### 4. Zero unnecessary external UI dependencies
This project explicitly avoids large UI libraries or styling frameworks. Do not introduce Tailwind, MUI, Chakra, or equivalent design systems unless explicitly approved.

### 5. Minimalist UX focus
The MVP must remain focused on the cashier workflow. Do not add unrelated screens, sidebars, or decorative complexity without deliberate product direction.

---

### Rule 5: Mandatory Strict Changelog Self-Logging
Every single implementation, bug fix, UI change, architectural adjustment, or feature update made to this codebase **MUST ALWAYS** be recorded in `.docs/AI_CHANGELOG.md` immediately upon completion, even if the user does NOT explicitly ask to report it.

Each changelog entry must include:
- `## [YYYY-MM-DD] <Descriptive Title>`
- `### What changed`: Detailed bullet points of every UI, logic, or state change made
- `### Why`: Clear explanation of the root cause or feature requirement
- `### Files Touched`: Exact list of every file modified or created
- `### Verification Performed`: Build output and verification tests performed

### Rule 6: Pre-Flight Check
Before executing any core change, the AI must provide a short pre-flight plan with:
- What: the change being made
- Why: the purpose or root cause
- Files Touched: the exact files expected to change

The AI must pause for user confirmation before executing the actual core change.

---

## Operational Guardrails

### No localStorage usage
The app must not rely on `localStorage` or `sessionStorage` for persistence. Use Zustand stores backed by IndexedDB.

### No unnecessary package sprawl
Do not add heavyweight dependencies unless they solve a concrete operational need for POS reliability or cashier speed.

### Maintain offline-first behavior
The app should remain usable in degraded network conditions, especially for the cart and previously cached product state.

### Preserve developer clarity
New work should remain easy to reason about, easy to test, and easy to extend without introducing architecture drift.

---

## Decision Summary

This project should remain a disciplined, lightweight WooCommerce POS interface that prioritizes:
- cashier speed
- offline persistence
- stable WooCommerce integration
- direct operational clarity
- small, maintainable architecture

The long-term goal is a resilient POS system that can evolve without losing its speed-first retail character.
