<?php
/**
 * Snippet: Product Schema for WooCommerce
 * Purpose: Inject Product JSON-LD schema on WC product pages
 * Author:  Khoa (SEO Agent) — 2026-04-05
 * Notes:   - RankMath does NOT generate Product schema for this site
 *          - Price hidden (POA) → Offer with priceSpecification description
 *          - SKU = WooCommerce SKU field (mã B&R)
 *          - Brand = "B&R Automation" mặc định, "Bachmann" cho Bachmann categories
 * WPCode:  PHP Snippet | Run Everywhere | Active
 */

add_action( 'wp_footer', 'agow_product_schema', 5 );

function agow_product_schema() {
    if ( ! is_product() ) return;

    global $product;
    if ( ! $product instanceof WC_Product ) {
        $product = wc_get_product( get_the_ID() );
    }
    if ( ! $product ) return;

    // --- Basic fields ---
    $name        = wp_strip_all_tags( $product->get_name() );
    $description = wp_strip_all_tags( $product->get_short_description() ?: $product->get_description() );
    $description = mb_substr( $description, 0, 500 );
    $url         = get_permalink( $product->get_id() );
    $sku         = $product->get_sku();
    $stock       = $product->is_in_stock()
                   ? 'https://schema.org/InStock'
                   : 'https://schema.org/OutOfStock';

    // --- Image ---
    $image_id  = $product->get_image_id();
    $image_url = $image_id
                 ? wp_get_attachment_url( $image_id )
                 : wc_placeholder_img_src();

    // --- Brand: B&R or Bachmann ---
    $brand_name = 'B&R Automation';
    $terms      = get_the_terms( $product->get_id(), 'product_cat' );
    $cat_slugs  = ( $terms && ! is_wp_error( $terms ) )
                  ? wp_list_pluck( $terms, 'slug' )
                  : [];
    if ( in_array( 'hang-bachmann', $cat_slugs, true )
      || in_array( 'plc-bachmann',  $cat_slugs, true ) ) {
        $brand_name = 'Bachmann';
    }

    // --- Build schema ---
    $schema = [
        '@context' => 'https://schema.org',
        '@type'    => 'Product',
        '@id'      => $url . '#product',
        'name'     => $name,
        'url'      => $url,
        'image'    => $image_url,
        'brand'    => [
            '@type' => 'Brand',
            'name'  => $brand_name,
        ],
        'offers'   => [
            '@type'         => 'Offer',
            'url'           => $url,
            'priceCurrency' => 'VND',
            'price'         => '0',
            'description'   => 'Liên hệ để được báo giá chính xác',
            'availability'  => $stock,
            'seller'        => [
                '@type' => 'Organization',
                'name'  => 'Agow Automation',
                'url'   => 'https://agowautomation.com',
            ],
        ],
    ];

    // Optional fields
    if ( $description ) {
        $schema['description'] = $description;
    }
    if ( $sku ) {
        $schema['sku']  = $sku;
        $schema['mpn']  = strtoupper( $sku ); // Model Part Number
    }

    // Category
    if ( $terms && ! is_wp_error( $terms ) ) {
        $schema['category'] = implode( ', ', wp_list_pluck( $terms, 'name' ) );
    }

    // Additional images (gallery)
    $gallery_ids = $product->get_gallery_image_ids();
    if ( ! empty( $gallery_ids ) ) {
        $images = [ $image_url ];
        foreach ( array_slice( $gallery_ids, 0, 4 ) as $gid ) {
            $img = wp_get_attachment_url( $gid );
            if ( $img ) $images[] = $img;
        }
        $schema['image'] = $images;
    }

    echo '<script type="application/ld+json">'
        . wp_json_encode( $schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES )
        . '</script>' . "\n";
}
