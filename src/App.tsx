import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  Database,
  Eye,
  FileCode2,
  Filter,
  Globe2,
  History,
  KeyRound,
  Lightbulb,
  Minus,
  LogOut,
  MessageSquareWarning,
  Network,
  PanelBottom,
  PictureInPicture2,
  Play,
  RotateCcw,
  Search,
  Server,
  ServerOff,
  Shield,
  ShieldAlert,
  TerminalSquare,
  User,
  UsersRound,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { createDefaultSettings, runScenario } from './engine'
import { stages } from './stages/loader'
import { useProgress } from './store'
import type {
  AttackResult,
  LoadedStage,
  LogEntry,
  Phase,
  ServerDefinition,
  SimulationResult,
} from './types'
import { TerminalPanel } from './components/TerminalPanel'
import { GoogleSignInButton } from './components/GoogleSignInButton'
import { apiUrl, createRuntimeSession, deleteRuntimeSession, getStoredAuth } from './lib/api'

const phaseLabels: Record<Phase, string> = {
  INITIALIZING: '環境構築中',
  OBSERVING: '観察フェーズ',
  EDITING: '対策フェーズ',
  SIMULATING: '検証中',
  CLEARED: '防御完了',
  FAILED: 'ゲームオーバー',
}

const danger = new Set(['medium', 'high', 'critical'])

interface ConsoleLayout {
  mode: 'docked' | 'floating'
  minimized: boolean
  x: number
  y: number
  width: number
  height: number
}

const consoleLayoutKey = 'btf-console-layout'
const floatingMinWidth = 520
const floatingMinHeight = 180
const consoleToolbarHeight = 37
const resizeDirections = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type ResizeDirection = typeof resizeDirections[number]

function clampFloatingConsole(layout: ConsoleLayout): ConsoleLayout {
  const width = Math.min(Math.max(layout.width, floatingMinWidth), window.innerWidth - 16)
  const height = Math.min(Math.max(layout.height, floatingMinHeight), window.innerHeight - 16)
  return {
    ...layout,
    width,
    height,
    x: Math.min(Math.max(layout.x, 0), window.innerWidth - width),
    y: Math.min(Math.max(layout.y, 0), window.innerHeight - consoleToolbarHeight),
  }
}

function loadConsoleLayout(): ConsoleLayout {
  const width = 720
  const height = 340
  const fallback: ConsoleLayout = { mode: 'docked', minimized: false, x: window.innerWidth - width - 24, y: window.innerHeight - height - 24, width, height }
  try {
    const stored = JSON.parse(localStorage.getItem(consoleLayoutKey) ?? 'null')
    return clampFloatingConsole(stored ? { ...fallback, ...stored } : fallback)
  } catch {
    return clampFloatingConsole(fallback)
  }
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function App() {
  const [activeStage, setActiveStage] = useState<LoadedStage | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [profileOpen, setProfileOpen] = useState(false)
  const [authRevision, setAuthRevision] = useState(0)

  if (!activeStage) {
    return <StageSelect key={authRevision} onSelect={setActiveStage} onProfile={() => setProfileOpen(true)} profileOpen={profileOpen} onCloseProfile={() => setProfileOpen(false)} onAuthenticated={() => { setAuthRevision((value) => value + 1); setProfileOpen(false) }} />
  }

  return (
    <GameSession
      key={`${activeStage.id}-${sessionKey}`}
      stage={activeStage}
      onExit={() => setActiveStage(null)}
      onReset={() => setSessionKey((value) => value + 1)}
    />
  )
}

function Brand() {
  return (
    <div className="brand-lockup" aria-label="Back to the Feature">
      <div className="brand-mark"><History size={18} strokeWidth={2.4} /></div>
      <div>
        <strong>BACK TO THE FEATURE</strong>
        <span>INCIDENT RESPONSE LAB</span>
      </div>
    </div>
  )
}

function StageSelect({
  onSelect,
  onProfile,
  profileOpen,
  onCloseProfile,
  onAuthenticated,
}: {
  onSelect: (stage: LoadedStage) => void
  onProfile: () => void
  profileOpen: boolean
  onCloseProfile: () => void
  onAuthenticated: () => void
}) {
  const progress = useProgress((state) => state.progress)
  const auth = getStoredAuth()
  const cleared = Object.values(progress).filter((item) => item.cleared).length

  return (
    <div className="shell stage-shell">
      <header className="app-header">
        <Brand />
        <div className="header-actions">
          <div className="system-indicator"><span /> SYSTEM READY</div>
          <button className="icon-text-button" onClick={onProfile}><User size={16} /> {(auth?.user.displayName ?? 'DEMO OPERATOR').toUpperCase()}</button>
        </div>
      </header>

      <main className="stage-select">
        <section className="mission-heading">
          <div>
            <p className="eyebrow">INCIDENT QUEUE / TOKYO REGION</p>
            <h1>未解決インシデント</h1>
            <p>痕跡を観測し、攻撃が始まる前の構成へ防御を仕込む。</p>
          </div>
          <div className="progress-readout">
            <span>対応完了</span>
            <strong>{cleared}<small> / {stages.length}</small></strong>
            <div className="progress-track"><span style={{ width: `${(cleared / stages.length) * 100}%` }} /></div>
          </div>
        </section>

        <div className="section-label"><span>ACTIVE MISSIONS</span><b>{stages.length} CASES</b></div>
        <section className="stage-grid">
          {stages.map((stage) => (
            <article className="stage-card" key={stage.id} style={{ '--accent': stage.accent } as React.CSSProperties}>
              <div className="stage-card-topline"><span>CASE {stage.number}</span><span>{progress[stage.id]?.cleared ? <><Check size={13} /> CLEARED</> : 'OPEN'}</span></div>
              <StageMiniMap stage={stage} />
              <div className="stage-card-content">
                <p className="stage-codename">{stage.codename}</p>
                <h2>{stage.title}</h2>
                <p>{stage.description}</p>
                <div className="stage-meta">
                  <span><Activity size={14} /> LEVEL {stage.difficulty}</span>
                  <span><Clock3 size={14} /> {stage.estimatedMinutes} MIN</span>
                </div>
                <div className="tag-row">{stage.category.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </div>
              <button className="launch-button" onClick={() => onSelect(stage)}>
                {progress[stage.id]?.cleared ? '再調査する' : '調査を開始'} <ChevronRight size={17} />
              </button>
            </article>
          ))}
        </section>

        <section className="status-strip">
          <div><Shield size={17} /><span>ISOLATED RANGE</span><strong>ACTIVE</strong></div>
          <div><Network size={17} /><span>SESSION NETWORK</span><strong>AUTO</strong></div>
          <div><Clock3 size={17} /><span>SESSION TTL</span><strong>30 MIN</strong></div>
        </section>
      </main>

      {profileOpen && <ProfileDialog onClose={onCloseProfile} onAuthenticated={onAuthenticated} />}
    </div>
  )
}

function StageMiniMap({ stage }: { stage: LoadedStage }) {
  return (
    <div className="stage-mini-map" aria-hidden="true">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        {stage.infra.connections.map((edge) => {
          const from = stage.infra.servers.find((server) => server.id === edge.from)!
          const to = stage.infra.servers.find((server) => server.id === edge.to)!
          return <line key={`${edge.from}-${edge.to}`} x1={from.position.x} y1={from.position.y / 2.5} x2={to.position.x} y2={to.position.y / 2.5} />
        })}
      </svg>
      {stage.infra.servers.map((server) => <i key={server.id} style={{ left: `${server.position.x}%`, top: `${server.position.y}%` }} />)}
      <div className="scan-line" />
    </div>
  )
}

function ProfileDialog({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: () => void }) {
  const progress = useProgress((state) => state.progress)
  const auth = getStoredAuth()
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="profile-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" onClick={onClose} title="閉じる"><X size={18} /></button>
        <div className="profile-avatar"><User size={25} /></div>
        <p className="eyebrow">{auth ? 'AUTHENTICATED PROFILE' : 'LOCAL DEMO PROFILE'}</p>
        <h2>{auth?.user.displayName ?? 'Demo Operator'}</h2>
        <div className="profile-stats">
          <div><strong>{Object.values(progress).filter((item) => item.cleared).length}</strong><span>クリア</span></div>
          <div><strong>{Object.values(progress).reduce((sum, item) => sum + item.hints, 0)}</strong><span>ヒント</span></div>
          <div><strong>{Object.values(progress).reduce((sum, item) => sum + item.attempts, 0)}</strong><span>検証</span></div>
        </div>
        <GoogleSignInButton onAuthenticated={() => onAuthenticated()} />
        <p className="dialog-note">{auth ? auth.user.email : 'デモ進行度はこのブラウザに保存されます。'}</p>
      </section>
    </div>
  )
}

function GameSession({ stage, onExit, onReset }: { stage: LoadedStage; onExit: () => void; onReset: () => void }) {
  const minimumConsoleHeight = 140
  const defaultConsoleHeight = 230
  const defaultSettings = useMemo(() => createDefaultSettings(stage), [stage])
  const [phase, setPhase] = useState<Phase>('INITIALIZING')
  const [selectedServerId, setSelectedServerId] = useState(stage.infra.servers.find((server) => server.shell)?.id ?? stage.infra.servers[0].id)
  const [terminalServerId, setTerminalServerId] = useState(stage.infra.servers.find((server) => server.shell)?.id ?? stage.infra.servers[0].id)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(stage.checkpoints[0].id)
  const [settings, setSettings] = useState(defaultSettings)
  const [results, setResults] = useState<AttackResult[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [playhead, setPlayhead] = useState(0)
  const [consoleTab, setConsoleTab] = useState<'logs' | 'terminal'>('logs')
  const [logQuery, setLogQuery] = useState('')
  const [logServer, setLogServer] = useState('all')
  const [hintOpen, setHintOpen] = useState(false)
  const [revealedHints, setRevealedHints] = useState<string[]>([])
  const [resultDialog, setResultDialog] = useState<SimulationResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [confirmReset, setConfirmReset] = useState(false)
  const [systemFailure, setSystemFailure] = useState<{ serverId: string; command: 'shutdown' | 'reboot' } | null>(null)
  const [consoleHeight, setConsoleHeight] = useState(defaultConsoleHeight)
  const [consoleLayout, setConsoleLayout] = useState(loadConsoleLayout)
  const [runtime, setRuntime] = useState<{
    status: 'local' | 'connecting' | 'live' | 'error'
    sessionId?: string
    accessToken?: string
    message?: string
  }>({ status: apiUrl ? 'connecting' : 'local' })
  const startedAt = useRef(Date.now())
  const timers = useRef<number[]>([])
  const gameShellRef = useRef<HTMLDivElement>(null)
  const consoleResizeDrag = useRef<{ startY: number; startHeight: number } | null>(null)
  const floatingDrag = useRef<{ direction: ResizeDirection | 'move'; startX: number; startY: number; start: ConsoleLayout } | null>(null)
  const finish = useProgress((state) => state.finish)

  const selectedServer = stage.infra.servers.find((server) => server.id === selectedServerId) ?? stage.infra.servers[0]
  const terminalServers = stage.infra.servers.filter((server) => server.shell)
  const terminalServer = terminalServers.find((server) => server.id === terminalServerId) ?? terminalServers[0] ?? stage.infra.servers[0]
  const orderedTerminalServers = [terminalServer, ...terminalServers.filter((server) => server.id !== terminalServer.id)]
  const maxTime = Math.max(...Object.values(stage.scenario.nodes).map((node) => node.time), 60)
  const observed = phase !== 'INITIALIZING' && results.length > 0

  const maximumConsoleHeight = () => {
    const shellHeight = gameShellRef.current?.getBoundingClientRect().height ?? window.innerHeight
    return Math.max(minimumConsoleHeight, Math.min(520, shellHeight - 58 - 48 - 140 - 180))
  }
  const clampConsoleHeight = (height: number) => Math.min(maximumConsoleHeight(), Math.max(minimumConsoleHeight, height))
  const resizeConsoleByKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const increments: Record<string, number> = { ArrowUp: 20, ArrowDown: -20, PageUp: 80, PageDown: -80 }
    if (event.key === 'Home') {
      event.preventDefault()
      setConsoleHeight(minimumConsoleHeight)
    } else if (event.key === 'End') {
      event.preventDefault()
      setConsoleHeight(maximumConsoleHeight())
    } else if (event.key in increments) {
      event.preventDefault()
      setConsoleHeight((height) => clampConsoleHeight(height + increments[event.key]))
    }
  }

  const floating = consoleLayout.mode === 'floating'
  const updateConsoleLayout = (patch: Partial<ConsoleLayout>) => setConsoleLayout((current) => clampFloatingConsole({ ...current, ...patch }))

  const startFloatingDrag = (direction: ResizeDirection | 'move', event: React.PointerEvent<HTMLElement>) => {
    floatingDrag.current = { direction, startX: event.clientX, startY: event.clientY, start: consoleLayout }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveFloatingDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = floatingDrag.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    const { start, direction } = drag
    if (direction === 'move') {
      updateConsoleLayout({ x: start.x + dx, y: start.y + dy })
      return
    }
    const next = { ...start }
    if (direction.includes('e')) next.width = start.width + dx
    if (direction.includes('s')) next.height = start.height + dy
    if (direction.includes('w')) {
      next.width = Math.max(floatingMinWidth, start.width - dx)
      next.x = start.x + start.width - next.width
    }
    if (direction.includes('n')) {
      next.height = Math.max(floatingMinHeight, start.height - dy)
      next.y = start.y + start.height - next.height
    }
    setConsoleLayout(clampFloatingConsole(next))
  }
  const endFloatingDrag = (event: React.PointerEvent<HTMLElement>) => {
    floatingDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    try {
      localStorage.setItem(consoleLayoutKey, JSON.stringify(consoleLayout))
    } catch {
      // Layout persistence is a convenience; ignore unavailable storage.
    }
  }, [consoleLayout])

  useEffect(() => {
    const keepConsoleInBounds = () => {
      setConsoleHeight((height) => clampConsoleHeight(height))
      setConsoleLayout((layout) => clampFloatingConsole(layout))
    }
    window.addEventListener('resize', keepConsoleInBounds)
    return () => window.removeEventListener('resize', keepConsoleInBounds)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    const initial = runScenario(stage, defaultSettings)
    timers.current.push(window.setTimeout(() => setPhase('OBSERVING'), 650))
    initial.results.forEach((result, index) => {
      timers.current.push(window.setTimeout(() => {
        setResults((current) => [...current, result])
        setPlayhead(result.time)
        setLogs((current) => [...initial.logs.filter((log) => Number(log.time.slice(3)) <= result.time + 2), ...current].filter((log, itemIndex, all) => all.findIndex((candidate) => candidate.id === log.id) === itemIndex))
      }, 1100 + index * 800))
    })
    return () => {
      window.clearInterval(interval)
      timers.current.forEach(window.clearTimeout)
    }
  }, [stage, defaultSettings])

  useEffect(() => {
    if (!apiUrl) return
    let disposed = false
    let createdSessionId = ''
    setRuntime({ status: 'connecting' })
    void createRuntimeSession(stage.id)
      .then(({ session, auth }) => {
        createdSessionId = session.id
        if (disposed) return deleteRuntimeSession(session.id)
        setRuntime({ status: 'live', sessionId: session.id, accessToken: auth.accessToken })
      })
      .catch((error: Error) => {
        if (!disposed) setRuntime({ status: 'error', message: error.message })
      })
    return () => {
      disposed = true
      if (createdSessionId) void deleteRuntimeSession(createdSessionId)
    }
  }, [stage.id])

  const rewind = () => {
    const checkpoint = stage.checkpoints.find((item) => item.id === selectedCheckpoint)!
    setPhase('EDITING')
    setPlayhead(checkpoint.time)
    setConsoleTab('terminal')
    setLogs((current) => [{ id: `rewind-${Date.now()}`, time: `00:${String(checkpoint.time).padStart(2, '0')}`, server: 'system', level: 'INFO', message: `snapshot restored: ${checkpoint.id} / ${checkpoint.label}` }, ...current])
  }

  const changeSettingFromTerminal = (serverId: string, settingId: string, value: boolean) => {
    const defense = stage.defenses.find((item) => item.serverId === serverId && item.id === settingId)
    if (!defense) return { ok: false, message: `config: '${settingId}' はこのノードの防御設定ではありません` }
    if (phase !== 'EDITING') return { ok: false, message: 'config: 設定変更は対策フェーズでのみ実行できます。先に「過去へ戻る」を実行してください' }

    setSettings((current) => ({ ...current, [settingId]: value }))
    setLogs((current) => [{
      id: `config-${Date.now()}-${settingId}`,
      time: `00:${String(playhead).padStart(2, '0')}`,
      server: serverId,
      level: 'INFO',
      message: `configuration updated from terminal: ${defense.label}=${value ? 'on' : 'off'}`,
    }, ...current])
    return { ok: true }
  }

  const failFromTerminal = (serverId: string, command: 'shutdown' | 'reboot') => {
    if (systemFailure || phase === 'CLEARED' || phase === 'FAILED') return
    timers.current.forEach(window.clearTimeout)
    setResultDialog(null)
    setHintOpen(false)
    setConfirmReset(false)
    setSettings((current) => ({ ...current, service_online: false }))
    setPhase('FAILED')
    setSystemFailure({ serverId, command })
    const failureTime = Date.now()
    setLogs((current) => [{
      id: `complaints-${failureTime}-${serverId}`,
      time: `00:${String(playhead + 2).padStart(2, '0')}`,
      server: 'customer-support',
      level: 'ALERT',
      message: '顧客から苦情: 「システム使えんやんけ！」',
    }, {
      id: `sla-${failureTime}-${serverId}`,
      time: `00:${String(playhead + 1).padStart(2, '0')}`,
      server: 'sla-monitor',
      level: 'ALERT',
      message: `availability probe failed after ${command}: SLA breached`,
    }, {
      id: `system-${failureTime}-${serverId}`,
      time: `00:${String(playhead).padStart(2, '0')}`,
      server: serverId,
      level: 'ALERT',
      message: `${command} command interrupted service availability`,
    }, ...current])
  }

  const simulate = () => {
    const simulation = runScenario(stage, settings)
    setPhase('SIMULATING')
    setResults([])
    setLogs((current) => [{ id: `sim-${Date.now()}`, time: '00:00', server: 'system', level: 'INFO', message: 'simulation run started from restored snapshot' }, ...current])
    simulation.results.forEach((result, index) => {
      timers.current.push(window.setTimeout(() => {
        setResults((current) => [...current, result])
        setPlayhead(result.time)
        setLogs((current) => [...simulation.logs.filter((log) => Number(log.time.slice(3)) >= result.time && Number(log.time.slice(3)) <= result.time + 2), ...current])
      }, 500 + index * 700))
    })
    timers.current.push(window.setTimeout(() => {
      setResultDialog(simulation)
      if (simulation.cleared) {
        setPhase('CLEARED')
        finish(stage, elapsed, revealedHints.length)
      } else {
        setPhase('OBSERVING')
      }
    }, 800 + simulation.results.length * 700))
  }

  const revealHint = () => {
    const breached = results.find((result) => result.status === 'success' && danger.has(result.severity))
    const node = stage.scenario.nodes[breached?.nodeId ?? stage.scenario.root]
    const next = node.hints.find((hint) => !revealedHints.includes(hint))
      ?? Object.values(stage.scenario.nodes).flatMap((item) => item.hints).find((hint) => !revealedHints.includes(hint))
    if (next) setRevealedHints((current) => [...current, next])
    setHintOpen(true)
  }

  const filteredLogs = logs.filter((log) => {
    const serverMatches = logServer === 'all' || log.server === logServer
    const queryMatches = !logQuery || `${log.server} ${log.message}`.toLowerCase().includes(logQuery.toLowerCase())
    return serverMatches && queryMatches
  })

  return (
    <div ref={gameShellRef} className="shell game-shell" style={{ '--stage-accent': stage.accent, '--console-height': floating ? '0px' : `${consoleHeight}px` } as React.CSSProperties}>
      <header className="app-header game-header">
        <button className="back-button" onClick={onExit} title="ステージ一覧"><ArrowLeft size={18} /></button>
        <Brand />
        <div className="case-title"><span>CASE {stage.number}</span><strong>{stage.codename}</strong></div>
        <div className="header-actions">
          <button className="icon-text-button" onClick={revealHint}><Lightbulb size={16} /> ヒント <span className="count-badge">{revealedHints.length}</span></button>
          <button className="icon-button" onClick={() => setConfirmReset(true)} title="ステージをリセット"><RotateCcw size={17} /></button>
          <div className="elapsed"><Clock3 size={15} /> {formatDuration(elapsed)}</div>
        </div>
      </header>

      <section className="operation-bar">
        <div className={`phase-badge phase-${phase.toLowerCase()}`}><span /> {phaseLabels[phase]}</div>
        <PhaseSteps phase={phase} />
        <div className="objective"><span>目標</span><strong title={stage.objective}>{stage.objective}</strong></div>
        <div className="availability"><Activity size={15} /><span>AVAILABILITY</span><strong>{systemFailure || !settings.service_online ? 'DOWN' : 'HEALTHY'}</strong></div>
      </section>

      <Timeline
        stage={stage}
        phase={phase}
        playhead={playhead}
        maxTime={maxTime}
        results={results}
        selectedCheckpoint={selectedCheckpoint}
        onSelectCheckpoint={setSelectedCheckpoint}
        onRewind={rewind}
        onSimulate={simulate}
        canSimulate={phase === 'EDITING'}
      />

      <main className="workspace">
        <section className="infra-panel panel">
          <div className="panel-header">
            <div><Network size={16} /><strong>INFRASTRUCTURE</strong><span>SESSION / {stage.id.toUpperCase()}</span></div>
            <div className="map-legend"><span><i className="online-dot" /> 正規アクセス</span><span><i className="attack-dot" /> 攻撃者アクセス</span></div>
          </div>
          <InfraGraph stage={stage} selectedId={selectedServerId} onSelect={setSelectedServerId} results={results} playhead={playhead} />
        </section>

        <aside className="detail-panel panel">
          <div className="server-heading">
            <div className="server-icon"><ServerIcon server={selectedServer} /></div>
            <div><span>{selectedServer.role}</span><h2>{selectedServer.label}</h2><code>{selectedServer.ip}</code></div>
            <span className="online-label"><i /> ONLINE</span>
          </div>
          <ServerDetails stage={stage} server={selectedServer} settings={settings} editing={phase === 'EDITING'} onOpenTerminal={() => { setTerminalServerId(selectedServer.id); setConsoleTab('terminal') }} />
        </aside>
      </main>

      <section
        className={`console-panel panel ${floating ? 'floating' : ''} ${floating && consoleLayout.minimized ? 'minimized' : ''}`}
        style={floating ? { left: consoleLayout.x, top: consoleLayout.y, width: consoleLayout.width, height: consoleLayout.minimized ? consoleToolbarHeight : consoleLayout.height } : undefined}
      >
        {floating && !consoleLayout.minimized && resizeDirections.map((direction) => (
          <span
            key={direction}
            className={`float-resize float-resize-${direction}`}
            aria-hidden="true"
            onPointerDown={(event) => startFloatingDrag(direction, event)}
            onPointerMove={moveFloatingDrag}
            onPointerUp={endFloatingDrag}
            onPointerCancel={() => { floatingDrag.current = null }}
          />
        ))}
        {!floating && <button
          className="console-resize-handle"
          type="button"
          role="separator"
          aria-label="ターミナルとイベントログの高さを変更"
          aria-orientation="horizontal"
          aria-valuemin={minimumConsoleHeight}
          aria-valuemax={maximumConsoleHeight()}
          aria-valuenow={Math.round(consoleHeight)}
          title="上下にドラッグしてサイズ変更（ダブルクリックで初期サイズ）"
          onDoubleClick={() => setConsoleHeight(defaultConsoleHeight)}
          onKeyDown={resizeConsoleByKeyboard}
          onPointerDown={(event) => {
            consoleResizeDrag.current = { startY: event.clientY, startHeight: consoleHeight }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = consoleResizeDrag.current
            if (drag) setConsoleHeight(clampConsoleHeight(drag.startHeight + drag.startY - event.clientY))
          }}
          onPointerUp={(event) => {
            consoleResizeDrag.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => { consoleResizeDrag.current = null }}
        ><span /></button>}
        <div
          className="console-toolbar"
          title={floating ? '空いている部分をドラッグして移動' : undefined}
          onPointerDown={(event) => {
            if (!floating || (event.target as HTMLElement).closest('button, input, select, label')) return
            startFloatingDrag('move', event)
          }}
          onPointerMove={moveFloatingDrag}
          onPointerUp={endFloatingDrag}
          onPointerCancel={() => { floatingDrag.current = null }}
          onDoubleClick={(event) => {
            if (floating && !(event.target as HTMLElement).closest('button, input, select, label')) updateConsoleLayout({ minimized: !consoleLayout.minimized })
          }}
        >
          <div className="tab-list console-tabs">
            <button className={consoleTab === 'logs' ? 'active' : ''} onClick={() => setConsoleTab('logs')}><FileCode2 size={15} /> イベントログ <span>{logs.length}</span></button>
            <button className={consoleTab === 'terminal' ? 'active' : ''} onClick={() => setConsoleTab('terminal')}><TerminalSquare size={15} /> ターミナル</button>
          </div>
          {consoleTab === 'logs' && (
            <div className="log-controls">
              <label><Search size={14} /><input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="ログを検索" /></label>
              <label><Filter size={14} /><select value={logServer} onChange={(event) => setLogServer(event.target.value)}><option value="all">ALL NODES</option>{stage.infra.servers.map((server) => <option key={server.id} value={server.id}>{server.label}</option>)}</select></label>
            </div>
          )}
          {consoleTab === 'terminal' && (
            <div className="terminal-targets">
              <div className="terminal-switcher" role="group" aria-label="ターミナル対象">
                {terminalServers.map((server) => <button key={server.id} className={terminalServerId === server.id ? 'active' : ''} onClick={() => setTerminalServerId(server.id)}><ServerIcon server={server} /> {server.label}</button>)}
              </div>
              <div className={`runtime-status runtime-${runtime.status}`} title={runtime.message}><i /><strong>{runtime.status === 'live' ? 'LIVE DOCKER' : runtime.status === 'connecting' ? 'CONNECTING' : runtime.status === 'error' ? 'LOCAL FALLBACK' : 'LOCAL SIM'}</strong></div>
            </div>
          )}
          <div className="console-window-controls">
            {floating && (
              <button onClick={() => updateConsoleLayout({ minimized: !consoleLayout.minimized })} title={consoleLayout.minimized ? '元のサイズに戻す' : '最小化'} aria-label={consoleLayout.minimized ? '元のサイズに戻す' : '最小化'}>
                {consoleLayout.minimized ? <ChevronUp size={15} /> : <Minus size={15} />}
              </button>
            )}
            <button
              onClick={() => updateConsoleLayout(floating ? { mode: 'docked', minimized: false } : { mode: 'floating' })}
              title={floating ? '画面下部に戻す' : 'ウィンドウとして切り離す'}
              aria-label={floating ? '画面下部に戻す' : 'ウィンドウとして切り離す'}
            >
              {floating ? <PanelBottom size={15} /> : <PictureInPicture2 size={15} />}
            </button>
          </div>
        </div>
        <div className="console-body">
          {consoleTab === 'logs' && <LogViewer logs={filteredLogs} loading={phase === 'INITIALIZING'} />}
          {orderedTerminalServers.map((server) => (
            <TerminalPanel
              key={server.id}
              server={server}
              stage={stage}
              settings={settings}
              active={consoleTab === 'terminal' && server.id === terminalServer.id}
              onConfigChange={changeSettingFromTerminal}
              onSystemCommand={failFromTerminal}
              connection={runtime.status === 'live' && runtime.sessionId && runtime.accessToken ? { sessionId: runtime.sessionId, accessToken: runtime.accessToken } : undefined}
            />
          ))}
        </div>
      </section>

      {hintOpen && <HintDrawer hints={revealedHints} onReveal={revealHint} hasMore={revealedHints.length < Object.values(stage.scenario.nodes).flatMap((node) => node.hints).length} onClose={() => setHintOpen(false)} />}
      {resultDialog && <ResultDialog result={resultDialog} stage={stage} elapsed={elapsed} hints={revealedHints.length} onClose={() => setResultDialog(null)} onExit={onExit} onReset={onReset} />}
      {systemFailure && <SystemFailureDialog failure={systemFailure} stage={stage} onExit={onExit} onReset={onReset} />}
      {confirmReset && <ConfirmDialog title="ステージをリセット" body="現在の設定変更と調査ログは破棄され、初期状態から再開します。" confirm="リセット" onCancel={() => setConfirmReset(false)} onConfirm={onReset} />}
      {phase === 'INITIALIZING' && <div className="initializing-overlay"><div className="loader-ring" /><strong>ISOLATED RANGE</strong><span>コンテナ構成を復元しています</span></div>}
    </div>
  )
}

const phaseSteps = ['攻撃を観察', '過去へ戻る', 'ターミナルで対策', 'シミュレーション検証']

function PhaseSteps({ phase }: { phase: Phase }) {
  const current = phase === 'EDITING' ? 2 : phase === 'SIMULATING' ? 3 : phase === 'CLEARED' ? phaseSteps.length : 0
  return (
    <ol className="phase-steps" aria-label="進め方">
      {phaseSteps.map((label, index) => (
        <li key={label} className={index < current ? 'done' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}>
          <span>{index < current ? <Check size={11} /> : index + 1}</span>{label}
        </li>
      ))}
    </ol>
  )
}

function Timeline({
  stage, phase, playhead, maxTime, results, selectedCheckpoint, onSelectCheckpoint, onRewind, onSimulate, canSimulate,
}: {
  stage: LoadedStage; phase: Phase; playhead: number; maxTime: number; results: AttackResult[]; selectedCheckpoint: string
  onSelectCheckpoint: (id: string) => void; onRewind: () => void; onSimulate: () => void; canSimulate: boolean
}) {
  const resultByNode = Object.fromEntries(results.map((result) => [result.nodeId, result]))
  return (
    <section className="timeline-panel">
      <div className="timeline-heading">
        <div><History size={16} /><strong>INCIDENT TIMELINE</strong></div>
        <div className="attack-tree">
          {Object.entries(stage.scenario.nodes).map(([id, node], index) => {
            const result = resultByNode[id]
            return (
              <div key={id} className={`attack-step ${result?.status ?? 'pending'}`}>
                {result?.status === 'blocked' ? <Shield size={13} /> : result?.status === 'success' ? <ShieldAlert size={13} /> : <span />}
                <b>{node.title}</b>
                {index < Object.keys(stage.scenario.nodes).length - 1 && <ChevronRight size={12} />}
              </div>
            )
          })}
        </div>
        <div className="timeline-actions">
          {phase === 'EDITING' ? (
            <button className="primary-button" disabled={!canSimulate} onClick={onSimulate}><Play size={15} fill="currentColor" /> シミュレーション実行</button>
          ) : (
            <button className="rewind-button" disabled={phase === 'INITIALIZING' || phase === 'SIMULATING' || phase === 'CLEARED' || phase === 'FAILED'} onClick={onRewind}><History size={15} /> 過去へ戻る</button>
          )}
        </div>
      </div>
      <div className="timeline-track-wrap">
        <div className="timeline-track">
          <div className="timeline-progress" style={{ width: `${Math.min(100, (playhead / maxTime) * 100)}%` }} />
          <div className="playhead" style={{ left: `${Math.min(100, (playhead / maxTime) * 100)}%` }}><span>{`00:${String(playhead).padStart(2, '0')}`}</span></div>
          {stage.checkpoints.map((checkpoint) => (
            <button
              key={checkpoint.id}
              className={`checkpoint ${selectedCheckpoint === checkpoint.id ? 'selected' : ''}`}
              style={{ left: `${(checkpoint.time / maxTime) * 100}%` }}
              onClick={() => onSelectCheckpoint(checkpoint.id)}
              title={checkpoint.label}
            >
              <i />
              <span>{checkpoint.id.toUpperCase()}</span>
              <small>{checkpoint.label}</small>
            </button>
          ))}
          {Object.entries(stage.scenario.nodes).map(([id, node]) => (
            <div key={id} className={`attack-marker ${resultByNode[id]?.status ?? ''}`} style={{ left: `${(node.time / maxTime) * 100}%` }} title={node.title}><Zap size={11} /></div>
          ))}
        </div>
      </div>
    </section>
  )
}

function InfraGraph({ stage, selectedId, onSelect, results, playhead }: { stage: LoadedStage; selectedId: string; onSelect: (id: string) => void; results: AttackResult[]; playhead: number }) {
  const activeResult = [...results].reverse().find((result) => result.time <= playhead)
  const activeTarget = activeResult ? stage.scenario.nodes[activeResult.nodeId].target : null
  const customerTarget = stage.infra.servers.find((server) => server.id === stage.availability_checks[0]?.target) ?? stage.infra.servers.find((server) => server.status === 'online') ?? stage.infra.servers[0]
  const customerPosition = { x: 9, y: 78 }
  return (
    <div className="infra-graph">
      <div className="grid-plane" />
      <svg className="connection-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g className="customer-edge">
          <line x1={customerPosition.x} y1={customerPosition.y} x2={customerTarget.position.x} y2={customerTarget.position.y} vectorEffect="non-scaling-stroke" />
          <circle r="0.75"><animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${customerPosition.x} ${customerPosition.y} L ${customerTarget.position.x} ${customerTarget.position.y}`} /></circle>
        </g>
        {stage.infra.connections.map((edge) => {
          const from = stage.infra.servers.find((server) => server.id === edge.from)!
          const to = stage.infra.servers.find((server) => server.id === edge.to)!
          const hot = activeTarget === to.id || activeTarget === from.id
          const threat = from.status === 'restricted'
          return (
            <g key={`${edge.from}-${edge.to}`} className={`${threat ? 'threat-edge' : ''} ${hot ? 'hot-edge' : ''}`}>
              <line x1={from.position.x} y1={from.position.y} x2={to.position.x} y2={to.position.y} vectorEffect="non-scaling-stroke" />
              {threat && <circle r="0.75"><animateMotion dur="1.45s" repeatCount="indefinite" path={`M ${from.position.x} ${from.position.y} L ${to.position.x} ${to.position.y}`} /></circle>}
            </g>
          )
        })}
      </svg>
      <span className="edge-label customer" style={{ left: `${(customerPosition.x + customerTarget.position.x) / 2}%`, top: `${(customerPosition.y + customerTarget.position.y) / 2}%` }}>NORMAL ACCESS</span>
      {stage.infra.connections.map((edge) => {
        const from = stage.infra.servers.find((server) => server.id === edge.from)!
        const to = stage.infra.servers.find((server) => server.id === edge.to)!
        return <span key={`${edge.from}-${edge.to}`} className={`edge-label ${from.status === 'restricted' ? 'threat' : ''}`} style={{ left: `${(from.position.x + to.position.x) / 2}%`, top: `${(from.position.y + to.position.y) / 2}%` }}>{edge.label}</span>
      })}
      <div className="infra-node customer-node" style={{ left: `${customerPosition.x}%`, top: `${customerPosition.y}%` }} aria-label="正規利用客がサービスにアクセス中">
        <span className="node-icon"><UsersRound size={20} /></span>
        <span className="node-copy"><strong>CUSTOMER</strong><small>正規利用客</small><code>ACCESSING...</code></span>
        <i className="node-status" />
      </div>
      {stage.infra.servers.map((server) => {
        const isTarget = activeTarget === server.id
        return (
          <button
            key={server.id}
            className={`infra-node ${selectedId === server.id ? 'selected' : ''} ${isTarget ? `targeted ${activeResult?.status}` : ''} ${server.status}`}
            style={{ left: `${server.position.x}%`, top: `${server.position.y}%` }}
            onClick={() => onSelect(server.id)}
          >
            <span className="node-icon"><ServerIcon server={server} /></span>
            <span className="node-copy"><strong>{server.label}</strong><small>{server.role}</small><code>{server.ip}</code></span>
            <i className="node-status" />
            {server.status === 'restricted' && <span className="threat-label">ATTACKER</span>}
            {isTarget && <span className="pulse-ring" />}
          </button>
        )
      })}
      <div className="zone-label zone-wan">EXTERNAL ACCESS</div>
      <div className="zone-label zone-internal">SESSION NETWORK / ISOLATED</div>
    </div>
  )
}

function ServerIcon({ server }: { server: ServerDefinition }) {
  const role = `${server.id} ${server.role}`.toLowerCase()
  if (role.includes('db') || role.includes('data') || role.includes('vault')) return <Database size={20} />
  if (role.includes('attacker') || role.includes('external') || role.includes('外部')) return <Globe2 size={20} />
  if (role.includes('gateway') || role.includes('bastion') || role.includes('踏み台')) return <Network size={20} />
  return <Server size={20} />
}

function ServerDetails({ stage, server, settings, editing, onOpenTerminal }: { stage: LoadedStage; server: ServerDefinition; settings: Record<string, boolean>; editing: boolean; onOpenTerminal: () => void }) {
  const defenses = stage.defenses.filter((defense) => defense.serverId === server.id)
  return (
    <div className="server-details scroll-area">
      <dl className="detail-grid">
        <div><dt>HOSTNAME</dt><dd>{server.label.toLowerCase()}</dd></div>
        <div><dt>ADDRESS</dt><dd>{server.ip}</dd></div>
        <div><dt>TRUST</dt><dd>{server.status === 'restricted' ? 'UNTRUSTED' : 'SESSION'}</dd></div>
        <div><dt>SHELL</dt><dd>{server.shell ? 'ENABLED' : 'LOCKED'}</dd></div>
      </dl>
      <div className="detail-section"><h3>SERVICES</h3>{server.services.map((service, index) => <div className="service-row" key={service}><Activity size={14} /><strong>{service}</strong><span>RUNNING</span><code>{server.ports[index] ? `:${server.ports[index]}` : 'internal'}</code></div>)}</div>
      <div className="detail-section">
        <h3>防御設定</h3>
        {defenses.length ? (
          <>
            {defenses.map((defense) => (
              <div className="applied-row" key={defense.id}>
                <div><strong>{defense.label}</strong><small>{settings[defense.id] ? defense.onLabel : defense.offLabel}</small></div>
                <span className={`state-pill ${settings[defense.id] ? 'enabled' : ''}`}>{settings[defense.id] ? 'ON' : 'OFF'}</span>
                <code>config set {defense.id}.conf {defense.id} on|off</code>
              </div>
            ))}
            <p className="defense-note">{editing ? '設定はこのノードのターミナルで上のコマンドを実行して変更します。' : '設定を変更するには、まず「過去へ戻る」で対策フェーズに入ってください。'}</p>
            {server.shell && <button className="secondary-button open-terminal" onClick={onOpenTerminal}><TerminalSquare size={14} /> {server.label} のターミナルを開く</button>}
          </>
        ) : <p className="empty-copy">このノードに変更できる設定はありません。</p>}
      </div>
    </div>
  )
}

function LogViewer({ logs, loading }: { logs: LogEntry[]; loading: boolean }) {
  if (loading) return <div className="log-empty"><span className="mini-spinner" /> waiting for event stream...</div>
  if (!logs.length) return <div className="log-empty">no events matched the current filter</div>
  return (
    <div className="log-viewer">
      {logs.map((log) => (
        <div className={`log-row level-${log.level.toLowerCase()}`} key={log.id}>
          <time>{log.time}.<small>042</small></time><span className="log-level">{log.level}</span><strong>{log.server}</strong><p>{log.message}</p>
        </div>
      ))}
    </div>
  )
}

function HintDrawer({ hints, onReveal, hasMore, onClose }: { hints: string[]; onReveal: () => void; hasMore: boolean; onClose: () => void }) {
  return (
    <aside className="hint-drawer">
      <div className="drawer-header"><div><Lightbulb size={18} /><strong>RESPONSE INTEL</strong></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
      <div className="hint-list">{hints.map((hint, index) => <div className="hint-item" key={hint}><span>{String(index + 1).padStart(2, '0')}</span><p>{hint}</p></div>)}</div>
      {hasMore && <button className="secondary-button hint-more" onClick={onReveal}>追加ヒントを開示 <ChevronRight size={15} /></button>}
    </aside>
  )
}

function ResultDialog({ result, stage, elapsed, hints, onClose, onExit, onReset }: { result: SimulationResult; stage: LoadedStage; elapsed: number; hints: number; onClose: () => void; onExit: () => void; onReset: () => void }) {
  const defensePassed = result.results.length > 0 && result.results.every((item) => item.status === 'blocked')
  const failureTitle = defensePassed && !result.availability ? '業務サービスが停止しています' : '侵入経路が残っています'
  const failureCopy = defensePassed && !result.availability
    ? '攻撃は遮断されていますが、正規ユーザーの機能チェックが失敗しました。サービスを復旧して再検証してください。'
    : '成功した攻撃ノードの証拠を確認し、別のチェックポイントから対策を更新してください。'
  return (
    <div className="modal-backdrop result-backdrop">
      <section className={`result-dialog ${result.cleared ? 'cleared' : 'failed'}`} role="dialog" aria-modal="true">
        <div className="result-symbol">{result.cleared ? <CheckCircle2 size={34} /> : <CircleAlert size={34} />}</div>
        <p className="eyebrow">SIMULATION RESULT / CASE {stage.number}</p>
        <h2>{result.cleared ? '攻撃を完全に遮断' : failureTitle}</h2>
        <p>{result.cleared ? 'サービスの可用性を維持したまま、実行された攻撃ノードをすべて無力化しました。' : failureCopy}</p>
        <div className="result-columns">
          <section>
            <h3>ATTACK NODES</h3>
            <div className="result-list">
              {result.results.map((item) => <div key={item.nodeId}><span className={item.status}>{item.status === 'blocked' ? <Shield size={15} /> : <ShieldAlert size={15} />}</span><div><strong>{stage.scenario.nodes[item.nodeId].title}</strong><small>{item.evidence}</small></div><b>{item.status === 'blocked' ? 'BLOCKED' : 'BREACHED'}</b></div>)}
            </div>
          </section>
          <section>
            <h3>NORMAL USER / SLA</h3>
            <div className="result-list availability-list">
              {result.availabilityResults.map((check) => <div key={check.id}><span className={check.status === 'OK' ? 'blocked' : 'success'}>{check.status === 'OK' ? <Activity size={15} /> : <XCircle size={15} />}</span><div><strong>{check.label}</strong><small>{check.target} / {check.entrypoint}</small></div><b>{check.status}</b></div>)}
            </div>
          </section>
        </div>
        {result.cleared && <div className="clear-stats"><div><span>対応時間</span><strong>{formatDuration(elapsed)}</strong></div><div><span>ヒント</span><strong>{hints}</strong></div><div><span>検証</span><strong>PASS</strong></div></div>}
        <div className="dialog-actions">
          {result.cleared ? <><button className="secondary-button" onClick={onReset}><RotateCcw size={15} /> 再挑戦</button><button className="primary-button" onClick={onExit}>ステージ一覧へ <ChevronRight size={16} /></button></> : <button className="primary-button" onClick={onClose}>対策を続ける <ChevronRight size={16} /></button>}
        </div>
      </section>
    </div>
  )
}

function SystemFailureDialog({ failure, stage, onExit, onReset }: { failure: { serverId: string; command: 'shutdown' | 'reboot' }; stage: LoadedStage; onExit: () => void; onReset: () => void }) {
  const server = stage.infra.servers.find((item) => item.id === failure.serverId)
  const stoppedLabel = failure.command === 'shutdown' ? '停止' : '再起動'
  return (
    <div className="modal-backdrop system-failure-backdrop">
      <section className="system-failure-dialog" role="alertdialog" aria-modal="true" aria-labelledby="system-failure-title" aria-describedby="system-failure-summary">
        <header className="game-over-header">
          <p>SESSION TERMINATED / CASE {stage.number}</p>
          <h2 id="system-failure-title">GAME OVER</h2>
          <span>ゲームオーバー</span>
        </header>

        <div className="failure-visual" id="system-failure-summary">
          <div className="failure-customer">
            <div className="failure-customer-icon"><UsersRound size={31} /></div>
            <strong>CUSTOMER</strong>
            <small>正規利用客</small>
          </div>
          <div className="complaint-bubble">
            <span><MessageSquareWarning size={15} /> 苦情が着信</span>
            <h3>「システム使えんやんけ！」</h3>
            <p>使っていたサービスが突然切断されました。</p>
          </div>
          <div className="failure-server">
            <div className="failure-server-icon"><ServerOff size={31} /></div>
            <strong>{server?.label ?? failure.serverId}</strong>
            <small>OFFLINE</small>
          </div>
        </div>

        <div className="failure-command-result">
          <CircleAlert size={18} />
          <div><h3>システムが{stoppedLabel}しました</h3><p><code>$ {failure.command}</code> により顧客の通信を切断したため、対応失敗です。</p></div>
        </div>
        <div className="dialog-actions system-failure-actions">
          <button className="secondary-button" onClick={onExit}><ArrowLeft size={15} /> ステージ一覧へ</button>
          <button className="primary-button" onClick={onReset}><RotateCcw size={15} /> 最初から再開</button>
        </div>
      </section>
    </div>
  )
}

function ConfirmDialog({ title, body, confirm, onCancel, onConfirm }: { title: string; body: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true"><div className="confirm-icon"><RotateCcw size={21} /></div><h2>{title}</h2><p>{body}</p><div className="dialog-actions"><button className="secondary-button" onClick={onCancel}>キャンセル</button><button className="danger-button" onClick={onConfirm}>{confirm}</button></div></section>
    </div>
  )
}

export default App
