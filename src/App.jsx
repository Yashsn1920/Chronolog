import { useEffect, useMemo, useState } from 'react'
import { readStored, writeStored } from './lib/storage.js'
import LocalAssistant from './components/LocalAssistant.jsx'
import './App.css'
import './Enhancements.css'

const STORAGE_KEY = 'progress-tracker.v1'
const TASKS_KEY = 'progress-tracker.tasks.v1'
const GITHUB_KEY = 'progress-tracker.github.v1'
const LEETCODE_KEY = 'progress-tracker.leetcode.v1'
const N8N_KEY = 'progress-tracker.n8n.v1'
const REMINDER_KEY = 'progress-tracker.reminders.v1'
const WEEKLY_SENT_KEY = 'progress-tracker.weekly-sent.v1'
const DEFAULT_NOTIFICATION_EMAIL = ''
const HABITS = ['Read or learn', 'Exercise', 'Plan tomorrow']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EVENT_TYPES = new Set(['PushEvent', 'PullRequestEvent', 'IssuesEvent', 'IssueCommentEvent', 'CreateEvent', 'ReleaseEvent', 'ForkEvent', 'WatchEvent'])

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createSnapshot(entries, tasks, github, leetcode) {
  return {
    entries,
    tasks,
    developerActivity: {
      github: { username: github.username, syncedAt: github.syncedAt, recentPublicEvents: github.events.length, publicRepositories: github.repositories.length },
      leetcode: { username: leetcode.username, syncedAt: leetcode.syncedAt, solved: leetcode.solved, currentStreak: leetcode.streak, activeDaysThisYear: leetcode.totalActiveDays },
    },
  }
}

function createWeeklySummary(entries, tasks, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return dateKey(date)
  })
  const weekEntries = dates.map((date) => ({ date, entry: entries[date] || {} }))
  const productiveDays = weekEntries.filter(({ entry }) => entry.productive).length
  const notes = weekEntries.filter(({ entry }) => entry.notes?.trim()).map(({ date, entry }) => ({ date, notes: entry.notes.trim() }))
  const weekTasks = tasks.filter((task) => dates.includes(task.dueDate))
  const completedTasks = weekTasks.filter((task) => task.completed).length
  const habitChecks = weekEntries.reduce((total, { entry }) => total + HABITS.filter((habit) => entry.habits?.[habit]).length, 0)
  return {
    period: { start: dates[0], end: dates[6] },
    productiveDays,
    daysWithNotes: notes.length,
    habitsCompleted: habitChecks,
    tasksCompleted: completedTasks,
    tasksTotal: weekTasks.length,
    notes,
  }
}

async function postToN8n(config, payload) {
  const path = config.webhookPath.trim().replace(/^\/+|\/+$/g, '')
  if (!/^[a-z\d/_-]+$/i.test(path) || path.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Enter a valid n8n webhook path.')
  }
  const response = await fetch(`/api/n8n/webhook/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160)
    throw new Error(`n8n returned ${response.status}${detail ? `: ${detail}` : '.'}`)
  }
  return response
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'chevron-left') return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>
  if (name === 'chevron-right') return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
  if (name === 'calendar') return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></svg>
  if (name === 'github') return <svg {...common}><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.8a5.3 5.3 0 0 0-1.4-3.7 4.9 4.9 0 0 0-.1-3.7S17.5 1 15 3.5a13.5 13.5 0 0 0-7 0C5.5 1 4.3 1.3 4.3 1.3a4.9 4.9 0 0 0-.1 3.7 5.3 5.3 0 0 0-1.4 3.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 8 18v4" /></svg>
  if (name === 'code') return <svg {...common}><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14" /></svg>
  if (name === 'trash') return <svg {...common}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></svg>
  return null
}

function streakStats(entries, today) {
  const productiveDays = Object.keys(entries).filter((key) => entries[key]?.productive).sort()
  const set = new Set(productiveDays)
  let current = 0
  const start = new Date(`${dateKey(today)}T12:00:00`)
  if (!set.has(dateKey(start))) start.setDate(start.getDate() - 1)
  while (set.has(dateKey(start))) {
    current += 1
    start.setDate(start.getDate() - 1)
  }
  let best = 0
  let run = 0
  let previous = null
  for (const key of productiveDays) {
    const [year, month, day] = key.split('-').map(Number)
    const currentDay = Date.UTC(year, month - 1, day)
    const difference = previous === null ? Infinity : (currentDay - previous) / 86400000
    run = difference === 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = currentDay
  }
  return { current, best }
}

function eventLabel(event) {
  if (event.type === 'PushEvent') return 'Pushed code'
  if (event.type === 'PullRequestEvent') return `Pull request ${event.payload?.action || 'updated'}`
  if (event.type === 'IssuesEvent') return `Issue ${event.payload?.action || 'updated'}`
  if (event.type === 'IssueCommentEvent') return 'Commented on an issue'
  if (event.type === 'CreateEvent') return `Created ${event.payload?.ref_type || 'a branch'}`
  if (event.type === 'ReleaseEvent') return 'Published a release'
  if (event.type === 'ForkEvent') return 'Forked a repository'
  if (event.type === 'WatchEvent') return 'Starred a repository'
  return 'GitHub activity'
}

function App() {
  const [today] = useState(() => new Date())
  const [entries, setEntries] = useState(() => {
    const saved = readStored(STORAGE_KEY, {})
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  })
  const [tasks, setTasks] = useState(() => {
    const saved = readStored(TASKS_KEY, [])
    return Array.isArray(saved) ? saved.filter((task) => task && typeof task.id === 'string' && typeof task.title === 'string' && typeof task.dueDate === 'string') : []
  })
  const [github, setGithub] = useState(() => {
    const saved = readStored(GITHUB_KEY, {})
    return { username: typeof saved.username === 'string' ? saved.username : '', events: Array.isArray(saved.events) ? saved.events : [], repositories: Array.isArray(saved.repositories) ? saved.repositories : [], commits: Array.isArray(saved.commits) ? saved.commits : [], commitLookupComplete: saved.commitLookupComplete !== false, syncedAt: saved.syncedAt || null }
  })
  const [leetcode, setLeetcode] = useState(() => {
    const saved = readStored(LEETCODE_KEY, {})
    return { username: typeof saved.username === 'string' ? saved.username : '', solved: saved.solved || null, streak: Number(saved.streak) || 0, totalActiveDays: Number(saved.totalActiveDays) || 0, submissionCalendar: saved.submissionCalendar && typeof saved.submissionCalendar === 'object' ? saved.submissionCalendar : {}, syncedAt: saved.syncedAt || null }
  })
  const [githubUsername, setGithubUsername] = useState(github.username || 'Yashsn1920')
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState('')
  const [leetcodeUsername, setLeetcodeUsername] = useState(leetcode.username || 'vesperina')
  const [leetcodeLoading, setLeetcodeLoading] = useState(false)
  const [leetcodeError, setLeetcodeError] = useState('')
  const [n8n, setN8n] = useState(() => {
    const saved = readStored(N8N_KEY, {})
    const savedEmail = typeof saved.email === 'string' ? saved.email : ''
    const email = savedEmail || DEFAULT_NOTIFICATION_EMAIL
    return { webhookPath: typeof saved.webhookPath === 'string' ? saved.webhookPath : 'progress-tracker', autoSync: Boolean(saved.autoSync), weeklyEmail: Boolean(saved.weeklyEmail), weeklyTime: typeof saved.weeklyTime === 'string' ? saved.weeklyTime : '09:00', email }
  })
  const [n8nBusy, setN8nBusy] = useState(false)
  const [n8nStatus, setN8nStatus] = useState({ kind: 'idle', message: '' })
  const [notificationPermission, setNotificationPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const [taskReminderTime, setTaskReminderTime] = useState('')
  const [remindersSent, setRemindersSent] = useState(() => readStored(REMINDER_KEY, {}))
  const [weeklySent, setWeeklySent] = useState(() => readStored(WEEKLY_SENT_KEY, ''))
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState(dateKey(today))
  const [taskError, setTaskError] = useState('')
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(dateKey(today))
  const selectedEntry = entries[selectedDate] || { productive: false, notes: '', habits: {} }

  useEffect(() => writeStored(STORAGE_KEY, entries), [entries])
  useEffect(() => writeStored(TASKS_KEY, tasks), [tasks])
  useEffect(() => writeStored(GITHUB_KEY, github), [github])
  useEffect(() => writeStored(LEETCODE_KEY, leetcode), [leetcode])
  useEffect(() => writeStored(N8N_KEY, n8n), [n8n])
  useEffect(() => writeStored(REMINDER_KEY, remindersSent), [remindersSent])
  useEffect(() => writeStored(WEEKLY_SENT_KEY, weeklySent), [weeklySent])
  useEffect(() => {
    const checkReminders = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const now = new Date()
      const todayKey = dateKey(now)
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const ready = tasks.filter((task) => {
        if (task.completed || task.dueDate !== todayKey || !task.reminderTime || remindersSent[task.id] === todayKey) return false
        const [hour, minute] = task.reminderTime.split(':').map(Number)
        const scheduledMinutes = hour * 60 + minute
        return scheduledMinutes <= currentMinutes
      })
      for (const task of ready) {
        try {
          new Notification('Daymark reminder', { body: task.title, tag: `daymark-${task.id}` })
          setRemindersSent((current) => ({ ...current, [task.id]: todayKey }))
        } catch {
          // Keep the reminder available for another attempt if the browser rejects it.
        }
      }
    }
    checkReminders()
    const interval = window.setInterval(checkReminders, 30000)
    return () => window.clearInterval(interval)
  }, [tasks, remindersSent])
  useEffect(() => {
    const checkWeeklySummary = () => {
      const now = new Date()
      const todayKey = dateKey(now)
      if (now.getDay() !== 1 || weeklySent === todayKey) return
      const [hour, minute] = n8n.weeklyTime.split(':').map(Number)
      if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Daymark weekly summary', { body: 'Your progress summary is ready.', tag: `daymark-weekly-${todayKey}` }) } catch { /* Email delivery can continue independently. */ }
      }
      if (!n8n.weeklyEmail) {
        setWeeklySent(todayKey)
        return
      }
      setWeeklySent(todayKey)
      postToN8n(n8n, { type: 'weekly-summary', source: 'daymark-schedule', sentAt: now.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, recipient: n8n.email, summary: createWeeklySummary(entries, tasks, now) }).then(() => {
        setN8nStatus({ kind: 'success', message: 'Scheduled weekly summary accepted by n8n. Check your workflow for email delivery.' })
      }).catch((error) => setN8nStatus({ kind: 'error', message: `Scheduled weekly summary failed: ${error.message}` }))
    }
    checkWeeklySummary()
    const interval = window.setInterval(checkWeeklySummary, 30000)
    return () => window.clearInterval(interval)
  }, [entries, tasks, n8n, weeklySent])
  useEffect(() => {
    if (!n8n.autoSync || !n8n.webhookPath) return undefined
    const timeout = window.setTimeout(() => {
      postToN8n({ webhookPath: n8n.webhookPath }, { type: 'snapshot', source: 'daymark-auto', sentAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, recipient: n8n.email, snapshot: createSnapshot(entries, tasks, github, leetcode) }).catch(() => {
        setN8nStatus({ kind: 'error', message: 'Automatic snapshot sync failed. Check the n8n webhook and local instance.' })
      })
    }, 5000)
    return () => window.clearTimeout(timeout)
  }, [entries, tasks, github, leetcode, n8n.autoSync, n8n.webhookPath, n8n.email])

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const offset = (firstDay.getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const selected = new Date(`${selectedDate}T12:00:00`)
  const selectedLabel = selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`
  const leetcodeDays = new Set(Object.keys(leetcode.submissionCalendar).map((timestamp) => new Date(Number(timestamp) * 1000).toISOString().slice(0, 10)))
  const selectedLeetcodeSubmissions = Object.entries(leetcode.submissionCalendar).find(([timestamp]) => new Date(Number(timestamp) * 1000).toISOString().slice(0, 10) === selectedDate)?.[1] || 0
  const monthEntries = Object.entries(entries).filter(([key]) => key.startsWith(monthPrefix))
  const productiveCount = monthEntries.filter(([, entry]) => entry.productive).length
  const loggedDates = new Set([
    ...monthEntries.filter(([, entry]) => (entry.notes || '').trim() || entry.productive || Object.values(entry.habits || {}).some(Boolean)).map(([key]) => key),
    ...tasks.filter((task) => task.dueDate.startsWith(monthPrefix)).map((task) => task.dueDate),
    ...github.events.filter((event) => EVENT_TYPES.has(event.type)).map((event) => dateKey(new Date(event.created_at))).filter((key) => key.startsWith(monthPrefix)),
    ...[...leetcodeDays].filter((key) => key.startsWith(monthPrefix)),
  ])
  const loggedCount = loggedDates.size
  const habitCount = HABITS.filter((habit) => selectedEntry.habits?.[habit]).length
  const streaks = useMemo(() => streakStats(entries, today), [entries, today])
  const selectedTasks = tasks.filter((task) => task.dueDate === selectedDate)
  const openTaskCount = tasks.filter((task) => task.dueDate.startsWith(monthPrefix) && !task.completed).length
  const selectedGithubEvents = github.events.filter((event) => dateKey(new Date(event.created_at)) === selectedDate && EVENT_TYPES.has(event.type))
  const githubDays = new Set(github.events.filter((event) => EVENT_TYPES.has(event.type)).map((event) => dateKey(new Date(event.created_at))))

  function updateEntry(patch) {
    setEntries((current) => {
      const previous = current[selectedDate] || { productive: false, notes: '', habits: {} }
      return { ...current, [selectedDate]: { ...previous, ...patch } }
    })
  }

  function changeMonth(delta) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  function goToToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(dateKey(today))
  }

  function addTask(event) {
    event.preventDefault()
    const title = taskTitle.trim()
    if (!title) {
      setTaskError('Enter a task before adding it.')
      return
    }
    if (!taskDueDate || Number.isNaN(new Date(`${taskDueDate}T12:00:00`).getTime())) {
      setTaskError('Choose a valid due date.')
      return
    }
    setTasks((current) => [{ id: crypto.randomUUID(), title, dueDate: taskDueDate, reminderTime: taskReminderTime, completed: false }, ...current])
    setSelectedDate(taskDueDate)
    setMonth(() => {
      const due = new Date(`${taskDueDate}T12:00:00`)
      return new Date(due.getFullYear(), due.getMonth(), 1)
    })
    setTaskTitle('')
    setTaskReminderTime('')
    setTaskError('')
  }

  async function enableDesktopNotifications() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  async function sendN8n(type) {
    setN8nBusy(true)
    setN8nStatus({ kind: 'pending', message: 'Sending to your local n8n webhook…' })
    const payload = { type, source: 'daymark', sentAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, recipient: n8n.email }
    if (type === 'snapshot') payload.snapshot = createSnapshot(entries, tasks, github, leetcode)
    if (type === 'weekly-summary') payload.summary = createWeeklySummary(entries, tasks)
    try {
      await postToN8n(n8n, payload)
      setN8nStatus({ kind: 'success', message: 'n8n accepted the webhook request. Email delivery depends on your workflow.' })
    } catch (error) {
      setN8nStatus({ kind: 'error', message: error.message || 'Could not reach the local n8n webhook.' })
    } finally {
      setN8nBusy(false)
    }
  }

  function updateTask(id, patch) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task))
  }

  async function syncGithub(event) {
    event.preventDefault()
    const username = githubUsername.trim()
    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
      setGithubError('Enter a valid GitHub username.')
      return
    }
    setGithubLoading(true)
    setGithubError('')
    const headers = { Accept: 'application/vnd.github+json' }
    try {
      const [eventsResponse, reposResponse] = await Promise.all([
        fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`, { headers }),
        fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100&type=owner`, { headers }),
      ])
      const failedResponse = !eventsResponse.ok ? eventsResponse : !reposResponse.ok ? reposResponse : null
      if (failedResponse) {
        if (failedResponse.status === 404) throw new Error('That GitHub account was not found.')
        if (failedResponse.status === 403 || failedResponse.status === 429) throw new Error('GitHub rate limit reached. Try again after the reset time.')
        throw new Error(`GitHub returned an error (${failedResponse.status}).`)
      }
      const [events, repositories] = await Promise.all([eventsResponse.json(), reposResponse.json()])
      const recentRepos = Array.isArray(repositories) ? repositories.slice(0, 3) : []
      const commitLists = await Promise.all(recentRepos.map(async (repo) => {
        try {
          const response = await fetch(`https://api.github.com/repos/${repo.full_name}/commits?author=${encodeURIComponent(username)}&per_page=5`, { headers })
          if (!response.ok) return { items: [], complete: false }
          const commits = await response.json()
          return { items: Array.isArray(commits) ? commits.map((commit) => ({ ...commit, repository: repo.full_name })) : [], complete: true }
        } catch {
          return { items: [], complete: false }
        }
      }))
      const commits = commitLists.flatMap((result) => result.items).sort((a, b) => new Date(b.commit?.author?.date || 0) - new Date(a.commit?.author?.date || 0)).slice(0, 6)
      setGithub({ username, events: Array.isArray(events) ? events : [], repositories: Array.isArray(repositories) ? repositories : [], commits, commitLookupComplete: commitLists.every((result) => result.complete), syncedAt: new Date().toISOString() })
      setGithubUsername(username)
    } catch (error) {
      setGithubError(error instanceof TypeError ? 'Could not reach GitHub. Check your connection and try again.' : error.message || 'GitHub sync failed.')
    } finally {
      setGithubLoading(false)
    }
  }

  async function syncLeetcode(event) {
    event.preventDefault()
    const username = leetcodeUsername.trim()
    if (!/^[a-z\d_-]{1,30}$/i.test(username)) {
      setLeetcodeError('Enter a valid LeetCode username.')
      return
    }
    setLeetcodeLoading(true)
    setLeetcodeError('')
    const query = `query localProgress($username: String!, $year: Int) {
      matchedUser(username: $username) {
        username
        submitStats { acSubmissionNum { difficulty count submissions } }
        userCalendar(year: $year) { streak totalActiveDays submissionCalendar }
      }
    }`
    try {
      const response = await fetch('/api/leetcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username, year: today.getFullYear() }, operationName: 'localProgress' }),
      })
      if (!response.ok) throw new Error(`LeetCode returned an error (${response.status}).`)
      const payload = await response.json()
      const profile = payload.data?.matchedUser
      if (payload.errors?.length || !profile) throw new Error('That public LeetCode profile could not be read.')
      const rawCounts = profile.submitStats?.acSubmissionNum || []
      const countFor = (difficulty) => rawCounts.find((item) => item.difficulty === difficulty)?.count || 0
      let submissionCalendar = {}
      try {
        const calendar = profile.userCalendar?.submissionCalendar
        submissionCalendar = typeof calendar === 'string' ? JSON.parse(calendar || '{}') : calendar || {}
      } catch {
        submissionCalendar = {}
      }
      setLeetcode({ username: profile.username, solved: { all: countFor('All'), easy: countFor('Easy'), medium: countFor('Medium'), hard: countFor('Hard') }, streak: profile.userCalendar?.streak || 0, totalActiveDays: profile.userCalendar?.totalActiveDays || 0, submissionCalendar, syncedAt: new Date().toISOString() })
      setLeetcodeUsername(profile.username)
    } catch (error) {
      setLeetcodeError(error instanceof TypeError ? 'Could not reach LeetCode. Check your connection and try again.' : error.message || 'LeetCode sync failed.')
    } finally {
      setLeetcodeLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Daymark home"><span className="brand-mark"><span /></span><span>daymark</span></a>
        <div className="topbar-right"><span className="local-badge"><span className="status-dot" /> Saved locally</span><span className="avatar">Y</span></div>
      </header>

      <section className="page-heading" id="top">
        <div><p className="eyebrow">YOUR PERSONAL SPACE</p><h1>Keep showing up.</h1><p className="subtitle">A little progress, captured each day.</p></div>
        <div className="today-label"><Icon name="calendar" size={16} />{today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </section>

      <section className="stats-row" aria-label="Monthly overview">
        <div className="stat"><span className="stat-icon green"><Icon name="check" size={17} /></span><div><strong>{productiveCount}</strong><span>productive days</span></div></div>
        <div className="stat"><span className="stat-icon blue"><Icon name="spark" size={17} /></span><div><strong>{streaks.current}<small> days</small></strong><span>current streak · best {streaks.best}</span></div></div>
        <div className="stat"><span className="stat-icon amber"><Icon name="calendar" size={17} /></span><div><strong>{loggedCount}</strong><span>days with activity</span></div></div>
        <div className="stat"><span className="stat-icon violet"><Icon name="check" size={17} /></span><div><strong>{openTaskCount}</strong><span>open tasks</span></div></div>
        <span className="stats-caption">THIS MONTH</span>
      </section>

      <div className="dashboard-grid">
        <section className="panel calendar-panel">
          <div className="panel-heading calendar-heading"><div><p className="section-kicker">YOUR ACTIVITY</p><h2>{monthName}</h2></div><div className="month-controls"><button className="text-button" onClick={goToToday}>Today</button><button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><Icon name="chevron-left" /></button><button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month"><Icon name="chevron-right" /></button></div></div>
          <div className="calendar-grid weekday-row">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid days-grid">{cells.map((day, index) => {
            if (!day) return <div className="day-cell empty" key={`empty-${index}`} />
            const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day))
            const entry = entries[key]
            const isToday = key === dateKey(today)
            const isSelected = key === selectedDate
            const hasNotes = Boolean(entry?.notes?.trim())
            const hasHabit = Object.values(entry?.habits || {}).some(Boolean)
            const hasTask = tasks.some((task) => task.dueDate === key)
            const hasGithub = githubDays.has(key)
            const hasLeetcode = leetcodeDays.has(key)
            const hasData = entry?.productive || hasNotes || hasHabit || hasTask || hasGithub || hasLeetcode
            return <button key={key} className={`day-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${entry?.productive ? ' productive' : ''}`} onClick={() => setSelectedDate(key)} aria-label={`${key}${entry?.productive ? ', productive' : ''}${hasNotes ? ', has notes' : ''}${hasTask ? ', tasks due' : ''}${hasGithub ? ', GitHub activity' : ''}${hasLeetcode ? ', LeetCode submissions' : ''}`} aria-pressed={isSelected}>
              <span className="day-number">{day}</span>{hasData && <span className="day-markers">{entry?.productive && <i className="mark-productivity" />}{hasNotes && <i className="mark-notes" />}{hasHabit && <i className="mark-habit" />}{hasTask && <i className="mark-task" />}{hasGithub && <i className="mark-github" />}{hasLeetcode && <i className="mark-leetcode" />}</span>}
            </button>
          })}</div>
          <div className="calendar-footer"><div className="legend"><span><i className="legend-dot green-dot" />Productive</span><span><i className="legend-dot blue-dot" />Notes</span><span><i className="legend-dot amber-dot" />Habits</span><span><i className="legend-dot task-dot" />Tasks</span><span><i className="legend-dot github-dot" />GitHub</span><span><i className="legend-dot leetcode-dot" />LeetCode</span></div><span className="timezone-note">Your notes stay on this device</span></div>
        </section>

        <section className="panel detail-panel">
          <div className="panel-heading detail-heading"><div><p className="section-kicker">DAILY LOG</p><h2>{selectedLabel}</h2></div><span className="date-chip">{selectedDate}</span></div>
          <button className={`productive-toggle${selectedEntry.productive ? ' active' : ''}`} onClick={() => updateEntry({ productive: !selectedEntry.productive })} aria-pressed={selectedEntry.productive}><span className="toggle-check"><Icon name="check" size={16} /></span><span className="toggle-copy"><strong>{selectedEntry.productive ? 'Marked as a productive day' : 'Mark as a productive day'}</strong><small>{selectedEntry.productive ? 'Nice work. This day is in your progress log.' : 'Give yourself credit for making progress.'}</small></span><span className="toggle-switch"><i /></span></button>
          <div className="detail-section notes-section"><div className="field-heading"><label htmlFor="daily-notes">Daily notes</label><span>Autosaves</span></div><textarea id="daily-notes" value={selectedEntry.notes || ''} onChange={(event) => updateEntry({ notes: event.target.value })} placeholder="What did you work on or learn today?" rows={4} /></div>
          <div className="detail-section habits-section"><div className="field-heading"><span className="field-label">Daily habits</span><span>{habitCount} of {HABITS.length} done</span></div><div className="habit-list">{HABITS.map((habit) => {
            const checked = Boolean(selectedEntry.habits?.[habit])
            return <label className={`habit-item${checked ? ' checked' : ''}`} key={habit}><input type="checkbox" checked={checked} onChange={() => updateEntry({ habits: { ...(selectedEntry.habits || {}), [habit]: !checked } })} /><span className="custom-check"><Icon name="check" size={13} /></span><span>{habit}</span></label>
          })}</div></div>
          {selectedGithubEvents.length > 0 && <div className="detail-section external-day"><div className="field-heading"><span className="field-label">GitHub activity</span><span>Synced</span></div>{selectedGithubEvents.slice(0, 3).map((event) => <a className="mini-github-event" key={event.id} href={`https://github.com/${event.repo?.name || github.username}`} target="_blank" rel="noreferrer"><span>{eventLabel(event)}</span><small>{event.repo?.name}</small></a>)}</div>}
          {selectedLeetcodeSubmissions > 0 && <div className="detail-section external-day leetcode-day"><div className="field-heading"><span className="field-label">LeetCode activity</span><span>Synced</span></div><p>{selectedLeetcodeSubmissions} submission{selectedLeetcodeSubmissions === 1 ? '' : 's'} recorded</p></div>}
          <div className="detail-section tasks-section"><div className="field-heading"><span className="field-label">Tasks</span><span>{selectedTasks.filter((task) => task.completed).length}/{selectedTasks.length} complete</span></div>
            <form className="task-form" onSubmit={addTask}><input aria-label="New task" value={taskTitle} onChange={(event) => { setTaskTitle(event.target.value); setTaskError('') }} placeholder="Add a task for this day" maxLength={120} /><input aria-label="Task due date" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /><input aria-label="Desktop reminder time" type="time" value={taskReminderTime} onChange={(event) => setTaskReminderTime(event.target.value)} title="Optional desktop reminder time" /><button type="submit" aria-label="Add task"><Icon name="plus" size={16} /></button></form>
            <div className="notification-setting"><span>{notificationPermission === 'granted' ? 'Desktop notifications enabled' : notificationPermission === 'unsupported' ? 'Desktop notifications are unavailable in this browser' : 'Desktop reminders need browser permission'}</span>{notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && <button type="button" onClick={enableDesktopNotifications}>Enable</button>}</div>
            {taskError && <p className="form-error" role="alert">{taskError}</p>}
            {selectedTasks.length === 0 ? <p className="empty-tasks">No tasks for this day yet.</p> : <ul className="task-list">{selectedTasks.map((task) => <li className={`task-item${task.completed ? ' completed' : ''}`} key={task.id}><label><input type="checkbox" checked={task.completed} onChange={() => updateTask(task.id, { completed: !task.completed })} /><span className="custom-check"><Icon name="check" size={13} /></span><span>{task.title}{task.reminderTime && <small className="task-reminder"> · reminder {task.reminderTime}</small>}</span></label><button type="button" className="delete-task" aria-label={`Delete ${task.title}`} onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}><Icon name="trash" size={14} /></button></li>)}</ul>}
          </div>
          <div className="local-note"><span className="note-lock">●</span> Notes, habits, and tasks are stored in this browser.</div>
        </section>
      </div>

      <section className="panel github-panel">
        <div className="github-top"><div><p className="section-kicker">DEVELOPER ACTIVITY</p><h2><Icon name="github" size={19} /> GitHub</h2><p className="github-description">Recent public activity and repositories. Read-only; no token required.</p></div>{github.syncedAt && <span className="sync-time">Synced {new Date(github.syncedAt).toLocaleString()}</span>}</div>
        <form className="github-connect" onSubmit={syncGithub}><label className="sr-only" htmlFor="github-username">GitHub username</label><span className="github-prefix">github.com/</span><input id="github-username" value={githubUsername} onChange={(event) => { setGithubUsername(event.target.value); setGithubError('') }} placeholder="your-username" autoComplete="off" /><button type="submit" disabled={githubLoading}>{githubLoading ? 'Syncing…' : <><Icon name="refresh" size={15} /> {github.syncedAt ? 'Sync now' : 'Connect'}</>}</button></form>
        {githubError && <p className="form-error github-error" role="alert">{githubError}</p>}
        {!github.syncedAt ? <p className="github-empty">Enter a username and sync to show public repositories, recent public events, and recent commits here.</p> : <div className="github-content">
          <div className="github-column"><div className="github-column-title"><strong>Recent public activity</strong><span>{github.events.filter((item) => EVENT_TYPES.has(item.type)).length} events returned</span></div>{github.events.filter((item) => EVENT_TYPES.has(item.type)).slice(0, 6).map((event) => <a className="github-event" key={event.id} href={`https://github.com/${event.repo?.name || github.username}`} target="_blank" rel="noreferrer"><span className="event-dot" /><span className="github-event-copy"><strong>{eventLabel(event)}</strong><small>{event.repo?.name || 'Repository'} · {new Date(event.created_at).toLocaleDateString()}</small></span><span className="event-arrow">↗</span></a>)}{github.events.filter((item) => EVENT_TYPES.has(item.type)).length === 0 && <p className="empty-tasks">No recent public events were returned for this account.</p>}</div>
          <div className="github-column"><div className="github-column-title"><strong>Recently updated repositories</strong><span>{github.repositories.length} public repos</span></div>{github.repositories.slice(0, 6).map((repo) => <a className="repo-item" key={repo.id} href={repo.html_url} target="_blank" rel="noreferrer"><span className="repo-name">{repo.name}</span><span className="repo-language">{repo.language || '—'}</span><span className="repo-stars">★ {repo.stargazers_count}</span></a>)}{github.repositories.length === 0 && <p className="empty-tasks">No public repositories were returned.</p>}</div>
          <div className="github-column"><div className="github-column-title"><strong>Recent commits</strong><span>{github.commits.length} found</span></div>{github.commits.map((commit) => <a className="commit-item" key={commit.sha} href={commit.html_url} target="_blank" rel="noreferrer"><span className="commit-message">{commit.commit?.message?.split('\n')[0] || 'Commit'}</span><small>{commit.repository} · {new Date(commit.commit?.author?.date || 0).toLocaleDateString()}</small></a>)}{github.commits.length === 0 && <p className="empty-tasks">{github.commitLookupComplete ? 'No commits found in recently updated public repositories.' : 'GitHub could not return commits for the checked repositories.'}</p>}</div>
        </div>}
        {github.syncedAt && <p className="github-footnote">Synced public data from GitHub’s REST API. Events cover only recent public activity; commit lookup checks the three most recently updated public repositories. This is not a complete contribution history.</p>}
      </section>

      <section className="panel leetcode-panel">
        <div className="github-top"><div><p className="section-kicker">CODING PRACTICE</p><h2><Icon name="code" size={19} /> LeetCode</h2><p className="github-description">Public profile stats and submission activity for this year.</p></div>{leetcode.syncedAt && <span className="sync-time">Synced {new Date(leetcode.syncedAt).toLocaleString()}</span>}</div>
        <form className="github-connect" onSubmit={syncLeetcode}><label className="sr-only" htmlFor="leetcode-username">LeetCode username</label><span className="github-prefix">leetcode.com/u/</span><input id="leetcode-username" value={leetcodeUsername} onChange={(event) => { setLeetcodeUsername(event.target.value); setLeetcodeError('') }} placeholder="your-username" autoComplete="off" /><button type="submit" disabled={leetcodeLoading}>{leetcodeLoading ? 'Syncing…' : <><Icon name="refresh" size={15} /> {leetcode.syncedAt ? 'Sync now' : 'Sync profile'}</>}</button></form>
        {leetcodeError && <p className="form-error github-error" role="alert">{leetcodeError}</p>}
        {leetcode.solved ? <div className="leetcode-stats"><div className="solved-total"><strong>{leetcode.solved.all}</strong><span>problems solved</span></div><div className="solved-breakdown"><span><i className="easy-dot" /> Easy <strong>{leetcode.solved.easy}</strong></span><span><i className="medium-dot" /> Medium <strong>{leetcode.solved.medium}</strong></span><span><i className="hard-dot" /> Hard <strong>{leetcode.solved.hard}</strong></span></div><div className="leetcode-extra"><span><strong>{leetcode.streak}</strong> current streak</span><span><strong>{leetcode.totalActiveDays}</strong> active days this year</span></div><a className="profile-link" href={`https://leetcode.com/u/${encodeURIComponent(leetcode.username)}/`} target="_blank" rel="noreferrer">View {leetcode.username}’s profile ↗</a></div> : <p className="github-empty">Sync to load solved counts and mark days with LeetCode submissions.</p>}
        <p className="github-footnote">Uses LeetCode’s public GraphQL endpoint through a localhost proxy. No login cookies or tokens are sent. This endpoint is undocumented and may change.</p>
      </section>

      <section className="panel automation-panel">
        <div className="github-top"><div><p className="section-kicker">AUTOMATION</p><h2>n8n notifications</h2><p className="github-description">Send tracker snapshots and weekly summaries to a local n8n workflow.</p><a className="n8n-open-link" href="http://127.0.0.1:5678/home/workflows" target="_blank" rel="noreferrer">Open local n8n workflows ↗</a></div><span className="local-badge"><span className="status-dot" /> Local webhook</span></div>
        <div className="automation-fields">
          <label>Webhook path<input value={n8n.webhookPath} onChange={(event) => setN8n((current) => ({ ...current, webhookPath: event.target.value }))} placeholder="progress-tracker" autoComplete="off" /></label>
          <label>Email recipient<input type="email" value={n8n.email} onChange={(event) => setN8n((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" autoComplete="email" /></label>
        </div>
        <label className="autosync-setting"><input type="checkbox" checked={n8n.autoSync} onChange={(event) => setN8n((current) => ({ ...current, autoSync: event.target.checked }))} /><span>Keep the latest tracker snapshot synced to n8n</span></label>
        <div className="weekly-setting"><label className="autosync-setting"><input type="checkbox" checked={n8n.weeklyEmail} onChange={(event) => setN8n((current) => ({ ...current, weeklyEmail: event.target.checked }))} /><span>Email me a weekly summary on Mondays</span></label><label>At <input type="time" value={n8n.weeklyTime} onChange={(event) => setN8n((current) => ({ ...current, weeklyTime: event.target.value }))} /></label></div>
        <div className="automation-actions"><button type="button" disabled={n8nBusy} onClick={() => sendN8n('test')}>Test webhook</button><button type="button" disabled={n8nBusy} onClick={() => sendN8n('snapshot')}>Send snapshot</button><button type="button" disabled={n8nBusy} onClick={() => sendN8n('weekly-summary')}>Send weekly summary</button></div>
        {n8nStatus.message && <p className={`automation-status ${n8nStatus.kind}`} role="status" aria-live="polite">{n8nStatus.message}</p>}
        <div className="workflow-map" id="automation-workflow">
          <p className="section-kicker">WORKFLOW MAP</p>
          <div className="workflow-steps" aria-label="Daymark to n8n email workflow">
            <div className="workflow-node"><strong>Daymark</strong><span>Manual send or Monday summary</span></div><span className="workflow-arrow" aria-hidden="true">→</span>
            <div className="workflow-node"><strong>Local Vite proxy</strong><span>127.0.0.1:5678</span></div><span className="workflow-arrow" aria-hidden="true">→</span>
            <div className="workflow-node n8n-node"><strong>n8n Webhook</strong><span>POST /webhook/{n8n.webhookPath || 'progress-tracker'}</span></div><span className="workflow-arrow" aria-hidden="true">→</span>
            <div className="workflow-node"><strong>Filter</strong><span>Ignore auto-sync snapshots</span></div><span className="workflow-arrow" aria-hidden="true">→</span>
            <div className="workflow-node email-node"><strong>Send Email</strong><span>{n8n.email || 'your recipient'}</span></div>
          </div>
          <p className="github-footnote">Build these nodes in n8n in this order. Set the Webhook node to POST, add an IF node that continues only when <code>{'{{$json.body.source}}'}</code> is not <code>daymark-auto</code>, then connect Send Email. Use <code>{'{{$json.body.recipient}}'}</code> for To and configure SMTP credentials.</p>
        </div>
        <p className="github-footnote">Import <code>daymark-n8n-workflow.json</code> from the project folder into n8n, set your SMTP credential and sender address, then activate it. The development server forwards requests to <code>127.0.0.1:5678</code> (override with <code>N8N_BASE_URL</code>). Weekly email and desktop reminders run while this dashboard is open; scheduled email also needs the app running at the selected time.</p>
      </section>

      <LocalAssistant entries={entries} tasks={tasks} github={github} leetcode={leetcode} />

      <footer className="app-footer"><span>DAYMARK <span className="footer-separator">/</span> PERSONAL PROGRESS TRACKER</span><span>One day at a time.</span></footer>
    </main>
  )
}

export default App
