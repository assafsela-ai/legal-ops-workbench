import type { Case, Context, Doc, Entry, Ref, Result, ToolId } from './domain'
import { sourcesFor } from './domain'
import { compareText, daysBefore, formatDate } from './rules'

function document(id: string, name: string, role: Doc['role'], version: string, sections: Record<string, string>, signed = false): Doc {
  return { id, name, role, version, signed, sources: Object.entries(sections).map(([key, text]) => ({
    id: id + '-' + key, label: '§ ' + key, text,
  })) }
}

export const demo: Case = {
  id: 'demo', title: 'Voice Notes launch', description: 'Orchard Software · Northline AI procurement',
  docs: [
    document('msa', 'Services Agreement', 'Signed agreement', 'Signed · 12 Jun 2026', {
      '4.2': 'Northline must notify Orchard within 72 hours of discovering a security incident. See Amendment A for plan-specific terms.',
      '7.1': 'The agreement renews on June 30, 2027 unless Orchard gives notice at least 30 calendar days before renewal.',
      '9.3': 'Customer indemnity is subject to the liability cap except for intentional misconduct.',
    }, true),
    document('amend', 'Amendment A', 'Amendment', 'Signed · 15 Jun 2026', {
      '2.1': 'For the Enterprise plan, this amendment replaces the 72-hour deadline in Section 4.2 with a 24-hour deadline. All other plans retain 72 hours.',
    }, true),
    document('draft', 'Services Agreement', 'Draft', 'Renewal draft · v2', {
      '4.2': 'Northline must notify Orchard within 72 hours of discovering a security incident. See Amendment A for plan-specific terms.',
      '7.1': 'The agreement renews on June 30, 2027 unless Orchard gives notice at least 30 calendar days before renewal.',
      '9.3': 'Customer indemnity is excepted from the liability cap.',
    }),
    document('brief', 'Northline sales brief', 'Vendor evidence', 'Sales packet', {
      '1': 'Customer data is not used to train Northline models.',
    }),
    document('terms', 'Northline AI terms', 'Vendor evidence', 'Terms · v1', {
      '3.2': 'Only Enterprise customers are excluded from model training. Other plans may be used for service improvement, including training.',
    }),
    document('spec', 'Voice Notes product spec', 'Product spec', 'Approved baseline · v1', {
      '5': 'Voice recordings are retained for 30 days after capture.',
    }),
  ],
  policy: [
    { id: 'policy-training', label: 'Company playbook · AI training', text: 'Customer recordings must be excluded from vendor model training.' },
    { id: 'policy-liability', label: 'Company playbook · Liability', text: 'Customer indemnity stays under the liability cap, except for intentional misconduct.' },
    { id: 'policy-retention', label: 'Company playbook · Retention', text: 'Recording retention above 30 days requires a new Privacy approval before launch.' },
  ],
  entries: [
    { id: 'approval-payment', kind: 'Decision', title: '90-day payment exception', owner: 'Legal', detail: 'Approved: 90-day terms on the remaining invoices after 25% of the annual fee was paid upfront. Approval applies only to the Cedar agreement.', refs: [] },
    { id: 'approval-privacy', kind: 'Decision', title: 'Privacy approval for Voice Notes', owner: 'Privacy', detail: 'Approved recording retention of 30 days for Voice Notes.', refs: [{ id: 'spec-5', quote: 'Voice recordings are retained for 30 days after capture.' }] },
  ],
  results: [],
}

export const presetQuestion = 'Have we approved 90-day payment terms before?'
export const demoContext: Context = { plan: 'Enterprise', retention: '30', question: presetQuestion }
export const tour: Record<ToolId, string> = {
  vendor: 'Start with a claim from the sales brief. Open the terms to see which plan it really covers.',
  redline: 'Compare the signed agreement with the renewal draft. Open the playbook rule behind the change.',
  memory: 'Look up a past exception and check the conditions before reusing it.',
  stack: 'Switch from Enterprise to Standard. Then hide Amendment A to see when the answer needs review.',
  promises: 'Check the deadline against the signed agreement, then add it to the task list.',
  launch: 'Switch retention to 180 days to see which approval needs another review.',
}

export function runDemo(tool: ToolId, docIds: string[], context: Context, before?: string, after?: string): Result {
  const available = sourcesFor(demo).filter(source => !demo.docs.some(doc =>
    !docIds.includes(doc.id) && doc.sources.some(part => part.id === source.id)))
  const refs = (...ids: string[]): Ref[] => ids.flatMap(id => {
    const source = available.find(item => item.id === id)
    return source ? [{ id, quote: source.text }] : []
  })
  const review = (summary: string): Result => ({
    tool, findings: [{ title: 'Needs review', summary, status: 'Needs review', refs: [] }],
  })
  if (tool === 'vendor') return {
    tool, findings: [{
      title: 'Training exclusion applies to Enterprise only', status: 'Needs review',
      summary: 'The sales brief promises a broad exclusion. The terms limit it to a single plan. Confirm the exclusion for the plan in the signed order.',
      action: 'Can you confirm in the order form that Orchard recordings are excluded from model training for our selected plan?',
      refs: refs('brief-1', 'terms-3.2', 'policy-training'),
    }],
  }
  if (tool === 'redline') {
    const left = demo.docs.find(doc => doc.id === before)
    const right = demo.docs.find(doc => doc.id === after)
    if (!left || !right || left.id === right.id) return review('Select two different versions.')
    const changes = compareText(left.sources.map(s => s.text).join('\n\n'), right.sources.map(s => s.text).join('\n\n'))
    const widens = left.id === 'msa' && right.id === 'draft'
    return { tool, changes, findings: [{
      title: widens ? 'Draft removes the cap on customer indemnity' : 'Agreement versions compared',
      summary: widens ? 'The signed wording limits the exception to intentional misconduct. The draft makes customer indemnity generally uncapped.' : 'Review the direction of the text changes against the company rule.',
      status: widens ? 'Needs review' : 'Finding', refs: refs(left.id + '-9.3', right.id + '-9.3', 'policy-liability'),
    }] }
  }
  if (tool === 'memory') {
    if (!/(?:\b90\b|ninety)/i.test(context.question) || !/pay|invoice|term/i.test(context.question)) {
      return review('The sample file has a precedent for 90-day payment terms. Ask about those terms to see it.')
    }
    return { tool, findings: [{
      title: '90 days, with 25% upfront', status: 'Finding', value: '90 days',
      summary: 'The prior decision covers remaining invoices for Cedar. Match the upfront payment and request a new decision for Northline.',
      refs: refs('approval-payment'),
    }] }
  }
  if (tool === 'stack') {
    const base = refs('msa-4.2')
    if (!base.length || !refs('amend-2.1').length) return {
      tool, findings: [{ title: 'Amendment A is missing', summary: 'The signed agreement points to a plan-specific amendment. Add Amendment A to confirm the deadline.', status: 'Needs review', refs: base }],
    }
    const hours = context.plan === 'Enterprise' ? 24 : 72
    return { tool, findings: [{
      title: 'Security incident notice', value: hours + ' hours', status: 'Verified',
      summary: context.plan === 'Enterprise' ? 'Signed Amendment A replaces the base deadline for Enterprise.' : 'The signed amendment preserves the base deadline for Standard.',
      refs: refs('msa-4.2', 'amend-2.1'),
    }] }
  }
  if (tool === 'promises') {
    const due = daysBefore('2027-06-30', 30)!
    return { tool, findings: [{
      title: 'Send non-renewal notice', value: formatDate(due), status: 'Verified', due,
      summary: 'Renewal date Jun 30, 2027, minus 30 calendar days. Assign the notice to Procurement.',
      refs: refs('msa-7.1'),
    }] }
  }
  const changed = context.retention === '180'
  return { tool, findings: [{
    title: changed ? 'Privacy approval needs a new review' : 'Privacy approval covers the current spec',
    value: context.retention + ' days', status: changed ? 'Needs review' : 'Verified',
    summary: changed ? 'The proposal increases retention from 30 to 180 days. The current approval covers 30 days and the playbook requires Privacy to review any increase above that threshold.' : 'The proposed retention is within the 30-day approved period.',
    refs: refs('spec-5', 'policy-retention', 'approval-privacy'),
  }] }
}

export function initialDemoResult(): Result {
  return runDemo('vendor', demo.docs.map(doc => doc.id), demoContext)
}

export function demoTask(result: Result): Entry {
  const finding = result.findings[0]
  return { id: 'demo-renewal-task', kind: 'Task', title: finding.title, detail: finding.summary,
    owner: 'Procurement', due: finding.due, refs: finding.refs }
}
