export const tools = [
  { id: 'vendor', title: 'AI Vendor Review', subtitle: 'Compare vendor claims with terms and company policy.' },
  { id: 'redline', title: 'Redline Replay', subtitle: 'Compare two versions and review changes against the playbook.' },
  { id: 'memory', title: 'Deal Desk Memory', subtitle: 'Find past decisions and the conditions attached to them.' },
  { id: 'stack', title: 'Contract Stack', subtitle: 'Trace a commitment through signed agreements and amendments.' },
  { id: 'promises', title: 'Promise Tracker', subtitle: 'Turn verified contract deadlines into work someone owns.' },
  { id: 'launch', title: 'Launch Review', subtitle: 'See which decisions need another look when the spec changes.' },
] as const

export type ToolId = typeof tools[number]['id']
export const roles = ['Signed agreement', 'Amendment', 'Draft', 'Vendor evidence', 'Company policy', 'Product spec'] as const
export type Role = typeof roles[number]
export type Source = { id: string; label: string; text: string }
export type Doc = { id: string; name: string; role: Role; version: string; signed: boolean; sources: Source[] }
export type Ref = { id: string; quote: string }
export type Finding = {
  title: string; summary: string; status: 'Finding' | 'Needs review' | 'Verified'; refs: Ref[]
  action?: string; value?: string; due?: string
}
export type Change = { operation: 'added' | 'removed' | 'same'; value: string }
export type Result = { tool: ToolId; findings: Finding[]; changes?: Change[] }
export type Entry = { id: string; kind: 'Decision' | 'Task'; title: string; detail: string; owner: string; due?: string; refs: Ref[] }
export type Case = { id: string; title: string; description: string; docs: Doc[]; policy: Source[]; entries: Entry[]; results: Result[] }
export type Context = { plan: string; question: string; retention: string }
export type Analyze = { tool: ToolId; docIds: string[]; context: Context; provider: 'ollama' | 'openai' }
export const modelNames = { ollama: 'qwen3:8b', openai: 'gpt-6-luna' } as const

export const emptyContext: Context = { plan: 'Enterprise', question: '', retention: '30' }

export function sourcesFor(data: Case): Source[] {
  return [
    ...data.docs.flatMap(doc => doc.sources.map(source => ({ ...source, label: `${doc.name} · ${doc.version} · ${source.label}` }))),
    ...data.policy,
    ...data.entries.filter(entry => entry.kind === 'Decision')
      .map(entry => ({ id: entry.id, label: `Decision · ${entry.title}`, text: entry.detail })),
  ]
}
