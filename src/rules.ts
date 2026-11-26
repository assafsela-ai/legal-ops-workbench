import { diffWordsWithSpace } from 'diff'
import type { Change, Ref, Source } from './domain'

export function daysBefore(date: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days) || days < 0 || days > 3660) return
  const time = new Date(date + 'T00:00:00Z')
  if (isNaN(+time) || time.toISOString().slice(0, 10) !== date) return
  time.setUTCDate(time.getUTCDate() - days)
  const deadline = time.toISOString().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : undefined
}

export function hasExactQuote(ref: Ref, sources: Source[]): boolean {
  return Boolean(ref.quote.trim() && sources.some(source => source.id === ref.id && source.text.includes(ref.quote)))
}

export function compareText(before: string, after: string): Change[] {
  const parts = diffWordsWithSpace(before, after, { maxEditLength: 3000, timeout: 600 })
  return parts?.map(part => ({
    operation: part.added ? 'added' : part.removed ? 'removed' : 'same',
    value: part.value,
  })) ?? []
}

export function formatDate(value: string): string {
  const date = new Date(value + 'T00:00:00Z')
  return isNaN(+date) ? value : new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}
