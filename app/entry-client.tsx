import '@vitejs/plugin-react/preamble'
import { hydrateRoot } from 'react-dom/client'
import { App } from './app.tsx'
import type { PageData } from '../shared/posts.ts'

const data: PageData = JSON.parse(document.getElementById('page-data')!.textContent!)
hydrateRoot(document.getElementById('app')!, <App data={data} />)
