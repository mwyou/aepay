# AEPay

AEPay 是一个部署在 Cloudflare Workers + D1 上的个人支付宝收款确认系统。

它不提供支付清算能力，也不规避支付宝风控。它只负责创建待支付订单、展示收款页面、接收支付宝通知或人工核销记录、匹配订单，并向你的业务系统发送到账回调。

## 功能

- Worker API
- D1 数据库存储
- 支付展示页 `/pay/:merchant_order_no`
- 后台页面 `/admin`
- 支付宝通知入口 `/api/alipay/notify`
- 手动核销、订单列表、到账事件和回调日志
- 易支付兼容接口 `/submit.php`、`/mapi.php`、`/api.php`
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

## 合规提醒

请只用于你自己真实、合法的业务收款确认。个人码经营性收款、第三方代收、赌博博彩、跑分、洗钱、虚假交易等场景都有严重账号与法律风险。
