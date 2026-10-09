<?php
// Fix 5: a cart express order must never resume the checkout page's
// order_awaiting_payment order, and must not take that pointer over.
require __DIR__ . '/wc-stubs.php';
paydef_test_load();

$checkout_order = new WC_Order( 55 ); // the pending order the checkout page created
WC()->session->set( 'order_awaiting_payment', 55 );

$order = Paydef_Express::create_from_cart();
check( $order instanceof WC_Order, 'express order created' );
check( 55 !== $order->get_id(), 'express order resumed the checkout page order' );
check( array( null ) === WC()->checkout()->seen_awaiting, 'create_order saw order_awaiting_payment' );
check( '1' === $order->get_meta( '_paydef_express' ), 'express order marked' );
// the checkout page keeps resuming its own order, never the express one
check( 55 === WC()->session->get( 'order_awaiting_payment' ), 'order_awaiting_payment not restored' );
check( '' === $checkout_order->get_meta( '_paydef_express' ), 'checkout order untouched' );

// no pointer before → none after
WC()->session->set( 'order_awaiting_payment', null );
$order2 = Paydef_Express::create_from_cart();
check( null === WC()->session->get( 'order_awaiting_payment' ), 'pointer left on the express order' );
check( $order2->get_id() !== $order->get_id(), 'second express order is new' );

echo "PASS test-express-cart-awaiting\n";
