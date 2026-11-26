export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('./api' + path, {
    ...options, headers: {
      'X-Workbench': '1',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.')
  return data as T
}

export const post = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })
export const caseRoute = (id: string) => '/cases/' + encodeURIComponent(id)
