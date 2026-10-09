<?php
/**
 * Just enough WordPress / WooCommerce for the plugin's express + expiry code to
 * run in php-wasm (see ../test-php-plugin.mjs). Each test sets $GLOBALS['fake_wc']
 * pieces it needs and loads the REAL plugin files through paydef_test_load().
 */

define( 'ABSPATH', '/tmp/' );
define( 'MINUTE_IN_SECONDS', 60 );

$GLOBALS['fake_actions'] = array();
function add_action( ...$a ) { $GLOBALS['fake_actions'][] = $a; }
function add_filter( ...$a ) {}
function plugin_dir_path( $f ) { return dirname( $f ) . '/'; }
function plugin_basename( $f ) { return basename( $f ); }
function __( $s, $d = '' ) { return $s; }
function sanitize_text_field( $s ) { return trim( (string) $s ); }
function sanitize_email( $s ) { return trim( (string) $s ); }
function sanitize_key( $s ) { return strtolower( preg_replace( '/[^a-z0-9_\-]/i', '', (string) $s ) ); }
function sanitize_title( $s ) { return trim( preg_replace( '/[^a-z0-9]+/', '-', strtolower( (string) $s ) ), '-' ); }
function remove_accents( $s ) { return $s; }
function is_email( $s ) { return false !== filter_var( $s, FILTER_VALIDATE_EMAIL ); }
function wc_format_decimal( $n, $dp = false ) { return false === $dp ? (string) $n : number_format( (float) $n, $dp, '.', '' ); }
function current_time( $t ) { return '2026-10-09 12:00:00'; }
function get_option( $k, $d = false ) { return $d; }
function get_transient( $k ) { return false; }
function as_schedule_single_action( ...$a ) { $GLOBALS['fake_scheduled'][] = $a; }
function wc_get_order( $id ) { return isset( $GLOBALS['fake_orders'][ $id ] ) ? $GLOBALS['fake_orders'][ $id ] : false; }
function is_wp_error( $x ) { return $x instanceof WP_Error; }

class WP_Error {
	public $code, $message, $data;
	public function __construct( $code = '', $message = '', $data = '' ) { $this->code = $code; $this->message = $message; $this->data = $data; }
	public function get_error_message() { return $this->message; }
	public function get_error_data() { return $this->data; }
}

class WC_Order {
	public $props = array( 'status' => 'pending', 'total' => '20.00', 'transaction_id' => '', 'date_paid' => null );
	public $meta  = array();
	public $notes = array();
	public $saves = 0;
	private $id;
	public function __construct( $id = 1 ) { $this->id = $id; $GLOBALS['fake_orders'][ $id ] = $this; }
	public function get_id() { return $this->id; }
	public function __call( $name, $args ) {
		if ( 0 === strpos( $name, 'set_' ) ) { $this->props[ substr( $name, 4 ) ] = $args[0]; return; }
		if ( 0 === strpos( $name, 'get_' ) ) { $k = substr( $name, 4 ); return isset( $this->props[ $k ] ) ? $this->props[ $k ] : ''; }
		throw new Exception( "WC_Order stub: no $name" );
	}
	public function get_meta( $k ) { return isset( $this->meta[ $k ] ) ? $this->meta[ $k ] : ''; }
	public function update_meta_data( $k, $v ) { $this->meta[ $k ] = $v; }
	public function delete_meta_data( $k ) { unset( $this->meta[ $k ] ); }
	public function has_status( $s ) { return in_array( $this->props['status'], (array) $s, true ); }
	public function update_status( $s, $note = '' ) { $this->props['status'] = $s; $this->notes[] = $note; $this->saves++; }
	public function payment_complete( $txid = '' ) {
		if ( $txid ) { $this->props['transaction_id'] = $txid; }
		$this->props['date_paid'] = '2026-10-09 12:00:00';
		$this->props['status']    = 'processing';
		$this->saves++;
	}
	public function get_items( $type = 'line_item' ) { return array(); }
	public function remove_item( $id ) {}
	public function remove_order_items( $type = null ) {}
	public function add_item( $item ) {}
	public function calculate_totals( $taxes = true ) {}
	public function get_coupon_codes() { return array(); }
	public function add_order_note( $n ) { $this->notes[] = $n; }
	public function save() { $this->saves++; return $this->id; }
}

class Fake_Session {
	public $data = array();
	public function get( $k ) { return isset( $this->data[ $k ] ) ? $this->data[ $k ] : null; }
	public function set( $k, $v ) { $this->data[ $k ] = $v; }
}

class Fake_Cart {
	public function is_empty() { return false; }
	public function calculate_totals() {}
}

/** WC_Checkout::create_order reuses the order in order_awaiting_payment. */
class Fake_Checkout {
	public $seen_awaiting = array();
	public function create_order( $data ) {
		$awaiting              = WC()->session->get( 'order_awaiting_payment' );
		$this->seen_awaiting[] = $awaiting;
		if ( $awaiting && wc_get_order( $awaiting ) ) {
			return (int) $awaiting; // resumed
		}
		$order = new WC_Order( 100 + count( $this->seen_awaiting ) );
		return $order->get_id();
	}
}

class Fake_Countries {
	public function get_states( $cc ) { return 'US' === $cc ? array( 'CA' => 'California', 'AK' => 'Alaska', 'NY' => 'New York' ) : array(); }
	public function get_shipping_countries() { return array( 'US' => 'United States', 'NL' => 'Netherlands' ); }
}

class Fake_Client {
	public $tx;
	public function get_transaction( $id ) { return $this->tx; }
}

class Fake_Gateway {
	public $client;
	public function __construct() { $this->client = new Fake_Client(); }
	public function get_client() { return $this->client; }
}

class Fake_Gateways {
	public $list = array();
	public function payment_gateways() { return $this->list; }
}

class Fake_WC {
	public $session, $cart, $checkout, $countries, $gateways;
	public function __construct() {
		$this->session   = new Fake_Session();
		$this->cart      = new Fake_Cart();
		$this->checkout  = new Fake_Checkout();
		$this->countries = new Fake_Countries();
		$this->gateways  = new Fake_Gateways();
	}
	public function checkout() { return $this->checkout; }
	public function payment_gateways() { return $this->gateways; }
}

$GLOBALS['fake_wc'] = new Fake_WC();
function WC() { return $GLOBALS['fake_wc']; }

function paydef_test_load() {
	$plugin = '/repo/plugin woo/paydef-woocommerce/';
	require_once $plugin . 'paydef-woocommerce.php';
	require_once $plugin . 'includes/class-paydef-express.php';
	require_once $plugin . 'includes/class-paydef-smart-buttons.php';
}

function check( $cond, $msg ) {
	if ( ! $cond ) {
		echo "FAIL: $msg\n";
		exit( 1 );
	}
}
