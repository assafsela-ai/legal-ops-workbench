import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CircleHelp, Columns3, Files, Gavel, KeyRound, Play, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { api, caseRoute, post } from './api'
import { Findings, icons, Modal } from './components'
import { demo, demoContext, demoTask, initialDemoResult, runDemo, tour } from './demo'
import { emptyContext, modelNames, sourcesFor, tools, type Analyze, type Case, type Context, type Finding, type Ref, type Result, type ToolId } from './domain'
import { newEntry, WorkspaceForm, type FormState } from './forms'
import { Library, Sources } from './library'
import { LiveAnalysis } from './live-analysis'

type Area = ToolId | 'documents' | 'decisions'
type CaseRow = Pick<Case, 'id' | 'title' | 'description'>
type Preview = { token: string; model: string; input: string }
const local = Boolean(document.querySelector('meta[name="workbench-mode"]'))
const toolIds = tools.map(item => item.id)

function defaultSelection(data: Case) {
  return data.docs.map(doc => doc.id)
}

export function App() {
  const [data, setData] = useState<Case | undefined>(local ? undefined : demo)
  const [rows, setRows] = useState<CaseRow[]>([])
  const [area, setArea] = useState<Area>('vendor')
  const [context, setContext] = useState<Context>(local ? emptyContext : demoContext)
  const [providerSelection, setProviderSelection] = useState<Analyze['provider']>()
  const [cloud, setCloud] = useState(false)
  const provider = providerSelection ?? (cloud ? 'openai' : 'ollama')
  const [selected, setSelected] = useState(local ? [] : defaultSelection(demo))
  const [before, setBefore] = useState('msa')
  const [after, setAfter] = useState('draft')
  const [picked, setPicked] = useState<Ref>()
  const [result, setResult] = useState<Result | undefined>(local ? undefined : initialDemoResult)
  const [form, setForm] = useState<FormState>()
  const [preview, setPreview] = useState<Preview>()
  const [liveRequest, setLiveRequest] = useState<Analyze>()
  const [liveResult, setLiveResult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [guided, setGuided] = useState(false)
  const item = tools.find(item => item.id === area)
  const activeIndex = item ? toolIds.indexOf(item.id) : -1
  const title = item?.title ?? (area === 'documents' ? 'Documents & playbook' : 'Decisions & tasks')
  const labels = new Map(data ? sourcesFor(data).map(source => [source.id, source.label]) : [])

  function fail(error: unknown) { setError(error instanceof Error ? error.message : 'The request failed.') }

  function update(next: Case) {
    if (next.id !== data?.id) {
      setSelected(defaultSelection(next))
      setBefore(next.docs[0]?.id ?? '')
      setAfter(next.docs[1]?.id ?? '')
      setPicked(undefined)
      setArea('vendor')
      setResult(next.results.find(item => item.tool === 'vendor'))
      setContext(emptyContext)
    } else {
      const added = next.docs.filter(doc => !data.docs.some(prior => prior.id === doc.id))
      setSelected(previous => [...previous, ...added.map(doc => doc.id)])
      if (!before) setBefore(next.docs[0]?.id ?? '')
      if (!after) setAfter(next.docs[1]?.id ?? '')
    }
    setData(next)
  }

  function reload() {
    if (local) void api<CaseRow[]>('/cases').then(setRows).catch(fail)
  }

  useEffect(() => {
    reload()
    if (local) void api<{ cloudConfigured: boolean }>('/status').then(status => setCloud(status.cloudConfigured)).catch(fail)
  }, [])

  function navigate(next: Area) {
    setArea(next)
    setError('')
    setPicked(undefined)
    setLiveResult(false)
    const tool = tools.find(item => item.id === next)?.id
    setResult(tool ? local ? data?.results.find(item => item.tool === tool) : runDemo(tool, selected, context, before, after) : undefined)
  }

  function reset() {
    setGuided(false)
    setData(demo)
    setArea('vendor')
    setContext(demoContext)
    setSelected(defaultSelection(demo))
    setBefore('msa')
    setAfter('draft')
    setPicked(undefined)
    setError('')
    setLiveResult(false)
    setResult(initialDemoResult())
  }

  function live(nextContext: Context, ids = selected, freshBefore = before, freshAfter = after) {
    if (!local && item) {
      setLiveResult(false)
      setResult(runDemo(item.id, ids, nextContext, freshBefore, freshAfter))
    }
  }

  function changeContext(next: Context) { setContext(next); live(next) }

  function toggle(id: string) {
    const ids = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]
    setSelected(ids)
    live(context, ids)
  }

  function show(ref: Ref) {
    setPicked(ref)
    requestAnimationFrame(() => {
      const panel = document.getElementById('source-preview')
      panel?.focus({ preventScroll: true })
      if (window.matchMedia('(max-width: 1080px)').matches) panel?.scrollIntoView({ block: 'center' })
    })
  }

  function apply(next: Result) {
    setResult(next)
    setData(previous => previous && ({ ...previous, results: [...previous.results.filter(item => item.tool !== next.tool), next] }))
  }

  function requestFor(tool: ToolId, model: Analyze['provider']): Analyze {
    return { tool, docIds: tool === 'redline' ? [before, after] : selected, context, provider: model }
  }

  async function run() {
    if (!item || !data) return
    setError('')
    if (!local) { live(context); return }
    if (provider === 'openai' && !cloud) { setForm({ kind: 'key' }); return }
    setBusy(true)
    try {
      const request = requestFor(item.id, provider)
      const outcome = await api<Result | Preview>(caseRoute(data.id) + '/analyze', post(request))
      if ('token' in outcome) setPreview(outcome)
      else apply(outcome)
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  async function confirm() {
    if (!data || !preview) return
    const token = preview.token
    setPreview(undefined)
    setBusy(true)
    setError('')
    try { apply(await api<Result>(caseRoute(data.id) + '/confirm', post({ token }))) }
    catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  function save(finding: Finding, tool: ToolId) {
    if (!data) return
    if (local) setForm(newEntry(tool === 'promises' ? 'Task' : 'Decision', finding.title, finding.summary, finding.refs, finding.due))
    else if (tool === 'promises' && result) {
      const entry = demoTask({ tool, findings: [finding] })
      setData({ ...data, entries: [...data.entries.filter(item => item.id !== entry.id), entry] })
    } else {
      const id = 'demo-decision-' + tool
      setData({ ...data, entries: [...data.entries.filter(item => item.id !== id), {
        id, kind: 'Decision', title: finding.title, detail: finding.summary, owner: 'Legal', refs: finding.refs,
      }] })
      navigate('decisions')
    }
  }

  return <>
    <header className="top">
      <div className="brand"><span className="brand-mark"><Gavel size={22}/></span><span>Legal Ops <strong>Workbench</strong></span></div>
      <div className="top-actions">
        <span className="mode"><i/>{local ? 'Local workspace' : 'Interactive demo'}</span>
        {local ? <button className="tool-button" onClick={() => setForm({ kind: 'key' })}><KeyRound size={17}/> <span>Model settings</span></button>
          : <><button className="tool-button" onClick={() => { setGuided(true); navigate('vendor') }}><CircleHelp size={17}/> <span>Guided tour</span></button>
            <button className="tool-button" onClick={reset}><RotateCcw size={16}/> <span>Reset demo</span></button></>}
      </div>
    </header>
    {!data ? <main className="case-list">
      <div className="section-heading"><h1>Your cases</h1><button className="primary" onClick={() => setForm({ kind: 'create' })}><Plus size={17}/> New case</button></div>
      {error && <p role="alert" className="error">{error}</p>}
      {!rows.length && <div className="empty"><Files size={27}/><h3>Start a case</h3><p>Bring documents, rules and decisions into one workspace.</p></div>}
      {rows.map(row => <button className="library-row" key={row.id} onClick={() => {
        setError('')
        void api<Case>(caseRoute(row.id)).then(update).catch(fail)
      }}><Files size={18}/><span><strong>{row.title}</strong><small>{row.description}</small></span><ArrowRight size={16}/></button>)}
    </main> : <div className="layout">
      <nav className="sidebar" aria-label="Case workspace">
        <div className="case-ident">
          {local && <button className="back" disabled={busy} onClick={() => { setData(undefined); setError(''); reload() }}><ArrowLeft size={14}/> All cases</button>}
          <div className="overline">{local ? 'CASE WORKSPACE' : 'SAMPLE CASE'}</div>
          <h2>{data.title}</h2><p>{data.description}</p>
        </div>
        <div className="nav-group"><span className="overline">WORKFLOWS</span>
          {tools.map(tool => {
            const Icon = icons[tool.id]
            return <button key={tool.id} disabled={busy} onClick={() => navigate(tool.id)} aria-current={area === tool.id ? 'page' : undefined}><Icon size={17}/><span>{tool.title}</span></button>
          })}
        </div>
        <div className="nav-group secondary-nav"><span className="overline">CASE MATERIAL</span>
          <button disabled={busy} aria-current={area === 'documents' ? 'page' : undefined} onClick={() => navigate('documents')}><Files size={17}/> Documents & playbook</button>
          <button disabled={busy} aria-current={area === 'decisions' ? 'page' : undefined} onClick={() => navigate('decisions')}><Columns3 size={17}/> Decisions & tasks <small>{data.entries.length}</small></button>
        </div>
        {local && <button className="back delete-link" disabled={busy} onClick={() => setForm({ kind: 'delete' })}><Trash2 size={14}/> Delete case</button>}
        {!local && <a className="repo" href="https://github.com/assafsela-ai/legal-ops-workbench"><BookOpen size={16}/> Source & local setup</a>}
      </nav>
      <main className="workspace" aria-busy={busy}>
        <div className="workspace-title"><div className="overline">{item ? 'WORKFLOW' : 'CASE MATERIAL'}</div>
          <h1>{title}</h1>{item && <p>{item.subtitle}</p>}</div>
        {guided && item && <section className="tour" aria-label="Guided tour">
          <Sparkles size={18}/><div><strong>Step {activeIndex + 1} of {tools.length}</strong><p>{tour[item.id]}</p></div>
          <button className="secondary" onClick={() => activeIndex + 1 === tools.length ? setGuided(false) : navigate(toolIds[activeIndex + 1])}>{activeIndex + 1 === tools.length ? 'Finish' : 'Next'} <ArrowRight size={15}/></button>
        </section>}
        {item && <section className="controls" aria-label="Analysis settings">
          {(item.id === 'stack' || item.id === 'memory' || item.id === 'launch' || item.id === 'redline' || local) && <div className="control-grid">
            {item.id === 'stack' && <>{local ? <label>Customer plan<input value={context.plan} onChange={event => changeContext({ ...context, plan: event.target.value })}/></label>
              : <><label>Customer plan<select value={context.plan} onChange={event => changeContext({ ...context, plan: event.target.value })}><option>Enterprise</option><option>Standard</option></select></label>
                <label className="check"><input type="checkbox" checked={selected.includes('amend')} onChange={() => toggle('amend')}/> Include Amendment A</label></>}</>}
            {item.id === 'launch' && <label>Proposed retention{local
              ? <input type="number" min="0" max="36500" value={context.retention} onChange={event => changeContext({ ...context, retention: event.target.value })}/>
              : <select value={context.retention} onChange={event => changeContext({ ...context, retention: event.target.value })}><option value="30">30 days</option><option value="180">180 days</option></select>}</label>}
            {item.id === 'memory' && <label className="question">Question<input value={context.question} maxLength={1500} placeholder="What exception was approved before?" onChange={event => changeContext({ ...context, question: event.target.value })}/></label>}
            {item.id === 'redline' && <>{(['Baseline', 'Changed version'] as const).map((label, index) => <label key={label}>{label}
              <select value={index ? after : before} onChange={event => {
                if (index) { setAfter(event.target.value); live(context, selected, before, event.target.value) }
                else { setBefore(event.target.value); live(context, selected, event.target.value, after) }
              }}><option value="">Select a version</option>{data.docs.filter(doc => local || ['msa', 'draft'].includes(doc.id)).map(doc => <option value={doc.id} key={doc.id}>{doc.name} · {doc.version}</option>)}</select>
            </label>)}</>}
            {local && <label>Model<select value={provider} onChange={event => setProviderSelection(event.target.value as Analyze['provider'])}><option value="ollama">Ollama · {modelNames.ollama}</option><option value="openai">OpenAI · {modelNames.openai}</option></select></label>}
          </div>}
          {local && item.id !== 'redline' && <details className="evidence"><summary>Selected document versions ({selected.length})</summary>
            {data.docs.map(doc => <label className="check" key={doc.id}><input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)}/>{doc.name} · {doc.version}</label>)}
            {!data.docs.length && <p className="muted">No document versions uploaded.</p>}
          </details>}
          <div className="control-footer">
            <div className="control-actions">
              <button className="primary" disabled={busy} onClick={() => void run()}><Play size={15}/>{busy ? 'Analyzing…' : !local ? 'Use saved results' : provider === 'openai' ? 'Preview cloud analysis' : 'Run analysis'}</button>
              {!local && <button className="secondary" onClick={() => setLiveRequest(requestFor(item.id, 'openai'))}>
                <Sparkles size={15}/> Analyze live with OpenAI
              </button>}
            </div>
            <span role="status"><i/>{local ? 'Current case evidence' : liveResult ? 'Live analysis · GPT-6 Luna' : 'Sample evidence · saved AI results'}</span>
          </div>
        </section>}
        {error && <p className="error" role="alert">{error}</p>}
        {item ? <Findings result={result} data={data} open={show} labels={labels} onSave={save}/>
          : <Library area={area === 'documents' ? 'documents' : 'decisions'} data={data} local={local} form={setForm} open={show}
            launchReview={local ? data.results.find(saved => saved.tool === 'launch') : runDemo('launch', selected, context)}/>}
      </main>
      <Sources data={data} picked={picked} onPick={show} onClose={() => setPicked(undefined)} local={local}/>
    </div>}
    {form && <WorkspaceForm mode={form} data={data} cloud={cloud} setCloud={setCloud} close={() => setForm(undefined)} update={update} remove={() => { setData(undefined); reload() }}/>}
    {liveRequest && <LiveAnalysis data={demo} request={liveRequest} close={() => setLiveRequest(undefined)} complete={result => {
      setResult(result)
      setLiveResult(true)
      setPicked(undefined)
      setLiveRequest(undefined)
    }}/>}
    {preview && <Modal title="Send evidence to OpenAI?" close={() => setPreview(undefined)}>
      <div className="form"><p>OpenAI · {preview.model}. Approve sending the evidence and context shown below for this run.</p>
        <pre className="payload" tabIndex={0}>{preview.input}</pre>
        <div className="actions"><button className="secondary" onClick={() => setPreview(undefined)}>Cancel</button>
          <button className="primary" onClick={() => void confirm()}>Send and analyze</button></div>
      </div>
    </Modal>}
  </>
}
