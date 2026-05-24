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
  collectQrImageUrl: string;
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
      if (url.pathname === "/admin" && request.method === "GET") return await requireAdmin(request, env, config, () => adminPage(env, config));
      if (url.pathname === "/api/admin/settings" && request.method === "POST") {
        return await requireAdmin(request, env, config, () => updateSettings(request, env, config));
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
  const rows = await env.DB.prepare("SELECT key, value, is_secret, updated_at FROM system_settings").all<SettingRow>();
  const settings = new Map(rows.results.map((row) => [row.key, row.value]));
  return {
    appName: settings.get("app_name") || env.APP_NAME || "AEPay",
    timeZone: settings.get("time_zone") || "Asia/Shanghai",
    orderExpireMinutes: settings.get("order_expire_minutes") || env.ORDER_EXPIRE_MINUTES || "15",
    amountVarianceCents: settings.get("amount_variance_cents") || env.AMOUNT_VARIANCE_CENTS || "30",
    collectAccount: settings.get("collect_account") || env.COLLECT_ACCOUNT || "",
    collectQrImageUrl: settings.get("collect_qr_image_url") || env.COLLECT_QR_IMAGE_URL || "",
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

async function updateSettings(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const form = await request.formData();
  const now = new Date().toISOString();
  const uploadedQrImage = await uploadedImageDataUrl(form, "collect_qr_image_file");
  const collectQrImageUrl = uploadedQrImage || stringForm(form, "collect_qr_image_url") || config.collectQrImageUrl;
  const alipayPublicKeyInput = stringForm(form, "alipay_public_key_text") || stringForm(form, "alipay_public_key_pem");
  const plain: Record<string, string> = {
    app_name: stringForm(form, "app_name"),
    time_zone: stringForm(form, "time_zone") || "Asia/Shanghai",
    order_expire_minutes: stringForm(form, "order_expire_minutes"),
    amount_variance_cents: stringForm(form, "amount_variance_cents"),
    collect_account: stringForm(form, "collect_account"),
    collect_qr_image_url: collectQrImageUrl,
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
  if (plain.collect_qr_image_url && !plain.collect_qr_image_url.startsWith("data:image/")) {
    assertUrl(plain.collect_qr_image_url, "collect_qr_image_url");
  }
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

  return Response.redirect(new URL("/admin?saved=1", request.url), 302);
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

function normalizePublicKeyPem(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("-----BEGIN PUBLIC KEY-----")) return trimmed;
  const compact = trimmed.replace(/\s+/g, "");
  return `-----BEGIN PUBLIC KEY-----\n${compact.match(/.{1,64}/g)?.join("\n") || compact}\n-----END PUBLIC KEY-----`;
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
  const order = await findOrder(env, decodeURIComponent(merchantOrderNo));
  if (!order) return json({ detail: "Order not found" }, 404);
  return json(orderResponse(config, order, requestUrl));
}

async function paymentPage(merchantOrderNo: string, env: Env, config: AppConfig): Promise<Response> {
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

  const tradeStatus = params.trade_status ?? "";
  if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(tradeStatus)) return text("success");
  const tradeNo = params.trade_no ?? "";
  const amount = params.total_amount ?? "";
  const paidAt = parseAlipayTime(params.gmt_payment ?? "");
  if (!tradeNo || !amount || !paidAt) return text("missing-fields", 400);

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
  if (result.order) await dispatchCallback(env, config, result.order);
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
  const runId = await createPollingRun(env, "running", startedAt, windowStart, windowEnd);

  try {
    if (config.alipayPollEnabled !== "true" && !force) {
      await finishPollingRun(env, runId, "skipped", 0, 0, "自动查账未开启");
      return { status: "skipped", fetched_count: 0, matched_count: 0, error: "自动查账未开启" };
    }
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
    const message = friendlyPollingError(error instanceof Error ? error.message : "polling failed");
    await finishPollingRun(env, runId, "failed", 0, 0, message);
    return { status: "failed", fetched_count: 0, matched_count: 0, error: message };
  }
}

function friendlyPollingError(message: string): string {
  if (message.includes("isv.invalid-signature")) {
    return "支付宝验签失败：请把 AEPay 已保存的应用公钥复制到支付宝开放平台，并确认当前应用私钥已保存";
  }
  return message.split("&amp;")[0].slice(0, 300);
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
    await env.DB.prepare(
      `UPDATE orders
       SET status = 'paid', alipay_trade_no = ?, paid_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(event.provider_trade_no, event.paid_at, now, order.id)
      .run();
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
  let query =
    "SELECT * FROM orders WHERE status = 'pending' AND pay_amount = ? AND created_at <= ? AND expires_at >= ?";
  const args: unknown[] = [event.amount, event.paid_at, event.paid_at];
  if (config.collectAccount) {
    query += " AND collect_account = ?";
    args.push(config.collectAccount);
  }
  query += " ORDER BY created_at ASC LIMIT 1";
  return env.DB.prepare(query).bind(...args).first<OrderRow>();
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

  let status = "failed";
  let responseStatus: number | null = null;
  let responseBody = "";
  try {
    const response = await fetch(order.notify_url, {
      method: "POST",
      headers: callback.headers,
      body: callback.body,
    });
    responseStatus = response.status;
    responseBody = (await response.text()).slice(0, 2000);
    status = response.ok ? "success" : "failed";
  } catch (error) {
    responseBody = error instanceof Error ? error.message : "callback failed";
  }

  await env.DB.prepare(
    `UPDATE callback_logs
     SET status = ?, response_status = ?, response_body = ?, attempts = attempts + 1, updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, responseStatus, responseBody, new Date().toISOString(), inserted.id)
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

async function adminPage(env: Env, config: AppConfig): Promise<Response> {
  const [orders, events, callbacks, pollingRuns] = await Promise.all([
    env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 50").all<OrderRow>(),
    env.DB.prepare("SELECT * FROM payment_events ORDER BY id DESC LIMIT 30").all<PaymentEventRow>(),
    env.DB.prepare("SELECT * FROM callback_logs ORDER BY id DESC LIMIT 30").all<CallbackLogRow>(),
    env.DB.prepare("SELECT * FROM polling_runs ORDER BY id DESC LIMIT 20").all<PollingRunRow>(),
  ]);
  return html(renderAdmin(config, orders.results, events.results, callbacks.results, pollingRuns.results));
}

async function adminOrders(env: Env): Promise<Response> {
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
  if (!(await verifyAdminPassword(env, config, username, password))) {
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
  await upsertSetting(env, "admin_username", username, true, now);
  await upsertSetting(env, "admin_password_hash", await adminPasswordHash(username, password), true, now);
  const nextConfig = { ...config, adminUsername: username, adminPasswordHash: await adminPasswordHash(username, password) };
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
  return timingSafeEqual(await adminPasswordHash(username, password), config.adminPasswordHash);
}

async function verifyAdminSession(request: Request, env: Env, config: AppConfig): Promise<boolean> {
  const session = cookieValue(request, "aepay_admin_session");
  if (!session) return false;
  const [payload64, signature] = session.split(".");
  if (!payload64 || !signature) return false;
  const expected = await hmacSha256(adminSessionSecret(env, config), payload64);
  if (!timingSafeEqual(signature, expected.slice("sha256=".length))) return false;
  const payload = JSON.parse(atobUrl(payload64)) as { u?: string; exp?: number };
  return payload.u === config.adminUsername && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
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
  return sha256Hex(`aepay-admin-v1:${username}:${password}`);
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
      Object.assign(params, (await request.json()) as Record<string, string>);
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
  panel: string;
  text: string;
  muted: string;
  line: string;
  brand: string;
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
      panel: "#ffffff",
      text: "#1f2937",
      muted: "#667085",
      line: "#dfe5ee",
      brand: "#102a43",
      accent: "#2563eb",
      ok: "#147d64",
      qrBg: "#ffffff",
      radius: "8px",
      shadow: "0 12px 40px rgba(15,23,42,.08)",
    },
    alipay: {
      colorScheme: "light",
      bg: "#eaf4ff",
      panel: "#ffffff",
      text: "#132238",
      muted: "#5b6b80",
      line: "#cfe2f7",
      brand: "#1677ff",
      accent: "#1677ff",
      ok: "#0f8f6b",
      qrBg: "#f7fbff",
      radius: "8px",
      shadow: "0 18px 50px rgba(22,119,255,.18)",
    },
    dark: {
      colorScheme: "dark",
      bg: "#101418",
      panel: "#171d23",
      text: "#eef4f8",
      muted: "#a9b4bf",
      line: "#2b3640",
      brand: "#22c55e",
      accent: "#38bdf8",
      ok: "#4ade80",
      qrBg: "#ffffff",
      radius: "8px",
      shadow: "0 18px 60px rgba(0,0,0,.35)",
    },
    warm: {
      colorScheme: "light",
      bg: "#f8f1e8",
      panel: "#fffdf9",
      text: "#2b2118",
      muted: "#7a6a5a",
      line: "#eadfcc",
      brand: "#b45309",
      accent: "#c2410c",
      ok: "#15803d",
      qrBg: "#fffaf2",
      radius: "8px",
      shadow: "0 18px 46px rgba(120,80,30,.14)",
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
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>支付订单 ${escapeHtml(order.merchant_order_no)}</title>
  <style>
    :root { color-scheme:${theme.colorScheme}; --bg:${theme.bg}; --panel:${theme.panel}; --text:${theme.text}; --muted:${theme.muted}; --line:${theme.line}; --brand:${theme.brand}; --accent:${theme.accent}; --ok:${theme.ok}; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:20px; background:var(--bg); color:var(--text); font:15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width:min(430px, 100%); background:var(--panel); border:1px solid var(--line); border-radius:${theme.radius}; padding:22px; text-align:center; box-shadow:${theme.shadow}; }
    .brand { width:44px; height:44px; margin:0 auto 12px; display:grid; place-items:center; border-radius:12px; color:white; background:var(--brand); font-size:22px; font-weight:850; }
    h1 { margin:0 0 10px; font-size:20px; }
    .amount { margin:8px 0 16px; font-size:42px; font-weight:800; color:var(--accent); }
    .qr-wrap { margin:0 auto; padding:12px; border:1px solid var(--line); border-radius:${theme.radius}; background:${theme.qrBg}; }
    .qr { width:min(280px, 68vw); aspect-ratio:1; object-fit:contain; display:block; margin:auto; border-radius:6px; }
    .empty { border:1px dashed var(--line); border-radius:${theme.radius}; padding:34px 18px; color:var(--muted); }
    .meta { margin-top:16px; color:var(--muted); font-size:13px; text-align:left; display:grid; gap:6px; }
    .meta div { display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); padding-bottom:6px; }
    .meta div:last-child { border-bottom:0; padding-bottom:0; }
    .timer { margin:0 0 16px; min-height:32px; display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid var(--line); border-radius:${theme.radius}; color:var(--muted); background:rgba(255,255,255,.35); font-weight:700; }
    .timer strong { color:var(--accent); }
    .hint { margin:12px 0 0; color:var(--muted); font-size:13px; }
    .paid { color:var(--ok); font-weight:750; }
    .expired { color:#b42318; font-weight:750; }
  </style>
</head>
<body>
  <main>
    <div class="brand">支</div>
    <h1 id="title">${escapeHtml(done ? "支付已确认" : "支付宝扫码付款")}</h1>
    <div class="amount" id="amount">¥${escapeHtml(order.pay_amount)}</div>
    <div class="timer" id="timer" ${done ? "hidden" : ""}>剩余支付时间 <strong>--:--</strong></div>
    <div id="pay-state">${done ? `<p class="paid">订单已到账，无需重复支付。</p>` : `<div class="qr-wrap">${qr}</div><p class="hint">请按页面金额付款，付款后将自动确认。</p>`}</div>
    <div class="meta">
      <div><span>订单号</span><strong>${escapeHtml(order.merchant_order_no)}</strong></div>
      <div><span>商品</span><strong>${escapeHtml(order.subject || "-")}</strong></div>
      <div><span>状态</span><strong id="status">${escapeHtml(order.status)}</strong></div>
      <div><span>过期时间</span><strong>${escapeHtml(shortDate(order.expires_at, config.timeZone))}</strong></div>
    </div>
  </main>
  <script>
    const orderNo = ${JSON.stringify(order.merchant_order_no)};
    const expiresAt = ${Number.isFinite(expiresAtMs) ? expiresAtMs : 0};
    const timer = document.querySelector('#timer');
    const statusEl = document.querySelector('#status');
    const title = document.querySelector('#title');
    const payState = document.querySelector('#pay-state');

    function renderPaid() {
      title.textContent = '支付已确认';
      statusEl.textContent = 'paid';
      if (timer) timer.hidden = true;
      payState.innerHTML = '<p class="paid">订单已到账，无需重复支付。</p>';
    }

    function renderExpired() {
      title.textContent = '订单已过期';
      statusEl.textContent = 'expired';
      if (timer) timer.innerHTML = '<span class="expired">订单已过期，请重新下单</span>';
      payState.innerHTML = '<p class="expired">请不要继续付款，重新创建订单后再支付。</p>';
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
      timer.innerHTML = '剩余支付时间 <strong>' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') + '</strong>';
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

    tick();
    setInterval(tick, 1000);
    setInterval(pollStatus, 3000);
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
): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)} Admin</title>
  <style>
    :root { color-scheme: light; --bg:#f7f8fb; --panel:#fff; --text:#1f2937; --muted:#667085; --line:#dde3ea; --ok:#147d64; --warn:#9f6b00; --bad:#b42318; --brand:#2563eb; }
    * { box-sizing: border-box; }
    body { margin:0; font:14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--text); }
    header { position:sticky; top:0; z-index:2; background:rgba(255,255,255,.94); border-bottom:1px solid var(--line); backdrop-filter: blur(10px); }
    .bar { max-width:1180px; margin:auto; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    h1 { margin:0; font-size:18px; }
    main { max-width:1180px; margin:0 auto; padding:20px; display:grid; gap:18px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    h2 { margin:0; padding:14px 16px; font-size:15px; border-bottom:1px solid var(--line); }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; white-space:nowrap; }
    th { color:var(--muted); font-weight:600; background:#fafbfc; }
    tr:last-child td { border-bottom:0; }
    .scroll { overflow:auto; }
    .pill { display:inline-flex; align-items:center; min-height:24px; padding:2px 8px; border-radius:999px; background:#eef2ff; color:#273ea5; font-size:12px; }
    .paid { background:#e8f7f1; color:var(--ok); }
    .pending { background:#fff4df; color:var(--warn); }
    .failed { background:#fee4e2; color:var(--bad); }
    form { padding:16px; display:grid; grid-template-columns:repeat(5,minmax(130px,1fr)); gap:10px; align-items:end; }
    .settings-form { grid-template-columns:repeat(3,minmax(180px,1fr)); align-items:start; }
    .tabs { display:flex; flex-wrap:wrap; gap:8px; }
    .tab { height:34px; border:1px solid var(--line); border-radius:6px; background:#fff; color:var(--text); padding:0 12px; font-weight:650; cursor:pointer; }
    .tab.active { background:var(--brand); border-color:var(--brand); color:#fff; }
    .panel[hidden] { display:none !important; }
    label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
    input, select, textarea { width:100%; min-height:38px; border:1px solid var(--line); border-radius:6px; padding:0 10px; font:inherit; color:var(--text); background:#fff; }
    textarea { min-height:96px; padding:10px; resize:vertical; }
    button { height:38px; border:0; border-radius:6px; background:var(--brand); color:white; padding:0 14px; font-weight:600; cursor:pointer; }
    .note { padding:0 16px 16px; color:var(--muted); }
    .wide { grid-column:1 / -1; }
    .settings-form .note { padding:0; align-self:center; }
    @media (max-width: 850px) { form, .settings-form { grid-template-columns:1fr; } .bar { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body>
  <header><div class="bar"><h1>${escapeHtml(config.appName)}</h1><span class="pill">Cloudflare Workers + D1</span></div></header>
  <main>
    <form method="post" action="/admin/logout" style="padding:0; display:flex; justify-content:flex-end;">
      <button type="submit" style="width:auto;">退出登录</button>
    </form>
    <nav class="tabs" aria-label="后台导航">
      <button class="tab active" type="button" data-tab="overview">概览</button>
      <button class="tab" type="button" data-tab="system">系统</button>
      <button class="tab" type="button" data-tab="epay">易支付</button>
      <button class="tab" type="button" data-tab="alipay">支付宝</button>
      <button class="tab" type="button" data-tab="test">支付测试</button>
    </nav>
    <section id="settings-section" hidden>
      <h2>设置</h2>
      ${settingsForm(config)}
    </section>
    <section class="panel" data-panel="test" hidden>
      <h2>真实支付测试</h2>
      <form method="post" action="/api/admin/test-order" onsubmit="return submitTestOrder(event)" style="grid-template-columns:minmax(180px,260px) auto 1fr;">
        <label>测试原金额<input name="amount" required value="0.01" inputmode="decimal"></label>
        <button type="submit">创建测试订单</button>
        <div class="note" style="padding:0;">系统会生成实际应付金额；打开支付页后按页面金额真实扫码付款，再等自动查账匹配。</div>
      </form>
      <div id="test-order-result" class="note"></div>
    </section>
    <section class="panel" data-panel="alipay" hidden>
      <h2>自动查账</h2>
      <form method="post" action="/api/admin/polling/run" onsubmit="return submitPolling(event)" style="grid-template-columns:1fr auto;">
        <div class="note" style="padding:0;">开启自动查账并保存支付宝配置后，Cron 每分钟执行一次；这里也可以手动立即测试。</div>
        <button type="submit">立即查账</button>
      </form>
      <div class="scroll">${pollingRunsTable(pollingRuns, config.timeZone)}</div>
    </section>
    <section class="panel" data-panel="overview">
      <h2>订单</h2>
      <div class="scroll">${ordersTable(orders, config.timeZone)}</div>
    </section>
    <section class="panel" data-panel="overview">
      <h2>到账事件</h2>
      <div class="scroll">${eventsTable(events, config.timeZone)}</div>
    </section>
    <section class="panel" data-panel="overview">
      <h2>回调日志</h2>
      <div class="scroll">${callbacksTable(callbacks, config.timeZone)}</div>
    </section>
  </main>
  <script>
    document.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
        const settings = document.querySelector('#settings-section');
        if (settings) settings.hidden = !['system', 'epay', 'alipay'].includes(target);
        document.querySelectorAll('[data-panel]').forEach(panel => {
          panel.hidden = panel.dataset.panel !== target;
        });
      });
    });
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
    function fillSecret(name) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const bytes = new Uint8Array(40);
      crypto.getRandomValues(bytes);
      const value = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
      const input = document.querySelector('[name="' + name + '"]');
      if (input) input.value = value;
    }
    async function copyText(value) {
      if (!value) {
        alert('还没有可复制的值');
        return;
      }
      await navigator.clipboard.writeText(value);
      alert('已复制');
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
    async function generateAlipayKeyPair() {
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
      const privatePem = pemFromBase64(btoa(String.fromCharCode(...new Uint8Array(privateKey))), 'PRIVATE KEY');
      const publicPem = pemFromBase64(btoa(String.fromCharCode(...new Uint8Array(publicKey))), 'PUBLIC KEY');
      const privateInput = document.querySelector('[name="alipay_private_key_pem"]');
      const publicHidden = document.querySelector('[name="alipay_app_public_key_text"]');
      const publicOutput = document.querySelector('#alipay-app-public-key-text');
      const pemOutput = document.querySelector('#alipay-app-public-key-pem');
      const publicText = alipayPublicKeyText(publicPem);
      if (privateInput) privateInput.value = privatePem;
      if (publicHidden) publicHidden.value = publicText;
      if (publicOutput) publicOutput.value = publicText;
      if (pemOutput) pemOutput.value = publicPem;
    }
    async function copyAlipayPublicKey() {
      const output = document.querySelector('#alipay-app-public-key-text');
      if (!output || !output.value) {
        alert('请先生成支付宝应用密钥对');
        return;
      }
      await navigator.clipboard.writeText(output.value);
      alert('已复制支付宝后台专用应用公钥字符串');
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
  </script>
</body>
</html>`;
}

function settingsForm(config: AppConfig): string {
  return `<form class="settings-form" method="post" action="/api/admin/settings" enctype="multipart/form-data">
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
    <label>订单过期分钟<input name="order_expire_minutes" value="${escapeAttr(config.orderExpireMinutes)}" inputmode="numeric" required></label>
    <label>金额尾数范围<input name="amount_variance_cents" value="${escapeAttr(config.amountVarianceCents)}" inputmode="numeric" required></label>
    <label>回调 HMAC 密钥，仅 JSON 回调用<input name="callback_secret" type="password" placeholder="${secretPlaceholder(config.callbackSecret)}"></label>
    <label>商户 API Key，仅直连 API 用<input name="merchant_api_key" type="password" placeholder="${secretPlaceholder(config.merchantApiKey)}"></label>
    <label>管理员账号<input name="admin_username" value="${escapeAttr(config.adminUsername)}" autocomplete="username"></label>
    <label>管理员新密码<input name="admin_password" type="password" placeholder="${secretPlaceholder(config.adminPasswordHash)}" autocomplete="new-password"></label>
    <div class="wide" style="display:flex; flex-wrap:wrap; gap:10px;">
      <button type="button" onclick="fillSecret('callback_secret')">生成回调 HMAC 密钥</button>
      <button type="button" onclick="fillSecret('merchant_api_key')">生成商户 API Key</button>
    </div>
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
    </div>

    <div class="panel" data-panel="alipay" hidden style="display:contents;">
    <div class="note wide" style="padding:0;">支付宝页放经营码展示和开放平台查账配置。查账接口已内置为支付宝商家账户账务明细查询。</div>
    <label>收款码图片，必填<input name="collect_qr_image_file" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label>收款码图片 URL，已有图床才填<input name="collect_qr_image_url" value="${config.collectQrImageUrl.startsWith("data:image/") ? "" : escapeAttr(config.collectQrImageUrl)}" placeholder="${config.collectQrImageUrl ? "已配置，上传新图片或填新 URL 可替换" : "https://.../alipay-qr.png"}"></label>
    <label>支付页主题
      <select name="payment_page_theme">
        ${paymentThemeOption(config.paymentPageTheme, "alipay", "支付宝蓝")}
        ${paymentThemeOption(config.paymentPageTheme, "minimal", "简洁白")}
        ${paymentThemeOption(config.paymentPageTheme, "dark", "暗色")}
        ${paymentThemeOption(config.paymentPageTheme, "warm", "暖色")}
      </select>
    </label>
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
    <label>支付宝通知验签
      <select name="alipay_notify_verify_required">
        <option value="true"${config.alipayNotifyVerifyRequired === "true" ? " selected" : ""}>开启</option>
        <option value="false"${config.alipayNotifyVerifyRequired === "false" ? " selected" : ""}>关闭</option>
      </select>
    </label>
    <div class="wide" style="display:flex; flex-wrap:wrap; gap:10px;">
      <button type="button" onclick="generateAlipayKeyPair()">生成支付宝应用密钥对</button>
      <button type="button" onclick="copyAlipayPublicKey()">复制支付宝后台专用公钥</button>
    </div>
    <label class="wide">支付宝后台专用应用公钥，复制到支付宝开放平台<textarea id="alipay-app-public-key-text" readonly placeholder="点击“生成支付宝应用密钥对”后这里会出现一整行公钥字符串，不含头尾和换行">${escapeHtml(config.alipayAppPublicKeyText)}</textarea></label>
    <label class="wide">应用公钥 PEM，仅备用查看<textarea id="alipay-app-public-key-pem" readonly placeholder="这里是 PEM 格式，通常不要粘到支付宝后台"></textarea></label>
    <label class="wide">支付宝应用私钥 PEM，查账必填<textarea name="alipay_private_key_pem" placeholder="${secretPlaceholder(config.alipayPrivateKeyPem)}"></textarea></label>
    <div class="note wide" style="padding:0;">当前支付宝公钥：${secretPreview(publicKeyText(config.alipayPublicKeyPem))} ${config.alipayPublicKeyPem ? `<button type="button" onclick="copyText('${escapeJs(publicKeyText(config.alipayPublicKeyPem))}')">复制支付宝公钥</button>` : ""}</div>
    <label class="wide">支付宝公钥字符串，通知验签用<textarea name="alipay_public_key_text" placeholder="粘贴支付宝开放平台提供的支付宝公钥；可带或不带 BEGIN/END，保存时会自动处理"></textarea></label>
    </div>

    <button type="submit">保存设置</button>
    <div class="note wide">密钥类字段留空表示不修改；易支付接入只需要配置易支付 PID 和易支付 Key。商户 API Key 只给直接调用 /api/orders 的程序用。</div>
  </form>`;
}

function loginPage(config: AppConfig, hasError: boolean): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)} 登录</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#f6f8fb; color:#1f2937; font:15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width:min(380px, calc(100vw - 32px)); background:#fff; border:1px solid #dfe5ee; border-radius:8px; padding:24px; box-shadow:0 12px 40px rgba(15,23,42,.08); }
    h1 { margin:0 0 18px; font-size:20px; text-align:center; }
    form { display:grid; gap:12px; }
    label { display:grid; gap:6px; color:#667085; font-size:13px; }
    input { width:100%; min-height:40px; border:1px solid #dfe5ee; border-radius:6px; padding:0 10px; font:inherit; color:#1f2937; }
    button { min-height:40px; border:0; border-radius:6px; background:#2563eb; color:white; font-weight:700; cursor:pointer; }
    .error { margin:0 0 12px; color:#b42318; text-align:center; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(config.appName)}</h1>
    ${hasError ? `<p class="error">账号或密码错误</p>` : ""}
    <form method="post" action="/admin/login">
      <label>管理员账号<input name="username" autocomplete="username" required autofocus></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">登录</button>
    </form>
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
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#f6f8fb; color:#1f2937; font:15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width:min(420px, calc(100vw - 32px)); background:#fff; border:1px solid #dfe5ee; border-radius:8px; padding:24px; box-shadow:0 12px 40px rgba(15,23,42,.08); }
    h1 { margin:0 0 8px; font-size:20px; text-align:center; }
    p { margin:0 0 18px; color:#667085; text-align:center; }
    form { display:grid; gap:12px; }
    label { display:grid; gap:6px; color:#667085; font-size:13px; }
    input { width:100%; min-height:40px; border:1px solid #dfe5ee; border-radius:6px; padding:0 10px; font:inherit; color:#1f2937; }
    button { min-height:40px; border:0; border-radius:6px; background:#2563eb; color:white; font-weight:700; cursor:pointer; }
  </style>
</head>
<body>
  <main>
    <h1>创建管理员</h1>
    <p>首次部署后创建后台账号，只能初始化一次。</p>
    <form method="post" action="/admin/setup">
      <label>管理员账号<input name="username" autocomplete="username" required autofocus></label>
      <label>密码<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>确认密码<input name="confirm_password" type="password" autocomplete="new-password" minlength="8" required></label>
      <button type="submit">创建并登录</button>
    </form>
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

function escapeJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

function timeZoneOption(current: string, value: string, label: string): string {
  return `<option value="${escapeAttr(value)}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function paymentThemeOption(current: string, value: string, label: string): string {
  return `<option value="${escapeAttr(value)}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

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
      row.error ? escapeHtml(row.error) : "-",
      shortDate(row.started_at, timeZone),
    ]),
  );
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body =
    rows.length > 0
      ? rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")
      : `<tr><td colspan="${headers.length}">暂无数据</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function statusPill(status: string): string {
  return `<span class="pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
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
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPrivateKeyArrayBuffer(privateKeyPem),
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
    .replace(/-----END PRIVATE KEY-----/g, "")
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
    throw new Error("Invalid JSON body");
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
  return normalizeDate(value.replace(" ", "T") + "+08:00", "gmt_payment");
}

function normalizeDate(value: string, field: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`);
  return date.toISOString();
}

function assertText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
}

function assertMoney(value: string, field: string): void {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error(`${field} must be money`);
  if (moneyToCents(value) <= 0) throw new Error(`${field} must be greater than zero`);
}

function assertPositiveInteger(value: string, field: string): void {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${field} must be a positive integer`);
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format(new Date());
  } catch {
    throw new Error("time_zone must be a valid IANA timezone");
  }
}

function assertPaymentTheme(value: string): void {
  if (!["alipay", "minimal", "dark", "warm"].includes(value)) {
    throw new Error("payment_page_theme is invalid");
  }
}

function assertUrl(value: string, field: string): void {
  try {
    const url = new URL(value);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) throw new Error();
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL`);
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
