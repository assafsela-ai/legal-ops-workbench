import { modelNames } from '../src/domain'
import { requestOpenAI, type ModelInput } from '../src/openai'

export { modelNames }
export type Provider = 'ollama' | 'openai'
export type Runner = (provider: Provider, input: ModelInput, key?: string) => Promise<unknown>

export function modelRunner(fetcher: typeof fetch = fetch): Runner {
  return async (provider, input, key) => {
    if (provider === 'openai') {
      if (!key) throw new Error('Add an OpenAI API key in Model settings.')
      return requestOpenAI(input, key, fetcher)
    }
    const messages = [{ role: 'system', content: input.instructions }, { role: 'user', content: input.data }]
    const body = { model: modelNames.ollama, messages, stream: false, think: false, format: input.schema,
      options: { temperature: 0, num_ctx: 32768, num_predict: 3500 } }
    let response: Response
    try {
      response = await fetcher('http://127.0.0.1:11434/api/chat', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error('Ollama could not be reached. Start Ollama and try again.')
    }
    if (!response.ok) {
      if (response.status === 404) throw new Error('Install the local model with: ollama pull qwen3:8b')
      throw new Error('Ollama returned HTTP ' + response.status + '. Check the provider and retry.')
    }
    const json = await response.json()
    const output = json.message?.content
    if (!output) throw new Error('The model did not complete the analysis. Try again.')
    try { return JSON.parse(output) } catch { throw new Error('The model response was unreadable. Try again.') }
  }
}
