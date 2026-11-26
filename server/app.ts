import express, { type RequestHandler } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { roles, sourcesFor, tools, type Analyze, type Doc, type Entry } from '../src/domain'
import { hasExactQuote, daysBefore } from '../src/rules'
import { prepareAnalysis, finalizeAnalysis } from './analysis'
import { extract, maxUpload } from './extract'
import { modelRunner, modelNames, type Runner } from './providers'
import { createStore } from './store'

const text = (max: number) => z.string().trim().min(1).max(max)
const requestSchema = z.object({
  tool: z.enum(tools.map(tool => tool.id)), docIds: z.array(z.string()).max(60),
  context: z.object({ question: z.string().max(1500), plan: z.string().max(100), retention: z.string().max(8) }),
  provider: z.enum(['ollama', 'openai']),
})
const refsSchema = z.array(z.object({ id: text(200), quote: text(20_000) })).max(25)
const entrySchema = z.object({
  title: text(200), detail: text(4000), owner: text(100), kind: z.enum(['Decision', 'Task']),
  due: z.string().refine(value => Boolean(daysBefore(value, 0))).optional(), refs: refsSchema,
})
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUpload, files: 1, fields: 4, parts: 6 } })

export function createApp(store: ReturnType<typeof createStore>, dist: string, runner: Runner = modelRunner()) {
  const app = express()
  let cloudKey: string | undefined
  const previews = new Map<string, { caseId: string; request: Analyze; prepared: ReturnType<typeof prepareAnalysis>; expires: number }>()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(req.get('host') ?? '')) {
      res.status(403).end()
      return
    }
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  })
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const origin = req.get('origin')
    if ((origin && origin !== 'http://' + req.get('host')) || req.get('X-Workbench') !== '1') {
      res.status(403).json({ error: 'Open the workbench from its local address.' })
      return
    }
    next()
  }, express.json({ limit: '256kb' }))
  app.get('/api/status', (_req, res) => { res.json({ cloudConfigured: Boolean(cloudKey) }) })
  app.put('/api/key', (req, res) => {
    const key = text(500).regex(/^sk-[A-Za-z0-9_-]{12,}$/).parse(req.body.key)
    cloudKey = key
    previews.clear()
    res.json({ cloudConfigured: true })
  })
  app.delete('/api/key', (_req, res) => {
    cloudKey = undefined
    previews.clear()
    res.json({ cloudConfigured: false })
  })
  app.get('/api/cases', (_req, res) => { res.json(store.list()) })
  app.post('/api/cases', (req, res) => {
    const input = z.object({ title: text(160), description: z.string().trim().max(600) }).parse(req.body)
    res.status(201).json(store.create(input.title, input.description))
  })
  app.get('/api/cases/:id', (req, res) => {
    const data = store.get(req.params.id)
    if (!data) { res.status(404).json({ error: 'Case not found.' }); return }
    res.json(data)
  })
  const caseExists: RequestHandler<{ id: string }> = (req, res, next) => {
    if (!store.get(req.params.id)) { res.status(404).json({ error: 'Case not found.' }); return }
    next()
  }
  app.delete('/api/cases/:id', caseExists, (req, res) => {
    for (const [token, preview] of previews) if (preview.caseId === req.params.id) previews.delete(token)
    store.delete(req.params.id)
    res.status(204).end()
  })
  app.post('/api/cases/:id/documents', caseExists, upload.single('file'), async (req, res) => {
    if (!req.file) throw new Error('Choose a document to upload.')
    const input = z.object({ name: text(160), version: text(100), role: z.enum(roles), signed: z.enum(['true', 'false']) }).parse(req.body)
    const id = randomUUID()
    const sources = await extract(req.file.originalname, req.file.buffer, id)
    if (!store.get(req.params.id)) { res.status(404).json({ error: 'Case was deleted.' }); return }
    const doc: Doc = { ...input, id, signed: input.role === 'Signed agreement' || (input.role === 'Amendment' && input.signed === 'true'), sources }
    store.addDoc(req.params.id, doc, req.file.buffer, req.file.originalname)
    res.status(201).json(store.get(req.params.id))
  })
  app.get('/api/cases/:id/documents/:doc/file', (req, res) => {
    const file = store.getFile(req.params.id, req.params.doc)
    if (!file) { res.status(404).json({ error: 'File not found.' }); return }
    const filename = String(file.filename).replace(/[^A-Za-z0-9_. -]/g, '_')
    res.attachment(filename).type('application/octet-stream').send(Buffer.from(file.bytes as Uint8Array))
  })
  app.post('/api/cases/:id/policies', caseExists, (req, res) => {
    const input = z.object({ label: text(160), text: text(4000), previousId: text(150).optional() }).parse(req.body)
    const previous = store.get(req.params.id)!.policy.find(source => source.id === input.previousId && !('archived' in source && source.archived))
    if (input.previousId && !previous) throw new Error('This rule version is no longer current.')
    store.addPolicy(req.params.id, { id: randomUUID(), label: input.label, text: input.text }, previous)
    res.json(store.get(req.params.id))
  })
  app.post('/api/cases/:id/entries', caseExists, (req, res) => {
    const data = store.get(req.params.id)!
    const input = entrySchema.parse(req.body)
    if (!input.refs.every(ref => hasExactQuote(ref, sourcesFor(data)))) throw new Error('One or more sources have changed.')
    const entry: Entry = { id: randomUUID(), ...input }
    store.addEntry(req.params.id, entry)
    res.status(201).json(store.get(req.params.id))
  })
  const run = async (caseId: string, request: Analyze, prepared: ReturnType<typeof prepareAnalysis>, key?: string) => {
    const output = await runner(request.provider, prepared.input, key)
    if (!store.get(caseId)) throw new Error('Case was deleted.')
    const result = finalizeAnalysis(request, prepared, output)
    store.putResult(caseId, result)
    return result
  }
  app.post('/api/cases/:id/analyze', caseExists, async (req, res) => {
    const request = requestSchema.parse(req.body)
    const caseId = req.params.id
    const prepared = prepareAnalysis(store.get(caseId)!, request)
    if (request.provider === 'ollama') { res.json(await run(caseId, request, prepared)); return }
    if (!cloudKey) throw new Error('Add an OpenAI API key in Model settings.')
    const now = Date.now()
    for (const [token, preview] of previews) if (preview.expires <= now || preview.caseId === caseId) previews.delete(token)
    const token = randomUUID()
    previews.set(token, { caseId, request, prepared, expires: now + 300_000 })
    res.json({ token, model: modelNames.openai, input: prepared.input.data })
  })
  app.post('/api/cases/:id/confirm', caseExists, async (req, res) => {
    const token = z.uuid().parse(req.body.token)
    const preview = previews.get(token)
    if (!preview || preview.caseId !== req.params.id || preview.expires <= Date.now() || !cloudKey) {
      throw new Error('The cloud preview expired. Open a fresh preview to retry.')
    }
    previews.delete(token)
    res.json(await run(preview.caseId, preview.request, preview.prepared, cloudKey))
  })
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown request.' }) })
  app.get(['/', '/index.html'], (_req, res) => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8')
    res.type('html').send(html.replace('</head>', '<meta name="workbench-mode" content="local"></head>'))
  })
  app.use(express.static(dist, { index: false }))
  const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof z.ZodError ? 'Check the required fields and file type.'
      : error instanceof multer.MulterError ? 'Upload one DOCX or PDF of 10 MB or less.'
      : error instanceof Error ? error.message : 'The request could not be completed.'
    res.status(400).json({ error: message })
  }
  app.use(errors)
  return app
}
