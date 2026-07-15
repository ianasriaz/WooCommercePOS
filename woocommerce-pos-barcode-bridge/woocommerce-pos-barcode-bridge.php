<?php
/**
 * Plugin Name: WooCommerce POS Barcode Bridge
 * Description: Adds barcode management for WooCommerce products and variations, exposes barcode via REST, supports bulk generation, and prints labels for POS usage.
 * Version: 1.0.0
 * Author: Your Team
 */

if (!defined('ABSPATH')) {
    exit;
}

final class WC_POS_Barcode_Bridge {
    const META_KEY = '_pos_barcode';

    public function __construct() {
        add_action('woocommerce_product_options_inventory_product_data', array($this, 'render_product_barcode_field'));
        add_action('woocommerce_process_product_meta', array($this, 'save_product_barcode_field'));
        add_action('woocommerce_process_product_meta', array($this, 'ensure_product_sku'), 20);

        add_action('woocommerce_variation_options_inventory', array($this, 'render_variation_barcode_field'), 10, 3);
        add_action('woocommerce_save_product_variation', array($this, 'save_variation_barcode_field'), 10, 2);
        add_action('woocommerce_save_product_variation', array($this, 'ensure_variation_sku'), 20, 2);

        add_filter('woocommerce_rest_prepare_product_object', array($this, 'inject_product_barcode_into_rest'), 10, 3);
        add_filter('woocommerce_rest_prepare_product_variation_object', array($this, 'inject_variation_barcode_into_rest'), 10, 3);

        add_filter('manage_edit-product_columns', array($this, 'add_barcode_column'));
        add_action('manage_product_posts_custom_column', array($this, 'render_barcode_column'), 10, 2);

        add_filter('bulk_actions-edit-product', array($this, 'register_bulk_actions'));
        add_filter('handle_bulk_actions-edit-product', array($this, 'handle_bulk_actions'), 10, 3);
        add_action('admin_notices', array($this, 'render_bulk_action_notice'));

        add_action('admin_menu', array($this, 'register_admin_pages'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_print_assets'));
    }

    public function render_product_barcode_field() {
        woocommerce_wp_text_input(array(
            'id' => self::META_KEY,
            'label' => __('POS Barcode', 'wc-pos-barcode-bridge'),
            'description' => __('Unique barcode for this product. Use this for scanner-based POS lookup.', 'wc-pos-barcode-bridge'),
            'desc_tip' => true,
            'value' => get_post_meta(get_the_ID(), self::META_KEY, true),
        ));
    }

    public function save_product_barcode_field($product_id) {
        if (!isset($_POST[self::META_KEY])) {
            return;
        }

        $raw_value = wp_unslash($_POST[self::META_KEY]);
        $barcode = $this->sanitize_barcode($raw_value);

        if ($barcode === '') {
            delete_post_meta($product_id, self::META_KEY);
            return;
        }

        if ($this->barcode_exists($barcode, $product_id)) {
            WC_Admin_Meta_Boxes::add_error(__('POS Barcode must be unique across products and variations.', 'wc-pos-barcode-bridge'));
            return;
        }

        update_post_meta($product_id, self::META_KEY, $barcode);
    }

    public function render_variation_barcode_field($loop, $variation_data, $variation) {
        woocommerce_wp_text_input(array(
            'id' => self::META_KEY . '[' . $loop . ']',
            'label' => __('POS Barcode', 'wc-pos-barcode-bridge'),
            'description' => __('Unique barcode for this variation.', 'wc-pos-barcode-bridge'),
            'desc_tip' => true,
            'value' => get_post_meta($variation->ID, self::META_KEY, true),
        ));
    }

    public function save_variation_barcode_field($variation_id, $index) {
        if (!isset($_POST[self::META_KEY][$index])) {
            return;
        }

        $raw_value = wp_unslash($_POST[self::META_KEY][$index]);
        $barcode = $this->sanitize_barcode($raw_value);

        if ($barcode === '') {
            delete_post_meta($variation_id, self::META_KEY);
            return;
        }

        if ($this->barcode_exists($barcode, $variation_id)) {
            WC_Admin_Meta_Boxes::add_error(sprintf(
                __('Barcode "%s" is already used by another product or variation.', 'wc-pos-barcode-bridge'),
                esc_html($barcode)
            ));
            return;
        }

        update_post_meta($variation_id, self::META_KEY, $barcode);
    }

    public function ensure_product_sku($product_id) {
        $this->ensure_sku_exists((int) $product_id, false);
    }

    public function ensure_variation_sku($variation_id, $index) {
        $this->ensure_sku_exists((int) $variation_id, true);
    }

    public function inject_product_barcode_into_rest($response, $product, $request) {
        $response->data['barcode'] = $this->get_barcode_for_product($product->get_id());
        return $response;
    }

    public function inject_variation_barcode_into_rest($response, $variation, $request) {
        $response->data['barcode'] = $this->get_barcode_for_product($variation->get_id());
        return $response;
    }

    public function add_barcode_column($columns) {
        $columns['pos_barcode'] = __('POS Barcode', 'wc-pos-barcode-bridge');
        return $columns;
    }

    public function render_barcode_column($column, $post_id) {
        if ($column !== 'pos_barcode') {
            return;
        }

        $barcode = $this->get_barcode_for_product($post_id);
        echo $barcode ? esc_html($barcode) : '<span style="color:#999;">-</span>';
    }

    public function register_bulk_actions($actions) {
        $actions['generate_pos_barcodes'] = __('Generate Missing POS Barcodes', 'wc-pos-barcode-bridge');
        $actions['print_pos_labels'] = __('Print POS Labels', 'wc-pos-barcode-bridge');
        return $actions;
    }

    public function handle_bulk_actions($redirect_url, $action, $post_ids) {
        if ($action === 'generate_pos_barcodes') {
            $updated = 0;

            foreach ($post_ids as $post_id) {
                $updated += $this->generate_missing_barcodes_for_product_tree((int) $post_id);
            }

            return add_query_arg('generated_pos_barcodes', (string) $updated, $redirect_url);
        }

        if ($action === 'print_pos_labels') {
            $post_ids = array_map('intval', $post_ids);
            $post_ids = array_filter($post_ids);

            if (empty($post_ids)) {
                return $redirect_url;
            }

            $print_url = add_query_arg(
                array(
                    'page' => 'wc-pos-print-labels',
                    'product_ids' => implode(',', $post_ids),
                ),
                admin_url('admin.php')
            );

            return $print_url;
        }

        return $redirect_url;
    }

    public function render_bulk_action_notice() {
        if (!is_admin() || !isset($_GET['generated_pos_barcodes'])) {
            return;
        }

        $count = intval($_GET['generated_pos_barcodes']);

        printf(
            '<div class="notice notice-success is-dismissible"><p>%s</p></div>',
            esc_html(sprintf(__('Generated %d missing POS barcodes.', 'wc-pos-barcode-bridge'), $count))
        );
    }

    public function register_admin_pages() {
        add_submenu_page(
            null,
            __('Print POS Labels', 'wc-pos-barcode-bridge'),
            __('Print POS Labels', 'wc-pos-barcode-bridge'),
            'manage_woocommerce',
            'wc-pos-print-labels',
            array($this, 'render_print_labels_page')
        );
    }

    public function enqueue_print_assets($hook) {
        if ($hook !== 'admin_page_wc-pos-print-labels') {
            return;
        }

        wp_enqueue_script(
            'jsbarcode',
            'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
            array(),
            '3.11.6',
            true
        );
    }

    public function render_print_labels_page() {
        if (!current_user_can('manage_woocommerce')) {
            wp_die(__('You do not have permission to access this page.', 'wc-pos-barcode-bridge'));
        }

        $ids_param = isset($_GET['product_ids']) ? wp_unslash($_GET['product_ids']) : '';
        $product_ids = array_filter(array_map('intval', explode(',', (string) $ids_param)));

        if (empty($product_ids)) {
            echo '<div class="wrap"><h1>' . esc_html__('Print POS Labels', 'wc-pos-barcode-bridge') . '</h1><p>' . esc_html__('No products selected.', 'wc-pos-barcode-bridge') . '</p></div>';
            return;
        }

        $labels = array();

        foreach ($product_ids as $product_id) {
            $post = get_post($product_id);

            if (!$post || $post->post_type !== 'product') {
                continue;
            }

            $product = wc_get_product($product_id);

            if (!$product) {
                continue;
            }

            $labels[] = array(
                'name' => $product->get_name(),
                'sku' => $product->get_sku(),
                'barcode' => $this->ensure_barcode_exists($product_id),
            );

            if ($product->is_type('variable')) {
                $children = $product->get_children();

                foreach ($children as $child_id) {
                    $variation = wc_get_product($child_id);

                    if (!$variation) {
                        continue;
                    }

                    $labels[] = array(
                        'name' => $variation->get_name(),
                        'sku' => $variation->get_sku(),
                        'barcode' => $this->ensure_barcode_exists($variation->get_id()),
                    );
                }
            }
        }

        echo '<div class="wrap">';
        echo '<h1>' . esc_html__('Print POS Labels', 'wc-pos-barcode-bridge') . '</h1>';
        echo '<p><button type="button" class="button button-primary" onclick="window.print()">' . esc_html__('Print Labels', 'wc-pos-barcode-bridge') . '</button></p>';

        echo '<div class="wc-pos-label-grid">';

        foreach ($labels as $label) {
            echo '<div class="wc-pos-label">';
            echo '<p class="wc-pos-label-name">' . esc_html($label['name']) . '</p>';
            echo '<p class="wc-pos-label-sku">' . esc_html($label['sku'] ? 'SKU: ' . $label['sku'] : 'SKU: N/A') . '</p>';
            echo '<svg class="wc-pos-barcode" jsbarcode-format="CODE128" jsbarcode-value="' . esc_attr($label['barcode']) . '" jsbarcode-textmargin="0" jsbarcode-height="34" jsbarcode-width="1.4"></svg>';
            echo '<p class="wc-pos-barcode-value">' . esc_html($label['barcode']) . '</p>';
            echo '</div>';
        }

        echo '</div>';

        echo '<style>
            .wc-pos-label-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
                gap: 12px;
                margin-top: 12px;
            }
            .wc-pos-label {
                border: 1px solid #ddd;
                border-radius: 6px;
                background: #fff;
                padding: 10px;
            }
            .wc-pos-label-name {
                margin: 0 0 4px;
                font-size: 13px;
                font-weight: 600;
            }
            .wc-pos-label-sku,
            .wc-pos-barcode-value {
                margin: 0;
                font-size: 11px;
                color: #555;
            }
            .wc-pos-barcode {
                width: 100%;
                margin: 6px 0 2px;
            }
            @media print {
                #adminmenumain,
                #wpadminbar,
                #screen-meta,
                .notice,
                .wrap > p:first-of-type {
                    display: none !important;
                }
                #wpcontent,
                #wpbody-content,
                .wrap {
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .wc-pos-label {
                    break-inside: avoid;
                }
            }
        </style>';

        echo '<script>
            document.addEventListener("DOMContentLoaded", function () {
                if (window.JsBarcode) {
                    JsBarcode(".wc-pos-barcode").init();
                }
            });
        </script>';

        echo '</div>';
    }

    private function generate_missing_barcodes_for_product_tree($product_id) {
        $count = 0;
        $product = wc_get_product($product_id);

        if (!$product) {
            return $count;
        }

        $count += $this->ensure_barcode_exists($product_id) ? 1 : 0;

        if ($product->is_type('variable')) {
            $children = $product->get_children();

            foreach ($children as $child_id) {
                $count += $this->ensure_barcode_exists((int) $child_id) ? 1 : 0;
            }
        }

        return $count;
    }

    private function ensure_barcode_exists($post_id) {
        $existing = $this->get_barcode_for_product($post_id);

        if ($existing !== '') {
            return false;
        }

        $barcode = $this->generate_unique_barcode_for_id((int) $post_id);
        update_post_meta($post_id, self::META_KEY, $barcode);
        return true;
    }

    private function generate_unique_barcode_for_id($post_id) {
        // 12-digit base + 1 check digit => EAN-13 style numeric code.
        $base = '20' . str_pad((string) $post_id, 10, '0', STR_PAD_LEFT);
        $barcode = $base . $this->calculate_ean13_check_digit($base);

        // In case of collision (extremely unlikely), increment postfix logic.
        $counter = 1;

        while ($this->barcode_exists($barcode, $post_id)) {
            $alt_base = '21' . str_pad((string) ($post_id + $counter), 10, '0', STR_PAD_LEFT);
            $barcode = $alt_base . $this->calculate_ean13_check_digit($alt_base);
            $counter++;
        }

        return $barcode;
    }

    private function calculate_ean13_check_digit($base12) {
        $digits = str_split($base12);
        $sum = 0;

        foreach ($digits as $index => $digit) {
            $value = intval($digit);
            $sum += (($index + 1) % 2 === 0) ? $value * 3 : $value;
        }

        $remainder = $sum % 10;
        return (string) (($remainder === 0) ? 0 : 10 - $remainder);
    }

    private function get_barcode_for_product($post_id) {
        return (string) get_post_meta($post_id, self::META_KEY, true);
    }

    private function sanitize_barcode($barcode) {
        return preg_replace('/\s+/', '', sanitize_text_field((string) $barcode));
    }

    private function barcode_exists($barcode, $exclude_post_id = 0) {
        global $wpdb;

        $sql = "
            SELECT pm.post_id
            FROM {$wpdb->postmeta} pm
            INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
            WHERE pm.meta_key = %s
              AND pm.meta_value = %s
              AND p.post_type IN ('product', 'product_variation')
              AND p.post_status <> 'trash'
              AND pm.post_id <> %d
            LIMIT 1
        ";

        $found = $wpdb->get_var($wpdb->prepare($sql, self::META_KEY, $barcode, (int) $exclude_post_id));

        return !empty($found);
    }

    private function ensure_sku_exists($post_id, $is_variation = false) {
        $post_id = (int) $post_id;
        if ($post_id <= 0) {
            return;
        }

        $existing_sku = (string) get_post_meta($post_id, '_sku', true);
        if ($existing_sku !== '') {
            return;
        }

        $prefix = $is_variation ? 'POS-VAR-' : 'POS-';
        $base = $prefix . $post_id;
        $candidate = $base;
        $counter = 1;

        while (true) {
            $found_id = wc_get_product_id_by_sku($candidate);
            if (empty($found_id) || (int) $found_id === $post_id) {
                break;
            }

            $candidate = $base . '-' . $counter;
            $counter++;
        }

        update_post_meta($post_id, '_sku', $candidate);
    }
}

new WC_POS_Barcode_Bridge();
