<?php
/**
 * WordPress Playground test shop for PayPal Smart Buttons (run by blueprint.json).
 * US-only shop like the production ones:
 *   - zones: California (CA) flat $9 · Alaska (AK) no methods (= cannot ship) · United States flat $5
 *   - products: "Test Tire" simple $20 · "Test Rim" variable, Size 16 = $30 / 17 = $35
 *   - PayDef gateway pointed at the local fake gateway (wp-gateway.mjs) with test values,
 *     PayPal flow, Smart Buttons on checkout / cart / product.
 */
require_once '/wordpress/wp-load.php';

update_option( 'permalink_structure', '/%postname%/' );
update_option( 'woocommerce_currency', 'USD' );
update_option( 'woocommerce_default_country', 'US:CA' );
update_option( 'woocommerce_allowed_countries', 'specific' );
update_option( 'woocommerce_specific_allowed_countries', array( 'US' ) );
update_option( 'woocommerce_ship_to_countries', '' );
update_option( 'woocommerce_calc_taxes', 'no' );
update_option( 'woocommerce_coming_soon', 'no' );
update_option( 'woocommerce_store_pages_only', 'no' );
update_option( 'woocommerce_enable_guest_checkout', 'yes' );

WC_Install::create_pages();
wp_update_post( array( 'ID' => wc_get_page_id( 'checkout' ), 'post_content' => '[woocommerce_checkout]' ) );
wp_update_post( array( 'ID' => wc_get_page_id( 'cart' ), 'post_content' => '[woocommerce_cart]' ) );

function paydef_rig_zone( $name, $order, $location, $type, $cost ) {
	$zone = new WC_Shipping_Zone();
	$zone->set_zone_name( $name );
	$zone->set_zone_order( $order );
	$zone->add_location( $location, $type );
	$zone->save();
	if ( null !== $cost ) {
		$instance = $zone->add_shipping_method( 'flat_rate' );
		update_option(
			'woocommerce_flat_rate_' . $instance . '_settings',
			array( 'title' => 'Flat rate', 'tax_status' => 'none', 'cost' => $cost )
		);
	}
}
paydef_rig_zone( 'California', 1, 'US:CA', 'state', '9' );
paydef_rig_zone( 'Alaska (no shipping)', 2, 'US:AK', 'state', null );
paydef_rig_zone( 'United States', 3, 'US', 'country', '5' );

$tire = new WC_Product_Simple();
$tire->set_name( 'Test Tire' );
$tire->set_regular_price( '20.00' );
$tire->set_weight( '10' );
$tire->set_status( 'publish' );
$tire->save();

$size = new WC_Product_Attribute();
$size->set_name( 'Size' );
$size->set_options( array( '16', '17' ) );
$size->set_visible( true );
$size->set_variation( true );
$rim = new WC_Product_Variable();
$rim->set_name( 'Test Rim' );
$rim->set_attributes( array( $size ) );
$rim->set_status( 'publish' );
$rim_id = $rim->save();
foreach ( array( '16' => '30.00', '17' => '35.00' ) as $option => $price ) {
	$variation = new WC_Product_Variation();
	$variation->set_parent_id( $rim_id );
	$variation->set_attributes( array( 'size' => $option ) );
	$variation->set_regular_price( $price );
	$variation->set_status( 'publish' );
	$variation->save();
}
WC_Product_Variable::sync( $rim_id );

update_option(
	'woocommerce_paydef_settings',
	array(
		'enabled'        => 'yes',
		'title'          => 'PayPal',
		'description'    => 'Pay with PayPal.',
		'flow'           => 'paypal',
		'force_redirect' => 'no',
		'sb_checkout'    => 'yes',
		'sb_cart'        => 'yes',
		'sb_product'     => 'yes',
		'base_url'       => 'http://localhost:4200',
		'store_id'       => 'local-test-store',
		'api_key'        => 'local-test-key',
		'webhook_secret' => 'local-test-webhook-secret',
		'capture_status' => '',
		'debug'          => 'yes',
	)
);
flush_rewrite_rules();

echo 'PAYDEF-RIG tire=' . $tire->get_id() . ' rim=' . $rim_id . ' checkout=' . wc_get_page_id( 'checkout' );
