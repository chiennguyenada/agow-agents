<?php
/**
 * Snippet: Fix Organization @type — Remove "Electrician"
 * Purpose: RankMath sets @type ["Electrician","Organization"] — wrong for B2B equipment distributor
 * Correct:  "Organization" — accurate for equipment distributor
 * Author:  Khoa (SEO Agent) — 2026-04-05
 * WPCode:  PHP Snippet | Run Everywhere | Active
 *
 * How: Filter RankMath's Organization schema node before output.
 * Note: If filter name doesn't work (RankMath version diff), use the ob approach below.
 */

// Method 1: RankMath schema filter (preferred)
add_filter( 'rank_math/schema/Organization', 'agow_fix_organization_type' );

function agow_fix_organization_type( $schema ) {
    if ( ! isset( $schema['@type'] ) ) return $schema;

    // Normalize to array, strip Electrician
    $types = array_values( array_filter(
        (array) $schema['@type'],
        fn( $t ) => $t !== 'Electrician'
    ) );

    // Ensure Organization remains
    if ( ! in_array( 'Organization', $types, true ) ) {
        $types[] = 'Organization';
    }

    // Unwrap single-item array
    $schema['@type'] = count( $types ) === 1 ? $types[0] : $types;

    // Add PostalAddress if missing
    if ( ! isset( $schema['address'] ) ) {
        $schema['address'] = [
            '@type'           => 'PostalAddress',
            'addressCountry'  => 'VN',
            'addressLocality' => 'Ho Chi Minh City',
        ];
    }

    // sameAs — link to B&R partner page (entity disambiguation)
    if ( ! isset( $schema['sameAs'] ) ) {
        $schema['sameAs'] = [ 'https://www.br-automation.com' ];
    }

    return $schema;
}

// Method 2: Fallback — patch JSON-LD output directly if filter above has no effect
add_filter( 'rank_math/json_ld', 'agow_patch_jsonld_organization', 99 );

function agow_patch_jsonld_organization( $data ) {
    foreach ( $data as $key => $node ) {
        if ( ! isset( $node['@type'] ) ) continue;
        $types = (array) $node['@type'];
        if ( in_array( 'Electrician', $types, true ) ) {
            $types = array_values( array_filter( $types, fn( $t ) => $t !== 'Electrician' ) );
            if ( empty( $types ) ) $types = [ 'Organization' ];
            $data[ $key ]['@type'] = count( $types ) === 1 ? $types[0] : $types;

            if ( ! isset( $data[ $key ]['address'] ) ) {
                $data[ $key ]['address'] = [
                    '@type'          => 'PostalAddress',
                    'addressCountry' => 'VN',
                    'addressLocality' => 'Ho Chi Minh City',
                ];
            }
        }
    }
    return $data;
}
