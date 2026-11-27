import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from './components'
import type { Analyze, Case, Result } from './domain'
import { requestOpenAI } from './openai'

type Engine = typeof import('./analysis')
type Prepared = { engine: Engine; evidence: ReturnType<Engine['prepareAnalysis']> }

export function LiveAnalysis({ data, request, close, complete }: {
  data: Case; request: Analyze; close: () => void; complete: (result: Result) => void;
}) {
  const keyField = useRef<HTMLInputElement>(null)
  const running = useRef<AbortController | null>(null)
  const [prepared, setPrepared] = useState<Prepared>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    void import('./analysis').then(engine => {
      if (mounted) setPrepared({ engine, evidence: engine.prepareAnalysis(data, request) })
    }).catch((failure: unknown) => {
      if (mounted) setError(failure instanceof Error ? failure.message : 'The evidence could not be prepared.')
    })
    return () => { mounted = false; running.current?.abort() }
  }, [data, request])

  function dismiss() {
    running.current?.abort()
    close()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const field = keyField.current
    if (!prepared || !field || running.current) return
    const key = field.value.trim()
    if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(key)) {
      setError('Enter an OpenAI API key that starts with sk-.')
      field.focus()
      return
    }
    field.value = ''
    setError('')
    setBusy(true)
    const controller = new AbortController()
    running.current = controller
    try {
      const response = await requestOpenAI(prepared.evidence.input, key, fetch, controller.signal)
      if (!controller.signal.aborted) complete(prepared.engine.finalizeAnalysis(request, prepared.evidence, response))
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The analysis failed. Try again.')
    } finally {
      running.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return <Modal title="Run a live analysis" close={dismiss}>
    <form className="form" onSubmit={submit}>
      <p><strong>OpenAI · GPT-6 Luna</strong></p>
      <p id="live-key-help">Your browser sends the key, the selected text, and your current inputs directly to OpenAI after you confirm. The original files stay on your device. The key field clears on submit. OpenAI may bill your API project.</p>
      {prepared?.evidence.sources.some(source => source.ocr) && <p>Some passages came from OCR. Check important wording against the original scan.</p>}
      {prepared?.evidence.docs.filter(doc => doc.unreadablePages?.length).map(doc =>
        <p key={doc.id}>{doc.name} · OCR found no text on pages {doc.unreadablePages!.join(', ')}. Those pages are excluded.</p>)}
      {prepared && <details className="live-payload">
        <summary>Review the evidence and inputs being sent</summary>
        <pre className="payload" tabIndex={0}>{prepared.evidence.input.data}</pre>
      </details>}
      <label>OpenAI API key
        <input ref={keyField} type="password" required maxLength={500} autoComplete="off" spellCheck={false}
          autoCapitalize="none" disabled={!prepared || busy} aria-describedby="live-key-help"/>
      </label>
      <p role="status">{busy ? 'Waiting for OpenAI…' : !prepared && !error ? 'Preparing evidence…' : ''}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="secondary" type="button" onClick={dismiss}>Cancel</button>
        <button className="primary" type="submit" disabled={!prepared || busy}>Send and analyze</button>
      </div>
    </form>
  </Modal>
}
