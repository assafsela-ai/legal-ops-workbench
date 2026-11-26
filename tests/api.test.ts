import { once } from 'node:events'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server/app'
import { createStore } from '../server/store'
import { modelRunner } from '../server/providers'
import type { Case } from '../src/domain'

test('Ollama uses loopback and parses a structured response without a cloud key', async () => {
  const runner = modelRunner(async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat')
    assert.equal(new Headers(init?.headers).has('Authorization'), false)
    const request = JSON.parse(String(init?.body))
    assert.equal(request.model, 'qwen3:8b')
    assert.deepEqual(request.format, { type: 'object' })
    return Response.json({ message: { content: '{"findings":[]}' } })
  })
  assert.deepEqual(await runner('ollama', {
    instructions: 'Use fictional evidence', data: '{}', schema: { type: 'object' },
  }), { findings: [] })
})

test('case files and history survive restart, and the UI key authorizes only confirmed requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workbench-'))
  const db = join(dir, 'test.sqlite')
  const store = createStore(db)
  let calls = 0
  let sent = ''
  const fakeKey = 'sk-test-example-for-fixtures'
  const fakeFetch: typeof fetch = async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + fakeKey)
    sent = JSON.parse(String(init?.body)).input[1].content
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"findings":[]}' }] }] })
  }
  const server = createApp(store, 'dist', modelRunner(fakeFetch)).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const url = 'http://127.0.0.1:' + address.port + '/api'
  const request = (path: string, method = 'GET', body?: unknown) => fetch(url + path, {
    method, headers: { 'X-Workbench': '1', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  })
  let id = ''
  try {
    const response = await request('/cases', 'POST', { title: 'Fictional test', description: 'Testing' })
    assert.equal(response.status, 201)
    id = (await response.json()).id
    const route = '/cases/' + id
    for (const [file, role] of [['msa.docx', 'Signed agreement'], ['terms.pdf', 'Vendor evidence']]) {
      const body = new FormData()
      body.set('file', new Blob([new Uint8Array(await readFile('public/samples/' + file))]), file)
      body.set('name', file)
      body.set('version', 'v1')
      body.set('role', role)
      body.set('signed', 'false')
      const uploaded = await request(route + '/documents', 'POST', body)
      assert.equal(uploaded.status, 201, await uploaded.text())
    }
    const data: Case = await (await request(route)).json()
    assert.equal(data.docs.length, 2)
    const analysis = { tool: 'vendor', provider: 'openai', docIds: data.docs.map(doc => doc.id), context: { plan: 'Enterprise', question: '', retention: '30' } }
    assert.equal((await request(route + '/analyze', 'POST', analysis)).status, 400)
    assert.equal((await fetch(url + '/key', { method: 'PUT', headers: { Origin: 'https://example.test' } })).status, 403)
    assert.deepEqual(await (await request('/key', 'PUT', { key: fakeKey })).json(), { cloudConfigured: true })
    assert.deepEqual(await (await request('/status')).json(), { cloudConfigured: true })
    const preview = await (await request(route + '/analyze', 'POST', analysis)).json()
    assert.ok(preview.input.includes('within 72 hours'))
    assert.equal(calls, 0)
    assert.equal((await request(route + '/confirm', 'POST', { token: preview.token })).status, 200)
    assert.equal(calls, 1)
    assert.equal(sent, preview.input)
    assert.equal((await request(route + '/confirm', 'POST', { token: preview.token })).status, 400)
    const second = await (await request(route + '/analyze', 'POST', analysis)).json()
    await request('/key', 'DELETE')
    assert.equal((await request(route + '/confirm', 'POST', { token: second.token })).status, 400)
    assert.equal(calls, 1)

    let policy = await (await request(route + '/policies', 'POST', { label: 'Retention', text: '30 days' })).json()
    const previousId = policy.policy[0].id
    const saved = await request(route + '/entries', 'POST', {
      kind: 'Decision', title: 'Approve', owner: 'Legal', detail: 'Approved', refs: [{ id: previousId, quote: '30 days' }],
    })
    assert.equal(saved.status, 201)
    policy = await (await request(route + '/policies', 'POST', { label: 'Retention', text: '20 days', previousId })).json()
    assert.equal(policy.policy[0].archived, true)
    assert.equal(policy.entries[0].refs[0].id, previousId)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    store.close()
    try {
      const reopened = createStore(db)
      try {
        const data = reopened.get(id)
        assert.equal(data?.docs.length, 2)
        assert.equal(data?.entries.length, 1)
        assert.equal(data?.results.length, 1)
        const docId = data!.docs[0].id
        assert.ok(reopened.getFile(id, docId)?.bytes)
        reopened.delete(id)
        assert.equal(reopened.get(id), undefined)
        assert.equal(reopened.getFile(id, docId), undefined)
      } finally { reopened.close() }
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
})
