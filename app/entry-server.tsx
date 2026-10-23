import './assets/vendor.css'
import './assets/main.css'
import { renderToReadableStream, renderToString } from 'react-dom/server.edge'
import { defineHandler } from 'nitro'
import { getCookie } from 'nitro/h3'
import { App } from './app.tsx'
import { getBindings } from '../server/utils/env.ts'
import { listPosts, readPost } from '../server/utils/posts.ts'
import { readSession } from '../server/utils/auth.ts'
import {
  acceptsMarkdown,
  parsePagePath,
  postHref,
  sidebarPreferences,
  sidebarSort,
  type PageData,
} from '../shared/posts.ts'
import { excerpt, structuredData } from '../shared/seo.ts'
import { renderMarkdown } from '../server/utils/markdown.ts'
import clientAssets from './entry-client?assets=client'
import serverAssets from './entry-server?assets=ssr'

export default defineHandler(async (event) => {
  const bindings = getBindings(event)
  if (!['GET', 'HEAD'].includes(event.req.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const route = parsePagePath(event.url.pathname)
  const raw = route?.raw || acceptsMarkdown(event.req.headers.get('Accept'))
  const headers = { Vary: 'Accept', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }
  if (route && !route.readOnly && raw) {
    return new Response('Markdown 源格式不支持编辑模式', { status: 406, headers })
  }
  const site = {
    title: bindings.SITE_NAME,
    icon: bindings.SITE_ICO,
    author: bindings.SITE_AUTHOR,
    description: bindings.SITE_DESCRIPTION,
    keywords: bindings.SITE_KEYWORDS,
  }
  let status = route ? 200 : 404
  let post = null
  if (route?.id) {
    try {
      post = await readPost(bindings.DB, route.id)
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error
      status = 404
    }
  }
  if (raw && route) {
    return new Response(post?.content ?? '文章不存在', {
      status,
      headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  }
  const [posts, session] = await Promise.all([listPosts(bindings.DB), readSession(event, bindings.JWT_SECRET)])
  const data: PageData = {
    site,
    post,
    posts,
    readOnly: !route || route.readOnly || status !== 200,
    sidebar: {
      ...sidebarPreferences(getCookie(event, 'for-record-sidebar')),
      sort: sidebarSort(getCookie(event, 'for-record-sort')),
    },
    sessionExpiresAt: session?.expiresAt ?? 0,
    isNew: !!route?.isNew,
    ...(status === 404 ? { error: '这篇笔记还不存在' } : {}),
  }
  const assets = clientAssets.merge(serverAssets)
  const body = post ? renderMarkdown(post.content) : null
  // The README row is the site itself, so it has no title of its own.
  const name = post && post.id !== 1 ? post.title : null
  const title = name ? `${name} · ${site.title}` : site.title
  // A preview and a rich result quote the heading the reader sees at the top of the
  // page, which is the note's own Markdown H1; the tab keeps the title field, the
  // name the note goes by in the sidebar.
  const headline = body?.title || name || site.title
  // A link preview reads the head only, so the note's own prose becomes the
  const shareable = status === 200 && data.readOnly
  const description = (post && post.id !== 1 && excerpt(post.content)) || site.description
  const canonical = post && new URL(postHref(post.id), event.url).href
  const image = /^https?:/i.test(site.icon) ? site.icon : null
  // Escape '<' so Markdown cannot terminate these inert JSON script elements.
  const serialized = JSON.stringify(data).replace(/</g, '\\u003c')
  // App is hydrated as a separate React root. Render that boundary separately so useId matches.
  const app = renderToString(<App data={data} bodyHtml={body?.html ?? ''} />)
  return new Response(
    await renderToReadableStream(
      <html lang="zh-CN">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="description" content={description} />
          <meta name="author" content={site.author} />
          <meta name="keywords" content={site.keywords} />
          {!data.readOnly && <meta name="robots" content="noindex, nofollow" />}
          <title>{title}</title>
          {shareable && post && canonical && (
            <>
              <link rel="canonical" href={canonical} />
              {/* The Markdown source is the same note without the shell, for readers that want text. */}
              <link rel="alternate" type="text/markdown" href={`/post/${post.id}.md`} />
              <meta property="og:type" content={post.id === 1 ? 'website' : 'article'} />
              <meta property="og:site_name" content={site.title} />
              <meta property="og:locale" content="zh_CN" />
              <meta property="og:title" content={headline} />
              <meta property="og:description" content={description} />
              <meta property="og:url" content={canonical} />
              {post.id !== 1 && <meta property="article:published_time" content={post.createon} />}
              {image && <meta property="og:image" content={image} />}
              {/* X is the only reader of twitter:*, and it falls back to og:* for the rest. */}
              <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify(structuredData({ site, post, url: canonical, description, headline })).replace(
                    /</g,
                    '\\u003c',
                  ),
                }}
              />
            </>
          )}
          <link rel="icon" href={site.icon} />
          <link rel="stylesheet" href="https://registry.npmmirror.com/katex/0.16.47/files/dist/katex.min.css" />
          {assets.css.map((attr) => (
            <link key={attr.href} rel="stylesheet" {...attr} />
          ))}
          {assets.js.map((attr) => (
            <link key={attr.href} rel="modulepreload" {...attr} />
          ))}
        </head>
        <body>
          <div id="app" className="isolate" dangerouslySetInnerHTML={{ __html: app }} />
          <script id="page-data" type="application/json" dangerouslySetInnerHTML={{ __html: serialized }} />
          <script type="module" src={assets.entry} />
        </body>
      </html>,
    ),
    {
      status,
      headers: {
        ...headers,
        Vary: 'Accept, Cookie',
        'Cache-Control': 'private, no-cache',
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  )
})
