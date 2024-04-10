const SITE = {
	title: '',
	ico: '',
	author: '',
	keywords: '',
	description: ''
}
const GenHtml = (body, head) => `<!DOCTYPE html>
<html lang="zh_CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="author" content="${SITE.author}">
    <meta name="keywords" content="${SITE.keywords}">
    <meta name="description" content="${SITE.description}">
	<title>${SITE.title}</title>
	<link rel="shortcut icon" href="${SITE.ico}" type="image/x-icon">
	<link rel="stylesheet" href="https://cdn.staticfile.net/highlight.js/11.9.0/styles/atom-one-light.min.css">
    <link rel="stylesheet" href="https://cdn.staticfile.net/github-markdown-css/5.5.0/github-markdown-light.min.css">
	${head}
</head>
<body>
	${body}
	<script src="https://cdn.staticfile.net/highlight.js/11.9.0/highlight.min.js"></script>
	<script>hljs.highlightAll();</script>
</body>
</html>`

const Editor = require('./editor')
const Post = require('./post')

export default {
	async fetch(req, env, ctx) {
		const method = req.method
		const { pathname, searchParams } = new URL(req.url)

		SITE.title = env.SITE_NAME
		SITE.ico = env.SITE_ICO
		SITE.author = env.SITE_AUTHOR
		SITE.keywords = env.SITE_KEYWORDS
		SITE.description = env.SITE_DESCRIPTION

		const routes = {
			async 'GET /'() {
				const result = await ReadPost(1)
				const { results: tree } = await PostIndex()
				const body = GenHtml(Post.html(result, tree), Post.style)
				return new Response(body, {
					headers: { "content-type": "text/html; charset:utf-8" }
				})
			},
			async 'GET /editor'() {
				const { results: postList } = await PostIndex()
				const body = GenHtml(Editor.html(postList), Editor.style)
				return new Response(body, {
					headers: { "content-type": "text/html; charset:utf-8" }
				})
			},
			async 'GET /post-?'(postId) {
				const result = await ReadPost(postId)
				
				if (searchParams.get('raw') != null)
					return Response.json(result)

				if (result.title != 'README')
					SITE.title = result.title + ' · ' + SITE.title

				const { results: tree } = await PostIndex()
				const body = GenHtml(Post.html(result, tree), Post.style)

				return new Response(body, {
					headers: { "content-type": "text/html; charset:utf-8" }
				})
			},
			async 'POST /post'() {
				const code = req.headers.get('Code')
				if (!await VerifyCode(code))
					return Response.json({ success: false, msg: 'code is err' })

				const { title, content, createon } = await req.json()
				const { success } = await env.DB
					.prepare('INSERT INTO notes (title, content, createon) VALUES (?, ?, ?)')
					.bind(title, content, createon)
					.run()

				return Response.json({ success })
			},
			async 'PATCH /post-?'(postId) {
				const code = req.headers.get('Code')

				if (!await VerifyCode(code))
					return Response.json({ success: false, msg: 'code is err' })

				const { title, content, createon } = await req.json()
				const { success } = await env.DB
					.prepare('UPDATE notes SET title=?, content=?, createon=? WHERE id=?')
					.bind(title, content, createon, postId)
					.run()
				return Response.json({ success })
			},
			async 'DELETE /post-?'(postId) {
				const code = req.headers.get('Code')
				if (!await VerifyCode(code))
					return Response.json({ success: false, msg: 'code is err' })

				const { success } = await env.DB
					.prepare('DELETE FROM notes WHERE id=?')
					.bind(postId)
					.run()
				return Response.json({ success })
			}
		}

		async function VerifyCode(code) {
			const TOTP = require('totp.js')
			return new TOTP(env.SECRET).verify(code)
		}

		async function PostIndex() {
			const { success, results } = await env.DB
				.prepare('SELECT id, title FROM notes')
				.all()

			return { success, results }
		}

		async function ReadPost(id) {
			const result = await env.DB
				.prepare('SELECT * FROM notes WHERE id=?')
				.bind(id)
				.first()

			return result
		}

		for (const [pattern, handler] of Object.entries(routes)) {
			const [methodPattern, pathPattern] = pattern.split(' ')
			const pathRegex = new RegExp(`^${pathPattern.replace(/\//g, '\\/').replace(/\?/g, '([^/]+)')}$`)

			if (methodPattern == method && pathRegex.test(pathname)) {
				const matches = pathRegex.exec(pathname)
				const params = matches ? matches.slice(1) : []
				return handler.apply(this, params)
			}
		}

		return new Response('404 Not Found', { status: 404 });
	}
}