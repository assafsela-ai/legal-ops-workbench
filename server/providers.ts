import { modelNames } from '../src/domain'

export { modelNames }
export type Provider = 'ollama' | 'openai'
export type ModelInput = { instructions: string; data: string; schema: Record<string, unknown> }
export type Runner = (provider: Provider, input: ModelInput, key?: string) => Promise<unknown>

export function modelRunner(fetcher: typeof fetch = fetch): Runner {
  return async (provider, input, key) => {
    const cloud = provider === 'openai'
    if (cloud && !key) throw new Error('Add an OpenAI API key in Model settings.')
    const messages = [{ role: 'system', content: input.instructions }, { role: 'user', content: input.data }]
    const body = cloud
      ? { model: modelNames.openai, input: messages, store: false, max_output_tokens: 6000,
          text: { format: { type: 'json_schema', name: 'legal_findings', schema: input.schema, strict: true } } }
      : { model: modelNames.ollama, messages, stream: false, think: false, format: input.schema,
          options: { temperature: 0, num_ctx: 32768, num_predict: 3500 } }
    let response: Response
    try {
      response = await fetcher(cloud ? 'https://api.openai.com/v1/responses' : 'http://127.0.0.1:11434/api/chat', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180_000),
        headers: { 'Content-Type': 'application/json', ...(cloud ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error(cloud ? 'OpenAI could not be reached. Try again.' : 'Ollama could not be reached. Start Ollama and try again.')
    }
    if (!response.ok) {
      if (!cloud && response.status === 404) throw new Error('Install the local model with: ollama pull qwen3:8b')
      throw new Error((cloud ? 'OpenAI' : 'Ollama') + ' returned HTTP ' + response.status + '. Check the provider and retry.')
    }
    const json = await response.json()
    const output = cloud
      ? json.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
          .filter((part: { type: string }) => part.type === 'output_text').map((part: { text: string }) => part.text).join('')
      : json.message?.content
    if (!output || (cloud && json.status !== 'completed')) throw new Error('The model did not complete the analysis. Try again.')
    try { return JSON.parse(output) } catch { throw new Error('The model response was unreadable. Try again.') }
  }
}
