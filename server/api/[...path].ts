import { defineHandler, HTTPError } from 'nitro'
import { noStore } from '../utils/http.ts'

// Without it an unknown /api path would fall through to the page renderer and answer HTML.
export default defineHandler(() => {
  throw new HTTPError({ status: 404, message: '接口不存在', headers: noStore })
})
