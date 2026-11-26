import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from './app'
import { createStore } from './store'

const dataDir = resolve(process.env.WORKBENCH_DATA || 'data')
mkdirSync(dataDir, { recursive: true })
const store = createStore(resolve(dataDir, 'workbench.sqlite'))
const port = Number(process.env.PORT || 4173)
const server = createApp(store, resolve('dist')).listen(port, '127.0.0.1', () => {
  console.log('Legal Ops Workbench: http://127.0.0.1:' + port)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => store.close()))
