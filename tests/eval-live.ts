import { demo, demoContext } from '../src/demo'
import { tools, type Analyze } from '../src/domain'
import { finalizeAnalysis, prepareAnalysis } from '../src/analysis'
import { modelRunner } from '../server/providers'

// The evaluation sends only the bundled fictional evidence.
const provider = process.argv[2] === 'openai' ? 'openai' : 'ollama'
const key = process.env.OPENAI_API_KEY
if (provider === 'openai' && !key) throw new Error('The opt-in evaluation requires an OpenAI API key.')
const runner = modelRunner()
const ids = demo.docs.map(doc => doc.id)
for (const tool of tools) {
  const expected = { vendor: 'training', redline: 'cap', memory: '25%', stack: '24 hours', promises: '2027-05-31', launch: 'privacy' }[tool.id]
  const request: Analyze = {
    tool: tool.id, docIds: tool.id === 'redline' ? ['msa', 'draft'] : ids,
    provider, context: { ...demoContext, retention: '180' },
  }
  const prepared = prepareAnalysis(demo, request)
  try {
    const result = finalizeAnalysis(request, prepared, await runner(provider, prepared.input, key))
    if (!result.findings.some(finding => finding.refs.length && JSON.stringify(finding).toLowerCase().includes(expected))) {
      throw new Error('Expected grounded evidence was not returned')
    }
    console.log('PASS', provider, tool.id)
  } catch (error) {
    console.error('FAIL', provider, tool.id, error instanceof Error ? error.message : 'Evaluation failed')
    process.exitCode = 1
  }
}
