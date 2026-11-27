import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from './components'
import { roles, type Doc, type Role } from './domain'

export function BrowserUpload({ close, complete }: { close: () => void; complete: (doc: Doc) => void }) {
  const [role, setRole] = useState<Role>('Draft')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const opened = useRef(true)
  const reading = useRef<AbortController | null>(null)

  useEffect(() => {
    opened.current = true
    return () => { opened.current = false; reading.current?.abort() }
  }, [])

  function dismiss() {
    opened.current = false
    reading.current?.abort()
    close()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reading.current) return
    const fields = new FormData(event.currentTarget)
    const file = fields.get('file')
    if (!(file instanceof File) || !file.size) {
      setError('Choose a DOCX or PDF.')
      return
    }
    const name = (String(fields.get('title')).trim() || file.name.replace(/\.(?:docx|pdf)$/i, '') || file.name).slice(0, 160)
    const version = String(fields.get('version')).trim() || 'v1'
    const signed = role === 'Signed agreement' || (role === 'Amendment' && fields.has('signed'))
    setError('')
    setBusy(true)
    setProgress('Reading the document…')
    const controller = new AbortController()
    const timeout = AbortSignal.timeout(180_000)
    const signal = AbortSignal.any([controller.signal, timeout])
    reading.current = controller
    try {
      const { extractBrowserDocument } = await import('./browser-documents')
      const id = crypto.randomUUID()
      const { sources, unreadablePages } = await extractBrowserDocument(file, id, signal, message => {
        if (opened.current) setProgress(message)
      })
      signal.throwIfAborted()
      if (opened.current) complete({ id, name, version, role, signed, sources, unreadablePages })
    } catch (failure) {
      if (opened.current) setError(timeout.aborted ? 'Reading took too long. Try a shorter scan or split the PDF.'
        : failure instanceof Error ? failure.message : 'The document could not be read.')
    } finally {
      reading.current = null
      if (opened.current) { setBusy(false); setProgress('') }
    }
  }

  return <Modal title="Add a document" close={dismiss}>
    <form className="form" onSubmit={submit}>
      <label>Document file<input type="file" name="file" accept=".docx,.pdf" aria-describedby="browser-file-help" required disabled={busy}/></label>
      <p id="browser-file-help">Use an unlocked DOCX or PDF, up to 10 MB. The browser reads text and runs English and Hebrew OCR on up to 25 scanned pages per file.</p>
      <label>Document title (optional)<input name="title" maxLength={160} disabled={busy}/></label>
      <div className="control-grid upload-fields">
        <label>Version label<input name="version" placeholder="v1" maxLength={100} disabled={busy}/></label>
        <label>Document type<select value={role} onChange={event => setRole(event.target.value as Role)} disabled={busy}>
          {roles.map(option => <option key={option}>{option}</option>)}
        </select></label>
      </div>
      {role === 'Amendment' && <label className="check"><input type="checkbox" name="signed" disabled={busy}/> Signed amendment</label>}
      <p role="status">{progress}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="secondary" type="button" onClick={dismiss}>Cancel</button>
        <button className="primary" type="submit" disabled={busy}>Add document</button>
      </div>
    </form>
  </Modal>
}
