export interface Env {
  DB: D1Database;
  APP_NAME: string;
  ORDER_EXPIRE_MINUTES: string;
  AMOUNT_VARIANCE_CENTS: string;
  COLLECT_ACCOUNT: string;
  COLLECT_QR_IMAGE_URL: string;
  CALLBACK_SECRET: string;
  MERCHANT_API_KEY: string;
  EPAY_PID: string;
  EPAY_KEY: string;
  ALIPAY_APP_ID: string;
  ALIPAY_PRIVATE_KEY_PEM: string;
  ALIPAY_PUBLIC_KEY_PEM: string;
  ALIPAY_NOTIFY_VERIFY_REQUIRED: string;
}

type OrderStatus = "pending" | "paid" | "expired" | "closed";

interface OrderRow {
  id: number;
  merchant_order_no: string;
  amount: string;
  pay_amount: string;
  status: OrderStatus;
  notify_url: string;
  return_url: string;
  subject: string;
  pay_type: string;
  compat_type: string;
  collect_account: string;
  alipay_trade_no: string;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface PaymentEventRow {
  id: number;
  provider: string;
  provider_trade_no: string;
  amount: string;
  paid_at: string;
  payer: string;
  collect_account: string;
  raw_payload: string;
  matched_order_id: number | null;
  created_at: string;
}

interface CallbackLogRow {
  id: number;
  order_id: number;
  notify_url: string;
  status: string;
  request_body: string;
  response_status: number | null;
  response_body: string;
  attempts: number;
  created_at: string;
  updated_at: string;
}

interface PollingRunRow {
  id: number;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  window_start: string;
  window_end: string;
  fetched_count: number;
  matched_count: number;
  error: string;
}

interface CreateOrderBody {
  merchant_order_no: string;
  amount: string;
  notify_url: string;
  subject?: string;
  return_url?: string;
  pay_type?: string;
  compat_type?: "json" | "epay";
}

interface ReconcileBody {
  alipay_trade_no: string;
  amount: string;
  paid_at: string;
  payer?: string;
  collect_account?: string;
}

interface TestOrderBody {
  amount: string;
}

interface AppConfig {
  appName: string;
  timeZone: string;
  orderExpireMinutes: string;
  amountVarianceCents: string;
  collectAccount: string;
  collectQrAssetId: string;
  collectQrImageUrl: string;
  paymentQrAssets: PaymentQrAssetRow[];
  paymentPageTheme: string;
  alipayPollEnabled: string;
  alipayPollMethod: string;
  alipayPollWindowMinutes: string;
  alipayGatewayUrl: string;
  alipayAppId: string;
  alipayAppPublicKeyText: string;
  alipayPrivateKeyPem: string;
  alipayNotifyVerifyRequired: string;
  alipayPublicKeyPem: string;
  callbackSecret: string;
  merchantApiKey: string;
  epayPid: string;
  epayKey: string;
  adminUsername: string;
  adminPasswordHash: string;
}

interface SettingRow {
  key: string;
  value: string;
  is_secret: number;
  updated_at: string;
}

interface PaymentQrAssetRow {
  id: number;
  name: string;
  source: string;
  value: string;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

interface AdminLoginAttemptRow {
  id: number;
  ip: string;
  username: string;
  success: number;
  created_at: string;
}

const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const ADMIN_PASSWORD_HASH_ITERATIONS = 100_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const config = await loadConfig(env);
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      if (url.pathname === "/" && request.method === "GET") return html(publicHome(config));
      if (url.pathname === "/health" && request.method === "GET") return json({ status: "ok" });
      if (url.pathname === "/admin/setup" && request.method === "GET") return await adminSetupPage(request, config);
      if (url.pathname === "/admin/setup" && request.method === "POST") return await adminSetup(request, env, config);
      if (url.pathname === "/admin/login" && request.method === "GET") return html(loginPage(config, url.searchParams.get("error") === "1"));
      if (url.pathname === "/admin/login" && request.method === "POST") return await adminLogin(request, env, config);
      if (url.pathname === "/admin/logout" && request.method === "POST") return adminLogout(request);
      if (url.pathname === "/admin" && request.method === "GET") return await requireAdmin(request, env, config, () => adminPage(request, env, config));
      if (url.pathname === "/api/admin/settings" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => updateSettings(request, env, config));
      }
      if (url.pathname === "/api/admin/alipay-key-check" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => alipayKeyCheck(config));
      }
      if (url.pathname === "/api/admin/payment-qr-assets" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => updatePaymentQrAssets(request, env, config));
      }
      if (url.pathname === "/api/admin/reset" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => resetSystem(request, env));
      }
      if (url.pathname === "/api/admin/polling/run" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => runPollingNow(env, config));
      }
      if (url.pathname === "/submit.php" && ["GET", "POST"].includes(request.method)) {
        return await epaySubmit(request, env, config);
      }
      if (url.pathname === "/mapi.php" && ["GET", "POST"].includes(request.method)) {
        return await epayMapi(request, env, config);
      }
      if (url.pathname === "/api.php" && ["GET", "POST"].includes(request.method)) {
        return await epayApi(request, env, config);
      }
      if (url.pathname.startsWith("/pay/") && request.method === "GET") {
        return await paymentPage(url.pathname.slice("/pay/".length), env, config);
      }
      if (url.pathname === "/api/orders" && request.method === "POST") {
        return await requireMerchant(request, config, () => createOrder(request, env, config));
      }
      if (url.pathname.startsWith("/api/orders/") && request.method === "GET") {
        return await getOrder(url.pathname.slice("/api/orders/".length), env, config, request.url);
      }
      if (url.pathname === "/api/admin/test-order" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => createTestOrder(request, env, config));
      }
      if (url.pathname === "/api/alipay/notify" && request.method === "POST") {
        return await alipayNotify(request, env, config);
      }
      if (url.pathname === "/api/admin/orders" && request.method === "GET") {
        return await requireAdmin(request, env, config, () => adminOrders(env));
      }
      return json({ detail: "Not found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ detail: error.message }, error.status);
      const message = error instanceof Error ? error.message : "Internal error";
      return json({ detail: message }, 500);
    }
  },
  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    const config = await loadConfig(env);
    await runAlipayPolling(env, config);
    await retryFailedCallbacks(env, config);
  },
};

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function loadConfig(env: Env): Promise<AppConfig> {
  const [rows, paymentQrAssets] = await Promise.all([
    env.DB.prepare("SELECT key, value, is_secret, updated_at FROM system_settings").all<SettingRow>(),
    loadPaymentQrAssets(env),
  ]);
  const settings = new Map(rows.results.map((row) => [row.key, row.value]));
  const collectQrAssetId = settings.get("collect_qr_asset_id") || "";
  const activeQrAsset = paymentQrAssets.find((asset) => String(asset.id) === collectQrAssetId) || null;
  return {
    appName: settings.get("app_name") || env.APP_NAME || "AEPay",
    timeZone: settings.get("time_zone") || "Asia/Shanghai",
    orderExpireMinutes: settings.get("order_expire_minutes") || env.ORDER_EXPIRE_MINUTES || "15",
    amountVarianceCents: settings.get("amount_variance_cents") || env.AMOUNT_VARIANCE_CENTS || "30",
    collectAccount: settings.get("collect_account") || env.COLLECT_ACCOUNT || "",
    collectQrAssetId: activeQrAsset ? String(activeQrAsset.id) : "",
    collectQrImageUrl: activeQrAsset?.value || settings.get("collect_qr_image_url") || env.COLLECT_QR_IMAGE_URL || "",
    paymentQrAssets,
    paymentPageTheme: settings.get("payment_page_theme") || "alipay",
    alipayPollEnabled: settings.get("alipay_poll_enabled") || "false",
    alipayPollMethod: settings.get("alipay_poll_method") || "alipay.data.bill.accountlog.query",
    alipayPollWindowMinutes: settings.get("alipay_poll_window_minutes") || "10",
    alipayGatewayUrl: settings.get("alipay_gateway_url") || "https://openapi.alipay.com/gateway.do",
    alipayAppId: settings.get("alipay_app_id") || env.ALIPAY_APP_ID || "",
    alipayAppPublicKeyText: settings.get("alipay_app_public_key_text") || "",
    alipayPrivateKeyPem: settings.get("alipay_private_key_pem") || env.ALIPAY_PRIVATE_KEY_PEM || "",
    alipayNotifyVerifyRequired:
      settings.get("alipay_notify_verify_required") || env.ALIPAY_NOTIFY_VERIFY_REQUIRED || "true",
    alipayPublicKeyPem: settings.get("alipay_public_key_pem") || env.ALIPAY_PUBLIC_KEY_PEM || "",
    callbackSecret: settings.get("callback_secret") || env.CALLBACK_SECRET || "",
    merchantApiKey: settings.get("merchant_api_key") || env.MERCHANT_API_KEY || "",
    epayPid: settings.get("epay_pid") || env.EPAY_PID || "1000",
    epayKey: settings.get("epay_key") || env.EPAY_KEY || "",
    adminUsername: settings.get("admin_username") || "",
    adminPasswordHash: settings.get("admin_password_hash") || "",
  };
}

type AdminTab = "overview" | "system" | "epay" | "payment" | "alipay" | "test";

function adminTabFromValue(value: string): AdminTab {
  if (value === "system" || value === "epay" || value === "payment" || value === "alipay" || value === "test") return value;
  return "overview";
}

function isSettingsTab(tab: AdminTab): boolean {
  return tab === "system" || tab === "epay" || tab === "payment" || tab === "alipay";
}

async function updateSettings(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const form = await request.formData();
  const now = new Date().toISOString();
  const alipayPublicKeyInput = stringForm(form, "alipay_public_key_text") || stringForm(form, "alipay_public_key_pem");
  const adminTab = adminTabFromValue(stringForm(form, "admin_tab"));
  const plain: Record<string, string> = {
    app_name: stringForm(form, "app_name"),
    time_zone: stringForm(form, "time_zone") || "Asia/Shanghai",
    order_expire_minutes: stringForm(form, "order_expire_minutes"),
    amount_variance_cents: stringForm(form, "amount_variance_cents"),
    collect_account: stringForm(form, "collect_account"),
    payment_page_theme: stringForm(form, "payment_page_theme") || "alipay",
    alipay_poll_enabled: stringForm(form, "alipay_poll_enabled") === "true" ? "true" : "false",
    alipay_poll_method: "alipay.data.bill.accountlog.query",
    alipay_poll_window_minutes: stringForm(form, "alipay_poll_window_minutes"),
    alipay_gateway_url: stringForm(form, "alipay_gateway_url"),
    alipay_app_public_key_text: stringForm(form, "alipay_app_public_key_text") || config.alipayAppPublicKeyText,
    alipay_notify_verify_required: stringForm(form, "alipay_notify_verify_required") === "true" ? "true" : "false",
    epay_pid: stringForm(form, "epay_pid"),
  };
  assertText(plain.app_name, "app_name");
  assertTimeZone(plain.time_zone);
  assertPositiveInteger(plain.order_expire_minutes, "order_expire_minutes");
  assertPositiveInteger(plain.amount_variance_cents, "amount_variance_cents");
  assertPaymentTheme(plain.payment_page_theme);
  assertPositiveInteger(plain.alipay_poll_window_minutes, "alipay_poll_window_minutes");
  if (plain.alipay_gateway_url) assertUrl(plain.alipay_gateway_url, "alipay_gateway_url");
  assertText(plain.epay_pid, "epay_pid");

  for (const [key, value] of Object.entries(plain)) {
    await upsertSetting(env, key, value, false, now);
  }

  const secrets = [
    "callback_secret",
    "merchant_api_key",
    "epay_key",
    "alipay_app_id",
    "alipay_private_key_pem",
    "alipay_public_key_pem",
  ];
  for (const key of secrets) {
    const value = key === "alipay_public_key_pem" ? normalizePublicKeyPem(alipayPublicKeyInput) : stringForm(form, key);
    if (value.trim() !== "") await upsertSetting(env, key, value, true, now);
  }

  const adminUsername = stringForm(form, "admin_username");
  const adminPassword = stringForm(form, "admin_password");
  if (adminUsername) await upsertSetting(env, "admin_username", adminUsername, true, now);
  if (adminPassword) {
    const usernameForHash = adminUsername || config.adminUsername;
    await upsertSetting(env, "admin_password_hash", await adminPasswordHash(usernameForHash, adminPassword), true, now);
  }

  if ((request.headers.get("accept") || "").includes("application/json") || request.headers.get("x-requested-with") === "fetch") {
    return json({ status: "success", message: "设置已保存", tab: adminTab });
  }

  const redirectUrl = new URL("/admin", request.url);
  if (adminTab !== "overview") redirectUrl.searchParams.set("tab", adminTab);
  return Response.redirect(redirectUrl, 302);
}

async function upsertSetting(env: Env, key: string, value: string, isSecret: boolean, updatedAt: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO system_settings (key, value, is_secret, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret, updated_at = excluded.updated_at`,
  )
    .bind(key, value, isSecret ? 1 : 0, updatedAt)
    .run();
}

async function updatePaymentQrAssets(request: Request, env: Env, _config: AppConfig): Promise<Response> {
  const form = await request.formData();
  const action = stringForm(form, "action") || "upload";
  if (action === "upload") {
    const asset = await createPaymentQrAssetFromForm(env, form);
    await setActivePaymentQrAsset(env, asset.id);
    return json({ ok: true, asset });
  }
  if (action === "select") {
    const assetId = paymentQrAssetIdFromForm(form);
    const asset = await findPaymentQrAsset(env, assetId);
    if (!asset) throw new HttpError(404, "收款码不存在");
    await setActivePaymentQrAsset(env, asset.id);
    return json({ ok: true, asset });
  }
  if (action === "delete") {
    const assetId = paymentQrAssetIdFromForm(form);
    const deleted = await deletePaymentQrAsset(env, assetId);
    return json({ ok: true, deleted });
  }
  throw new HttpError(400, "unsupported payment qr asset action");
}

async function createPaymentQrAssetFromForm(env: Env, form: FormData): Promise<PaymentQrAssetRow> {
  const name = stringForm(form, "payment_qr_name");
  const url = stringForm(form, "payment_qr_image_url");
  const file = form.get("payment_qr_image_file");
  const now = new Date().toISOString();

  if (file instanceof File && file.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      throw new HttpError(400, "收款码图片只支持 PNG、JPG 或 WebP");
    }
    if (file.size > 750_000) {
      throw new HttpError(400, "收款码图片不能超过 750KB");
    }
    const inserted = await env.DB.prepare(
      `INSERT INTO payment_qr_assets (name, source, value, mime_type, created_at, updated_at)
       VALUES (?, 'upload', ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        name || file.name || `收款码 ${now.slice(0, 10)}`,
        `data:${file.type};base64,${arrayBufferToBase64(await file.arrayBuffer())}`,
        file.type,
        now,
        now,
      )
      .first<PaymentQrAssetRow>();
    if (!inserted) throw new HttpError(500, "failed to save payment qr asset");
    return inserted;
  }

  if (url) {
    assertUrl(url, "payment_qr_image_url");
    const inserted = await env.DB.prepare(
      `INSERT INTO payment_qr_assets (name, source, value, mime_type, created_at, updated_at)
       VALUES (?, 'url', ?, ?, ?, ?) RETURNING *`,
    )
      .bind(name || `外链收款码 ${now.slice(0, 10)}`, url, "text/uri-list", now, now)
      .first<PaymentQrAssetRow>();
    if (!inserted) throw new HttpError(500, "failed to save payment qr asset");
    return inserted;
  }

  throw new HttpError(400, "请先选择图片文件或填写收款码 URL");
}

function paymentQrAssetIdFromForm(form: FormData): number {
  const value = stringForm(form, "id");
  assertPositiveInteger(value, "id");
  return Number.parseInt(value, 10);
}

async function findPaymentQrAsset(env: Env, id: number): Promise<PaymentQrAssetRow | null> {
  try {
    return await env.DB.prepare("SELECT * FROM payment_qr_assets WHERE id = ?").bind(id).first<PaymentQrAssetRow>();
  } catch {
    return null;
  }
}

async function setActivePaymentQrAsset(env: Env, assetId: number | null): Promise<void> {
  await upsertSetting(env, "collect_qr_asset_id", assetId ? String(assetId) : "", false, new Date().toISOString());
}

async function deletePaymentQrAsset(env: Env, assetId: number): Promise<{ id: number; activeId: number | null }> {
  const existing = await findPaymentQrAsset(env, assetId);
  if (!existing) throw new HttpError(404, "收款码不存在");
  await env.DB.prepare("DELETE FROM payment_qr_assets WHERE id = ?").bind(assetId).run();
  const activeSetting = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'collect_qr_asset_id'").first<{ value: string }>();
  const stillActive = activeSetting?.value === String(assetId);
  if (stillActive) {
    const next = await env.DB.prepare("SELECT id FROM payment_qr_assets ORDER BY updated_at DESC, id DESC LIMIT 1").first<{ id: number }>();
    await setActivePaymentQrAsset(env, next?.id ?? null);
    return { id: assetId, activeId: next?.id ?? null };
  }
  return { id: assetId, activeId: activeSetting?.value ? Number.parseInt(activeSetting.value, 10) : null };
}

async function resetSystem(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  if (stringForm(form, "confirm") !== "RESET") {
    throw new HttpError(400, "请输入 RESET 确认重置");
  }
  const keepAdmin = stringForm(form, "keep_admin") !== "false";
  const adminUsername = keepAdmin
    ? await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'admin_username'").first<{ value: string }>()
    : null;
  const adminPasswordHash = keepAdmin
    ? await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'admin_password_hash'").first<{ value: string }>()
    : null;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_login_attempts"),
    env.DB.prepare("DELETE FROM payment_qr_assets"),
    env.DB.prepare("DELETE FROM callback_logs"),
    env.DB.prepare("DELETE FROM payment_events"),
    env.DB.prepare("DELETE FROM alipay_transactions"),
    env.DB.prepare("DELETE FROM polling_runs"),
    env.DB.prepare("DELETE FROM orders"),
    env.DB.prepare("DELETE FROM system_settings"),
  ]);
  await seedDefaultSettings(env);
  if (keepAdmin && adminUsername?.value && adminPasswordHash?.value) {
    const now = new Date().toISOString();
    await upsertSetting(env, "admin_username", adminUsername.value, true, now);
    await upsertSetting(env, "admin_password_hash", adminPasswordHash.value, true, now);
  }
  return Response.redirect(new URL(keepAdmin ? "/admin?reset=1" : "/admin/setup", request.url), 302);
}

async function seedDefaultSettings(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const defaults: Array<[string, string, boolean]> = [
    ["app_name", "AEPay", false],
    ["time_zone", "Asia/Shanghai", false],
    ["order_expire_minutes", "15", false],
    ["amount_variance_cents", "30", false],
    ["collect_account", "", false],
    ["collect_qr_image_url", "", false],
    ["collect_qr_asset_id", "", false],
    ["payment_page_theme", "alipay", false],
    ["alipay_poll_enabled", "false", false],
    ["alipay_poll_method", "alipay.data.bill.accountlog.query", false],
    ["alipay_poll_window_minutes", "10", false],
    ["alipay_gateway_url", "https://openapi.alipay.com/gateway.do", false],
    ["alipay_app_id", "", true],
    ["alipay_app_public_key_text", "", false],
    ["alipay_private_key_pem", "", true],
    ["alipay_notify_verify_required", "true", false],
    ["alipay_public_key_pem", "", true],
    ["callback_secret", "", true],
    ["merchant_api_key", "", true],
    ["epay_pid", "1000", false],
    ["epay_key", "", true],
    ["admin_username", "", true],
    ["admin_password_hash", "", true],
  ];
  for (const [key, value, isSecret] of defaults) {
    await upsertSetting(env, key, value, isSecret, now);
  }
}

function stringForm(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function uploadedImageDataUrl(form: FormData, key: string): Promise<string> {
  const value = form.get(key);
  if (!(value instanceof File) || value.size === 0) return "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(value.type)) {
    throw new HttpError(400, "收款码图片只支持 PNG、JPG 或 WebP");
  }
  if (value.size > 750_000) {
    throw new HttpError(400, "收款码图片不能超过 750KB");
  }
  return `data:${value.type};base64,${arrayBufferToBase64(await value.arrayBuffer())}`;
}

async function loadPaymentQrAssets(env: Env): Promise<PaymentQrAssetRow[]> {
  try {
    const rows = await env.DB.prepare("SELECT * FROM payment_qr_assets ORDER BY updated_at DESC, id DESC").all<PaymentQrAssetRow>();
    return rows.results;
  } catch {
    return [];
  }
}

function normalizePublicKeyPem(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("-----BEGIN PUBLIC KEY-----")) return trimmed;
  const compact = trimmed.replace(/\s+/g, "");
  return `-----BEGIN PUBLIC KEY-----\n${compact.match(/.{1,64}/g)?.join("\n") || compact}\n-----END PUBLIC KEY-----`;
}

function normalizePrivateKeyPem(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("-----BEGIN PRIVATE KEY-----") || trimmed.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    return trimmed;
  }
  const compact = trimmed.replace(/\s+/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${compact.match(/.{1,64}/g)?.join("\n") || compact}\n-----END PRIVATE KEY-----`;
}

function isPkcs1PrivateKey(value: string): boolean {
  return value.includes("-----BEGIN RSA PRIVATE KEY-----");
}

async function createOrder(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<CreateOrderBody>(request);
  const order = await createOrderRecord(env, config, body);
  return json(orderResponse(config, order, request.url));
}

async function createOrderRecord(env: Env, config: AppConfig, body: CreateOrderBody): Promise<OrderRow> {
  assertText(body.merchant_order_no, "merchant_order_no");
  assertMoney(body.amount, "amount");
  assertUrl(body.notify_url, "notify_url");
  if (body.return_url) assertUrl(body.return_url, "return_url");

  await expirePendingOrders(env);

  const existing = await findOrder(env, body.merchant_order_no);
  if (existing) throw new HttpError(409, "merchant_order_no already exists");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + numberEnv(config.orderExpireMinutes, 15) * 60_000);
  const baseCents = moneyToCents(body.amount);
  const maxVariance = numberEnv(config.amountVarianceCents, 30);

  for (let cents = 1; cents <= maxVariance; cents += 1) {
    const payAmount = centsToMoney(baseCents + cents);
    try {
      await env.DB.prepare(
        `INSERT INTO orders
          (merchant_order_no, amount, pay_amount, status, notify_url, return_url, subject, pay_type, compat_type, collect_account, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          body.merchant_order_no,
          centsToMoney(baseCents),
          payAmount,
          body.notify_url,
          body.return_url ?? "",
          body.subject ?? "",
          body.pay_type ?? "alipay",
          body.compat_type ?? "json",
          config.collectAccount,
          expiresAt.toISOString(),
          now.toISOString(),
          now.toISOString(),
        )
        .run();
      const order = await findOrder(env, body.merchant_order_no);
      return order!;
    } catch (error) {
      if (!isSqlConflict(error)) throw error;
    }
  }

  throw new HttpError(409, "No available unique pay amount in the configured variance range");
}

async function getOrder(merchantOrderNo: string, env: Env, config: AppConfig, requestUrl: string): Promise<Response> {
  await expirePendingOrders(env);
  const order = await findOrder(env, decodeURIComponent(merchantOrderNo));
  if (!order) return json({ detail: "Order not found" }, 404);
  return json(orderResponse(config, order, requestUrl));
}

async function paymentPage(merchantOrderNo: string, env: Env, config: AppConfig): Promise<Response> {
  await expirePendingOrders(env);
  const order = await findOrder(env, decodeURIComponent(merchantOrderNo));
  if (!order) return html("<h1>订单不存在</h1>", 404);
  return html(renderPaymentPage(config, order));
}

async function epaySubmit(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const params = await requestParams(request);
  const order = await createEpayOrder(request, env, config, params);
  return Response.redirect(paymentUrl(request.url, order), 302);
}

async function epayMapi(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const params = await requestParams(request);
  const order = await createEpayOrder(request, env, config, params);
  return json({
    code: 1,
    msg: "success",
    trade_no: order.merchant_order_no,
    out_trade_no: order.merchant_order_no,
    payurl: paymentUrl(request.url, order),
    qrcode: config.collectQrImageUrl,
    money: order.pay_amount,
  });
}

async function epayApi(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const params = await requestParams(request);
  const act = params.act ?? "";
  if (!["order", "query"].includes(act)) return json({ code: -1, msg: "unsupported act" }, 400);
  assertEpayMerchant(config, params);
  if ((params.key ?? "") !== config.epayKey && !verifyEpaySign(params, config.epayKey)) {
    return json({ code: -1, msg: "invalid key or sign" }, 401);
  }
  const outTradeNo = params.out_trade_no ?? params.trade_no ?? "";
  assertText(outTradeNo, "out_trade_no");
  const order = await findOrder(env, outTradeNo);
  if (!order) return json({ code: -1, msg: "order not found" }, 404);
  return json({
    code: 1,
    msg: "success",
    pid: config.epayPid,
    trade_no: order.merchant_order_no,
    out_trade_no: order.merchant_order_no,
    type: order.pay_type,
    name: order.subject,
    money: order.amount,
    pay_amount: order.pay_amount,
    status: order.status,
    trade_status: order.status === "paid" ? "TRADE_SUCCESS" : "WAIT_BUYER_PAY",
    endtime: order.paid_at ?? "",
  });
}

async function createEpayOrder(request: Request, env: Env, config: AppConfig, params: Record<string, string>): Promise<OrderRow> {
  assertEpayMerchant(config, params);
  if (!verifyEpaySign(params, config.epayKey)) throw new HttpError(400, "invalid epay sign");
  const outTradeNo = params.out_trade_no ?? "";
  const money = params.money ?? "";
  const notifyUrl = params.notify_url ?? "";
  const returnUrl = params.return_url ?? "";
  const payType = params.type ?? "alipay";
  const name = params.name ?? "";
  assertMoney(money, "money");
  if (payType !== "alipay") throw new HttpError(400, "only alipay type is supported");
  const existing = await findOrder(env, outTradeNo);
  if (existing) {
    if (existing.amount !== centsToMoney(moneyToCents(money))) {
      throw new HttpError(409, "out_trade_no already exists with different money");
    }
    return existing;
  }
  const order = await createOrderRecord(env, config, {
    merchant_order_no: outTradeNo,
    amount: money,
    notify_url: notifyUrl,
    return_url: returnUrl,
    subject: name,
    pay_type: payType,
    compat_type: "epay",
  });
  if (params.clientip) {
    await env.DB.prepare("UPDATE orders SET updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), order.id)
      .run();
  }
  return order;
}

async function createTestOrder(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<TestOrderBody>(request);
  const amount = body.amount || "0.01";
  assertMoney(amount, "amount");
  const merchantOrderNo = `TEST-${Date.now()}`;
  const order = await createOrderRecord(env, config, {
    merchant_order_no: merchantOrderNo,
    amount,
    notify_url: `${new URL(request.url).origin}/health`,
    subject: "支付链路测试",
    pay_type: "alipay",
    compat_type: "json",
  });
  return json({
    merchant_order_no: order.merchant_order_no,
    amount: order.amount,
    pay_amount: order.pay_amount,
    payment_url: paymentUrl(request.url, order),
  });
}

async function alipayNotify(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const form = await request.formData();
  const params = formToRecord(form);
  const verifyRequired = config.alipayNotifyVerifyRequired === "true";
  if (verifyRequired && !(await verifyAlipayRsa2(params, config.alipayPublicKeyPem))) {
    return text("invalid-signature", 400);
  }
  assertAlipayNotifyContext(params, config);

  const tradeStatus = params.trade_status ?? "";
  if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(tradeStatus)) return text("success");
  const tradeNo = params.trade_no ?? "";
  const amount = params.total_amount ?? "";
  const paidAt = parseAlipayTime(params.gmt_payment ?? "");
  if (!tradeNo || !amount || !paidAt) return text("missing-fields", 400);

  const existingEvent = await env.DB.prepare(
    "SELECT id FROM payment_events WHERE provider = 'alipay' AND provider_trade_no = ?",
  )
    .bind(tradeNo)
    .first<{ id: number }>();

  const result = await recordPaymentEvent(
    env,
    config,
    {
      alipay_trade_no: tradeNo,
      amount,
      paid_at: paidAt,
      payer: params.buyer_logon_id ?? "",
      collect_account: params.seller_id ?? config.collectAccount,
    },
    params,
  );
  if (result.order && !existingEvent) await dispatchCallback(env, config, result.order);
  return text("success");
}

async function runPollingNow(env: Env, config: AppConfig): Promise<Response> {
  const result = await runAlipayPolling(env, config, true);
  return json(result);
}

async function runAlipayPolling(
  env: Env,
  config: AppConfig,
  force = false,
): Promise<{ status: string; fetched_count: number; matched_count: number; error?: string }> {
  const startedAt = new Date();
  const windowMinutes = numberEnv(config.alipayPollWindowMinutes, 10);
  const windowEnd = startedAt;
  const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60_000);
  let runId = 0;

  try {
    if (config.alipayPollEnabled !== "true" && !force) {
      return { status: "skipped", fetched_count: 0, matched_count: 0, error: "自动查账未开启" };
    }
    runId = await createPollingRun(env, "running", startedAt, windowStart, windowEnd);
    if (!config.alipayAppId || !config.alipayPrivateKeyPem) {
      throw new Error("支付宝查账未配置完整：APP_ID 和应用私钥都必填");
    }

    const rows = await queryAlipayTransactions(config, windowStart, windowEnd);
    let matchedCount = 0;
    for (const row of rows) {
      const result = await ingestPolledTransaction(env, config, row);
      if (result.order) matchedCount += 1;
    }
    await finishPollingRun(env, runId, "success", rows.length, matchedCount, "");
    return { status: "success", fetched_count: rows.length, matched_count: matchedCount };
  } catch (error) {
    const message = await friendlyPollingError(error instanceof Error ? error.message : "polling failed", config);
    await finishPollingRun(env, runId, "failed", 0, 0, message);
    return { status: "failed", fetched_count: 0, matched_count: 0, error: message };
  }
}

async function friendlyPollingError(message: string, config?: AppConfig): Promise<string> {
  if (message.toLowerCase().includes("invalid-signature")) {
    return await diagnoseAlipaySignatureFailure(config);
  }
  return message.split("&amp;")[0].slice(0, 300);
}

async function diagnoseAlipaySignatureFailure(config?: AppConfig): Promise<string> {
  if (!config) {
    return "支付宝接口验签失败：请检查当前应用私钥和支付宝开放平台中的应用公钥是否匹配。";
  }
  const result = await validateAlipayAppKeyPair(config);
  if (!result.ok) return `支付宝接口验签失败：${result.message}`;
  return "支付宝接口验签失败：本地应用密钥对已校验通过，请确认支付宝开放平台里保存的是当前应用公钥，并检查 app_id 是否对应当前应用。";
}

async function validateAlipayAppKeyPair(config: AppConfig): Promise<{ ok: boolean; message: string }> {
  const privateKeyPem = normalizePrivateKeyPem(config.alipayPrivateKeyPem);
  const appPublicKeyText = config.alipayAppPublicKeyText.trim();
  if (!privateKeyPem || !appPublicKeyText) {
    return { ok: false, message: "请先保存应用私钥和应用公钥，再把应用公钥同步到支付宝开放平台" };
  }
  if (isPkcs1PrivateKey(privateKeyPem)) {
    return { ok: false, message: "当前私钥是 PKCS#1 格式，Workers 只支持 PKCS#8；请用后台按钮重新生成应用密钥对并保存" };
  }
  try {
    const probe = { app_id: config.alipayAppId || "aepay", method: "aepay.key.check", timestamp: "2026-05-24 00:00:00" };
    const content = alipaySignContent(probe);
    const signature = await rsa2Sign(privateKeyPem, content);
    const verified = await verifyAlipayRsa2({ ...probe, sign: signature }, normalizePublicKeyPem(appPublicKeyText));
    if (!verified) {
      return { ok: false, message: "当前应用私钥和应用公钥不是同一对，请重新生成后保存，再把新的应用公钥同步到支付宝开放平台" };
    }
    return { ok: true, message: "本地应用密钥对校验通过" };
  } catch {
    return { ok: false, message: "应用私钥或应用公钥格式不正确，请重新生成后再保存" };
  }
}

async function alipayKeyCheck(config: AppConfig): Promise<Response> {
  const result = await validateAlipayAppKeyPair(config);
  return json({
    status: result.ok ? "success" : "failed",
    message: result.ok
      ? "本地应用密钥对校验通过；如果查账仍报验签失败，请确认支付宝开放平台里的应用公钥已经更新，并检查 app_id 是否对应当前应用。"
      : `本地应用密钥对校验失败：${result.message}`,
    app_id_present: Boolean(config.alipayAppId.trim()),
    private_key_present: Boolean(config.alipayPrivateKeyPem.trim()),
    app_public_key_present: Boolean(config.alipayAppPublicKeyText.trim()),
    private_key_preview: secretPreview(alipayPrivateKeyText(config.alipayPrivateKeyPem)),
    app_public_key_preview: secretPreview(config.alipayAppPublicKeyText),
  });
}

async function createPollingRun(
  env: Env,
  status: string,
  startedAt: Date,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const inserted = await env.DB.prepare(
    `INSERT INTO polling_runs (source, status, started_at, window_start, window_end)
     VALUES ('alipay', ?, ?, ?, ?) RETURNING id`,
  )
    .bind(status, startedAt.toISOString(), windowStart.toISOString(), windowEnd.toISOString())
    .first<{ id: number }>();
  return inserted?.id ?? 0;
}

async function finishPollingRun(
  env: Env,
  id: number,
  status: string,
  fetchedCount: number,
  matchedCount: number,
  error: string,
): Promise<void> {
  if (!id) return;
  await env.DB.prepare(
    `UPDATE polling_runs
     SET status = ?, finished_at = ?, fetched_count = ?, matched_count = ?, error = ?
     WHERE id = ?`,
  )
    .bind(status, new Date().toISOString(), fetchedCount, matchedCount, error.slice(0, 1000), id)
    .run();
}

interface PolledTransaction {
  provider_trade_no: string;
  amount: string;
  paid_at: string;
  payer: string;
  collect_account: string;
  raw_payload: unknown;
}

async function queryAlipayTransactions(config: AppConfig, start: Date, end: Date): Promise<PolledTransaction[]> {
  const payload = defaultAlipayPollPayload(config, start, end);
  const response = await alipayOpenApiRequest(config, config.alipayPollMethod, payload);
  return extractPolledTransactions(response);
}

function defaultAlipayPollPayload(config: AppConfig, start: Date, end: Date): Record<string, unknown> {
  if (config.alipayPollMethod === "alipay.data.bill.accountlog.query") {
    return {
      start_time: formatAlipayTime(start, config.timeZone),
      end_time: formatAlipayTime(end, config.timeZone),
      page_no: 1,
      page_size: 1000,
    };
  }
  return {
    start_time: formatAlipayTime(start, config.timeZone),
    end_time: formatAlipayTime(end, config.timeZone),
    page_no: 1,
    page_size: 100,
  };
}

async function alipayOpenApiRequest(
  config: AppConfig,
  method: string,
  bizContent: Record<string, unknown>,
): Promise<unknown> {
  const params: Record<string, string> = {
    app_id: config.alipayAppId,
    method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatAlipayTime(new Date(), config.timeZone),
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  };
  params.sign = await rsa2Sign(config.alipayPrivateKeyPem, alipaySignContent(params));

  const response = await fetch(config.alipayGatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const textBody = await response.text();
  if (!response.ok) throw new Error(`支付宝接口请求失败：HTTP ${response.status}`);
  let payload: unknown;
  try {
    payload = JSON.parse(textBody) as unknown;
  } catch {
    throw new Error("支付宝接口返回不是 JSON");
  }
  const error = alipayResponseError(payload);
  if (error) throw new Error(error);
  return payload;
}

function alipayResponseError(value: unknown): string {
  if (!isRecord(value)) return "";
  for (const nested of Object.values(value)) {
    if (!isRecord(nested)) continue;
    const code = typeof nested.code === "string" ? nested.code : "";
    if (code && code !== "10000") {
      const message = [nested.msg, nested.sub_code, nested.sub_msg]
        .filter((item): item is string => typeof item === "string" && item !== "")
        .join(" / ");
      return message || `支付宝接口返回错误码 ${code}`;
    }
  }
  return "";
}

function extractPolledTransactions(response: unknown): PolledTransaction[] {
  const rows = findTransactionRows(response);
  return rows.flatMap((row) => {
    const direction = stringField(row, ["direction"]);
    if (direction && !["收入", "in", "IN", "income", "CREDIT"].includes(direction)) return [];
    const tradeNo = stringField(row, [
      "account_log_id",
      "alipay_order_no",
      "trade_no",
      "provider_trade_no",
      "transaction_id",
      "order_no",
    ]);
    const amount = stringField(row, ["trans_amount", "in_amount", "amount", "total_amount", "pay_amount"]);
    const paidAt = stringField(row, ["trans_dt", "create_time", "paid_at", "pay_time", "gmt_payment"]);
    if (!tradeNo || !/^\d+(\.\d{1,2})?$/.test(amount) || moneyToCents(amount) <= 0 || !paidAt) return [];
    return [
      {
        provider_trade_no: tradeNo,
        amount: centsToMoney(moneyToCents(amount)),
        paid_at: normalizeDate(paidAt.includes("T") ? paidAt : paidAt.replace(" ", "T") + "+08:00", "paid_at"),
        payer: stringField(row, ["other_account", "opt_user_id", "buyer_user_id", "buyer_logon_id", "payer"]),
        collect_account: stringField(row, ["self_user_id", "seller_id", "collect_account"]),
        raw_payload: row,
      },
    ];
  });
}

function findTransactionRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) return [];
  for (const key of ["account_report_list", "trade_list", "detail_list", "bill_list", "records", "items", "list"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }
  for (const nested of Object.values(value)) {
    const rows = findTransactionRows(nested);
    if (rows.length > 0) return rows;
  }
  return [];
}

async function ingestPolledTransaction(
  env: Env,
  config: AppConfig,
  row: PolledTransaction,
): Promise<{ event: PaymentEventRow; order: OrderRow | null }> {
  const existingEvent = await env.DB.prepare(
    "SELECT id FROM payment_events WHERE provider = 'alipay' AND provider_trade_no = ?",
  )
    .bind(row.provider_trade_no)
    .first<{ id: number }>();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO alipay_transactions
      (source, provider_trade_no, amount, paid_at, payer, collect_account, raw_payload, created_at)
     VALUES ('poll', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.provider_trade_no,
      row.amount,
      row.paid_at,
      row.payer,
      row.collect_account,
      JSON.stringify(row.raw_payload),
      new Date().toISOString(),
    )
    .run();

  const result = await recordPaymentEvent(
    env,
    config,
    {
      alipay_trade_no: row.provider_trade_no,
      amount: row.amount,
      paid_at: row.paid_at,
      payer: row.payer,
      collect_account: row.collect_account,
    },
    row.raw_payload,
  );
  if (result.order && !existingEvent) await dispatchCallback(env, config, result.order);
  if (result.order) {
    await env.DB.prepare("UPDATE alipay_transactions SET matched_order_id = ? WHERE provider_trade_no = ?")
      .bind(result.order.id, row.provider_trade_no)
      .run();
  }
  return result;
}

async function recordPaymentEvent(
  env: Env,
  config: AppConfig,
  body: ReconcileBody,
  rawPayload: unknown,
): Promise<{ event: PaymentEventRow; order: OrderRow | null }> {
  assertText(body.alipay_trade_no, "alipay_trade_no");
  assertMoney(body.amount, "amount");
  const paidAt = normalizeDate(body.paid_at, "paid_at");

  const existing = await env.DB.prepare(
    "SELECT * FROM payment_events WHERE provider = 'alipay' AND provider_trade_no = ?",
  )
    .bind(body.alipay_trade_no)
    .first<PaymentEventRow>();
  if (existing) {
    const order = existing.matched_order_id ? await findOrderById(env, existing.matched_order_id) : null;
    return { event: existing, order };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO payment_events
      (provider, provider_trade_no, amount, paid_at, payer, collect_account, raw_payload, created_at)
     VALUES ('alipay', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      body.alipay_trade_no,
      centsToMoney(moneyToCents(body.amount)),
      paidAt,
      body.payer ?? "",
      body.collect_account ?? config.collectAccount,
      JSON.stringify(rawPayload),
      now,
    )
    .run();

  const event = (await env.DB.prepare(
    "SELECT * FROM payment_events WHERE provider = 'alipay' AND provider_trade_no = ?",
  )
    .bind(body.alipay_trade_no)
    .first<PaymentEventRow>())!;

  const order = await matchPendingOrder(env, config, event);
  if (order) {
    const updateResult = await env.DB.prepare(
      `UPDATE orders
       SET status = 'paid', alipay_trade_no = ?, paid_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(event.provider_trade_no, event.paid_at, now, order.id)
      .run();
    if ((updateResult.meta?.changes ?? 0) === 0) {
      return { event, order: null };
    }
    await env.DB.prepare("UPDATE payment_events SET matched_order_id = ? WHERE id = ?")
      .bind(order.id, event.id)
      .run();
    const paidOrder = (await findOrderById(env, order.id))!;
    const updatedEvent = (await env.DB.prepare("SELECT * FROM payment_events WHERE id = ?")
      .bind(event.id)
      .first<PaymentEventRow>())!;
    return { event: updatedEvent, order: paidOrder };
  }

  return { event, order: null };
}

async function matchPendingOrder(env: Env, config: AppConfig, event: PaymentEventRow): Promise<OrderRow | null> {
  await expirePendingOrders(env, event.paid_at);
  let query =
    "SELECT * FROM orders WHERE status = 'pending' AND pay_amount = ? AND created_at <= ? AND expires_at >= ?";
  const args: unknown[] = [event.amount, event.paid_at, event.paid_at];
  if (event.collect_account) {
    query += " AND collect_account = ?";
    args.push(event.collect_account);
  }
  query += " ORDER BY created_at ASC LIMIT 1";
  return env.DB.prepare(query).bind(...args).first<OrderRow>();
}

async function expirePendingOrders(env: Env, nowIso = new Date().toISOString()): Promise<void> {
  await env.DB.prepare("UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at < ?")
    .bind(nowIso, nowIso)
    .run();
}

async function dispatchCallback(env: Env, config: AppConfig, order: OrderRow): Promise<void> {
  const callback = await buildCallback(config, order);
  const now = new Date().toISOString();

  const inserted = await env.DB.prepare(
    `INSERT INTO callback_logs (order_id, notify_url, status, request_body, attempts, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, 0, ?, ?) RETURNING id`,
  )
    .bind(order.id, order.notify_url, callback.body, now, now)
    .first<{ id: number }>();
  if (!inserted) return;

  await sendCallbackAttempt(env, inserted.id, order.notify_url, callback.body, callback.headers);
}

async function retryFailedCallbacks(env: Env, config: AppConfig): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT * FROM callback_logs WHERE status = 'failed' AND attempts < 5 ORDER BY updated_at ASC LIMIT 20",
  ).all<CallbackLogRow>();
  for (const row of rows.results) {
    const order = await findOrderById(env, row.order_id);
    if (!order || order.status !== "paid") continue;
    const callback = await buildCallback(config, order);
    await sendCallbackAttempt(env, row.id, order.notify_url, callback.body, callback.headers);
  }
}

async function sendCallbackAttempt(
  env: Env,
  logId: number,
  notifyUrl: string,
  body: string,
  headers: HeadersInit,
): Promise<void> {
  let status = "failed";
  let responseStatus: number | null = null;
  let responseBody = "";
  try {
    const response = await fetch(notifyUrl, {
      method: "POST",
      headers,
      body,
    });
    responseStatus = response.status;
    responseBody = (await response.text()).slice(0, 2000);
    status = response.ok && responseBody.trim().toLowerCase() === "success" ? "success" : "failed";
  } catch (error) {
    responseBody = error instanceof Error ? error.message : "callback failed";
  }

  await env.DB.prepare(
    `UPDATE callback_logs
     SET status = ?, request_body = ?, response_status = ?, response_body = ?, attempts = attempts + 1, updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, body, responseStatus, responseBody, new Date().toISOString(), logId)
    .run();
}

async function buildCallback(config: AppConfig, order: OrderRow): Promise<{ body: string; headers: HeadersInit }> {
  if (order.compat_type === "epay") {
    const params: Record<string, string> = {
      pid: config.epayPid,
      trade_no: order.alipay_trade_no || order.merchant_order_no,
      out_trade_no: order.merchant_order_no,
      type: order.pay_type || "alipay",
      name: order.subject,
      money: order.amount,
      trade_status: "TRADE_SUCCESS",
    };
    params.sign = epaySign(params, config.epayKey);
    params.sign_type = "MD5";
    return {
      body: new URLSearchParams(params).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    };
  }

  const body = JSON.stringify({
    merchant_order_no: order.merchant_order_no,
    amount: order.amount,
    pay_amount: order.pay_amount,
    status: order.status,
    alipay_trade_no: order.alipay_trade_no,
    paid_at: order.paid_at,
  });
  const signature = await hmacSha256(config.callbackSecret, body);
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-aepay-event": "order.paid",
      "x-aepay-signature": signature,
    },
  };
}

async function adminPage(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const activeTab = adminTabFromValue(new URL(request.url).searchParams.get("tab") || "");
  await expirePendingOrders(env);
  const [orders, events, callbacks, pollingRuns] = await Promise.all([
    env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 50").all<OrderRow>(),
    env.DB.prepare("SELECT * FROM payment_events ORDER BY id DESC LIMIT 30").all<PaymentEventRow>(),
    env.DB.prepare("SELECT * FROM callback_logs ORDER BY id DESC LIMIT 30").all<CallbackLogRow>(),
    env.DB.prepare("SELECT * FROM polling_runs ORDER BY id DESC LIMIT 20").all<PollingRunRow>(),
  ]);
  return html(renderAdmin(config, orders.results, events.results, callbacks.results, pollingRuns.results, activeTab));
}

async function adminOrders(env: Env): Promise<Response> {
  await expirePendingOrders(env);
  const rows = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 100").all<OrderRow>();
  return json({ orders: rows.results });
}

async function requireAdmin(
  request: Request,
  env: Env,
  config: AppConfig,
  next: () => Promise<Response>,
): Promise<Response> {
  if (!isAdminInitialized(config)) {
    if (request.method === "GET") return Response.redirect(new URL("/admin/setup", request.url), 302);
    return new Response("Admin is not initialized", { status: 401 });
  }
  if (!(await verifyAdminSession(request, env, config))) {
    if (request.method === "GET") return Response.redirect(new URL("/admin/login", request.url), 302);
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": "Session" },
    });
  }
  return next();
}

function isAdminInitialized(config: AppConfig): boolean {
  return Boolean(config.adminUsername && config.adminPasswordHash);
}

async function requireMerchant(request: Request, config: AppConfig, next: () => Promise<Response>): Promise<Response> {
  const token = bearerToken(request);
  if (!config.merchantApiKey || token !== config.merchantApiKey) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    });
  }
  return next();
}

function bearerToken(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

function cookieValue(request: Request, name: string): string {
  const cookie = request.headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return "";
}

async function adminLogin(request: Request, env: Env, config: AppConfig): Promise<Response> {
  if (!isAdminInitialized(config)) return Response.redirect(new URL("/admin/setup", request.url), 302);
  const form = await request.formData();
  const username = stringForm(form, "username");
  const password = stringForm(form, "password");
  const ip = clientIp(request);
  if (await adminLoginLocked(env, ip, username)) {
    await logAdminLoginAttempt(env, ip, username, false);
    return new Response("登录失败次数过多，请 15 分钟后再试", { status: 429 });
  }
  const verified = await verifyAdminPassword(env, config, username, password);
  await logAdminLoginAttempt(env, ip, username, verified);
  if (!verified) {
    return Response.redirect(new URL("/admin/login?error=1", request.url), 302);
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: "/admin",
      "set-cookie": await adminCookie(request, env, config, username),
    },
  });
}

async function adminSetupPage(request: Request, config: AppConfig): Promise<Response> {
  if (isAdminInitialized(config)) return Response.redirect(new URL("/admin/login", request.url), 302);
  return html(setupPage(config));
}

async function adminSetup(request: Request, env: Env, config: AppConfig): Promise<Response> {
  if (isAdminInitialized(config)) return Response.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const username = stringForm(form, "username");
  const password = stringForm(form, "password");
  const confirm = stringForm(form, "confirm_password");
  assertText(username, "username");
  if (password.length < 8) throw new HttpError(400, "password must be at least 8 characters");
  if (password !== confirm) throw new HttpError(400, "password confirmation does not match");
  const now = new Date().toISOString();
  const passwordHash = await adminPasswordHash(username, password);
  await upsertSetting(env, "admin_username", username, true, now);
  await upsertSetting(env, "admin_password_hash", passwordHash, true, now);
  const nextConfig = { ...config, adminUsername: username, adminPasswordHash: passwordHash };
  return new Response(null, {
    status: 302,
    headers: {
      location: "/admin",
      "set-cookie": await adminCookie(request, env, nextConfig, username),
    },
  });
}

function adminLogout(request: Request): Response {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      location: "/admin/login",
      "set-cookie": `aepay_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
    },
  });
}

async function verifyAdminPassword(env: Env, config: AppConfig, username: string, password: string): Promise<boolean> {
  if (!username || !password || username !== config.adminUsername) return false;
  if (!config.adminPasswordHash) return false;
  return verifyAdminPasswordHash(config.adminPasswordHash, username, password);
}

async function verifyAdminSession(request: Request, env: Env, config: AppConfig): Promise<boolean> {
  const session = cookieValue(request, "aepay_admin_session");
  if (!session) return false;
  const [payload64, signature] = session.split(".");
  if (!payload64 || !signature) return false;
  const expected = await hmacSha256(adminSessionSecret(env, config), payload64);
  if (!timingSafeEqual(signature, expected.slice("sha256=".length))) return false;
  try {
    const payload = JSON.parse(atobUrl(payload64)) as { u?: string; exp?: number };
    return payload.u === config.adminUsername && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function adminCookie(request: Request, env: Env, config: AppConfig, username: string): Promise<string> {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const payload = btoaUrl(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + 86400 }));
  const signature = (await hmacSha256(adminSessionSecret(env, config), payload)).slice("sha256=".length);
  return `aepay_admin_session=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`;
}

function adminSessionSecret(env: Env, config: AppConfig): string {
  return config.adminPasswordHash || env.CALLBACK_SECRET || "aepay-admin-session";
}

async function adminPasswordHash(username: string, password: string): Promise<string> {
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt, ADMIN_PASSWORD_HASH_ITERATIONS);
  return `${ADMIN_PASSWORD_HASH_PREFIX}:${ADMIN_PASSWORD_HASH_ITERATIONS}:${salt}:${hash}`;
}

async function verifyAdminPasswordHash(storedHash: string, username: string, password: string): Promise<boolean> {
  const parsed = parseAdminPasswordHash(storedHash);
  if (parsed) {
    try {
      const hash = await pbkdf2Hex(password, parsed.salt, parsed.iterations);
      return timingSafeEqual(hash, parsed.hash);
    } catch {
      return false;
    }
  }
  return timingSafeEqual(await sha256Hex(`aepay-admin-v1:${username}:${password}`), storedHash);
}

function parseAdminPasswordHash(value: string): { iterations: number; salt: string; hash: string } | null {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== ADMIN_PASSWORD_HASH_PREFIX) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return null;
  if (parts[2].length % 2 !== 0 || parts[3].length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/i.test(parts[2]) || !/^[0-9a-f]+$/i.test(parts[3])) return null;
  return { iterations, salt: parts[2], hash: parts[3] };
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToArrayBuffer(saltHex),
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return hex(bits);
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return hex(bytes.buffer);
}

function hexToArrayBuffer(value: string): ArrayBuffer {
  const clean = value.trim();
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const connectingIp = request.headers.get("cf-connecting-ip") ?? "";
  const realIp = request.headers.get("x-real-ip") ?? "";
  return [connectingIp, forwarded.split(",")[0] ?? "", realIp].map((value) => value.trim()).find(Boolean) ?? "";
}

async function adminLoginLocked(env: Env, ip: string, username: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ADMIN_LOGIN_WINDOW_MS).toISOString();
  const clauses = ["success = 0", "created_at >= ?"];
  const args: unknown[] = [cutoff];
  const filters: string[] = [];
  if (ip) {
    filters.push("ip = ?");
    args.push(ip);
  }
  if (username) {
    filters.push("username = ?");
    args.push(username);
  }
  if (filters.length > 0) clauses.push(`(${filters.join(" OR ")})`);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM admin_login_attempts WHERE ${clauses.join(" AND ")}`,
  )
    .bind(...args)
    .first<{ count: number }>();
  return (row?.count ?? 0) >= ADMIN_LOGIN_MAX_FAILURES;
}

async function logAdminLoginAttempt(env: Env, ip: string, username: string, success: boolean): Promise<void> {
  const now = new Date().toISOString();
  const purgeBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_login_attempts WHERE created_at < ?").bind(purgeBefore),
    env.DB.prepare(
      `INSERT INTO admin_login_attempts (ip, username, success, created_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(ip, username, success ? 1 : 0, now),
  ]);
}

function btoaUrl(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function atobUrl(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function findOrder(env: Env, merchantOrderNo: string): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM orders WHERE merchant_order_no = ?")
    .bind(merchantOrderNo)
    .first<OrderRow>();
}

async function findOrderById(env: Env, id: number): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
}

function paymentUrl(requestUrl: string, order: OrderRow): string {
  const origin = new URL(requestUrl).origin;
  return `${origin}/pay/${encodeURIComponent(order.merchant_order_no)}`;
}

async function requestParams(request: Request): Promise<Record<string, string>> {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        Object.assign(params, (await request.json()) as Record<string, string>);
      } catch {
        throw new HttpError(400, "Invalid JSON body");
      }
    } else {
      const form = await request.formData();
      Object.assign(params, formToRecord(form));
    }
  }
  return params;
}

function assertEpayMerchant(config: AppConfig, params: Record<string, string>): void {
  if (!config.epayPid || !config.epayKey) throw new HttpError(500, "epay merchant is not configured");
  if ((params.pid ?? "") !== config.epayPid) throw new HttpError(401, "invalid pid");
}

function verifyEpaySign(params: Record<string, string>, key: string): boolean {
  const sign = (params.sign ?? "").toLowerCase();
  if (!sign) return false;
  return timingSafeEqual(sign, epaySign(params, key));
}

function epaySign(params: Record<string, string>, key: string): string {
  const content = Object.keys(params)
    .filter((name) => name !== "sign" && name !== "sign_type" && params[name] !== "")
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join("&");
  return md5(`${content}${key}`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function orderResponse(config: AppConfig, order: OrderRow, requestUrl: string): Record<string, unknown> {
  const origin = requestUrl ? new URL(requestUrl).origin : "";
  return {
    merchant_order_no: order.merchant_order_no,
    amount: order.amount,
    pay_amount: order.pay_amount,
    status: order.status,
    subject: order.subject,
    type: order.pay_type,
    compat_type: order.compat_type,
    collect_account: order.collect_account,
    alipay_trade_no: order.alipay_trade_no,
    paid_at: order.paid_at,
    expires_at: order.expires_at,
    payment_url: origin ? paymentUrl(requestUrl, order) : undefined,
    qr_image_url: config.collectQrImageUrl || null,
    qr_hint: `请使用你的支付宝收款码收取 ${order.pay_amount} 元，并在 ${order.expires_at} 前完成。`,
  };
}

function paymentTheme(name: string): {
  colorScheme: string;
  bg: string;
  bg2: string;
  panel: string;
  panelSoft: string;
  text: string;
  muted: string;
  line: string;
  brand: string;
  brand2: string;
  accent: string;
  ok: string;
  qrBg: string;
  radius: string;
  shadow: string;
} {
  const themes = {
    minimal: {
      colorScheme: "light",
      bg: "#f6f8fb",
      bg2: "#eef2f8",
      panel: "#ffffff",
      panelSoft: "#f8fafc",
      text: "#1f2937",
      muted: "#667085",
      line: "#dfe5ee",
      brand: "#102a43",
      brand2: "#3b82f6",
      accent: "#2563eb",
      ok: "#147d64",
      qrBg: "#ffffff",
      radius: "8px",
      shadow: "0 12px 40px rgba(15,23,42,.08)",
    },
    alipay: {
      colorScheme: "light",
      bg: "#eef6ff",
      bg2: "#dfeeff",
      panel: "#ffffff",
      panelSoft: "#f7fbff",
      text: "#132238",
      muted: "#5b6b80",
      line: "#d2e3f3",
      brand: "#1677ff",
      brand2: "#4f8dff",
      accent: "#1677ff",
      ok: "#0f8f6b",
      qrBg: "#f7fbff",
      radius: "18px",
      shadow: "0 22px 56px rgba(22,119,255,.18)",
    },
    pearl: {
      colorScheme: "light",
      bg: "#f8fbff",
      bg2: "#edf5ff",
      panel: "#ffffff",
      panelSoft: "#f6faff",
      text: "#122033",
      muted: "#5d6d82",
      line: "#dce7f3",
      brand: "#1d4ed8",
      brand2: "#78b1ff",
      accent: "#2563eb",
      ok: "#127a61",
      qrBg: "#f8fbff",
      radius: "22px",
      shadow: "0 20px 54px rgba(30,64,175,.14)",
    },
    aurora: {
      colorScheme: "light",
      bg: "#eef6ff",
      bg2: "#d8e9ff",
      panel: "#ffffff",
      panelSoft: "#f7fbff",
      text: "#132238",
      muted: "#596b81",
      line: "#d7e4f4",
      brand: "#2563eb",
      brand2: "#7ab0ff",
      accent: "#1d4ed8",
      ok: "#0f8f6b",
      qrBg: "#f8fbff",
      radius: "24px",
      shadow: "0 24px 60px rgba(37,99,235,.18)",
    },
    graphite: {
      colorScheme: "light",
      bg: "#f4f7fb",
      bg2: "#e7edf4",
      panel: "#ffffff",
      panelSoft: "#f7f9fc",
      text: "#1f2937",
      muted: "#687385",
      line: "#d7dfe8",
      brand: "#1f3a5f",
      brand2: "#446892",
      accent: "#2563eb",
      ok: "#157f5f",
      qrBg: "#ffffff",
      radius: "20px",
      shadow: "0 20px 54px rgba(31,41,55,.12)",
    },
    dark: {
      colorScheme: "dark",
      bg: "#101418",
      bg2: "#151b24",
      panel: "#171d23",
      panelSoft: "#1d2430",
      text: "#eef4f8",
      muted: "#a9b4bf",
      line: "#2b3640",
      brand: "#22c55e",
      brand2: "#0ea5e9",
      accent: "#38bdf8",
      ok: "#4ade80",
      qrBg: "#ffffff",
      radius: "18px",
      shadow: "0 18px 60px rgba(0,0,0,.35)",
    },
    warm: {
      colorScheme: "light",
      bg: "#f8f1e8",
      bg2: "#f0e6d8",
      panel: "#fffdf9",
      panelSoft: "#fff8ef",
      text: "#2b2118",
      muted: "#7a6a5a",
      line: "#eadfcc",
      brand: "#b45309",
      brand2: "#d97706",
      accent: "#c2410c",
      ok: "#15803d",
      qrBg: "#fffaf2",
      radius: "18px",
      shadow: "0 18px 46px rgba(120,80,30,.14)",
    },
    midnight: {
      colorScheme: "dark",
      bg: "#0b1020",
      bg2: "#101a33",
      panel: "#111a2d",
      panelSoft: "#16213a",
      text: "#eef4ff",
      muted: "#a4b2c7",
      line: "#253451",
      brand: "#4f7cff",
      brand2: "#7b68ff",
      accent: "#68d4ff",
      ok: "#52d29a",
      qrBg: "#ffffff",
      radius: "24px",
      shadow: "0 24px 70px rgba(2,6,23,.48)",
    },
  };
  return themes[name as keyof typeof themes] || themes.alipay;
}

function renderPaymentPage(config: AppConfig, order: OrderRow): string {
  const done = order.status === "paid";
  const theme = paymentTheme(config.paymentPageTheme);
  const expiresAtMs = new Date(order.expires_at).getTime();
  const qr = config.collectQrImageUrl
    ? `<img class="qr" src="${escapeHtml(config.collectQrImageUrl)}" alt="支付宝收款码">`
    : `<div class="empty">未配置收款码图片，请向商户索取支付宝收款码。</div>`;
  const payState = done
    ? `<div class="state-card paid-state"><strong>支付已确认</strong><span>订单已到账，无需重复支付。</span></div>`
    : `<div class="qr-stage"><div class="qr-glow"></div><div class="qr-wrap">${qr}</div></div><p class="hint">请按页面金额付款，付款后将自动确认。</p>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>支付订单 ${escapeHtml(order.merchant_order_no)}</title>
  <style>
    :root { color-scheme:${theme.colorScheme}; --bg:${theme.bg}; --bg-2:${theme.bg2}; --panel:${theme.panel}; --panel-soft:${theme.panelSoft}; --text:${theme.text}; --muted:${theme.muted}; --line:${theme.line}; --brand:${theme.brand}; --brand-2:${theme.brand2}; --accent:${theme.accent}; --ok:${theme.ok}; --qrBg:${theme.qrBg}; --radius:${theme.radius}; --shadow:${theme.shadow}; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; padding:34px 22px; color:var(--text); font:15px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 28%), radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--brand-2) 20%, transparent), transparent 30%), linear-gradient(145deg, var(--bg-2), var(--bg)); }
    main { width:min(1080px, 100%); margin:0 auto; overflow:hidden; border:1px solid color-mix(in srgb, var(--line) 82%, transparent); border-radius:30px; background:color-mix(in srgb, var(--panel) 92%, transparent); box-shadow:var(--shadow); backdrop-filter:blur(18px); }
    .topbar { min-height:74px; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:18px 24px; color:#fff; background:linear-gradient(132deg, var(--brand), var(--brand-2)); position:relative; overflow:hidden; }
    .topbar:after { content:""; position:absolute; inset:-80px 18% auto auto; width:280px; height:180px; transform:rotate(18deg); background:rgba(255,255,255,.14); border-radius:36px; }
    .brand-row { position:relative; z-index:1; display:flex; align-items:center; gap:14px; min-width:0; }
    .brand { width:42px; height:42px; display:grid; place-items:center; border-radius:14px; color:white; background:rgba(255,255,255,.18); font-size:22px; font-weight:900; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
    .title-stack { min-width:0; }
    h1 { margin:0; font-size:22px; line-height:1.2; letter-spacing:.02em; }
    .subtitle { margin-top:3px; color:rgba(255,255,255,.78); font-size:13px; }
    .safe-badge { position:relative; z-index:1; display:inline-flex; align-items:center; gap:8px; min-height:38px; padding:0 14px; border-radius:999px; background:rgba(255,255,255,.16); box-shadow:inset 0 0 0 1px rgba(255,255,255,.16); font-weight:750; white-space:nowrap; }
    .content { display:grid; grid-template-columns:minmax(0, 1.08fr) minmax(330px, .92fr); }
    .pay-column, .info-column { padding:28px; }
    .pay-column { display:grid; gap:18px; background:linear-gradient(180deg, color-mix(in srgb, var(--panel-soft) 72%, transparent), transparent); border-right:1px solid var(--line); }
    .timer { display:grid; gap:8px; place-items:center; min-height:142px; padding:20px; border:1px solid color-mix(in srgb, var(--brand) 18%, var(--line)); border-radius:24px; color:var(--muted); background:linear-gradient(135deg, color-mix(in srgb, var(--brand) 92%, #111827), var(--brand-2)); box-shadow:0 18px 42px color-mix(in srgb, var(--brand) 18%, transparent); }
    .timer-label { color:rgba(255,255,255,.78); font-weight:750; }
    .timer strong { color:#fff; font-size:48px; line-height:1; letter-spacing:.08em; text-shadow:0 0 28px rgba(255,255,255,.5); }
    .timer-note { color:rgba(255,255,255,.7); font-size:13px; }
    .amount-card { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:18px 20px; border:1px solid var(--line); border-radius:22px; background:var(--panel); box-shadow:0 12px 32px rgba(15,23,42,.06); }
    .amount-card span { color:var(--muted); font-weight:750; }
    .amount { font-size:42px; font-weight:900; line-height:1; color:#f26b6f; letter-spacing:.03em; }
    .copy-btn { height:42px; border:0; border-radius:14px; padding:0 18px; color:#fff; background:linear-gradient(135deg, var(--brand), var(--brand-2)); box-shadow:0 12px 26px color-mix(in srgb, var(--brand) 24%, transparent); font-weight:850; cursor:pointer; }
    .qr-card { padding:22px; border:1px solid var(--line); border-radius:26px; background:var(--panel); box-shadow:0 16px 38px rgba(15,23,42,.07); text-align:center; }
    .qr-stage { position:relative; display:grid; place-items:center; padding:18px; }
    .qr-glow { position:absolute; inset:28px; border-radius:32px; background:radial-gradient(circle, color-mix(in srgb, var(--brand) 20%, transparent), transparent 64%); filter:blur(14px); }
    .qr-wrap { position:relative; margin:0 auto; padding:18px; border:1px solid color-mix(in srgb, var(--brand) 18%, var(--line)); border-radius:22px; background:linear-gradient(145deg, var(--qrBg), var(--panel-soft)); }
    .qr { width:min(312px, 68vw); aspect-ratio:1; object-fit:contain; display:block; margin:auto; border-radius:14px; background:#fff; }
    .empty { width:min(312px, 68vw); min-height:240px; display:grid; place-items:center; border:1px dashed var(--line); border-radius:18px; padding:34px 18px; color:var(--muted); background:var(--panel-soft); }
    .hint { margin:10px 0 0; color:var(--muted); font-size:13px; }
    .info-column { display:grid; gap:18px; align-content:start; background:color-mix(in srgb, var(--panel) 72%, var(--panel-soft)); }
    .channel { display:flex; align-items:center; justify-content:center; gap:12px; padding:17px; border:1px solid var(--line); border-radius:24px; background:var(--panel); box-shadow:0 12px 30px rgba(15,23,42,.05); font-size:18px; font-weight:900; }
    .channel-mark { width:36px; height:36px; display:grid; place-items:center; border-radius:13px; color:#fff; background:linear-gradient(135deg, var(--brand), var(--brand-2)); }
    .panel-card { padding:22px; border:1px solid var(--line); border-radius:24px; background:var(--panel); box-shadow:0 12px 30px rgba(15,23,42,.05); }
    .panel-card h2 { margin:0 0 16px; font-size:20px; letter-spacing:.01em; }
    .meta { display:grid; gap:0; color:var(--muted); font-size:14px; }
    .meta div { display:flex; justify-content:space-between; gap:18px; border-bottom:1px solid var(--line); padding:12px 0; }
    .meta div:last-child { border-bottom:0; padding-bottom:0; }
    .meta strong { color:var(--text); text-align:right; word-break:break-all; }
    .steps { margin:0; padding-left:19px; color:var(--muted); display:grid; gap:10px; }
    .steps strong { color:var(--text); }
    .state-card { min-height:280px; display:grid; place-items:center; gap:8px; border:1px solid var(--line); border-radius:22px; background:var(--panel-soft); color:var(--muted); }
    .state-card strong { display:block; color:var(--ok); font-size:22px; }
    .paid { color:var(--ok); font-weight:850; }
    .expired { color:#d92d20; font-weight:850; }
    .footer { padding:16px 24px; color:#fff; text-align:center; font-size:13px; font-weight:750; background:linear-gradient(132deg, var(--brand), var(--brand-2)); }
    @media (max-width: 860px) { body { padding:14px; } main { border-radius:24px; } .topbar { align-items:flex-start; flex-direction:column; } .content { grid-template-columns:1fr; } .pay-column { border-right:0; border-bottom:1px solid var(--line); } .pay-column, .info-column { padding:18px; } .amount-card { align-items:flex-start; flex-direction:column; } .timer strong { font-size:42px; } }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div class="brand-row">
        <div class="brand">支</div>
        <div class="title-stack">
          <h1 id="title">${escapeHtml(done ? "支付已确认" : "订单支付")}</h1>
          <div class="subtitle" id="subtitle">${escapeHtml(done ? "订单已经到账，无需再次支付" : "请使用手机扫描二维码完成支付")}</div>
        </div>
      </div>
      <div class="safe-badge">安全收银台</div>
    </div>
    <div class="content">
      <section class="pay-column">
        <div class="timer" id="timer" ${done ? "hidden" : ""}>
          <div class="timer-label">支付剩余时间</div>
          <strong>--:--</strong>
          <div class="timer-note">超时订单将自动关闭</div>
        </div>
        <div class="amount-card">
          <div>
            <span>支付金额</span>
            <div class="amount">¥${escapeHtml(order.pay_amount)}</div>
          </div>
          <button class="copy-btn" type="button" id="copy-amount-button">复制金额</button>
        </div>
        <div class="qr-card" id="pay-state">${payState}</div>
      </section>
      <aside class="info-column">
        <div class="channel"><span class="channel-mark">支</span><span>支付宝</span></div>
        <div class="panel-card">
          <h2>订单信息</h2>
          <div class="meta">
            <div><span>订单编号</span><strong>${escapeHtml(order.merchant_order_no)}</strong></div>
            <div><span>商品名称</span><strong>${escapeHtml(order.subject || "-")}</strong></div>
            <div><span>创建时间</span><strong>${escapeHtml(shortDate(order.created_at, config.timeZone))}</strong></div>
            <div><span>订单状态</span><strong id="status">${escapeHtml(order.status)}</strong></div>
          </div>
        </div>
        <div class="panel-card">
          <h2>支付说明</h2>
          <ol class="steps">
            <li><strong>打开支付宝</strong> 或手机扫一扫功能</li>
            <li>扫描左侧二维码，按页面金额付款</li>
            <li>支付成功后不要关闭页面，系统会自动确认</li>
            <li>如遇支付问题，请刷新页面或联系客服</li>
            <li>支付超时后，请重新创建订单</li>
          </ol>
        </div>
      </aside>
    </div>
    <div class="footer">© 2025 ${escapeHtml(config.appName)} | 安全支付保障</div>
  </main>
  <script>
    const orderNo = ${JSON.stringify(order.merchant_order_no)};
    const expiresAt = ${Number.isFinite(expiresAtMs) ? expiresAtMs : 0};
    const timer = document.querySelector('#timer');
    const statusEl = document.querySelector('#status');
    const title = document.querySelector('#title');
    const subtitle = document.querySelector('#subtitle');
    const payState = document.querySelector('#pay-state');
    const copyAmountButton = document.querySelector('#copy-amount-button');
    const amountValue = ${JSON.stringify(order.pay_amount)};

    function renderPaid() {
      title.textContent = '支付已确认';
      if (subtitle) subtitle.textContent = '订单已经到账，无需再次支付';
      statusEl.textContent = 'paid';
      if (timer) timer.hidden = true;
      payState.innerHTML = '<div class="state-card paid-state"><strong>支付已确认</strong><span>订单已到账，无需重复支付。</span></div>';
    }

    function renderExpired() {
      title.textContent = '订单已过期';
      if (subtitle) subtitle.textContent = '请重新创建订单后再次支付';
      statusEl.textContent = 'expired';
      if (timer) {
        timer.hidden = false;
        timer.innerHTML = '<div class="timer-label">支付剩余时间</div><strong class="expired">已过期</strong><div class="timer-note">请重新创建订单后再支付</div>';
      }
      payState.innerHTML = '<div class="state-card"><strong class="expired">订单已过期</strong><span>请不要继续付款，重新创建订单后再支付。</span></div>';
    }

    function tick() {
      if (!timer || timer.hidden || !expiresAt) return;
      const left = expiresAt - Date.now();
      if (left <= 0) {
        renderExpired();
        return;
      }
      const total = Math.ceil(left / 1000);
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      const target = timer.querySelector('strong');
      if (target) target.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    async function pollStatus() {
      if (statusEl.textContent === 'paid' || statusEl.textContent === 'expired') return;
      try {
        const res = await fetch('/api/orders/' + encodeURIComponent(orderNo), { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') renderPaid();
      } catch {}
    }

    async function copyAmount() {
      if (!amountValue) return;
      try {
        await navigator.clipboard.writeText(amountValue);
      } catch {
        window.prompt('浏览器拦截了自动复制，请手动复制：', amountValue);
      }
    }

    tick();
    setInterval(tick, 1000);
    setInterval(pollStatus, 3000);
    if (copyAmountButton) copyAmountButton.addEventListener('click', copyAmount);
  </script>
</body>
</html>`;
}

function renderAdmin(
  config: AppConfig,
  orders: OrderRow[],
  events: PaymentEventRow[],
  callbacks: CallbackLogRow[],
  pollingRuns: PollingRunRow[],
  activeTab: AdminTab,
): string {
  const totalOrders = orders.length;
  const paidOrders = orders.filter((row) => row.status === "paid").length;
  const pendingOrders = orders.filter((row) => row.status === "pending").length;
  const activeAsset = config.paymentQrAssets.find((asset) => String(asset.id) === config.collectQrAssetId) || null;
  const activeAssetLabel = activeAsset
    ? `${activeAsset.name || "未命名"} · ${paymentQrAssetSourceLabel(activeAsset.source)}`
    : config.collectQrImageUrl
      ? "备用 URL"
      : "未配置";
  const themeLabel = paymentThemeLabel(config.paymentPageTheme);
  const latestOrder = orders[0] || null;
  const latestPolling = pollingRuns[0] || null;
  const latestCallback = callbacks[0] || null;
  const heroStatus = [
    latestPolling ? `最近查账 ${escapeHtml(shortDate(latestPolling.started_at, config.timeZone))} · ${escapeHtml(latestPolling.status)}` : "还没有查账记录",
    latestCallback ? `最近回调 ${escapeHtml(shortDate(latestCallback.updated_at, config.timeZone))} · ${escapeHtml(latestCallback.status)}` : "暂无回调",
  ].join(" · ");
  const heroMetrics = [
    `<article class="metric-card accent"><span>订单总数</span><strong>${totalOrders}</strong><small>${latestOrder ? `最新 ${escapeHtml(shortDate(latestOrder.created_at, config.timeZone))}` : "还没有订单"}</small></article>`,
    `<article class="metric-card good"><span>已支付</span><strong>${paidOrders}</strong><small>${pendingOrders} 笔待处理</small></article>`,
    `<article class="metric-card warn"><span>收款码资产</span><strong>${config.paymentQrAssets.length}</strong><small>${escapeHtml(activeAssetLabel)}</small></article>`,
    `<article class="metric-card dark"><span>自动查账</span><strong>${config.alipayPollEnabled === "true" ? "开启" : "关闭"}</strong><small>${escapeHtml(config.alipayPollEnabled === "true" ? "Cron 每分钟执行一次" : "尚未启用自动查账")}</small></article>`,
  ].join("");
  const heroBadges = [
    `<span class="chip">当前收款码 ${escapeHtml(activeAssetLabel)}</span>`,
    `<span class="chip">查账窗口 ${escapeHtml(config.alipayPollWindowMinutes)} 分钟</span>`,
    `<span class="chip">支付页主题 ${escapeHtml(themeLabel)}</span>`,
  ].join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)} Admin</title>
  <style>
    :root {
      color-scheme: light;
      --bg:#edf3fb;
      --bg-2:#f7f9fe;
      --panel:#ffffff;
      --panel-soft:#f6f9ff;
      --text:#0f172a;
      --muted:#5b6474;
      --line:#d8e1ee;
      --ok:#147d64;
      --warn:#a16207;
      --bad:#b42318;
      --brand:#265cf0;
      --brand-2:#4f8cff;
      --brand-soft:rgba(38,92,240,.12);
      --shadow:0 20px 56px rgba(15,23,42,.10);
    }
    * { box-sizing: border-box; }
    body {
      margin:0;
      font:14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 8% 0%, rgba(38,92,240,.14), transparent 28%),
        radial-gradient(circle at 92% 4%, rgba(79,140,255,.12), transparent 24%),
        linear-gradient(180deg, var(--bg-2), var(--bg));
      color:var(--text);
      position:relative;
    }
    body::before {
      content:"";
      position:fixed;
      inset:0;
      background-image:linear-gradient(rgba(15,23,42,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.025) 1px, transparent 1px);
      background-size:72px 72px;
      mask-image:linear-gradient(180deg, rgba(0,0,0,.72), transparent 92%);
      pointer-events:none;
    }
    header {
      position:sticky;
      top:0;
      z-index:2;
      background:rgba(255,255,255,.74);
      border-bottom:1px solid rgba(216,225,238,.9);
      backdrop-filter: blur(16px);
    }
    .bar {
      max-width:1280px;
      margin:auto;
      padding:16px 24px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:18px;
    }
    .brand-block { display:flex; align-items:center; gap:14px; min-width:0; }
    .brand-mark {
      width:42px;
      height:42px;
      border-radius:14px;
      display:grid;
      place-items:center;
      color:#fff;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow:0 14px 32px rgba(38,92,240,.22);
      font-size:21px;
      font-weight:900;
      flex:none;
    }
    .brand-copy h1 { margin:0; font-size:18px; letter-spacing:.02em; }
    .brand-copy p { margin:3px 0 0; color:var(--muted); font-size:12px; }
    .bar-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
    main { max-width:1280px; margin:0 auto; padding:22px 24px 34px; display:grid; gap:18px; }
    .hero {
      display:grid;
      grid-template-columns:minmax(0, 1.18fr) minmax(300px, .82fr);
      gap:18px;
      padding:22px;
      border:1px solid rgba(216,225,238,.92);
      border-radius:26px;
      background:linear-gradient(135deg, rgba(255,255,255,.96), rgba(249,251,255,.92));
      box-shadow:var(--shadow);
    }
    .hero-copy { display:grid; gap:14px; align-content:start; }
    .eyebrow {
      display:inline-flex;
      align-items:center;
      width:max-content;
      min-height:28px;
      padding:0 12px;
      border-radius:999px;
      background:var(--brand-soft);
      color:var(--brand);
      font-size:12px;
      font-weight:800;
      letter-spacing:.02em;
    }
    .hero-copy h2 { margin:0; font-size:clamp(26px, 3vw, 40px); line-height:1.08; letter-spacing:-.03em; }
    .hero-copy p { margin:0; color:var(--muted); font-size:15px; max-width:64ch; }
    .hero-chips { display:flex; flex-wrap:wrap; gap:8px; }
    .chip {
      display:inline-flex;
      align-items:center;
      min-height:32px;
      padding:0 12px;
      border-radius:999px;
      background:#fff;
      border:1px solid var(--line);
      color:var(--muted);
      font-size:12px;
      font-weight:650;
      box-shadow:0 8px 20px rgba(15,23,42,.04);
    }
    .hero-panel {
      display:grid;
      gap:12px;
      align-content:start;
      padding:18px;
      border-radius:20px;
      background:linear-gradient(180deg, rgba(246,249,255,.95), rgba(237,243,253,.95));
      border:1px solid rgba(216,225,238,.84);
    }
    .hero-panel-top {
      display:grid;
      gap:8px;
      padding:16px;
      border-radius:18px;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      color:#fff;
      box-shadow:0 18px 36px rgba(38,92,240,.18);
    }
    .hero-panel-top span { font-size:12px; opacity:.85; font-weight:700; }
    .hero-panel-top strong { font-size:26px; letter-spacing:.01em; }
    .hero-panel-top p { margin:0; color:rgba(255,255,255,.84); font-size:13px; }
    .metric-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .metric-card {
      padding:14px;
      border-radius:16px;
      background:#fff;
      border:1px solid var(--line);
      box-shadow:0 10px 24px rgba(15,23,42,.04);
      display:grid;
      gap:6px;
    }
    .metric-card span { color:var(--muted); font-size:12px; font-weight:700; }
    .metric-card strong { font-size:22px; line-height:1; letter-spacing:-.02em; }
    .metric-card small { color:var(--muted); font-size:12px; }
    .metric-card.accent strong { color:var(--brand); }
    .metric-card.good strong { color:var(--ok); }
    .metric-card.warn strong { color:var(--warn); }
    .metric-card.dark strong { color:var(--text); }
    section {
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:22px;
      overflow:hidden;
      box-shadow:0 16px 38px rgba(15,23,42,.06);
    }
    h2 {
      margin:0;
      padding:18px 20px;
      font-size:16px;
      border-bottom:1px solid rgba(216,225,238,.8);
      background:linear-gradient(180deg, #fff, #fbfdff);
    }
    table { width:100%; border-collapse:separate; border-spacing:0; }
    th, td {
      padding:12px 14px;
      border-bottom:1px solid var(--line);
      text-align:left;
      vertical-align:top;
      white-space:nowrap;
    }
    th {
      color:var(--muted);
      font-weight:700;
      background:rgba(248,250,252,.96);
      backdrop-filter: blur(8px);
    }
    tbody tr:nth-child(even) td { background:rgba(250,252,255,.55); }
    tbody tr:hover td { background:#f8fbff; }
    tr:last-child td { border-bottom:0; }
    th:first-child, td:first-child { padding-left:20px; }
    th:last-child, td:last-child { padding-right:20px; }
    .scroll { overflow:auto; padding-bottom:8px; }
    .pill { display:inline-flex; align-items:center; min-height:24px; padding:2px 8px; border-radius:999px; background:#eef2ff; color:#273ea5; font-size:12px; font-weight:700; }
    .paid { background:#e8f7f1; color:var(--ok); }
    .pending { background:#fff4df; color:var(--warn); }
    .failed { background:#fee4e2; color:var(--bad); }
    form {
      padding:18px 20px 20px;
      display:grid;
      grid-template-columns:repeat(5,minmax(130px,1fr));
      gap:12px;
      align-items:end;
    }
    .settings-form { grid-template-columns:repeat(3,minmax(180px,1fr)); align-items:start; }
    .tabs {
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      padding:8px;
      border:1px solid rgba(216,225,238,.9);
      border-radius:18px;
      background:rgba(255,255,255,.76);
      box-shadow:0 12px 28px rgba(15,23,42,.05);
    }
    .tab {
      height:40px;
      border:1px solid transparent;
      border-radius:12px;
      background:transparent;
      color:var(--muted);
      padding:0 16px;
      font-weight:750;
      cursor:pointer;
      transition:background .18s ease, box-shadow .18s ease, color .18s ease, transform .18s ease;
    }
    .tab:hover { background:#fff; color:var(--text); box-shadow:0 8px 18px rgba(15,23,42,.05); transform:translateY(-1px); }
    .tab.active { background:linear-gradient(135deg, var(--brand), var(--brand-2)); color:#fff; box-shadow:0 12px 24px rgba(38,92,240,.24); }
    .panel[hidden] { display:none !important; }
    label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
    input, select, textarea {
      width:100%;
      min-height:40px;
      border:1px solid var(--line);
      border-radius:12px;
      padding:0 12px;
      font:inherit;
      color:var(--text);
      background:#fff;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.6);
      transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease;
    }
    textarea { min-height:110px; padding:12px; resize:vertical; }
    input:focus, select:focus, textarea:focus {
      outline:none;
      border-color:rgba(38,92,240,.5);
      box-shadow:0 0 0 4px rgba(38,92,240,.10);
    }
    button {
      height:40px;
      border:0;
      border-radius:12px;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      color:white;
      padding:0 16px;
      font-weight:700;
      cursor:pointer;
      box-shadow:0 12px 24px rgba(38,92,240,.18);
      transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
    }
    button:hover { transform:translateY(-1px); box-shadow:0 16px 28px rgba(38,92,240,.22); }
    button:disabled { opacity:.65; cursor:not-allowed; transform:none; box-shadow:none; }
    .note { padding:0 20px 16px; color:var(--muted); }
    .wide { grid-column:1 / -1; }
    .settings-form .note { padding:0; align-self:center; }
    .action-status {
      min-height:22px;
      padding:10px 12px;
      border-radius:12px;
      color:var(--ok);
      font-weight:650;
      background:#f3faf7;
      border:1px solid rgba(20,125,100,.12);
    }
    .action-status.error { color:var(--bad); background:#fff7f5; border-color:rgba(180,35,24,.14); }
    button.secondary { background:#eef4ff; color:#1d4ed8; border:1px solid #d6e3ff; box-shadow:none; }
    button.secondary:hover { background:#e1ebff; box-shadow:none; }
    button.danger { background:#fee4e2; color:#b42318; border-color:#fecdca; box-shadow:none; }
    .qr-manager {
      grid-column:1 / -1;
      display:grid;
      gap:12px;
      padding:16px;
      border:1px solid var(--line);
      border-radius:18px;
      background:linear-gradient(180deg, #fff, #fbfdff);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.8);
    }
    .qr-manager-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .qr-manager-head strong { color:var(--text); }
    .qr-manager-head span { color:var(--muted); font-size:12px; }
    .qr-upload-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; align-items:end; }
    .qr-upload-grid .wide { grid-column:1 / -1; }
    .qr-asset-list { display:grid; gap:10px; }
    .qr-asset {
      display:grid;
      grid-template-columns:92px 1fr auto;
      gap:12px;
      padding:12px;
      border:1px solid var(--line);
      border-radius:16px;
      background:#fff;
      transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }
    .qr-asset:hover { transform:translateY(-1px); box-shadow:0 14px 28px rgba(15,23,42,.06); }
    .qr-asset.active { border-color:rgba(38,92,240,.5); box-shadow:0 16px 30px rgba(38,92,240,.12); }
    .qr-asset img { width:92px; height:92px; object-fit:contain; border-radius:12px; background:#f8fafc; border:1px solid var(--line); }
    .qr-asset-body { display:grid; gap:6px; }
    .qr-asset-body strong { color:var(--text); }
    .qr-asset-meta { display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-size:12px; }
    .qr-asset-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; align-items:flex-start; }
    .qr-empty { border:1px dashed var(--line); border-radius:16px; padding:18px; color:var(--muted); background:#fff; }
    .payment-preview-grid { grid-column:1 / -1; display:grid; grid-template-columns:minmax(240px,320px) minmax(300px,1fr); gap:14px; align-items:start; margin-top:6px; }
    .preview-card { border:1px solid var(--line); border-radius:18px; background:#fff; padding:16px; display:grid; gap:10px; box-shadow:0 12px 26px rgba(15,23,42,.05); }
    .preview-card strong { color:var(--text); }
    .saved-qr-frame, .preview-qr-frame {
      min-height:188px;
      border:1px dashed var(--line);
      border-radius:14px;
      background:#fafbfc;
      display:grid;
      place-items:center;
      padding:12px;
      color:var(--muted);
      text-align:center;
    }
    .saved-qr-frame img, .preview-qr-frame img { width:min(180px,100%); aspect-ratio:1; object-fit:contain; border-radius:10px; background:#fff; }
    .pay-preview-canvas { border-radius:22px; padding:18px; background:linear-gradient(180deg, var(--preview-bg), var(--preview-bg-2)); display:grid; place-items:center; min-height:520px; }
    .pay-preview-phone { width:min(350px,100%); border:1px solid var(--preview-line); border-radius:var(--preview-radius); padding:18px; text-align:center; background:var(--preview-panel); color:var(--preview-text); box-shadow:var(--preview-shadow); }
    .pay-preview-mark { width:42px; height:42px; margin:0 auto 10px; border-radius:12px; display:grid; place-items:center; background:linear-gradient(135deg, var(--preview-brand), var(--preview-brand-2)); color:#fff; font-size:22px; font-weight:850; }
    .pay-preview-phone h3 { margin:0 0 8px; font-size:18px; }
    .pay-preview-amount { margin:6px 0 12px; color:var(--preview-accent); font-size:36px; font-weight:850; }
    .pay-preview-timer { margin:0 0 12px; min-height:30px; display:flex; align-items:center; justify-content:center; border:1px solid var(--preview-line); border-radius:var(--preview-radius); color:var(--preview-muted); font-weight:700; background:var(--preview-panel-soft); }
    .preview-qr-frame { background:var(--preview-qr-bg); }
    .pay-preview-meta { margin-top:12px; display:grid; gap:6px; color:var(--preview-muted); font-size:12px; text-align:left; }
    .pay-preview-meta div { display:flex; justify-content:space-between; gap:10px; border-bottom:1px solid var(--preview-line); padding-bottom:6px; }
    .pay-preview-meta div:last-child { border-bottom:0; padding-bottom:0; }
    @media (max-width: 920px) {
      .hero { grid-template-columns:1fr; }
      .metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .payment-preview-grid { grid-template-columns:1fr; }
    }
    @media (max-width: 850px) {
      form, .settings-form, .payment-preview-grid, .qr-upload-grid, .qr-asset { grid-template-columns:1fr; }
      .bar { align-items:flex-start; flex-direction:column; }
      .bar-actions { width:100%; justify-content:flex-start; }
      .hero, .qr-manager, .preview-card { padding:16px; }
      .metric-grid { grid-template-columns:1fr; }
      .qr-asset-actions { justify-content:flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div class="brand-block">
        <div class="brand-mark">支</div>
        <div class="brand-copy">
          <h1>${escapeHtml(config.appName)}</h1>
          <p>支付后台 · 收款码 · 查账 · 回调</p>
        </div>
      </div>
      <div class="bar-actions">
        <span class="pill">Cloudflare Workers + D1</span>
        <form method="post" action="/admin/logout" style="padding:0; display:flex;">
          <button type="submit" class="secondary" style="width:auto;">退出登录</button>
        </form>
      </div>
    </div>
  </header>
  <main>
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">控制台总览</span>
        <h2>${escapeHtml(config.appName)} 的支付工作台</h2>
        <p>把订单、二维码、自动查账和回调日志放在一张干净的桌面上。当前主题是 <strong>${escapeHtml(themeLabel)}</strong>，收款码资产共 ${config.paymentQrAssets.length} 套。</p>
        <div class="hero-chips">${heroBadges}</div>
      </div>
      <div class="hero-panel">
        <div class="hero-panel-top">
          <span>${config.alipayPollEnabled === "true" ? "自动查账已开启" : "自动查账未开启"}</span>
          <strong>${escapeHtml(themeLabel)}</strong>
          <p>${heroStatus}</p>
        </div>
        <div class="metric-grid">${heroMetrics}</div>
      </div>
    </section>
    <nav class="tabs" aria-label="后台导航">
      <button class="tab${activeTab === "overview" ? " active" : ""}" type="button" data-tab="overview">概览</button>
      <button class="tab${activeTab === "system" ? " active" : ""}" type="button" data-tab="system">系统</button>
      <button class="tab${activeTab === "epay" ? " active" : ""}" type="button" data-tab="epay">易支付</button>
      <button class="tab${activeTab === "payment" ? " active" : ""}" type="button" data-tab="payment">支付页</button>
      <button class="tab${activeTab === "alipay" ? " active" : ""}" type="button" data-tab="alipay">支付宝</button>
      <button class="tab${activeTab === "test" ? " active" : ""}" type="button" data-tab="test">支付测试</button>
    </nav>
    <section id="settings-section"${isSettingsTab(activeTab) ? "" : " hidden"}>
      <h2>设置</h2>
      ${settingsForm(config, activeTab)}
    </section>
    <section class="panel" data-panel="test"${activeTab === "test" ? "" : " hidden"}>
      <h2>真实支付测试</h2>
      <form method="post" action="/api/admin/test-order" onsubmit="return submitTestOrder(event)" style="grid-template-columns:minmax(180px,260px) auto 1fr;">
        <label>测试原金额<input name="amount" required value="0.01" inputmode="decimal"></label>
        <button type="submit">创建测试订单</button>
        <div class="note" style="padding:0;">系统会生成实际应付金额；打开支付页后按页面金额真实扫码付款，再等自动查账匹配。</div>
      </form>
      <div id="test-order-result" class="note"></div>
    </section>
    <section class="panel" data-panel="alipay"${activeTab === "alipay" ? "" : " hidden"}>
      <h2>自动查账</h2>
      <form method="post" action="/api/admin/polling/run" onsubmit="return submitPolling(event)" style="grid-template-columns:1fr auto;">
        <div class="note" style="padding:0;">开启自动查账并保存支付宝配置后，Cron 每分钟执行一次；这里也可以手动立即测试。</div>
        <button type="submit">立即查账</button>
      </form>
      <div class="scroll">${pollingRunsTable(pollingRuns, config.timeZone)}</div>
    </section>
    <section class="panel" data-panel="overview"${activeTab === "overview" ? "" : " hidden"}>
      <h2>订单</h2>
      <div class="scroll">${ordersTable(orders, config.timeZone)}</div>
    </section>
    <section class="panel" data-panel="overview"${activeTab === "overview" ? "" : " hidden"}>
      <h2>到账事件</h2>
      <div class="scroll">${eventsTable(events, config.timeZone)}</div>
    </section>
    <section class="panel" data-panel="overview"${activeTab === "overview" ? "" : " hidden"}>
      <h2>回调日志</h2>
      <div class="scroll">${callbacksTable(callbacks, config.timeZone)}</div>
    </section>
  </main>
  <script>
    const adminTabStorageKey = 'aepay-admin-tab';
    const adminTabs = ['overview', 'system', 'epay', 'payment', 'alipay', 'test'];
    function isAdminTab(value) {
      return adminTabs.includes(value);
    }
    function readAdminTabStorage() {
      try {
        return sessionStorage.getItem(adminTabStorageKey) || '';
      } catch {
        return '';
      }
    }
    function writeAdminTabStorage(value) {
      try {
        sessionStorage.setItem(adminTabStorageKey, value);
      } catch {
      }
    }
    function initialAdminTab() {
      const hash = location.hash ? location.hash.slice(1) : '';
      if (isAdminTab(hash)) return hash;
      const query = new URLSearchParams(location.search).get('tab') || '';
      if (isAdminTab(query)) return query;
      const stored = readAdminTabStorage();
      if (isAdminTab(stored)) return stored;
      return 'overview';
    }
    function applyAdminTab(target, persist = true) {
      const next = isAdminTab(target) ? target : 'overview';
      document.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === next));
      const settings = document.querySelector('#settings-section');
      if (settings) settings.hidden = !['system', 'epay', 'payment', 'alipay'].includes(next);
      document.querySelectorAll('[data-panel]').forEach(panel => {
        panel.hidden = panel.dataset.panel !== next;
      });
      const hiddenTab = document.querySelector('[name="admin_tab"]');
      if (hiddenTab) hiddenTab.value = next;
      if (persist) {
        writeAdminTabStorage(next);
        const url = new URL(location.href);
        if (next === 'overview') url.searchParams.delete('tab');
        else url.searchParams.set('tab', next);
        url.hash = '';
        history.replaceState(null, '', url.toString());
      }
    }
    applyAdminTab(initialAdminTab(), false);
    document.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        applyAdminTab(button.dataset.tab || 'overview');
      });
    });
    async function submitSettings(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const body = new FormData(form);
      body.set('admin_tab', document.querySelector('[name="admin_tab"]')?.value || initialAdminTab());
      if (submitButton) submitButton.disabled = true;
      showStatus('settings-save-status', '正在保存设置...');
      try {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { accept: 'application/json' },
          body
        });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        if (!res.ok) {
          showStatus('settings-save-status', (data && data.detail) ? data.detail : text || '保存失败', true);
          return false;
        }
        const nextTab = data && typeof data.tab === 'string' && isAdminTab(data.tab) ? data.tab : initialAdminTab();
        showStatus('settings-save-status', (data && data.message) ? data.message : '设置已保存');
        applyAdminTab(nextTab);
        window.setTimeout(() => location.reload(), 150);
      } catch (error) {
        showStatus('settings-save-status', error instanceof Error ? error.message : '网络请求失败', true);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return false;
    }
    async function submitTestOrder(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form).entries());
      const res = await fetch('/api/admin/test-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      if (!res.ok) {
        alert(text);
        return false;
      }
      const data = JSON.parse(text);
      const target = document.querySelector('#test-order-result');
      target.innerHTML = '测试订单 ' + data.merchant_order_no + '，实际应付 <strong>¥' + data.pay_amount + '</strong>。<a href="' + data.payment_url + '" target="_blank" rel="noopener">打开支付页</a>';
      return false;
    }
    async function submitPolling(event) {
      event.preventDefault();
      const res = await fetch('/api/admin/polling/run', { method: 'POST' });
      alert(await res.text());
      if (res.ok) location.reload();
      return false;
    }
    document.querySelectorAll('form[action="/api/admin/settings"]').forEach(form => {
      form.addEventListener('submit', submitSettings);
    });
    function fillSecret(name) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const bytes = new Uint8Array(40);
      crypto.getRandomValues(bytes);
      const value = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
      const input = document.querySelector('[name="' + name + '"]');
      if (input) {
        input.value = value;
        const target = name === 'epay_key' ? 'epay-action-status' : 'system-action-status';
        const label = name === 'callback_secret' ? '回调 HMAC 密钥' : name === 'merchant_api_key' ? '商户 API Key' : '易支付 Key';
        showStatus(target, label + '已生成，点击“保存设置”后生效。');
      }
    }
    function showStatus(id, message, isError) {
      const target = document.querySelector('#' + id);
      if (!target) return;
      target.textContent = message;
      target.classList.toggle('error', Boolean(isError));
    }
    async function copyText(value) {
      if (!value) {
        alert('还没有可复制的值');
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        alert('已复制');
      } catch {
        window.prompt('浏览器拦截了自动复制，请手动复制：', value);
      }
    }
    function base64FromArrayBuffer(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }
    function pemFromBase64(base64, type) {
      const lines = base64.match(/.{1,64}/g) || [];
      return '-----BEGIN ' + type + '-----\\n' + lines.join('\\n') + '\\n-----END ' + type + '-----';
    }
    function alipayPublicKeyText(publicPem) {
      return publicPem
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\\s+/g, '');
    }
    function alipayPrivateKeyText(privatePem) {
      return privatePem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\\s+/g, '');
    }
    function previewSecretText(value) {
      if (!value) return '未配置';
      return value.length <= 10 ? value : value.slice(0, 4) + '...' + value.slice(-4);
    }
    async function generateAlipayKeyPair() {
      const button = document.querySelector('#generate-alipay-key-button');
      try {
        if (!window.crypto || !crypto.subtle) throw new Error('当前浏览器不支持 WebCrypto，请用 HTTPS 页面或新版浏览器打开后台');
        if (button) button.disabled = true;
        showStatus('alipay-key-status', '正在生成密钥对，稍等几秒...');
        const pair = await crypto.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
          },
          true,
          ['sign', 'verify']
        );
        const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
        const publicKey = await crypto.subtle.exportKey('spki', pair.publicKey);
        const privatePem = pemFromBase64(base64FromArrayBuffer(privateKey), 'PRIVATE KEY');
        const publicPem = pemFromBase64(base64FromArrayBuffer(publicKey), 'PUBLIC KEY');
        const privateInput = document.querySelector('[name="alipay_private_key_pem"]');
        const privatePreview = document.querySelector('#alipay-app-private-key-preview');
        const publicHidden = document.querySelector('[name="alipay_app_public_key_text"]');
        const publicPreview = document.querySelector('#alipay-app-public-key-preview');
        const publicText = alipayPublicKeyText(publicPem);
        if (privateInput) privateInput.value = privatePem;
        if (privatePreview) privatePreview.textContent = previewSecretText(alipayPrivateKeyText(privatePem));
        if (publicHidden) publicHidden.value = publicText;
        if (publicPreview) publicPreview.textContent = previewSecretText(publicText);
        showStatus('alipay-key-status', '密钥对已生成：先点击“保存设置”，保存后再校验；再把新的应用公钥复制到支付宝开放平台。');
        showStatus('alipay-key-check-status', '刚生成的新密钥还没有保存，当前校验按钮仍会检查已保存的旧配置。');
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成失败';
        showStatus('alipay-key-status', message, true);
      } finally {
        if (button) button.disabled = false;
      }
    }
    async function copyAlipayPublicKey() {
      const output = document.querySelector('[name="alipay_app_public_key_text"]');
      if (!output || !output.value) {
        alert('请先生成支付宝应用密钥对');
        return;
      }
      try {
        await navigator.clipboard.writeText(output.value);
        alert('已复制应用公钥字符串，请粘贴到支付宝开放平台的应用公钥位置');
      } catch {
        window.prompt('浏览器拦截了自动复制，请手动复制：', output.value);
      }
    }
    async function checkAlipayKeyPair() {
      const target = 'alipay-key-check-status';
      try {
        const privateInput = document.querySelector('[name="alipay_private_key_pem"]');
        if (privateInput && privateInput.value.trim()) {
          showStatus(target, '你刚生成的新密钥还没保存。请先点页面底部“保存设置”，保存后再校验。', true);
          return;
        }
        showStatus(target, '正在校验本地应用密钥对...');
        const res = await fetch('/api/admin/alipay-key-check', { method: 'POST' });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        const preview = data && data.private_key_preview && data.app_public_key_preview
          ? ' 当前私钥：' + data.private_key_preview + '，应用公钥：' + data.app_public_key_preview + '。'
          : '';
        const message = data && typeof data.message === 'string' ? data.message + preview : text;
        showStatus(target, message, !res.ok || !data || data.status !== 'success');
      } catch (error) {
        showStatus(target, error instanceof Error ? error.message : '校验失败', true);
      }
    }
    const paymentPreviewThemes = {
      minimal: { colorScheme:'light', bg:'#f6f8fb', bg2:'#eef2f8', panel:'#ffffff', panelSoft:'#f8fafc', text:'#1f2937', muted:'#667085', line:'#dfe5ee', brand:'#102a43', brand2:'#3b82f6', accent:'#2563eb', qrBg:'#ffffff', radius:'8px', shadow:'0 12px 40px rgba(15,23,42,.08)' },
      alipay: { colorScheme:'light', bg:'#eef6ff', bg2:'#dfeeff', panel:'#ffffff', panelSoft:'#f7fbff', text:'#132238', muted:'#5b6b80', line:'#d2e3f3', brand:'#1677ff', brand2:'#4f8dff', accent:'#1677ff', qrBg:'#f7fbff', radius:'18px', shadow:'0 22px 56px rgba(22,119,255,.18)' },
      pearl: { colorScheme:'light', bg:'#f8fbff', bg2:'#edf5ff', panel:'#ffffff', panelSoft:'#f6faff', text:'#122033', muted:'#5d6d82', line:'#dce7f3', brand:'#1d4ed8', brand2:'#78b1ff', accent:'#2563eb', qrBg:'#f8fbff', radius:'22px', shadow:'0 20px 54px rgba(30,64,175,.14)' },
      aurora: { colorScheme:'light', bg:'#eef6ff', bg2:'#d8e9ff', panel:'#ffffff', panelSoft:'#f7fbff', text:'#132238', muted:'#596b81', line:'#d7e4f4', brand:'#2563eb', brand2:'#7ab0ff', accent:'#1d4ed8', qrBg:'#f8fbff', radius:'24px', shadow:'0 24px 60px rgba(37,99,235,.18)' },
      graphite: { colorScheme:'light', bg:'#f4f7fb', bg2:'#e7edf4', panel:'#ffffff', panelSoft:'#f7f9fc', text:'#1f2937', muted:'#687385', line:'#d7dfe8', brand:'#1f3a5f', brand2:'#446892', accent:'#2563eb', qrBg:'#ffffff', radius:'20px', shadow:'0 20px 54px rgba(31,41,55,.12)' },
      dark: { colorScheme:'dark', bg:'#101418', bg2:'#151b24', panel:'#171d23', panelSoft:'#1d2430', text:'#eef4f8', muted:'#a9b4bf', line:'#2b3640', brand:'#22c55e', brand2:'#0ea5e9', accent:'#38bdf8', qrBg:'#ffffff', radius:'18px', shadow:'0 18px 60px rgba(0,0,0,.35)' },
      warm: { colorScheme:'light', bg:'#f8f1e8', bg2:'#f0e6d8', panel:'#fffdf9', panelSoft:'#fff8ef', text:'#2b2118', muted:'#7a6a5a', line:'#eadfcc', brand:'#b45309', brand2:'#d97706', accent:'#c2410c', qrBg:'#fffaf2', radius:'18px', shadow:'0 18px 46px rgba(120,80,30,.14)' },
      midnight: { colorScheme:'dark', bg:'#0b1020', bg2:'#101a33', panel:'#111a2d', panelSoft:'#16213a', text:'#eef4ff', muted:'#a4b2c7', line:'#253451', brand:'#4f7cff', brand2:'#7b68ff', accent:'#68d4ff', qrBg:'#ffffff', radius:'24px', shadow:'0 24px 70px rgba(2,6,23,.48)' }
    };
    function setPaymentPreviewTheme(name) {
      const theme = paymentPreviewThemes[name] || paymentPreviewThemes.alipay;
      const preview = document.querySelector('#payment-page-preview');
      if (!preview) return;
      preview.style.colorScheme = theme.colorScheme || 'light';
      const keyMap = {
        bg2: '--preview-bg-2',
        panelSoft: '--preview-panel-soft',
        brand2: '--preview-brand-2',
        qrBg: '--preview-qr-bg',
      };
      Object.entries(theme).forEach(([key, value]) => {
        if (key === 'colorScheme') return;
        const variable = keyMap[key] || '--preview-' + key;
        preview.style.setProperty(variable, value);
      });
    }
    function setPaymentPreviewQr(src) {
      document.querySelectorAll('[data-payment-qr-target]').forEach(target => {
        target.textContent = '';
        if (!src) {
          const empty = document.createElement('div');
          empty.textContent = '未配置收款码';
          target.appendChild(empty);
          return;
        }
        const image = document.createElement('img');
        image.src = src;
        image.alt = '收款码预览';
        target.appendChild(image);
      });
    }
    async function submitPaymentQrAsset(body, successMessage) {
      try {
        const res = await fetch('/api/admin/payment-qr-assets', { method: 'POST', body });
        const text = await res.text();
        if (!res.ok) {
          showStatus('payment-qr-action-status', text || '操作失败', true);
          return false;
        }
        showStatus('payment-qr-action-status', successMessage);
        location.reload();
        return true;
      } catch (error) {
        showStatus('payment-qr-action-status', error instanceof Error ? error.message : '网络请求失败', true);
        return false;
      }
    }
    async function uploadPaymentQrAsset() {
      const fileInput = document.querySelector('#payment-qr-image-file');
      const nameInput = document.querySelector('#payment-qr-name');
      const file = fileInput && fileInput.files && fileInput.files[0];
      const name = nameInput ? nameInput.value.trim() : '';
      const body = new FormData();
      body.set('action', 'upload');
      if (!file) {
        showStatus('payment-qr-action-status', '请选择图片文件后再上传。', true);
        return;
      }
      body.set('payment_qr_image_file', file);
      if (name) body.set('payment_qr_name', name);
      showStatus('payment-qr-action-status', '正在保存收款码...');
      await submitPaymentQrAsset(body, '收款码已保存，正在刷新...');
    }
    async function uploadPaymentQrAssetFromUrl() {
      const urlInput = document.querySelector('#payment-qr-url');
      if (!urlInput || !urlInput.value.trim()) {
        showStatus('payment-qr-action-status', '请先填写收款码 URL。', true);
        return;
      }
      const nameInput = document.querySelector('#payment-qr-name');
      const body = new FormData();
      body.set('action', 'upload');
      body.set('payment_qr_image_url', urlInput.value.trim());
      if (nameInput && nameInput.value.trim()) body.set('payment_qr_name', nameInput.value.trim());
      showStatus('payment-qr-action-status', '正在保存收款码...');
      await submitPaymentQrAsset(body, '收款码已保存，正在刷新...');
    }
    async function selectPaymentQrAsset(id) {
      const body = new FormData();
      body.set('action', 'select');
      body.set('id', String(id));
      showStatus('payment-qr-action-status', '正在切换收款码...');
      await submitPaymentQrAsset(body, '收款码已切换，正在刷新...');
    }
    async function deletePaymentQrAsset(id) {
      if (!confirm('确定删除这张收款码吗？')) return;
      const body = new FormData();
      body.set('action', 'delete');
      body.set('id', String(id));
      showStatus('payment-qr-action-status', '正在删除收款码...');
      await submitPaymentQrAsset(body, '收款码已删除，正在刷新...');
    }
    function initPaymentPreviewControls() {
      const fileInput = document.querySelector('#payment-qr-image-file');
      const urlInput = document.querySelector('#payment-qr-url');
      const themeInput = document.querySelector('[name="payment_page_theme"]');
      const savedQr = ${JSON.stringify(config.collectQrImageUrl)};
      if (themeInput) setPaymentPreviewTheme(themeInput.value);
      if (fileInput) {
        fileInput.addEventListener('change', () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) {
            setPaymentPreviewQr(urlInput && urlInput.value.trim() ? urlInput.value.trim() : savedQr);
            showStatus('payment-preview-status', savedQr ? '当前展示的是已保存收款码。' : '还没有选择新图片。');
            return;
          }
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            showStatus('payment-preview-status', '只支持 PNG、JPG 或 WebP 图片。', true);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            setPaymentPreviewQr(String(reader.result || ''));
            showStatus('payment-preview-status', '正在预览新图片；点击上方“上传并设为当前”后才会正式生效。');
          };
          reader.readAsDataURL(file);
        });
      }
      if (urlInput) {
        urlInput.addEventListener('input', () => {
          const value = urlInput.value.trim();
          setPaymentPreviewQr(value || savedQr);
          showStatus('payment-preview-status', value ? '正在预览新的图片 URL；点击上方“添加 URL 收款码”后才会正式生效。' : savedQr ? '当前展示的是已保存收款码。' : '还没有配置收款码。');
        });
      }
      if (themeInput) {
        themeInput.addEventListener('change', () => setPaymentPreviewTheme(themeInput.value));
      }
    }
    async function resetSystem() {
      const confirmInput = document.querySelector('#reset-confirm');
      const keepAdmin = document.querySelector('#reset-keep-admin');
      const confirmValue = confirmInput ? confirmInput.value.trim() : '';
      if (confirmValue !== 'RESET') {
        alert('请输入 RESET 确认重置');
        return;
      }
      if (!confirm('确认重置系统？订单、到账、查账和回调日志会被清空。')) return;
      const body = new FormData();
      body.set('confirm', confirmValue);
      body.set('keep_admin', keepAdmin && keepAdmin.checked ? 'true' : 'false');
      const res = await fetch('/api/admin/reset', { method: 'POST', body });
      if (res.redirected) {
        location.href = res.url;
        return;
      }
      const text = await res.text();
      if (!res.ok) alert(text);
      else location.reload();
    }
    initPaymentPreviewControls();
  </script>
</body>
</html>`;
}

function settingsForm(config: AppConfig, activeTab: AdminTab): string {
  return `<form class="settings-form" method="post" action="/api/admin/settings" enctype="multipart/form-data">
    <input name="admin_tab" type="hidden" value="${escapeAttr(activeTab)}">
    <div class="panel" data-panel="system" hidden style="display:contents;">
    <div class="note wide" style="padding:0;">系统页只放本系统自己的行为设置和管理员账号。</div>
    <label>系统名称<input name="app_name" value="${escapeAttr(config.appName)}" required></label>
    <label>显示时区
      <select name="time_zone">
        ${timeZoneOption(config.timeZone, "Asia/Shanghai", "北京时间 Asia/Shanghai")}
        ${timeZoneOption(config.timeZone, "UTC", "UTC")}
        ${timeZoneOption(config.timeZone, "Asia/Hong_Kong", "香港 Asia/Hong_Kong")}
        ${timeZoneOption(config.timeZone, "Asia/Tokyo", "东京 Asia/Tokyo")}
        ${timeZoneOption(config.timeZone, "America/Los_Angeles", "洛杉矶 America/Los_Angeles")}
      </select>
    </label>
    <label>回调 HMAC 密钥，仅 JSON 回调用<input name="callback_secret" type="password" placeholder="${secretPlaceholder(config.callbackSecret)}"></label>
    <label>商户 API Key，仅直连 API 用<input name="merchant_api_key" type="password" placeholder="${secretPlaceholder(config.merchantApiKey)}"></label>
    <label>管理员账号<input name="admin_username" value="${escapeAttr(config.adminUsername)}" autocomplete="username"></label>
    <label>管理员新密码
      <div class="password-field">
        <input name="admin_password" type="password" placeholder="${secretPlaceholder(config.adminPasswordHash)}" autocomplete="new-password">
        <button type="button" class="toggle-password" onclick="togglePasswordField(this)">显示</button>
      </div>
    </label>
    <div class="wide" style="display:flex; flex-wrap:wrap; gap:10px;">
      <button type="button" onclick="fillSecret('callback_secret')">生成回调 HMAC 密钥</button>
      <button type="button" onclick="fillSecret('merchant_api_key')">生成商户 API Key</button>
    </div>
    <div id="system-action-status" class="action-status wide"></div>
    <div class="wide" style="border:1px solid #f3b4ad; border-radius:8px; padding:14px; background:#fff7f6; display:grid; gap:10px;">
      <strong style="color:#b42318;">危险操作</strong>
      <div class="note" style="padding:0;">重置会清空订单、到账事件、支付宝流水、查账日志、回调日志，并恢复所有业务配置默认值。默认保留当前管理员账号。</div>
      <div style="display:grid; grid-template-columns:minmax(180px,260px) auto auto; gap:10px; align-items:end;">
        <label>输入 RESET 确认<input id="reset-confirm" autocomplete="off"></label>
        <label style="display:flex; align-items:center; gap:8px; color:#667085;"><input id="reset-keep-admin" type="checkbox" checked style="width:auto; min-height:0;">保留管理员账号</label>
        <button type="button" onclick="resetSystem()" style="background:#b42318;">重置系统</button>
      </div>
    </div>
    </div>

    <div class="panel" data-panel="epay" hidden style="display:contents;">
    <div class="note wide" style="padding:0;">易支付页放给上游商城/发卡系统配置的参数。</div>
    <label>易支付 PID，必填<input name="epay_pid" value="${escapeAttr(config.epayPid)}" required></label>
    <label>易支付 Key，必填<input name="epay_key" type="password" placeholder="${secretPlaceholder(config.epayKey)}"></label>
    <div class="note wide" style="padding:0;">当前易支付 Key：${secretPreview(config.epayKey)} ${config.epayKey ? `<button type="button" onclick="copyText('${escapeJs(config.epayKey)}')">复制易支付 Key</button>` : ""}</div>
    <div class="wide" style="display:flex; flex-wrap:wrap; gap:10px;">
      <button type="button" onclick="fillSecret('epay_key')">生成易支付 Key</button>
    </div>
    <div id="epay-action-status" class="action-status wide"></div>
    </div>

    <div class="panel" data-panel="payment" hidden style="display:contents;">
    <div class="note wide" style="padding:0;">支付页设置只影响用户扫码付款页面，不影响支付宝开放平台查账。</div>
    <label>订单过期分钟<input name="order_expire_minutes" value="${escapeAttr(config.orderExpireMinutes)}" inputmode="numeric" required></label>
    <label>金额尾数范围<input name="amount_variance_cents" value="${escapeAttr(config.amountVarianceCents)}" inputmode="numeric" required></label>
    ${paymentQrAssetsMarkup(config)}
    <label>支付页主题
      <select name="payment_page_theme">
        ${paymentThemeOption(config.paymentPageTheme, "alipay", "支付宝蓝")}
        ${paymentThemeOption(config.paymentPageTheme, "minimal", "简洁白")}
        ${paymentThemeOption(config.paymentPageTheme, "pearl", "珍珠白")}
        ${paymentThemeOption(config.paymentPageTheme, "aurora", "极光蓝")}
        ${paymentThemeOption(config.paymentPageTheme, "graphite", "石墨灰")}
        ${paymentThemeOption(config.paymentPageTheme, "midnight", "深夜蓝")}
        ${paymentThemeOption(config.paymentPageTheme, "dark", "暗色")}
        ${paymentThemeOption(config.paymentPageTheme, "warm", "暖色")}
      </select>
    </label>
    <div id="payment-preview-status" class="action-status wide">${config.collectQrImageUrl ? "当前已有可用收款码，下面预览会显示当前选中的资产。" : "还没有配置收款码，先上传或添加一张再预览。"}</div>
    ${paymentSettingsPreview(config)}
    </div>

    <div class="panel" data-panel="alipay" hidden style="display:contents;">
    <div class="note wide" style="padding:0;">支付宝页只放开放平台查账和验签配置。查账接口已内置为支付宝商家账户账务明细查询。</div>
    <label>收款账号标识，可空<input name="collect_account" value="${escapeAttr(config.collectAccount)}" placeholder="用于多收款账号时过滤匹配"></label>
    <label>支付宝 APP_ID，必填<input name="alipay_app_id" type="password" placeholder="${secretPlaceholder(config.alipayAppId)}"></label>
    <input name="alipay_app_public_key_text" type="hidden" value="${escapeAttr(config.alipayAppPublicKeyText)}">
    <label>自动查账
      <select name="alipay_poll_enabled">
        <option value="false"${config.alipayPollEnabled !== "true" ? " selected" : ""}>关闭</option>
        <option value="true"${config.alipayPollEnabled === "true" ? " selected" : ""}>开启</option>
      </select>
    </label>
    <label>查账接口<input value="支付宝商家账户账务明细查询" disabled></label>
    <label>查账回看分钟<input name="alipay_poll_window_minutes" value="${escapeAttr(config.alipayPollWindowMinutes)}" inputmode="numeric" required></label>
    <label class="wide">支付宝网关，默认即可<input name="alipay_gateway_url" value="${escapeAttr(config.alipayGatewayUrl)}" required></label>
    <div class="note wide" style="padding:0; font-weight:700; color:#1f2937;">AEPay 应用密钥：点击生成后必须先保存设置；保存后的应用公钥再复制到支付宝开放平台。</div>
    <label>支付宝通知验签
      <select name="alipay_notify_verify_required">
        <option value="true"${config.alipayNotifyVerifyRequired === "true" ? " selected" : ""}>开启</option>
        <option value="false"${config.alipayNotifyVerifyRequired === "false" ? " selected" : ""}>关闭</option>
      </select>
    </label>
    <div class="wide" style="display:flex; flex-wrap:wrap; gap:10px;">
      <button id="generate-alipay-key-button" type="button" onclick="generateAlipayKeyPair()">生成支付宝应用密钥对</button>
      <button type="button" onclick="copyAlipayPublicKey()">复制应用公钥</button>
      <button type="button" onclick="checkAlipayKeyPair()">校验已保存密钥对</button>
    </div>
    <div id="alipay-key-status" class="action-status wide"></div>
    <div id="alipay-key-check-status" class="action-status wide"></div>
    <div class="note wide" style="padding:0;">当前应用私钥：<span id="alipay-app-private-key-preview">${secretPreview(alipayPrivateKeyText(config.alipayPrivateKeyPem))}</span></div>
    <input name="alipay_private_key_pem" type="hidden" value="">
    <div class="note wide" style="padding:0;">当前应用公钥：<span id="alipay-app-public-key-preview">${secretPreview(config.alipayAppPublicKeyText)}</span> ${config.alipayAppPublicKeyText ? `<button type="button" onclick="copyAlipayPublicKey()">复制应用公钥</button>` : ""}</div>
    <div class="note wide" style="padding:0; font-weight:700; color:#1f2937;">支付宝平台公钥：从支付宝开放平台复制到这里，只用于通知验签。它不是上面的应用公钥，也不能复制到“应用公钥”位置。</div>
    <div class="note wide" style="padding:0;">当前支付宝公钥：${secretPreview(publicKeyText(config.alipayPublicKeyPem))} ${config.alipayPublicKeyPem ? `<button type="button" onclick="copyText('${escapeJs(publicKeyText(config.alipayPublicKeyPem))}')">复制支付宝公钥</button>` : ""}</div>
    <label class="wide">支付宝公钥<textarea name="alipay_public_key_text" placeholder="粘贴支付宝开放平台提供的支付宝公钥字符串，保存时会自动处理格式"></textarea></label>
    </div>

    <button type="submit">保存设置</button>
    <div id="settings-save-status" class="action-status wide"></div>
    <div class="note wide">密钥类字段留空表示不修改；易支付接入只需要配置易支付 PID 和易支付 Key。商户 API Key 只给直接调用 /api/orders 的程序用。订单过期分钟和金额尾数范围已放到支付页设置里。</div>
  </form>`;
}

function paymentSettingsPreview(config: AppConfig): string {
  const theme = paymentTheme(config.paymentPageTheme);
  const activeAsset = config.paymentQrAssets.find((asset) => String(asset.id) === config.collectQrAssetId) || null;
  const activeLabel = activeAsset
    ? `${activeAsset.name || "未命名"} · ${paymentQrAssetSourceLabel(activeAsset.source)}`
    : config.collectQrImageUrl
      ? "备用 URL"
      : "未配置";
  const previewStyle = [
    `--preview-bg:${theme.bg}`,
    `--preview-bg-2:${theme.bg2}`,
    `--preview-panel:${theme.panel}`,
    `--preview-panel-soft:${theme.panelSoft}`,
    `--preview-text:${theme.text}`,
    `--preview-muted:${theme.muted}`,
    `--preview-line:${theme.line}`,
    `--preview-brand:${theme.brand}`,
    `--preview-brand-2:${theme.brand2}`,
    `--preview-accent:${theme.accent}`,
    `--preview-qr-bg:${theme.qrBg}`,
    `--preview-radius:${theme.radius}`,
    `--preview-shadow:${theme.shadow}`,
  ].join(";");
  const qrPreview = paymentQrPreview(config.collectQrImageUrl);
  return `<div class="payment-preview-grid">
    <div class="preview-card">
      <strong>当前收款码</strong>
      <div class="note" style="padding:0;">当前选中：${escapeHtml(activeLabel)}</div>
      <div class="saved-qr-frame" data-payment-qr-target>${qrPreview}</div>
      <div class="note" style="padding:0;">这里显示的是当前实际生效的收款码，删除或切换后会立刻更新。</div>
    </div>
    <div class="preview-card">
      <strong>支付页预览</strong>
      <div id="payment-page-preview" class="pay-preview-canvas" style="${escapeAttr(previewStyle)}">
        <div class="pay-preview-phone">
          <div class="pay-preview-mark">支</div>
          <h3>支付宝扫码付款</h3>
          <div class="pay-preview-amount">¥9.91</div>
          <div class="pay-preview-timer">剩余支付时间 <strong style="margin-left:6px;color:var(--preview-accent);">14:59</strong></div>
          <div class="preview-qr-frame" data-payment-qr-target>${qrPreview}</div>
          <p style="margin:10px 0 0;color:var(--preview-muted);font-size:13px;">请按页面金额付款，付款后将自动确认。</p>
          <div class="pay-preview-meta">
            <div><span>订单号</span><strong>PREVIEW-ORDER</strong></div>
            <div><span>商品</span><strong>支付页预览</strong></div>
            <div><span>状态</span><strong>pending</strong></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function paymentQrPreview(src: string): string {
  return src
    ? `<img src="${escapeAttr(src)}" alt="收款码预览">`
    : `<div>未配置收款码</div>`;
}

function paymentQrAssetSourceLabel(source: string): string {
  if (source === "upload") return "本地上传";
  if (source === "url") return "外链";
  return source || "未知来源";
}

function paymentQrAssetsMarkup(config: AppConfig): string {
  const activeAsset = config.paymentQrAssets.find((asset) => String(asset.id) === config.collectQrAssetId) || null;
  const activeLabel = activeAsset
    ? `${activeAsset.name || "未命名"} · ${paymentQrAssetSourceLabel(activeAsset.source)}`
    : config.collectQrImageUrl
      ? "备用 URL"
      : "未配置";
  const assetRows = config.paymentQrAssets.length
    ? config.paymentQrAssets
        .map((row) => {
          const isActive = String(row.id) === config.collectQrAssetId;
          return `<div class="qr-asset${isActive ? " active" : ""}">
            <img src="${escapeAttr(row.value)}" alt="${escapeAttr(row.name || "收款码")}" loading="lazy">
            <div class="qr-asset-body">
              <strong>${escapeHtml(row.name || "未命名收款码")}</strong>
              <div class="qr-asset-meta">
                <span>${escapeHtml(paymentQrAssetSourceLabel(row.source))}</span>
                <span>${escapeHtml(row.mime_type || "未知类型")}</span>
                <span>更新 ${escapeHtml(shortDate(row.updated_at, config.timeZone))}</span>
              </div>
            </div>
            <div class="qr-asset-actions">
              ${isActive ? `<span class="pill paid">当前使用</span>` : `<button type="button" class="secondary" onclick="selectPaymentQrAsset(${row.id})">设为当前</button>`}
              <button type="button" class="secondary danger" onclick="deletePaymentQrAsset(${row.id})">删除</button>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="qr-empty">还没有收款码资产，先上传一张，或者填一个 URL。</div>`;
  return `<div class="qr-manager">
    <div class="qr-manager-head">
      <strong>收款码资产管理</strong>
      <span>当前使用：${escapeHtml(activeLabel)}</span>
    </div>
    <div class="qr-upload-grid">
      <label>收款码名称<input id="payment-qr-name" placeholder="例如：主收款码"></label>
      <label>选择图片文件<input id="payment-qr-image-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <button type="button" onclick="uploadPaymentQrAsset()">上传并设为当前</button>
      <label class="wide">或者填写收款码 URL<input id="payment-qr-url" placeholder="https://.../alipay-qr.png"></label>
      <button type="button" onclick="uploadPaymentQrAssetFromUrl()">添加 URL 收款码</button>
    </div>
    <div id="payment-qr-action-status" class="action-status"></div>
    <div class="qr-asset-list">
      ${assetRows}
    </div>
  </div>`;
}

function loginPage(config: AppConfig, hasError: boolean): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)} 登录</title>
  <style>
    :root { --bg:#edf3fb; --bg-2:#f8fbff; --panel:#ffffff; --text:#0f172a; --muted:#5b6474; --line:#d8e1ee; --brand:#265cf0; --brand-2:#4f8cff; }
    * { box-sizing:border-box; }
    body {
      margin:0;
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:32px 16px;
      background:
        radial-gradient(circle at 12% 0%, rgba(38,92,240,.16), transparent 28%),
        radial-gradient(circle at 88% 10%, rgba(79,140,255,.12), transparent 24%),
        linear-gradient(180deg, var(--bg-2), var(--bg));
      color:var(--text);
      font:15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      position:relative;
    }
    body::before {
      content:"";
      position:fixed;
      inset:0;
      background-image:linear-gradient(rgba(15,23,42,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.022) 1px, transparent 1px);
      background-size:72px 72px;
      mask-image:linear-gradient(180deg, rgba(0,0,0,.65), transparent 92%);
      pointer-events:none;
    }
    main {
      width:min(420px, calc(100vw - 32px));
      background:rgba(255,255,255,.9);
      border:1px solid rgba(216,225,238,.92);
      border-radius:24px;
      padding:28px;
      box-shadow:0 24px 70px rgba(15,23,42,.10);
      backdrop-filter: blur(16px);
    }
    .brand { display:grid; gap:10px; justify-items:center; margin-bottom:22px; text-align:center; }
    .brand-mark {
      width:54px;
      height:54px;
      border-radius:18px;
      display:grid;
      place-items:center;
      color:#fff;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow:0 16px 34px rgba(38,92,240,.24);
      font-size:26px;
      font-weight:900;
    }
    h1 { margin:0; font-size:24px; text-align:center; letter-spacing:.02em; }
    .subtitle { color:var(--muted); text-align:center; }
    form { display:grid; gap:12px; }
    label { display:grid; gap:6px; color:var(--muted); font-size:13px; }
    input {
      width:100%;
      min-height:42px;
      border:1px solid var(--line);
      border-radius:12px;
      padding:0 12px;
      font:inherit;
      color:var(--text);
      background:#fff;
    }
    .password-field {
      display:grid;
      grid-template-columns:1fr auto;
      gap:8px;
      align-items:center;
    }
    .password-field input { min-width:0; }
    .toggle-password {
      min-height:42px;
      padding:0 14px;
      border:1px solid var(--line);
      border-radius:12px;
      background:#f8fbff;
      color:var(--brand);
      box-shadow:none;
      font-weight:800;
      white-space:nowrap;
    }
    .toggle-password:hover { background:#eef5ff; }
    input:focus { outline:none; border-color:rgba(38,92,240,.5); box-shadow:0 0 0 4px rgba(38,92,240,.10); }
    button {
      min-height:42px;
      border:0;
      border-radius:12px;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      color:white;
      font-weight:800;
      cursor:pointer;
      box-shadow:0 12px 24px rgba(38,92,240,.18);
    }
    .error {
      margin:0 0 12px;
      color:#b42318;
      text-align:center;
      background:#fff7f5;
      border:1px solid rgba(180,35,24,.14);
      border-radius:12px;
      padding:10px 12px;
      font-weight:650;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="brand-mark">支</div>
      <h1>${escapeHtml(config.appName)}</h1>
      <div class="subtitle">安全支付后台登录</div>
    </div>
    ${hasError ? `<p class="error">账号或密码错误</p>` : ""}
    <form method="post" action="/admin/login">
      <label>管理员账号<input name="username" autocomplete="username" required autofocus></label>
      <label>密码
        <div class="password-field">
          <input name="password" type="password" autocomplete="current-password" required>
          <button type="button" class="toggle-password" onclick="togglePasswordField(this)">显示</button>
        </div>
      </label>
      <button type="submit">登录</button>
    </form>
    <script>
      function togglePasswordField(button) {
        const field = button && button.parentElement ? button.parentElement.querySelector('input') : null;
        if (!field) return;
        const nextType = field.type === 'password' ? 'text' : 'password';
        field.type = nextType;
        button.textContent = nextType === 'password' ? '显示' : '隐藏';
      }
    </script>
  </main>
</body>
</html>`;
}

function setupPage(config: AppConfig): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)} 初始化</title>
  <style>
    :root { --bg:#edf3fb; --bg-2:#f8fbff; --panel:#ffffff; --text:#0f172a; --muted:#5b6474; --line:#d8e1ee; --brand:#265cf0; --brand-2:#4f8cff; }
    * { box-sizing:border-box; }
    body {
      margin:0;
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:32px 16px;
      background:
        radial-gradient(circle at 12% 0%, rgba(38,92,240,.16), transparent 28%),
        radial-gradient(circle at 88% 10%, rgba(79,140,255,.12), transparent 24%),
        linear-gradient(180deg, var(--bg-2), var(--bg));
      color:var(--text);
      font:15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      position:relative;
    }
    body::before {
      content:"";
      position:fixed;
      inset:0;
      background-image:linear-gradient(rgba(15,23,42,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.022) 1px, transparent 1px);
      background-size:72px 72px;
      mask-image:linear-gradient(180deg, rgba(0,0,0,.65), transparent 92%);
      pointer-events:none;
    }
    main {
      width:min(440px, calc(100vw - 32px));
      background:rgba(255,255,255,.9);
      border:1px solid rgba(216,225,238,.92);
      border-radius:24px;
      padding:28px;
      box-shadow:0 24px 70px rgba(15,23,42,.10);
      backdrop-filter: blur(16px);
    }
    .brand { display:grid; gap:10px; justify-items:center; margin-bottom:22px; text-align:center; }
    .brand-mark {
      width:54px;
      height:54px;
      border-radius:18px;
      display:grid;
      place-items:center;
      color:#fff;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow:0 16px 34px rgba(38,92,240,.24);
      font-size:26px;
      font-weight:900;
    }
    h1 { margin:0; font-size:24px; text-align:center; letter-spacing:.02em; }
    p { margin:0 0 18px; color:var(--muted); text-align:center; }
    form { display:grid; gap:12px; }
    label { display:grid; gap:6px; color:var(--muted); font-size:13px; }
    input {
      width:100%;
      min-height:42px;
      border:1px solid var(--line);
      border-radius:12px;
      padding:0 12px;
      font:inherit;
      color:var(--text);
      background:#fff;
    }
    .password-field {
      display:grid;
      grid-template-columns:1fr auto;
      gap:8px;
      align-items:center;
    }
    .password-field input { min-width:0; }
    .toggle-password {
      min-height:42px;
      padding:0 14px;
      border:1px solid var(--line);
      border-radius:12px;
      background:#f8fbff;
      color:var(--brand);
      box-shadow:none;
      font-weight:800;
      white-space:nowrap;
    }
    .toggle-password:hover { background:#eef5ff; }
    input:focus { outline:none; border-color:rgba(38,92,240,.5); box-shadow:0 0 0 4px rgba(38,92,240,.10); }
    button {
      min-height:42px;
      border:0;
      border-radius:12px;
      background:linear-gradient(135deg, var(--brand), var(--brand-2));
      color:white;
      font-weight:800;
      cursor:pointer;
      box-shadow:0 12px 24px rgba(38,92,240,.18);
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="brand-mark">支</div>
      <h1>创建管理员</h1>
    </div>
    <p>首次部署后创建后台账号，只能初始化一次。</p>
    <form method="post" action="/admin/setup">
      <label>管理员账号<input name="username" autocomplete="username" required autofocus></label>
      <label>密码
        <div class="password-field">
          <input name="password" type="password" autocomplete="new-password" minlength="8" required>
          <button type="button" class="toggle-password" onclick="togglePasswordField(this)">显示</button>
        </div>
      </label>
      <label>确认密码
        <div class="password-field">
          <input name="confirm_password" type="password" autocomplete="new-password" minlength="8" required>
          <button type="button" class="toggle-password" onclick="togglePasswordField(this)">显示</button>
        </div>
      </label>
      <button type="submit">创建并登录</button>
    </form>
    <script>
      function togglePasswordField(button) {
        const field = button && button.parentElement ? button.parentElement.querySelector('input') : null;
        if (!field) return;
        const nextType = field.type === 'password' ? 'text' : 'password';
        field.type = nextType;
        button.textContent = nextType === 'password' ? '显示' : '隐藏';
      }
    </script>
  </main>
</body>
</html>`;
}

function secretPlaceholder(value: string): string {
  return value ? "已配置，留空不修改" : "未配置";
}

function secretPreview(value: string): string {
  if (!value) return "未配置";
  if (value.length <= 10) return escapeHtml(value);
  return `${escapeHtml(value.slice(0, 4))}...${escapeHtml(value.slice(-4))}`;
}

function publicKeyText(value: string): string {
  return value
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
}

function alipayPrivateKeyText(value: string): string {
  return value
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
}

function escapeJs(value: string): string {
  return escapeAttr(value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, ""));
}

function timeZoneOption(current: string, value: string, label: string): string {
  return `<option value="${escapeAttr(value)}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function paymentThemeOption(current: string, value: string, label: string): string {
  return `<option value="${escapeAttr(value)}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function paymentThemeLabel(value: string): string {
  switch (value) {
    case "alipay":
      return "支付宝蓝";
    case "minimal":
      return "简洁白";
    case "pearl":
      return "珍珠白";
    case "aurora":
      return "极光蓝";
    case "graphite":
      return "石墨灰";
    case "midnight":
      return "深夜蓝";
    case "dark":
      return "暗色";
    case "warm":
      return "暖色";
    default:
      return value || "未命名主题";
  }
}

type TableCell = string | { html: string };

function ordersTable(rows: OrderRow[], timeZone: string): string {
  return table(
    ["订单号", "原金额", "应付", "模式", "状态", "交易号", "创建", "过期"],
    rows.map((row) => [
      row.merchant_order_no,
      row.amount,
      row.pay_amount,
      row.compat_type,
      statusPill(row.status),
      row.alipay_trade_no || "-",
      shortDate(row.created_at, timeZone),
      shortDate(row.expires_at, timeZone),
    ]),
  );
}

function eventsTable(rows: PaymentEventRow[], timeZone: string): string {
  return table(
    ["交易号", "金额", "付款方", "匹配订单", "支付时间"],
    rows.map((row) => [
      row.provider_trade_no,
      row.amount,
      row.payer || "-",
      row.matched_order_id ? String(row.matched_order_id) : "-",
      shortDate(row.paid_at, timeZone),
    ]),
  );
}

function callbacksTable(rows: CallbackLogRow[], timeZone: string): string {
  return table(
    ["订单 ID", "状态", "HTTP", "次数", "地址", "时间"],
    rows.map((row) => [
      String(row.order_id),
      statusPill(row.status),
      row.response_status ? String(row.response_status) : "-",
      String(row.attempts),
      row.notify_url,
      shortDate(row.created_at, timeZone),
    ]),
  );
}

function pollingRunsTable(rows: PollingRunRow[], timeZone: string): string {
  return table(
    ["状态", "查账窗口", "获取", "匹配", "错误", "时间"],
    rows.map((row) => [
      statusPill(row.status),
      `${shortDate(row.window_start, timeZone)} - ${shortDate(row.window_end, timeZone)}`,
      String(row.fetched_count),
      String(row.matched_count),
      row.error || "-",
      shortDate(row.started_at, timeZone),
    ]),
  );
}

function table(headers: string[], rows: TableCell[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body =
    rows.length > 0
      ? rows
          .map((row) => `<tr>${row.map((cell) => `<td>${tableCell(cell)}</td>`).join("")}</tr>`)
          .join("")
      : `<tr><td colspan="${headers.length}">暂无数据</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tableCell(cell: TableCell): string {
  return typeof cell === "string" ? escapeHtml(cell) : cell.html;
}

function statusPill(status: string): TableCell {
  return { html: `<span class="pill ${escapeHtml(status)}">${escapeHtml(status)}</span>` };
}

function publicHome(config: AppConfig): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)}</title>
  <style>
    :root { color-scheme: light; --ink:#182230; --muted:#596579; --line:#d8dee8; --paper:#ffffff; --wash:#f5f7fa; --brand:#0f766e; --blue:#1d4ed8; --warn:#9a6700; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font:15px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--wash); }
    header { border-bottom:1px solid var(--line); background:rgba(255,255,255,.92); backdrop-filter:blur(10px); }
    .nav { max-width:1120px; margin:0 auto; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:18px; }
    .mark { width:30px; height:30px; display:grid; place-items:center; border-radius:8px; background:#102a43; color:white; font-weight:800; }
    .admin { min-height:38px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #0f5f59; border-radius:6px; padding:0 14px; color:white; background:var(--brand); text-decoration:none; font-weight:700; }
    main { max-width:1120px; margin:0 auto; padding:58px 22px 34px; }
    .hero { display:grid; grid-template-columns:minmax(0, 1.02fr) minmax(360px, .98fr); gap:48px; align-items:center; }
    h1 { margin:0; max-width:680px; font-size:clamp(34px, 5vw, 62px); line-height:1.05; letter-spacing:0; }
    .lead { max-width:620px; margin:22px 0 0; color:var(--muted); font-size:18px; }
    .actions { margin-top:28px; display:flex; flex-wrap:wrap; align-items:center; gap:14px; }
    .secondary { min-height:38px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:6px; padding:0 14px; color:var(--ink); background:white; text-decoration:none; font-weight:700; }
    .note { color:var(--muted); font-size:13px; }
    .preview { border:1px solid var(--line); border-radius:8px; background:var(--paper); box-shadow:0 18px 45px rgba(24,34,48,.10); overflow:hidden; }
    .preview-head { padding:14px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); }
    .dots { display:flex; gap:6px; }
    .dot { width:9px; height:9px; border-radius:999px; background:#c7d0dd; }
    .live { color:var(--brand); font-size:12px; font-weight:800; }
    .preview-body { padding:18px; display:grid; gap:14px; }
    .metric-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .metric { border:1px solid var(--line); border-radius:8px; padding:14px; background:#fbfcfe; }
    .label { color:var(--muted); font-size:12px; }
    .value { margin-top:4px; font-size:24px; font-weight:800; }
    .order { border:1px solid var(--line); border-radius:8px; padding:14px; display:grid; gap:10px; }
    .order-top { display:flex; justify-content:space-between; gap:12px; align-items:center; }
    .tag { min-height:24px; display:inline-flex; align-items:center; border-radius:999px; padding:0 8px; background:#e8f7f1; color:#0b6b52; font-size:12px; font-weight:800; }
    .bar { height:8px; border-radius:999px; background:#dbeafe; overflow:hidden; }
    .bar span { display:block; width:72%; height:100%; background:var(--blue); }
    .steps { margin-top:44px; display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; }
    .step { border-top:2px solid var(--line); padding-top:14px; color:var(--muted); }
    .step strong { display:block; margin-bottom:5px; color:var(--ink); }
    .compliance { margin-top:34px; border:1px solid #ead79c; border-radius:8px; background:#fff9e8; color:#6f4e00; padding:14px 16px; }
    @media (max-width: 860px) {
      main { padding-top:34px; }
      .hero { grid-template-columns:1fr; gap:28px; }
      .preview { max-width:560px; }
      .steps { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="nav">
      <div class="brand"><span class="mark">A</span><span>${escapeHtml(config.appName)}</span></div>
      <a class="admin" href="/admin">进入后台</a>
    </div>
  </header>
  <main>
    <section class="hero">
      <div>
        <h1>经营码收款确认，更清楚地对账和回调。</h1>
        <p class="lead">${escapeHtml(config.appName)} 部署在 Cloudflare Workers 和 D1 上，用于创建待支付订单、轮询支付宝账单流水，并把确认结果通知给你的业务系统。</p>
        <div class="actions">
          <a class="admin" href="/admin">管理订单</a>
          <a class="secondary" href="/health">服务状态</a>
          <span class="note">首次进入后台会创建管理员账号</span>
        </div>
      </div>
      <div class="preview" aria-hidden="true">
        <div class="preview-head">
          <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
          <span class="live">D1 ONLINE</span>
        </div>
        <div class="preview-body">
          <div class="metric-row">
            <div class="metric"><div class="label">待确认</div><div class="value">12</div></div>
            <div class="metric"><div class="label">今日到账</div><div class="value">¥286.40</div></div>
          </div>
          <div class="order">
            <div class="order-top"><strong>ORDER-20260523</strong><span class="tag">已匹配</span></div>
            <div class="label">应付金额 ¥9.91 · 支付宝交易号 2026******001</div>
            <div class="bar"><span></span></div>
          </div>
        </div>
      </div>
    </section>
    <section class="steps">
      <div class="step"><strong>创建订单</strong>生成带尾数区分的应付金额，降低同额订单碰撞。</div>
      <div class="step"><strong>确认到账</strong>定时查询支付宝开放平台账单流水，自动匹配待支付订单。</div>
      <div class="step"><strong>发送回调</strong>订单匹配成功后，向业务系统发送签名回调。</div>
    </section>
    <div class="compliance">合规提醒：本系统只做收款确认和对账记录，不提供支付清算，不规避平台风控，也不适用于代收、跑分等违规场景。</div>
  </main>
</body>
</html>`;
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${hex(signature)}`;
}

async function rsa2Sign(privateKeyPem: string, content: string): Promise<string> {
  const normalizedPrivateKeyPem = normalizePrivateKeyPem(privateKeyPem);
  if (!normalizedPrivateKeyPem || isPkcs1PrivateKey(normalizedPrivateKeyPem)) {
    throw new Error("private key format is invalid");
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPrivateKeyArrayBuffer(normalizedPrivateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(content));
  return arrayBufferToBase64(signature);
}

async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function verifyAlipayRsa2(params: Record<string, string>, publicKeyPem: string): Promise<boolean> {
  const sign = params.sign;
  if (!sign || !publicKeyPem) return false;
  const keyData = pemToArrayBuffer(publicKeyPem);
  const key = await crypto.subtle.importKey(
    "spki",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const content = alipaySignContent(params);
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64ToArrayBuffer(sign),
    new TextEncoder().encode(content),
  );
}

function alipaySignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToArrayBuffer(normalized);
}

function pemToPrivateKeyArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToArrayBuffer(normalized);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatAlipayTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function formToRecord(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

function parseAlipayTime(value: string): string {
  if (!value) return "";
  try {
    return normalizeDate(value.replace(" ", "T") + "+08:00", "gmt_payment");
  } catch {
    return "";
  }
}

function assertAlipayNotifyContext(params: Record<string, string>, config: AppConfig): void {
  if (config.alipayAppId && params.app_id && params.app_id !== config.alipayAppId) {
    throw new HttpError(400, "invalid app_id");
  }
  if (config.collectAccount && params.seller_id && params.seller_id !== config.collectAccount) {
    throw new HttpError(400, "invalid seller_id");
  }
}

function normalizeDate(value: string, field: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field} must be a valid date`);
  return date.toISOString();
}

function assertText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() === "") throw new HttpError(400, `${field} is required`);
}

function assertMoney(value: string, field: string): void {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new HttpError(400, `${field} must be money`);
  if (moneyToCents(value) <= 0) throw new HttpError(400, `${field} must be greater than zero`);
}

function assertPositiveInteger(value: string, field: string): void {
  if (!/^[1-9]\d*$/.test(value)) throw new HttpError(400, `${field} must be a positive integer`);
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format(new Date());
  } catch {
    throw new HttpError(400, "time_zone must be a valid IANA timezone");
  }
}

function assertPaymentTheme(value: string): void {
  if (!["alipay", "minimal", "pearl", "aurora", "graphite", "dark", "warm", "midnight"].includes(value)) {
    throw new HttpError(400, "payment_page_theme is invalid");
  }
}

function assertUrl(value: string, field: string): void {
  try {
    const url = new URL(value);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) throw new Error();
  } catch {
    throw new HttpError(400, `${field} must be a valid HTTPS URL`);
  }
}

function moneyToCents(value: string): number {
  const [yuan, cents = ""] = String(value).split(".");
  return Number(yuan) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
}

function centsToMoney(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  const bitLength = bytes.length * 8;
  words[bitLength >> 5] |= 0x80 << bitLength % 32;
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = md5ff(a, b, c, d, words[i + 0] || 0, 7, -680876936);
    d = md5ff(d, a, b, c, words[i + 1] || 0, 12, -389564586);
    c = md5ff(c, d, a, b, words[i + 2] || 0, 17, 606105819);
    b = md5ff(b, c, d, a, words[i + 3] || 0, 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4] || 0, 7, -176418897);
    d = md5ff(d, a, b, c, words[i + 5] || 0, 12, 1200080426);
    c = md5ff(c, d, a, b, words[i + 6] || 0, 17, -1473231341);
    b = md5ff(b, c, d, a, words[i + 7] || 0, 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8] || 0, 7, 1770035416);
    d = md5ff(d, a, b, c, words[i + 9] || 0, 12, -1958414417);
    c = md5ff(c, d, a, b, words[i + 10] || 0, 17, -42063);
    b = md5ff(b, c, d, a, words[i + 11] || 0, 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12] || 0, 7, 1804603682);
    d = md5ff(d, a, b, c, words[i + 13] || 0, 12, -40341101);
    c = md5ff(c, d, a, b, words[i + 14] || 0, 17, -1502002290);
    b = md5ff(b, c, d, a, words[i + 15] || 0, 22, 1236535329);

    a = md5gg(a, b, c, d, words[i + 1] || 0, 5, -165796510);
    d = md5gg(d, a, b, c, words[i + 6] || 0, 9, -1069501632);
    c = md5gg(c, d, a, b, words[i + 11] || 0, 14, 643717713);
    b = md5gg(b, c, d, a, words[i + 0] || 0, 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5] || 0, 5, -701558691);
    d = md5gg(d, a, b, c, words[i + 10] || 0, 9, 38016083);
    c = md5gg(c, d, a, b, words[i + 15] || 0, 14, -660478335);
    b = md5gg(b, c, d, a, words[i + 4] || 0, 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9] || 0, 5, 568446438);
    d = md5gg(d, a, b, c, words[i + 14] || 0, 9, -1019803690);
    c = md5gg(c, d, a, b, words[i + 3] || 0, 14, -187363961);
    b = md5gg(b, c, d, a, words[i + 8] || 0, 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13] || 0, 5, -1444681467);
    d = md5gg(d, a, b, c, words[i + 2] || 0, 9, -51403784);
    c = md5gg(c, d, a, b, words[i + 7] || 0, 14, 1735328473);
    b = md5gg(b, c, d, a, words[i + 12] || 0, 20, -1926607734);

    a = md5hh(a, b, c, d, words[i + 5] || 0, 4, -378558);
    d = md5hh(d, a, b, c, words[i + 8] || 0, 11, -2022574463);
    c = md5hh(c, d, a, b, words[i + 11] || 0, 16, 1839030562);
    b = md5hh(b, c, d, a, words[i + 14] || 0, 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1] || 0, 4, -1530992060);
    d = md5hh(d, a, b, c, words[i + 4] || 0, 11, 1272893353);
    c = md5hh(c, d, a, b, words[i + 7] || 0, 16, -155497632);
    b = md5hh(b, c, d, a, words[i + 10] || 0, 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13] || 0, 4, 681279174);
    d = md5hh(d, a, b, c, words[i + 0] || 0, 11, -358537222);
    c = md5hh(c, d, a, b, words[i + 3] || 0, 16, -722521979);
    b = md5hh(b, c, d, a, words[i + 6] || 0, 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9] || 0, 4, -640364487);
    d = md5hh(d, a, b, c, words[i + 12] || 0, 11, -421815835);
    c = md5hh(c, d, a, b, words[i + 15] || 0, 16, 530742520);
    b = md5hh(b, c, d, a, words[i + 2] || 0, 23, -995338651);

    a = md5ii(a, b, c, d, words[i + 0] || 0, 6, -198630844);
    d = md5ii(d, a, b, c, words[i + 7] || 0, 10, 1126891415);
    c = md5ii(c, d, a, b, words[i + 14] || 0, 15, -1416354905);
    b = md5ii(b, c, d, a, words[i + 5] || 0, 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12] || 0, 6, 1700485571);
    d = md5ii(d, a, b, c, words[i + 3] || 0, 10, -1894986606);
    c = md5ii(c, d, a, b, words[i + 10] || 0, 15, -1051523);
    b = md5ii(b, c, d, a, words[i + 1] || 0, 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8] || 0, 6, 1873313359);
    d = md5ii(d, a, b, c, words[i + 15] || 0, 10, -30611744);
    c = md5ii(c, d, a, b, words[i + 6] || 0, 15, -1560198380);
    b = md5ii(b, c, d, a, words[i + 13] || 0, 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4] || 0, 6, -145523070);
    d = md5ii(d, a, b, c, words[i + 11] || 0, 10, -1120210379);
    c = md5ii(c, d, a, b, words[i + 2] || 0, 15, 718787259);
    b = md5ii(b, c, d, a, words[i + 9] || 0, 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  return [a, b, c, d].map(wordToHex).join("");
}

function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn((b & c) | (~b & d), a, b, x, s, t);
}

function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function bitRotateLeft(num: number, cnt: number): number {
  return (num << cnt) | (num >>> (32 - cnt));
}

function wordToHex(num: number): string {
  let output = "";
  for (let j = 0; j <= 3; j += 1) {
    output += ((num >>> (j * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return output;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isSqlConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE") || message.includes("constraint");
}

function shortDate(value: string | null, timeZone: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(formatDisplayTime(date, timeZone));
}

function formatDisplayTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function json(data: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  );
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
