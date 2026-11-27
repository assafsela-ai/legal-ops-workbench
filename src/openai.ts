import { modelNames } from './domain'

export type ModelInput = { instructions: string; data: string; schema: Record<string, unknown> }

const responsesUrl = 'https://api.openai.com/v1/responses'

function openAIError(status: number, code: string | undefined): Error {
  if (status === 401) return new Error('OpenAI rejected the API key. Check the key and try again.')
  if (code === 'model_not_found') return new Error('Your OpenAI project does not have access to GPT-6 Luna. Check Model usage in your project limits.')
  if (status === 403) return new Error('OpenAI denied access. Check your project’s model access and the key’s write permission for Responses.')
  if (status === 429) return new Error('Your OpenAI project reached a usage or rate limit. Check its limits and try again.')
  return new Error('OpenAI returned HTTP ' + status + '. Try again.')
}

export async function requestOpenAI(input: ModelInput, key: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(180_000)
  let response: Response
  try {
    response = await fetcher(responsesUrl, {
      method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: modelNames.openai,
        input: [{ role: 'system', content: input.instructions }, { role: 'user', content: input.data }],
        store: false,
        max_output_tokens: 6000,
        text: { format: { type: 'json_schema', name: 'legal_findings', schema: input.schema, strict: true } },
      }),
    })
  } catch {
    if (timeout.aborted) throw new Error('The analysis timed out. Try again.')
    throw new Error('OpenAI could not be reached. Check your connection and try again.')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw openAIError(response.status, payload?.error?.code)
  const output = payload?.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
    .filter((part: { type: string }) => part.type === 'output_text').map((part: { text: string }) => part.text).join('')
  if (!output || payload.status !== 'completed') throw new Error('The model did not complete the analysis. Try again.')
  try { return JSON.parse(output) } catch { throw new Error('The model response was unreadable. Try again.') }
}
