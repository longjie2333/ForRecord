# typora-web (vendored)

[typora-web](https://github.com/Albert-PZY/typora-web) 的 v0.9.1 构建产物。上游只发布到 GitHub
Releases，npm 上的同名包是早期版本（0.3.1，缺数学、表格、CodeMirror 代码块），因此这里保存一份
预构建的库，由 `file:` 依赖引入。

- `dist/lib/typora-web.js` —— 由 `src/lib.ts` 打包的 ESM 入口。
  **本地补丁**：`HighlightStyle.define` 的每条 spec 从 `color: var(--tw-code-*)` 改为
  `class: "hljs-*"`（如 keyword→`hljs-keyword`、function→`hljs-title function_`），让
  CodeMirror 的 token 命中 highlight.js 主题的类选择器——换高亮主题只需在宿主
  `vendor.css` 里换 `highlight.js/styles/<theme>.css` 的 import。`EditorView.theme` 里
  的 `--tw-code-*` 变量因此闲置（保留，最小化 diff）；升级上游构建产物时此补丁需重打。
  同一补丁还给代码块外框 `pre` 加了 `hljs` 类（`"code-source-frame hljs"`），使 highlight.js
  主题的 `.hljs { background; color }` 成为代码块的底色与基色——`theme-shadcn.css` 的
  `.ProseMirror pre` 相应不再声明 background/color/border 以免特异性压过 `.hljs`。
  同批补丁还同步 CodeMirror 的可编辑态：嵌入式工厂增加 `editableCompartment` 与
  `setEditable()`；NodeView 以 `__typoraWebCodeBlock` 暴露自身并提供 `setEditable()`；
  新增 `codeEditableSyncPlugin()`（注册在 code_block 节点 plugins 里）在每次 PM 更新
  （含 `setProps({ editable })` 的阅读/编辑切换）时把 `view.editable` 推给每个代码块，
  修复阅读模式下代码块仍可编辑的问题；同一同步点会一并 `disabled` 语言输入框。
  另在 `pre` 上补了 mousedown 监听：点击边框/padding 时焦点会被 ProseMirror 抢走导致
  块永不激活，编辑态下改为回焦 CodeMirror，使点击框内任意位置都能拉起语言选择框。
  阅读模式下 chrome 的显隐同样按可编辑态门控：`onFocusIn`/`onInputFocus`/`applyDecorations`
  的焦点与类切换均以 `cmEditable` 为前置条件；`fencedCodeChromePlugin()` 用闭包跟踪
  `view.editable`，只在可编辑时产出 `cb-active`/`cb-lang-focus` node decoration
  （PM 会经 `updateOuterDeco` 绕过 NodeView 直接把 decoration 的 class 打到块 DOM 上，
  仅在 NodeView 侧拦截拦不住）；`setEditable(false)` 时清除残留类并隐藏语言菜单，
  兜住模式切换瞬间的时序缝隙。
  **同一文件的第二处补丁**：mermaid 不再用上游那套手写的 `base` + `DARK_MERMAID_THEME_VARIABLES`
  （约 4KB 的奶油色/紫色变量），改成 mermaid 官方主题——`mermaidConfigForAppearance()`
  在 `appearance === 'dark'` 时给 `theme: 'dark'`、否则 `'default'`。观察器仍是上游的：
  `data-appearance` 一变就整块重渲染（svg 的 fill/stroke 是渲染时烤进节点的，换调色板
  只能重画）。实测官方 dark 的节点 `#1f2020` / 文字 `#ccc` / 连线 `#ccc`，和站点中性色板一致。
  升级上游构建产物时这两处补丁都需重打。
- `dist/lib/typora-web.d.ts` —— 按 `src/editor-api.ts` 转写的类型声明（上游不产出 `.d.ts`）。
- `src/styles/widgets.css` —— 编辑器交互界面样式，必须引入。
  **本地补丁**：`.diagram-panel` 底色改用站点的 `var(--muted)`，让图表容器的表面跟着主题走；
  同时删掉 `[data-appearance='dark']` 下给 diagram svg 及其 label（`nodeLabel`/`edgeLabel`/
  `branch-label*`/`packet*`/`text.actor` 等）刷成 `#ece7dd` 的那批 `!important` 覆盖——
  那些是给旧的自制调色板补色的，官方 `dark` 主题自己会画标签颜色，留着反而与 `#ccc` 冲突。
- `src/styles/theme-shadcn.css` —— Markdown 内容排版主题（基于 shadcn/typeset，官方
  typeset.css 值 + md-alert / KaTeX 扩展，作用域换成 `.ProseMirror`）。
  **本地补丁**：GitHub 提示框（`md-alert-important`）的紫色原本是写死的 `#8250df`，改为
  `var(--md-important, #8250df)`，宿主主题据此在深色下换成更亮的色阶（见 `app/assets/theme.css`
  的 `.dark`）；提示框底色由该色 9% 混合而来，随之一同变化。

重新构建（在 v0.9.1 源码目录内执行，`external` 列表见下）：

```sh
npm install
npx vite build --config lib.config.mjs
```

```js
external: [
  /^prosemirror-/,
  'markdown-it',
  /^markdown-it-/,
  'katex',
  'mermaid',
  'dompurify',
  /^@codemirror\//,
  /^@lezer\//,
]
```

外部化的包写在项目 `package.json` 的 dependencies 里，由站点自己的 Vite 解析。
