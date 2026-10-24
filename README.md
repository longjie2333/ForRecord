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
  routes/               非 API 路由（MCP 端点）
  utils/                D1 数据访问、TOTP / JWT 鉴权、访问令牌与正文服务端渲染
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

## MCP 服务

站点在 `/mcp` 暴露一个 MCP 端点（Streamable HTTP，无会话状态），让大模型直接查阅和撰写笔记。端点只认 `Authorization: Bearer` 的访问令牌，不使用 Cookie，因此每个请求自带身份。

### 签发令牌

打开任意页面，点击右上角操作栏的钥匙图标，输入动态码后在对话框里签发、吊销或删除令牌。令牌明文只在签发时显示一次，数据库里只保存它的 SHA-256 摘要；有效期留空即永久有效。吊销保留记录并立即失效，已吊销的令牌可以再删除。权限在签发时固定，四档：

| 权限                 | 读取       | 写入       |
| -------------------- | ---------- | ---------- |
| 只读                 | 全部笔记   | 无         |
| 全权限               | 全部笔记   | 全部笔记   |
| 目录内读写           | 仅指定目录 | 仅指定目录 |
| 目录内读写，其余只读 | 全部笔记   | 仅指定目录 |

目录以笔记标题为路径前缀，例如标题 `日记/2026-10-24` 属于目录 `日记`。“目录内读写”类权限至少需要一个目录。所有权限都不能管理令牌：令牌的签发与吊销只在网页里进行。

### 连接到客户端

把令牌作为 `Authorization` 头交给客户端，例如 Claude Code、Cursor 的 MCP 配置：

```json
{
  "mcpServers": {
    "for-record": {
      "type": "http",
      "url": "https://<worker>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer fr_..." }
    }
  }
}
```

端点提供六个工具：`describe_access` 报告当前权限范围，`list_notes` 列出或搜索笔记，`note_lines` 按行读写正文，`create_note`、`update_note`、`delete_note` 在授权范围内改写。越权调用返回 `isError` 结果而不是报错，模型可以把原因转述给用户。

`note_lines` 是正文的默认入口，用来把上下文留在需要的几行上：

| 参数       | 作用                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| `op`       | `read` 查看、`replace` 替换、`insert` 插入、`delete` 删除               |
| `start`    | 起始行号，从 1 开始；`read` 省略 `start` 与 `end` 时读取整篇            |
| `end`      | 结束行号，默认与 `start` 相同                                           |
| `position` | `insert` 的位置：`before` / `after` 配合行号，`top` / `bottom` 忽略行号 |
| `content`  | `replace` 或 `insert` 的新内容，可以含换行                              |

读和写都返回带行号的行，写操作只回显改动的那几行。
