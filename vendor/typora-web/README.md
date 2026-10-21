# typora-web (vendored)

[typora-web](https://github.com/Albert-PZY/typora-web) 的 v0.9.1 构建产物。上游只发布到 GitHub
Releases，npm 上的同名包是早期版本（0.3.1，缺数学、表格、CodeMirror 代码块），因此这里保存一份
预构建的库，由 `file:` 依赖引入。

- `dist/lib/typora-web.js` —— 由 `src/lib.ts` 打包的 ESM 入口。
- `dist/lib/typora-web.d.ts` —— 按 `src/editor-api.ts` 转写的类型声明（上游不产出 `.d.ts`）。
- `src/styles/widgets.css` —— 编辑器交互界面样式，必须引入；主题文件（typography）没有引入，
  页面排版由站点自己的 `main.css` 负责。

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
