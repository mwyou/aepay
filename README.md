# AEPay

AEPay 是一个部署在 Cloudflare Workers + D1 上的支付宝经营码收款确认系统。

它不提供支付清算能力，也不规避支付宝风控。它负责按易支付协议接入上游商城，生成带尾数区分的待支付订单，定时查询支付宝开放平台账单/流水，匹配到账后按易支付格式回调上游系统。

## 功能

- Worker API
- D1 数据库存储
- 支付展示页 `/pay/:merchant_order_no`
- 后台页面 `/admin`
- 易支付兼容接口 `/submit.php`、`/mapi.php`、`/api.php`
- Cloudflare Cron 自动查账
- 支付宝开放平台 RSA2 请求签名
- 订单列表、到账事件、查账日志和回调日志
- 支付宝通知入口 `/api/alipay/notify`，保留给兼容场景
- GitHub Actions 自动迁移 D1 并部署 Worker

## 项目结构

```text
.github/workflows/deploy-worker.yml  GitHub Actions 部署流程
src/index.ts                         Worker 源码
migrations/                          D1 数据库迁移
wrangler.toml                        Wrangler 本地配置
package.json                         Worker 开发脚本
```

## 快速部署

1. 创建 D1 数据库：

```bash
npx wrangler login
npx wrangler d1 create aepay
```

2. 在 GitHub Actions Secrets 添加：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID
```

3. 推送到 `main` 分支后，GitHub Actions 会自动执行：

```text
npm ci
npm run typecheck
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

部署完成后访问 Worker 地址的 `/admin`，首次进入会跳转到 `/admin/setup` 创建管理员账号。

## 运行配置

进入后台后配置：

```text
商户 API Key       上游商城创建订单用
易支付 PID / Key   易支付协议验签和回调签名
收款码图片 URL     支付页展示的经营码
支付宝 APP_ID      开放平台应用 ID
支付宝应用私钥      用于请求支付宝开放平台
支付宝公钥          用于支付宝通知验签
查账接口名          例如 alipay.user.accountreport.get，按你的开放平台权限填写
自动查账            开启后 Cron 每分钟执行
```

## 合规提醒

请只用于你自己真实、合法的业务收款确认。个人码经营性收款、第三方代收、赌博博彩、跑分、洗钱、虚假交易等场景都有严重账号与法律风险。
