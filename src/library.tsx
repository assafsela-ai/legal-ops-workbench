import { ArrowUpRight, BookOpen, Download, FileText, Plus, X } from 'lucide-react'
import type { Case, Ref, Result } from './domain'
import { sourcesFor } from './domain'
import { formatDate } from './rules'
import { caseRoute } from './api'
import { RefButtons } from './components'
import { newEntry, type FormState } from './forms'

export function Sources({ data, picked, onPick, onClose, local }: {
  data: Case; picked?: Ref; onPick: (ref: Ref) => void; onClose: () => void; local: boolean
}) {
  const source = sourcesFor(data).find(item => item.id === picked?.id)
  const doc = data.docs.find(item => item.sources.some(part => part.id === source?.id))
  const snippet = picked?.quote
  const offset = source && snippet ? source.text.indexOf(snippet) : -1
  return <aside className={'inspector' + (picked ? ' is-picked' : '')} aria-label="Sources">
    <div className="inspector-heading"><BookOpen size={17}/><h2>Sources</h2>{picked && <button className="icon close-source" aria-label="Close source" onClick={onClose}><X size={17}/></button>}</div>
    {source ? <div className="source-preview" id="source-preview" tabIndex={-1}>
      <div className="overline">SOURCE EXCERPT</div>
      <h3>{source.label}</h3>
      <blockquote>{offset >= 0 && snippet ? <>{source.text.slice(0, offset)}<mark>{snippet}</mark>{source.text.slice(offset + snippet.length)}</> : source.text}</blockquote>
      {local && doc && <a className="text-link" href={caseRoute(data.id).replace(/^/, './api') + '/documents/' + doc.id + '/file'} onClick={async event => {
        event.preventDefault()
        const response = await fetch(event.currentTarget.href, { headers: { 'X-Workbench': '1' } })
        if (!response.ok) return
        const url = URL.createObjectURL(await response.blob())
        const a = document.createElement('a')
        a.href = url
        a.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? doc.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}><Download size={14}/> Download original</a>}
    </div> : <p className="muted inspector-note">Open a reference to check the exact wording.</p>}
    <div className="source-list">
      {data.docs.map(item => <details key={item.id}><summary><FileText size={15}/><span>{item.name}<small>{item.version}</small></span></summary>
        {item.sources.map(part => <button type="button" key={part.id} onClick={() => onPick({ id: part.id, quote: part.text })}>{part.label}<ArrowUpRight size={12}/></button>)}
      </details>)}
    </div>
  </aside>
}

export function Library({ area, data, local, form, open, launchReview, browserDocuments }: {
  area: 'documents' | 'decisions'; data: Case; local: boolean; form: (mode: FormState) => void;
  open: (ref: Ref) => void; launchReview?: Result
  browserDocuments?: { add: () => void; remove: (id: string) => void; atLimit: boolean; review: () => void }
}) {
  const labels = new Map(sourcesFor(data).map(source => [source.id, source.label]))
  const flagged = new Set(launchReview?.findings.filter(finding => finding.status === 'Needs review')
    .flatMap(finding => finding.refs.map(ref => ref.id)))
  if (area === 'documents') return <div className="library">
    <div className="section-heading"><h3>Document versions</h3>
      {local && <button className="secondary" onClick={() => form({ kind: 'upload' })}><Plus size={15}/> Upload version</button>}
      {browserDocuments && <button className="primary" onClick={browserDocuments.add} disabled={browserDocuments.atLimit}><Plus size={15}/> Upload document</button>}
    </div>
    {browserDocuments && <p className="muted document-note">{browserDocuments.atLimit
      ? 'Remove a document before adding another.'
      : 'Files are read on this device. Extracted text stays in this tab until you approve sending it to OpenAI.'}</p>}
    {data.docs.length === 0 && <p className="muted">Upload a DOCX or PDF to start your case.</p>}
    {data.docs.map(doc => <div className="document-row" key={doc.id}>
      <button className="library-row" onClick={() => open({ id: doc.sources[0].id, quote: '' })}>
        <FileText size={18}/><span><strong>{doc.name}</strong><small>{doc.role} · {doc.version}</small></span><ArrowUpRight size={15}/>
      </button>
      {browserDocuments && <button className="secondary" onClick={() => browserDocuments.remove(doc.id)} aria-label={'Remove ' + doc.name}>Remove</button>}
    </div>)}
    {browserDocuments && data.docs.length > 0 && <button className="secondary spaced" onClick={browserDocuments.review}>Review documents</button>}
    {!browserDocuments && <div className="section-heading spaced"><h3>Company playbook</h3>{local && <button className="secondary" onClick={() => form({ kind: 'rule' })}><Plus size={15}/> Add rule</button>}</div>}
    {data.policy.filter(source => !('archived' in source && source.archived)).map(source => <article className="rule" key={source.id}>
      <strong>{source.label}</strong><p>{source.text}</p>{local && <button className="secondary" onClick={() => form({ kind: 'rule', previous: source })}>Edit rule</button>}
    </article>)}
    {!local && !browserDocuments && <a className="text-link spaced" href="./samples/legal-ops-samples.zip" download><Download size={15}/> Download sample files</a>}
  </div>
  return <div className="library">
    <div className="section-heading"><h3>Activity log</h3>{local && <div className="actions"><button className="secondary" onClick={() => form(newEntry('Decision'))}>New decision</button><button className="secondary" onClick={() => form(newEntry('Task'))}>New task</button></div>}</div>
    {!data.entries.length && <p className="muted">Saved decisions and tasks will appear here.</p>}
    {data.entries.map(entry => <article className="finding" key={entry.id}>
      <span className={'status' + (flagged.has(entry.id) ? ' attention' : '')}>{flagged.has(entry.id) ? 'Needs review' : entry.kind}</span>
      <h3>{entry.title}</h3><p>{entry.detail}</p>
      <p className="muted">{entry.owner}{entry.due && ' · Due ' + formatDate(entry.due)}</p>
      <RefButtons refs={entry.refs} open={open} labels={labels}/>
    </article>)}
  </div>
}
