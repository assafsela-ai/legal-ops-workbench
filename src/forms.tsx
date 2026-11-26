import { useState, type FormEvent } from 'react'
import { api, caseRoute, post } from './api'
import { roles, type Case, type Entry, type Ref, type Source } from './domain'
import { Modal } from './components'

export type FormState =
  | { kind: 'create' | 'upload' | 'delete' | 'key' }
  | { kind: 'rule'; previous?: Source }
  | { kind: 'entry'; entry: Omit<Entry, 'id'> }

export function WorkspaceForm({ mode, data, close, update, remove, cloud, setCloud }: {
  mode: FormState; data?: Case; close: () => void; update: (data: Case) => void;
  remove: () => void; cloud: boolean; setCloud: (status: boolean) => void;
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<string>(roles[0])
  const titles = { create: 'New case', upload: 'Upload a document version', rule: 'Company rule', entry: mode.kind === 'entry' ? 'Save ' + mode.entry.kind.toLowerCase() : '', delete: 'Delete case', key: 'Model settings' }
  const route = data ? caseRoute(data.id) : ''
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const get = (name: string) => String(form.get(name) ?? '')
    setBusy(true)
    setError('')
    try {
      if (mode.kind === 'key') {
        const result = await api<{ cloudConfigured: boolean }>('/key', { ...post({ key: get('key') }), method: 'PUT' })
        setCloud(result.cloudConfigured)
      } else if (mode.kind === 'delete') {
        await api(route, { method: 'DELETE' })
        remove()
      } else {
        let next: Case
        if (mode.kind === 'create') next = await api('/cases', post({ title: get('title'), description: get('description') }))
        else if (mode.kind === 'upload') {
          form.set('signed', String(form.has('signed')))
          next = await api(route + '/documents', { method: 'POST', body: form })
        } else if (mode.kind === 'rule') {
          next = await api(route + '/policies', post({ label: get('label'), text: get('text'), previousId: mode.previous?.id }))
        } else if (mode.kind === 'entry') {
          next = await api(route + '/entries', post({
            ...mode.entry, title: get('title'), detail: get('detail'), owner: get('owner'), due: get('due') || undefined,
          }))
        } else return
        update(next)
      }
      close()
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  async function clear() {
    setBusy(true)
    try {
      await api('/key', { method: 'DELETE' })
      setCloud(false)
      close()
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  return <Modal title={titles[mode.kind]} close={close}>
    <form className="form" onSubmit={submit}>
      {mode.kind === 'create' && <><label>Case name<input required name="title" maxLength={160}/></label><label>Description<input name="description" maxLength={600}/></label></>}
      {mode.kind === 'upload' && <>
        <label>File<input type="file" name="file" accept=".docx,.pdf" required/></label>
        <label>Document title<input name="name" required maxLength={160}/></label>
        <label>Version label<input name="version" placeholder="Signed · 12 Jun 2026" maxLength={100} required/></label>
        <label>Document type<select name="role" value={role} onChange={event => setRole(event.target.value)}>{roles.map(item => <option key={item}>{item}</option>)}</select></label>
        {role === 'Amendment' && <label className="check"><input type="checkbox" name="signed"/> Signed amendment</label>}
        <p className="muted">DOCX or PDF with selectable text. Up to 10 MB.</p>
      </>}
      {mode.kind === 'rule' && <><label>Rule name<input name="label" maxLength={160} defaultValue={mode.previous?.label} required/></label><label>Rule text<textarea name="text" maxLength={4000} defaultValue={mode.previous?.text} required/></label></>}
      {mode.kind === 'entry' && <>
        <label>Title<input name="title" defaultValue={mode.entry.title} maxLength={200} required/></label>
        <label>Owner<input name="owner" defaultValue={mode.entry.owner} maxLength={100} required/></label>
        <label>Details<textarea name="detail" defaultValue={mode.entry.detail} maxLength={4000} required/></label>
        {mode.entry.kind === 'Task' && <label>Due date<input type="date" name="due" defaultValue={mode.entry.due}/></label>}
        {mode.entry.refs.length > 0 && <p className="muted">{mode.entry.refs.length} source references will be saved.</p>}
      </>}
      {mode.kind === 'key' && <>
        <p>Ollama runs on this computer. To use OpenAI in this session, enter your own API key. The server keeps it in memory until you clear it or stop the server.</p>
        {cloud && <p className="muted">An OpenAI key is set for this session.</p>}
        <label>OpenAI API key<input type="password" name="key" placeholder="sk-…" autoComplete="off" spellCheck={false} maxLength={500} required/></label>
      </>}
      {mode.kind === 'delete' && <p>Delete <strong>{data?.title}</strong> and all its documents, rules, tasks and decisions? This action is permanent.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions">
        {mode.kind === 'key' && cloud && <button className="secondary" type="button" disabled={busy} onClick={clear}>Clear key</button>}
        <button className="secondary" type="button" onClick={close}>Cancel</button>
        <button className={mode.kind === 'delete' ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Working…' : mode.kind === 'key' ? 'Use this key' : mode.kind === 'delete' ? 'Delete case' : 'Save'}</button>
      </div>
    </form>
  </Modal>
}

export const newEntry = (kind: Entry['kind'], title = '', detail = '', refs: Ref[] = [], due?: string): FormState =>
  ({ kind: 'entry', entry: { kind, title, detail, refs, due, owner: kind === 'Decision' ? 'Legal' : 'Procurement' } })
