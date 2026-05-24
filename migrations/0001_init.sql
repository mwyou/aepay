CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_order_no TEXT NOT NULL UNIQUE,
  amount TEXT NOT NULL,
  pay_amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notify_url TEXT NOT NULL,
  return_url TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  pay_type TEXT NOT NULL DEFAULT 'alipay',
  compat_type TEXT NOT NULL DEFAULT 'json',
  collect_account TEXT NOT NULL DEFAULT '',
  alipay_trade_no TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_pending_pay_amount
  ON orders(pay_amount)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'alipay',
  provider_trade_no TEXT NOT NULL,
  amount TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  payer TEXT NOT NULL DEFAULT '',
  collect_account TEXT NOT NULL DEFAULT '',
  raw_payload TEXT NOT NULL DEFAULT '',
  matched_order_id INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_trade_no)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_matched_order_id ON payment_events(matched_order_id);

CREATE TABLE IF NOT EXISTS alipay_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'poll',
  provider_trade_no TEXT NOT NULL UNIQUE,
  amount TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  payer TEXT NOT NULL DEFAULT '',
  collect_account TEXT NOT NULL DEFAULT '',
  raw_payload TEXT NOT NULL DEFAULT '',
  matched_order_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alipay_transactions_paid_at ON alipay_transactions(paid_at);
CREATE INDEX IF NOT EXISTS idx_alipay_transactions_matched_order_id ON alipay_transactions(matched_order_id);

CREATE TABLE IF NOT EXISTS polling_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'alipay',
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_polling_runs_started_at ON polling_runs(started_at);

CREATE TABLE IF NOT EXISTS callback_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  notify_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_body TEXT NOT NULL DEFAULT '',
  response_status INTEGER,
  response_body TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_callback_logs_order_id ON callback_logs(order_id);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_settings (key, value, is_secret, updated_at) VALUES
  ('app_name', 'AEPay', 0, datetime('now')),
  ('time_zone', 'Asia/Shanghai', 0, datetime('now')),
  ('order_expire_minutes', '15', 0, datetime('now')),
  ('amount_variance_cents', '30', 0, datetime('now')),
  ('collect_account', '', 0, datetime('now')),
  ('collect_qr_image_url', '', 0, datetime('now')),
  ('payment_page_theme', 'alipay', 0, datetime('now')),
  ('alipay_poll_enabled', 'false', 0, datetime('now')),
  ('alipay_poll_method', 'alipay.data.bill.accountlog.query', 0, datetime('now')),
  ('alipay_poll_window_minutes', '10', 0, datetime('now')),
  ('alipay_gateway_url', 'https://openapi.alipay.com/gateway.do', 0, datetime('now')),
  ('alipay_app_id', '', 1, datetime('now')),
  ('alipay_app_public_key_text', '', 0, datetime('now')),
  ('alipay_private_key_pem', '', 1, datetime('now')),
  ('alipay_notify_verify_required', 'true', 0, datetime('now')),
  ('alipay_public_key_pem', '', 1, datetime('now')),
  ('callback_secret', '', 1, datetime('now')),
  ('merchant_api_key', '', 1, datetime('now')),
  ('epay_pid', '1000', 0, datetime('now')),
  ('epay_key', '', 1, datetime('now')),
  ('admin_username', '', 1, datetime('now')),
  ('admin_password_hash', '', 1, datetime('now'));
