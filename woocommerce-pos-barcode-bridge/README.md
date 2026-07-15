# WooCommerce POS Barcode Bridge

## What this mini-plugin adds

- Product barcode field in WooCommerce admin.
- Variation barcode field for variable products.
- Barcode uniqueness validation across products and variations.
- `barcode` field injected into WooCommerce REST responses for products and variations.
- Product list bulk action: generate missing barcodes.
- Product list bulk action: print barcode labels.

## Installation

1. Copy the folder `woocommerce-pos-barcode-bridge` to your store at:
   - `wp-content/plugins/woocommerce-pos-barcode-bridge`
2. In WordPress admin, open Plugins.
3. Activate **WooCommerce POS Barcode Bridge**.

## Store-side usage

### 1) Add barcode manually

- Edit a product: Product data -> Inventory -> POS Barcode.
- Edit a variation: Variation -> Inventory -> POS Barcode.

### 2) Generate missing barcodes in bulk

- Go to Products list.
- Select products.
- Bulk actions -> **Generate Missing POS Barcodes**.

Note: Variable products also generate missing barcodes for variations.

### 3) Print labels

- Go to Products list.
- Select products.
- Bulk actions -> **Print POS Labels**.
- Click **Print Labels** on the label page.

## REST API output

This plugin injects `barcode` into:

- `/wp-json/wc/v3/products`
- `/wp-json/wc/v3/products/{product_id}/variations`

## POS-side mapping recommendation

On POS, use this priority for scan match:

1. `barcode`
2. `sku`
3. `global_unique_id`

## Notes

- Auto-generated barcodes are EAN-13 style numeric values generated from product/variation IDs.
- Keep barcode values unique to avoid scan ambiguity.
