import { useEffect, useMemo, useState } from 'react'

const QUICK_PROMPTS = ['Summarize my week', 'What did I work on last week?', 'Help me plan tomorrow']

async function getOllamaModels() {
  const response = await fetch('/api/ollama/api/tags', { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Ollama returned ${response.status}.`)
  const payload = await response.json()
  return Array.isArray(payload.models) ? payload.models : []
}

function makeTrackerContext({ entries, tasks, github, leetcode }) {
  const recentCutoff = new Date()
  recentCutoff.setDate(recentCutoff.getDate() - 45)
  const recentEntries = Object.entries(entries)
    .filter(([date]) => new Date(`${date}T12:00:00`) >= recentCutoff)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({
      date,
      productive: Boolean(entry.productive),
      notes: (entry.notes || '').slice(0, 1600),
      habits: Object.entries(entry.habits || {}).filter(([, checked]) => checked).map(([habit]) => habit),
    }))
  const commits = (github.commits || []).slice(0, 12).map((commit) => ({
    date: commit.commit?.author?.date || null,
    repository: commit.repository,
    message: (commit.commit?.message || '').split('\n')[0].slice(0, 220),
  }))
  const publicEvents = (github.events || []).slice(0, 20).map((event) => ({
    date: event.created_at,
    type: event.type,
    repository: event.repo?.name,
  }))
  const submissions = Object.entries(leetcode.submissionCalendar || {}).slice(-45).map(([timestamp, count]) => ({
    date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
    submissions: count,
  }))
  return {
    generatedAt: new Date().toISOString(),
    dateRange: 'Journal entries are limited to the last 45 days.',
    journal: recentEntries,
    tasks: tasks.map(({ title, dueDate, completed }) => ({ title, dueDate, completed })),
    github: { username: github.username || null, syncedAt: github.syncedAt, commits, recentPublicEvents: publicEvents },
    leetcode: { username: leetcode.username || null, syncedAt: leetcode.syncedAt, solved: leetcode.solved, currentStreak: leetcode.streak, activeDaysThisYear: leetcode.totalActiveDays, recentSubmissions: submissions },
  }
}

export default function LocalAssistant({ entries, tasks, github, leetcode }) {
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [modelStatus, setModelStatus] = useState({ kind: 'pending', message: 'Checking local Ollama…' })
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const context = useMemo(() => makeTrackerContext({ entries, tasks, github, leetcode }), [entries, tasks, github, leetcode])

  async function refreshModels() {
    setModelStatus({ kind: 'pending', message: 'Checking local Ollama…' })
    try {
      const available = await getOllamaModels()
      setModels(available)
      setModel((current) => available.some((item) => item.name === current) ? current : available[0]?.name || '')
      setModelStatus(available.length
        ? { kind: 'success', message: `${available.length} local model${available.length === 1 ? '' : 's'} available.` }
        : { kind: 'error', message: 'Ollama is running, but no models are installed yet.' })
    } catch {
      setModels([])
      setModel('')
      setModelStatus({ kind: 'error', message: 'Ollama is not reachable at 127.0.0.1:11434. Start Ollama, then refresh.' })
    }
  }

  useEffect(() => {
    let active = true
    getOllamaModels().then((available) => {
      if (!active) return
      setModels(available)
      setModel(available[0]?.name || '')
      setModelStatus(available.length
        ? { kind: 'success', message: `${available.length} local model${available.length === 1 ? '' : 's'} available.` }
        : { kind: 'error', message: 'Ollama is running, but no models are installed yet.' })
    }).catch(() => {
      if (active) setModelStatus({ kind: 'error', message: 'Ollama is not reachable at 127.0.0.1:11434. Start Ollama, then refresh.' })
    })
    return () => { active = false }
  }, [])

  async function ask(rawQuestion = question) {
    const content = rawQuestion.trim()
    if (!content || busy) return
    if (!model) {
      setError('Start Ollama and select an installed model first.')
      return
    }
    setQuestion('')
    setError('')
    setBusy(true)
    const nextMessages = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    const system = `You are Daymark, a private personal progress assistant. Answer using only the tracker data in the user message. Be practical, concise, and specific with dates. If the data is missing, say so rather than guessing. Clearly separate recorded facts from suggestions. You cannot change tracker records; never claim to have saved, edited, or scheduled anything. The tracker data follows as JSON:\n${JSON.stringify(context)}`
    try {
      const response = await fetch('/api/ollama/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: system }, ...nextMessages.slice(-8)] }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || `Ollama returned ${response.status}.`)
      const answer = payload.message?.content?.trim()
      if (!answer) throw new Error('Ollama returned an empty answer.')
      setMessages((current) => [...current, { role: 'assistant', content: answer }])
    } catch (requestError) {
      setError(requestError.name === 'TimeoutError' ? 'The model took too long to respond. Try a shorter question or a smaller model.' : requestError.message || 'Could not get a response from Ollama.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel assistant-panel" aria-labelledby="assistant-title">
      <div className="github-top assistant-top">
        <div><p className="section-kicker">LOCAL AI</p><h2 id="assistant-title">Progress assistant</h2><p className="github-description">Ask questions about your journal, habits, tasks, and synced developer activity.</p></div>
        <span className="local-badge"><span className={`status-dot${modelStatus.kind === 'error' ? ' offline' : ''}`} /> Ollama on this device</span>
      </div>
      <div className="assistant-controls">
        <label htmlFor="ollama-model">Model</label>
        <select id="ollama-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={!models.length}>
          {models.length ? models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>) : <option value="">No model available</option>}
        </select>
        <button type="button" onClick={refreshModels} disabled={modelStatus.kind === 'pending'}>Refresh models</button>
        <span className={`assistant-model-status ${modelStatus.kind}`} role="status">{modelStatus.message}</span>
      </div>
      <div className="assistant-chat" aria-live="polite">
        {messages.length === 0 && <div className="assistant-empty"><strong>What would you like to reflect on?</strong><div className="assistant-prompts">{QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)} disabled={!model || busy}>{prompt}</button>)}</div></div>}
        {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}><span>{message.role === 'user' ? 'You' : 'Daymark'}</span><p>{message.content}</p></article>)}
        {busy && <p className="assistant-thinking" role="status">Thinking locally…</p>}
      </div>
      <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); ask() }}>
        <label className="sr-only" htmlFor="assistant-question">Ask about your progress</label>
        <textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your progress…" rows={2} maxLength={1000} />
        <button type="submit" disabled={busy || !question.trim() || !model}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {error && <p className="assistant-error" role="alert">{error}</p>}
      <p className="github-footnote assistant-privacy">Only recent journal entries (45 days), tasks, and stored GitHub/LeetCode summaries are sent to your local Ollama instance. Chat history stays in memory until this page is reloaded. This assistant can read and suggest; it cannot change your records.</p>
    </section>
  )
}
