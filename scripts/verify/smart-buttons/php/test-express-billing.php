<?php
// Fix 6: billing that PayDef derived from PayPal's address follows every later
// shipping change (billing-based tax must use the current address); billing
// the buyer typed is never overwritten.
require __DIR__ . '/wc-stubs.php';
paydef_test_load();

$order = new WC_Order( 7 );
$r = Paydef_Express::apply_paypal_address( $order, array( 'countryCode' => 'US', 'state' => 'CA', 'postalCode' => '90001', 'city' => 'Los Angeles' ) );
check( true === $r['ok'], 'first address accepted' );
check( 'CA' === $order->get_billing_state() && 'Los Angeles' === $order->get_billing_city(), 'billing set from the first address' );
check( '' !== (string) $order->get_meta( '_paydef_express_billing' ), 'billing marked as express-derived' );

$r = Paydef_Express::apply_paypal_address( $order, array( 'countryCode' => 'US', 'state' => 'NY', 'postalCode' => '10001', 'city' => 'New York' ) );
check( true === $r['ok'], 'second address accepted' );
check( 'NY' === $order->get_shipping_state(), 'shipping follows' );
check( 'NY' === $order->get_billing_state(), 'billing kept the first PayPal address' );
check( '10001' === $order->get_billing_postcode() && 'New York' === $order->get_billing_city() && 'US' === $order->get_billing_country(), 'billing fully updated' );

// a rejected address changes nothing
$r = Paydef_Express::apply_paypal_address( $order, array( 'countryCode' => 'FR', 'state' => '', 'postalCode' => '75001', 'city' => 'Paris' ) );
check( false === $r['ok'] && 'NY' === $order->get_billing_state(), 'rejected address left billing alone' );

// billing the buyer typed is never overwritten
$typed = new WC_Order( 8 );
$typed->set_billing_country( 'NL' );
$typed->set_billing_city( 'Amsterdam' );
$typed->set_billing_postcode( '1011' );
Paydef_Express::apply_paypal_address( $typed, array( 'countryCode' => 'US', 'state' => 'AK', 'postalCode' => '99801', 'city' => 'Juneau' ) );
Paydef_Express::apply_paypal_address( $typed, array( 'countryCode' => 'US', 'state' => 'CA', 'postalCode' => '90001', 'city' => 'Los Angeles' ) );
check( 'NL' === $typed->get_billing_country() && 'Amsterdam' === $typed->get_billing_city() && '1011' === $typed->get_billing_postcode(), 'typed billing overwritten' );
check( '' === (string) $typed->get_meta( '_paydef_express_billing' ), 'typed billing marked as express' );
check( 'CA' === $typed->get_shipping_state(), 'shipping still follows PayPal' );

echo "PASS test-express-billing\n";
