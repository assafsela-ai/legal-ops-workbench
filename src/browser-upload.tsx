import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from './components'
import { roles, type Doc, type Role } from './domain'

export function BrowserUpload({ close, complete }: { close: () => void; complete: (doc: Doc) => void }) {
  const [role, setRole] = useState<Role>('Draft')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const opened = useRef(true)
  const reading = useRef(false)

  useEffect(() => {
    opened.current = true
    return () => { opened.current = false }
  }, [])

  function dismiss() {
    opened.current = false
    close()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reading.current) return
    const fields = new FormData(event.currentTarget)
    const file = fields.get('file')
    if (!(file instanceof File) || !file.size) {
      setError('Choose a DOCX or PDF with selectable text.')
      return
    }
    const name = (String(fields.get('title')).trim() || file.name.replace(/\.(?:docx|pdf)$/i, '') || file.name).slice(0, 160)
    const version = String(fields.get('version')).trim() || 'v1'
    const signed = role === 'Signed agreement' || (role === 'Amendment' && fields.has('signed'))
    setError('')
    setBusy(true)
    reading.current = true
    try {
      const { extractBrowserDocument } = await import('./browser-documents')
      const id = crypto.randomUUID()
      const sources = await extractBrowserDocument(file, id)
      if (opened.current) complete({ id, name, version, role, signed, sources })
    } catch (failure) {
      if (opened.current) setError(failure instanceof Error ? failure.message : 'The document could not be read.')
    } finally {
      reading.current = false
      if (opened.current) setBusy(false)
    }
  }

  return <Modal title="Add a document" close={dismiss}>
    <form className="form" onSubmit={submit}>
      <label>Document file<input type="file" name="file" accept=".docx,.pdf" aria-describedby="browser-file-help" required disabled={busy}/></label>
      <p id="browser-file-help">Use an unlocked DOCX or a PDF with selectable text, up to 10 MB. The browser reads the file on this device.</p>
      <label>Document title (optional)<input name="title" maxLength={160} disabled={busy}/></label>
      <div className="control-grid upload-fields">
        <label>Version label<input name="version" placeholder="v1" maxLength={100} disabled={busy}/></label>
        <label>Document type<select value={role} onChange={event => setRole(event.target.value as Role)} disabled={busy}>
          {roles.map(option => <option key={option}>{option}</option>)}
        </select></label>
      </div>
      {role === 'Amendment' && <label className="check"><input type="checkbox" name="signed" disabled={busy}/> Signed amendment</label>}
      <p role="status">{busy ? 'Reading the document…' : ''}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="secondary" type="button" onClick={dismiss}>Cancel</button>
        <button className="primary" type="submit" disabled={busy}>Add document</button>
      </div>
    </form>
  </Modal>
}
