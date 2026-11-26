import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowUpRight, BookOpen, ClipboardList, FileDiff, FileText, Layers3, MessageSquareText, Rocket, X } from 'lucide-react'
import type { Case, Finding, Ref, Result, ToolId } from './domain'

export const icons = { vendor: FileText, redline: FileDiff, memory: MessageSquareText, stack: Layers3, promises: ClipboardList, launch: Rocket }

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" className="icon" aria-label="Close dialog" onClick={close}><X size={20}/></button></header>
    {children}
  </dialog>
}

export function RefButtons({ refs, open, labels }: { refs: Ref[]; open: (ref: Ref) => void; labels: Map<string, string> }) {
  return <div className="refs">{refs.map((ref, index) => <button key={ref.id + index} type="button" onClick={() => open(ref)} title={labels.get(ref.id)}>
    <FileText size={13}/><span>{labels.get(ref.id) ?? 'Source'}</span><ArrowUpRight size={12}/>
  </button>)}</div>
}

export function Findings({ result, data, open, labels, onSave }: {
  result?: Result; data: Case; open: (ref: Ref) => void; labels: Map<string, string>; onSave: (finding: Finding, tool: ToolId) => void
}) {
  if (!result) return <div className="empty"><BookOpen size={27}/><h3>Ready for review</h3><p>Select evidence and run the analysis to see source-backed findings here.</p></div>
  return <section className="findings" aria-label="Findings">
    <div className="section-heading"><h3>Findings</h3><span>{result.findings.length} {result.findings.length === 1 ? 'result' : 'results'}</span></div>
    {result.findings.map((finding, index) => {
      const task = result.tool === 'promises'
      const canSave = task ? Boolean(finding.due && finding.status === 'Verified') : finding.refs.length > 0
      const saved = task && data.entries.some(entry => entry.kind === 'Task' && entry.title === finding.title && entry.due === finding.due)
      return <article className="finding" key={index}>
        <span className={'status ' + (finding.status === 'Needs review' ? 'attention' : '')}>{finding.status}</span>
        <h3>{finding.title}</h3>
        {finding.value && <div className="metric">{finding.value}</div>}
        <p>{finding.summary}</p>
        {finding.action && <div className="draft-question"><strong>Question for the vendor</strong><p>{finding.action}</p></div>}
        <RefButtons refs={finding.refs} open={open} labels={labels}/>
        {canSave && <button className="secondary save" disabled={saved} onClick={() => onSave(finding, result.tool)}>
          {saved ? 'Task added' : task ? 'Add to task list' : 'Record decision'}
        </button>}
      </article>
    })}
    {result.changes && result.changes.length > 0 && <section className="comparison">
      <div className="section-heading"><h3>Version comparison</h3><span><del>Removed</del> <ins>Added</ins></span></div>
      <div>{result.changes.map((change, index) => change.operation === 'added' ? <ins key={index}>{change.value}</ins>
        : change.operation === 'removed' ? <del key={index}>{change.value}</del> : <span key={index}>{change.value}</span>)}</div>
    </section>}
  </section>
}
