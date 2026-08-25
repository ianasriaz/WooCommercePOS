# WooCommerce POS System Architecture

## 1. High-Level Data Flow

```text
+-------------------+        +----------------------------+
| Cashier / User    | ----> | React POS UI               |
| Barcode Scanner   |        | PosTerminal / PosDashboard |
+-------------------+        +-------------+--------------+
                                            |
                                            v
                              +----------------------------+
                              | Zustand Store Layer        |
                              | - Auth                     |
                              | - Catalog                  |
                              | - Cart                     |
                              | - Sync metadata            |
                              | - Settings                 |
                              +-------------+--------------+
                                            |
                                            v
                              +----------------------------+
                              | IndexedDB persistence      |
                              | idb-keyval + Zustand       |
                              +-------------+--------------+
                                            |
                                            v
                              +----------------------------+
                              | WooCommerce REST API v3    |
                              | /wp-json/wc/v3/products    |
                              | /wp-json/wc/v3/orders      |
                              | /wp-json/wc/v3/variations |
                              +----------------------------+
```

---

## 2. Architectural Layers

### UI Layer
The UI layer is composed of the main POS interface and supporting components:
- dashboard for stock and sales visibility
- checkout terminal for cashier workflow
- barcode receipt and barcode generator modals
- auth gate and protected routes

### State Layer
State is managed by Zustand stores. The primary responsibilities are:

#### Auth store
- licenses / login state
- WooCommerce credentials
- store metadata
- hydration state

#### POS store
- product catalog cache
- cart contents
- variation cache
- printed barcode tracking
- last sync timestamp
- hydration markers

#### Supporting data model patterns
- `cart` stores product + variation metadata for line item generation
- `products` remain the main catalog source after sync
- `variationsCache` reduces repeated variation fetches

### Persistence Layer
The persistence layer is backed by IndexedDB rather than `localStorage`.

This is critical because product catalogs can exceed browser storage limits and POS workflows require reliable stale-state recovery. The project relies on Zustand persistence middleware with `createJSONStorage(() => idbStorage)`.

---

## 3. State Management Breakdown

### Cart state
Tracks the current sale items with:
- product id
- variation id
- quantity
- display price
- variation attributes for display and checkout

This cart is the operational source of truth during a live transaction.

### Catalog / inventory state
Tracks the synced WooCommerce product catalog and the latest timestamp used for delta syncs.

Important behaviors:
- full sync loads the catalog from the remote API
- delta sync updates only changed products or stock data
- product state is stored locally for offline and fast retrieval

### Sync state
Tracks the last successful sync timestamp and sync status metadata. This is used to determine whether a full sync or a delta refresh is needed.

### Auth state
Stores connection details required to talk to WooCommerce:
- store URL
- consumer key
- consumer secret
- store name
- login status

### Settings state
The current project structure suggests settings are light and localized, but the design intent is to support payment types, customer info, and editing-specific state without splitting too broadly.

---

## 4. WooCommerce REST API v3 Integration

### Core patterns
The API client in `src/api/wc-client.js` is responsible for all requests to:
- `/wp-json/wc/v3/products`
- `/wp-json/wc/v3/products/{id}/variations`
- `/wp-json/wc/v3/orders`
- custom POS stock endpoints and fallback stock routes

### HTTP Basic Auth pattern
Requests are configured with Basic Auth using:

```js
const authToken = btoa(`${wcConsumerKey}:${wcConsumerSecret}`);
config.headers.Authorization = `Basic ${authToken}`;
```

This is applied through an Axios request interceptor.

### Parallel catalog sync pattern
The project uses a two-step product sync pattern:

1. Fetch the first page to determine total page count via `X-WP-TotalPages`
2. Fetch remaining pages in parallel or with controlled batching as needed

This is designed to reduce catalog sync time dramatically relative to sequential page-by-page fetching.

### Delta stock sync mechanism
The client supports a `modified_after` pattern with a last sync timestamp, allowing a catalog refresh to fetch only updated products relative to the last successful sync. This is the data flow used to keep the dashboard and stock state current without re-fetching the entire catalog in every refresh.

---

## 5. Checkout Payload Schema

The order creation flow posts to `/wc/v3/orders` with payloads shaped like:

```json
{
  "status": "completed",
  "set_paid": true,
  "payment_method": "pos_cash",
  "payment_method_title": "In-Store Cash",
  "billing": {
    "first_name": "John",
    "email": "john@example.com",
    "phone": "123456789"
  },
  "line_items": [
    {
      "product_id": 101,
      "variation_id": null,
      "quantity": 2
    }
  ],
  "fee_lines": [
    {
      "name": "POS Discount",
      "total": "-50"
    }
  ]
}
```

### Important notes
- `line_items` represent product and variation quantities in the sale
- `fee_lines` are used for discount injection patterns
- `billing` info can be populated with customer details when available
- payment type is normalized via a payment mapping layer

### Stock validation and checkout safety
Before checkout, the app validates stock and product availability to reduce invalid sales and protect against out-of-stock edge cases.

---

## 6. Operational Model

The project is designed as a high-speed retail interface with minimal friction:
- product lookup is optimized for SKU and barcode search
- cart operations are kept local and instantaneous
- stock and dashboard updates are refreshed in the background
- checkout is direct and API-driven for immediate order creation

This makes the POS suitable for a store environment where latency and cashier speed directly impact usability.
