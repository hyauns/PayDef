<?php
// Fix 7: the 30-minute express check that finds the order paid must record the
// payment state the capture button / auth countdown rely on, exactly like
// paydef_wc_backfill_payment_state (captured / authorization id / auth expiry).
require __DIR__ . '/wc-stubs.php';
paydef_test_load();

$gateway = new Fake_Gateway();
WC()->gateways->list['paydef'] = $gateway;

function express_order( $id ) {
	$o = new WC_Order( $id );
	$o->update_meta_data( '_paydef_express', '1' );
	$o->update_meta_data( '_paydef_transaction_id', 'tx-' . $id );
	return $o;
}

// AUTHORIZED (manual-capture store): funds held
$o = express_order( 21 );
$gateway->client->tx = array(
	'current_status'   => 'AUTHORIZED',
	'authorization_id' => 'AUTH-21',
	'paypal_order_id'  => 'PP-21',
	'timestamps'       => array( 'authorization_expires_at' => '2026-10-16T12:00:00Z' ),
);
Paydef_Smart_Buttons::expire_express_order( 21 );
check( 'processing' === $o->get_status(), 'authorized order not processing' );
check( 'AUTH-21' === $o->get_meta( '_paydef_authorization_id' ), 'authorization id not stored' );
check( '2026-10-16 12:00:00' === $o->get_meta( '_paydef_auth_expires_at' ), 'auth expiry not stored' );
check( '' === (string) $o->get_meta( '_paydef_captured' ), 'authorized order marked captured' );
check( 'tx-21' === $o->get_transaction_id(), 'transaction id not stamped' );

// COMPLETED (instant capture): money in
$o = express_order( 22 );
$gateway->client->tx = array( 'current_status' => 'COMPLETED', 'paypal_order_id' => 'PP-22', 'paypal_capture_id' => 'CAP-22' );
Paydef_Smart_Buttons::expire_express_order( 22 );
check( 'processing' === $o->get_status() && $o->get_date_paid(), 'completed order not paid' );
check( '' !== (string) $o->get_meta( '_paydef_captured' ), 'captured not recorded' );
check( 'CAP-22' === $o->get_meta( '_paydef_paypal_capture_id' ), 'capture id not stored' );

// unpaid → cancelled, nothing recorded
$o = express_order( 23 );
$gateway->client->tx = array( 'current_status' => 'CREATED' );
Paydef_Smart_Buttons::expire_express_order( 23 );
check( 'cancelled' === $o->get_status(), 'unpaid order not cancelled' );
check( '' === (string) $o->get_meta( '_paydef_captured' ) && '' === (string) $o->get_meta( '_paydef_authorization_id' ), 'unpaid order got payment meta' );

echo "PASS test-express-expire-paid\n";
