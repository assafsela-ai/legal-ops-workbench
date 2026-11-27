import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demo, demoContext, runDemo } from '../src/demo'
import { sourcesFor, tools, type Analyze, type ToolId } from '../src/domain'
import { hasExactQuote, daysBefore } from '../src/rules'
import { prepareAnalysis, finalizeAnalysis } from '../src/analysis'
import { extract } from '../server/extract'

const ids = demo.docs.map(doc => doc.id)
const request = (tool: ToolId, docIds = ids): Analyze => ({ tool, docIds, context: demoContext, provider: 'ollama' })
export const proposal = (overrides = {}) => ({
  title: 'Notice', summary: 'Ready for review', refs: [], review: false, action: null, date: null, days: null,
  baseHours: null, amendmentHours: null, amendmentPlan: null, ...overrides,
})
const material = sourcesFor(demo)
const ref = (id: string) => ({ id, quote: material.find(item => item.id === id)!.text })

test('all six demo workflows produce real references and expected results', () => {
  const cases = ['Training exclusion applies to Enterprise only', 'Draft removes the cap on customer indemnity',
    '90 days, with 25% upfront', 'Security incident notice', 'Send non-renewal notice', 'Privacy approval covers the current spec']
  tools.forEach((tool, index) => {
    const { findings } = runDemo(tool.id, ids, demoContext, 'msa', 'draft')
    assert.equal(findings[0].title, cases[index])
    assert.ok(findings[0].refs.length)
    assert.ok(findings[0].refs.every(item => hasExactQuote(item, material)))
  })
  assert.equal(runDemo('stack', ids, demoContext).findings[0].value, '24 hours')
  assert.equal(runDemo('stack', ids, { ...demoContext, plan: 'Standard' }).findings[0].value, '72 hours')
  assert.equal(runDemo('stack', ['msa'], demoContext).findings[0].status, 'Needs review')
  assert.equal(runDemo('launch', ids, { ...demoContext, retention: '180' }).findings[0].status, 'Needs review')
  assert.equal(runDemo('promises', ids, demoContext).findings[0].due, '2027-05-31')
  assert.equal(runDemo('memory', ids, { ...demoContext, question: 'Was 60-day payment approved?' }).findings[0].status, 'Needs review')
})

test('draft evidence and invented quotes cannot establish a contractual deadline', () => {
  const input = request('stack', ['draft'])
  const result = finalizeAnalysis(input, prepareAnalysis(demo, input), { findings: [proposal({
    refs: [ref('draft-4.2')], baseHours: 72,
  })] })
  assert.equal(result.findings[0].status, 'Needs review')
  const valid = request('stack', ['msa', 'amend', 'draft'])
  const response = { findings: [proposal({ refs: [ref('msa-4.2'), ref('amend-2.1')], baseHours: 72, amendmentHours: 24, amendmentPlan: 'Enterprise' })] }
  assert.equal(finalizeAnalysis(valid, prepareAnalysis(demo, valid), response).findings[0].value, '24 hours')
  assert.equal(finalizeAnalysis({ ...valid, context: { ...valid.context, plan: 'Standard' } }, prepareAnalysis(demo, valid), response).findings[0].value, '72 hours')
  const invalid = { findings: [proposal({ refs: [{ id: 'msa-4.2', quote: 'Within 8 hours.' }], baseHours: 8 })] }
  assert.equal(finalizeAnalysis(valid, prepareAnalysis(demo, valid), invalid).findings[0].status, 'Needs review')
  const missing = request('stack', ['msa'])
  assert.equal(finalizeAnalysis(missing, prepareAnalysis(demo, missing), { findings: [
    proposal({ refs: [ref('msa-4.2')], baseHours: 72 }),
  ] }).findings[0].status, 'Needs review')
})

test('renewal dates are calculated only with explicit calendar days and valid dates', () => {
  const input = request('promises', ['msa'])
  function result(date: string, days: number) {
    return finalizeAnalysis(input, prepareAnalysis(demo, input), { findings: [proposal({ date, days, refs: [ref('msa-7.1')] })] }).findings[0]
  }
  assert.equal(result('2027-06-30', 30).due, '2027-05-31')
  assert.equal(result('2027-06-30', 60).status, 'Needs review')
  assert.equal(result('2027-06-31', 30).status, 'Needs review')
  assert.equal(daysBefore('2028-03-01', 1), '2028-02-29')
  const scanned = { ...demo, docs: demo.docs.map(doc => doc.id === 'msa'
    ? { ...doc, sources: doc.sources.map(source => ({ ...source, ocr: true as const })) }
    : doc) }
  const review = finalizeAnalysis(input, prepareAnalysis(scanned, input), {
    findings: [proposal({ date: '2027-06-30', days: 30, refs: [ref('msa-7.1')] })],
  }).findings[0]
  assert.equal(review.status, 'Needs review')
  assert.match(review.summary, /OCR wording/)
})

test('extracts DOCX paragraphs and PDF pages and rejects invalid or textless files', async () => {
  const docx = await extract('msa.docx', await readFile('public/samples/msa.docx'), 'docx')
  const pdf = await extract('terms.pdf', await readFile('public/samples/terms.pdf'), 'pdf')
  assert.ok(docx.some(part => part.label.startsWith('Paragraph') && part.text.includes('72 hours')))
  assert.ok(pdf[0].text.includes('Enterprise'))
  assert.equal(pdf[0].label, 'Page 1')
  await assert.rejects(extract('bad.pdf', Buffer.from('bad file'), 'bad'), /could not be read/)
  await assert.rejects(extract('scan.pdf', await readFile('tests/no-text.pdf'), 'scan'), /without selectable text/)
})
