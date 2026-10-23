# ForRecord

运行于 Cloudflare Workers 的 Markdown 博客，使用 React 实现服务端渲染（SSR），搭配 coss UI 和 [typora-web](https://github.com/Albert-PZY/typora-web) 提供实时编辑与阅读体验。

项目基于 [Nitro v3](https://nitro.build)、[h3](https://h3.dev/)、[Vite](https://vite.dev/) 和 [Rolldown](https://rolldown.rs/)。Nitro 负责服务端路由、SSR 与 Worker 构建，Vite 提供本地热更新。

## 目录结构

```text
app/
  entry-server.tsx      React SSR 入口
  entry-client.tsx      浏览器入口
  app.tsx               页面整体布局
  components/
    article/             文章区域：正文、顶部操作栏与底部信息编辑区
    sidebar/             目录侧边栏、宽度拖拽与移动端抽屉
    ui/                  coss 组件
  lib/                  编辑器封装（typora-web）、文章状态及客户端工具
  assets/               Tailwind 主题及原生 CSS 嵌套样式
server/
  api/                  REST API
  utils/                D1 数据访问、TOTP / JWT 鉴权与正文服务端渲染
shared/                 数据类型及公共逻辑（URL、SEO、标题锚点）
public/                 静态资源
migrations/             D1 数据库迁移与初始化
nitro.config.ts         Nitro / Cloudflare 构建配置
vite.config.ts          Vite 配置
wrangler.example.jsonc  Worker 配置模板
AGENTS.md               开发与验证规范
```

## 环境变量

在私有配置 `wrangler.jsonc` 中，站点变量及 `SECRET`、`JWT_SECRET` 填写在 `vars` 中，D1 数据库绑定填写在 `d1_databases` 中。这些配置会随 Worker 部署。

`CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 供 Wrangler 进行部署认证，按需设置在本地终端或 CI 环境中。

| 名称                    | 用途                                          |
| ----------------------- | --------------------------------------------- |
| `DB`                    | D1 数据库绑定，在 `d1_databases` 中配置       |
| `SECRET`                | 用于验证动态码的 Base32 TOTP 密钥             |
| `JWT_SECRET`            | 独立的 JWT 签名密钥，使用至少 32 字节的随机值 |
| `SITE_NAME`             | 站点名称                                      |
| `SITE_ICO`              | 站点图标 URL 或 Data URL                      |
| `SITE_AUTHOR`           | 作者名称                                      |
| `SITE_KEYWORDS`         | SEO 关键词                                    |
| `SITE_DESCRIPTION`      | 站点描述                                      |
| `CLOUDFLARE_API_TOKEN`  | 可选，用于无交互部署的 Cloudflare API Token   |
| `CLOUDFLARE_ACCOUNT_ID` | 可选，无交互部署时指定 Cloudflare 账户        |

## 使用方式

需要 Node.js 22.12 或更高版本。先安装依赖：

```sh
npm ci
```

首次使用时，复制模板创建私有配置；已有配置时跳过此步：

```sh
cp wrangler.example.jsonc wrangler.jsonc
```

在 `wrangler.jsonc` 中填写 Worker 名称、站点变量、`SECRET` 和 `JWT_SECRET`，并配置 D1 数据库名称与 ID。

`JWT_SECRET` 不要复用 TOTP 密钥，可用下面的命令生成后填入私有配置：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

首次保存或删除文章时，需要输入 TOTP 动态码。验证通过后，会话有效期为一小时，期间无需重复输入动态码，删除操作仍需确认。

### 本地开发

应用本地数据库迁移，然后启动热更新开发服务：

```sh
npm run migrate:local
npm run dev
```

访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。本地数据位于 `.wrangler/state/v3`，开发、预览和运行模式共用这份数据。

新增迁移后，重新运行 `npm run migrate:local`。Wrangler 使用 `d1_migrations` 记录执行状态，只应用尚未执行的迁移，因此该命令可以重复运行。

### 部署到 Worker

先登录 Cloudflare 账户：

```sh
npx wrangler login
```

也可以设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 进行无交互认证，无需执行登录命令。

首次部署且尚未创建 D1 数据库时，运行：

```sh
npm run create:db
```

该命令创建名为 `for-record` 的数据库，并自动将 `DB` 绑定信息写回私有 `wrangler.jsonc`。已有数据库且绑定配置完整时，跳过此步。

应用远端迁移后部署 Worker：

```sh
npm run migrate:remote
npm run deploy
```

`deploy` 会先构建项目，再将 Worker 和静态资源部署到 Cloudflare。
