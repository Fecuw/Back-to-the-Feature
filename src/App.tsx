import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
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
  LockKeyhole,
  LogOut,
  Network,
  Play,
  RotateCcw,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  TerminalSquare,
  User,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { createDefaultSettings, runScenario } from './engine'
import { stages } from './stages/loader'
import { useProgress } from './store'
import type {
  AttackResult,
  DefenseDefinition,
  LoadedStage,
  LogEntry,
  Phase,
  ServerDefinition,
  SimulationResult,
} from './types'
import { TerminalPanel } from './components/TerminalPanel'

const phaseLabels: Record<Phase, string> = {
  INITIALIZING: '環境構築中',
  OBSERVING: '観察フェーズ',
  EDITING: '対策フェーズ',
  SIMULATING: '検証中',
  CLEARED: '防御完了',
}

const danger = new Set(['medium', 'high', 'critical'])

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function App() {
  const [activeStage, setActiveStage] = useState<LoadedStage | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [profileOpen, setProfileOpen] = useState(false)

  if (!activeStage) {
    return <StageSelect onSelect={setActiveStage} onProfile={() => setProfileOpen(true)} profileOpen={profileOpen} onCloseProfile={() => setProfileOpen(false)} />
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
}: {
  onSelect: (stage: LoadedStage) => void
  onProfile: () => void
  profileOpen: boolean
  onCloseProfile: () => void
}) {
  const progress = useProgress((state) => state.progress)
  const cleared = Object.values(progress).filter((item) => item.cleared).length

  return (
    <div className="shell stage-shell">
      <header className="app-header">
        <Brand />
        <div className="header-actions">
          <div className="system-indicator"><span /> SYSTEM READY</div>
          <button className="icon-text-button" onClick={onProfile}><User size={16} /> DEMO OPERATOR</button>
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

      {profileOpen && <ProfileDialog onClose={onCloseProfile} />}
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

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const progress = useProgress((state) => state.progress)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="profile-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" onClick={onClose} title="閉じる"><X size={18} /></button>
        <div className="profile-avatar"><User size={25} /></div>
        <p className="eyebrow">LOCAL DEMO PROFILE</p>
        <h2>Demo Operator</h2>
        <div className="profile-stats">
          <div><strong>{Object.values(progress).filter((item) => item.cleared).length}</strong><span>クリア</span></div>
          <div><strong>{Object.values(progress).reduce((sum, item) => sum + item.hints, 0)}</strong><span>ヒント</span></div>
          <div><strong>{Object.values(progress).reduce((sum, item) => sum + item.attempts, 0)}</strong><span>検証</span></div>
        </div>
        <button className="google-button"><span>G</span> Googleでログイン</button>
        <p className="dialog-note">デモ進行度はこのブラウザに保存されます。</p>
      </section>
    </div>
  )
}

function GameSession({ stage, onExit, onReset }: { stage: LoadedStage; onExit: () => void; onReset: () => void }) {
  const defaultSettings = useMemo(() => createDefaultSettings(stage), [stage])
  const [phase, setPhase] = useState<Phase>('INITIALIZING')
  const [selectedServerId, setSelectedServerId] = useState(stage.infra.servers.find((server) => server.shell)?.id ?? stage.infra.servers[0].id)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(stage.checkpoints[0].id)
  const [settings, setSettings] = useState(defaultSettings)
  const [draft, setDraft] = useState(defaultSettings)
  const [results, setResults] = useState<AttackResult[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [playhead, setPlayhead] = useState(0)
  const [rightTab, setRightTab] = useState<'details' | 'defense'>('details')
  const [consoleTab, setConsoleTab] = useState<'logs' | 'terminal'>('logs')
  const [logQuery, setLogQuery] = useState('')
  const [logServer, setLogServer] = useState('all')
  const [hintOpen, setHintOpen] = useState(false)
  const [revealedHints, setRevealedHints] = useState<string[]>([])
  const [resultDialog, setResultDialog] = useState<SimulationResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [confirmReset, setConfirmReset] = useState(false)
  const startedAt = useRef(Date.now())
  const timers = useRef<number[]>([])
  const finish = useProgress((state) => state.finish)

  const selectedServer = stage.infra.servers.find((server) => server.id === selectedServerId) ?? stage.infra.servers[0]
  const maxTime = Math.max(...Object.values(stage.scenario.nodes).map((node) => node.time), 60)
  const observed = phase !== 'INITIALIZING' && results.length > 0
  const changes = stage.defenses.filter((defense) => draft[defense.id] !== settings[defense.id])

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

  const rewind = () => {
    const checkpoint = stage.checkpoints.find((item) => item.id === selectedCheckpoint)!
    setPhase('EDITING')
    setPlayhead(checkpoint.time)
    setDraft(settings)
    setRightTab('defense')
    setLogs((current) => [{ id: `rewind-${Date.now()}`, time: `00:${String(checkpoint.time).padStart(2, '0')}`, server: 'system', level: 'INFO', message: `snapshot restored: ${checkpoint.id} / ${checkpoint.label}` }, ...current])
  }

  const applySettings = () => {
    if (!changes.length) return
    const changedLabels = changes.map((item) => item.label).join(', ')
    setSettings(draft)
    setLogs((current) => [{ id: `config-${Date.now()}`, time: `00:${String(playhead).padStart(2, '0')}`, server: selectedServer.id, level: 'INFO', message: `configuration applied: ${changedLabels}` }, ...current])
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
    <div className="shell game-shell" style={{ '--stage-accent': stage.accent } as React.CSSProperties}>
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
        <div className="objective"><span>OBJECTIVE</span><strong>{stage.objective}</strong></div>
        <div className="availability"><Activity size={15} /><span>AVAILABILITY</span><strong>{settings.service_online ? 'HEALTHY' : 'DOWN'}</strong></div>
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
        canSimulate={phase === 'EDITING' && changes.length === 0}
      />

      <main className="workspace">
        <section className="infra-panel panel">
          <div className="panel-header">
            <div><Network size={16} /><strong>INFRASTRUCTURE</strong><span>SESSION / {stage.id.toUpperCase()}</span></div>
            <div className="map-legend"><span><i className="online-dot" /> ONLINE</span><span><i className="attack-dot" /> ATTACK PATH</span></div>
          </div>
          <InfraGraph stage={stage} selectedId={selectedServerId} onSelect={setSelectedServerId} results={results} playhead={playhead} />
        </section>

        <aside className="detail-panel panel">
          <div className="server-heading">
            <div className="server-icon"><ServerIcon server={selectedServer} /></div>
            <div><span>{selectedServer.role}</span><h2>{selectedServer.label}</h2><code>{selectedServer.ip}</code></div>
            <span className="online-label"><i /> ONLINE</span>
          </div>
          <div className="tab-list compact-tabs">
            <button className={rightTab === 'details' ? 'active' : ''} onClick={() => setRightTab('details')}>詳細</button>
            <button className={rightTab === 'defense' ? 'active' : ''} onClick={() => setRightTab('defense')}>防御設定</button>
          </div>
          {rightTab === 'details' ? (
            <ServerDetails stage={stage} server={selectedServer} settings={settings} />
          ) : (
            <DefenseSettings
              stage={stage}
              server={selectedServer}
              phase={phase}
              settings={settings}
              draft={draft}
              onChange={(id, value) => setDraft((current) => ({ ...current, [id]: value }))}
              onApply={applySettings}
              changes={changes}
            />
          )}
        </aside>
      </main>

      <section className="console-panel panel">
        <div className="console-toolbar">
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
          {consoleTab === 'terminal' && <div className="terminal-target"><span>TARGET</span><strong>{selectedServer.label}</strong><i /></div>}
        </div>
        <div className="console-body">
          {consoleTab === 'logs' ? <LogViewer logs={filteredLogs} loading={phase === 'INITIALIZING'} /> : <TerminalPanel server={selectedServer} stage={stage} settings={settings} />}
        </div>
      </section>

      {hintOpen && <HintDrawer hints={revealedHints} onReveal={revealHint} hasMore={revealedHints.length < Object.values(stage.scenario.nodes).flatMap((node) => node.hints).length} onClose={() => setHintOpen(false)} />}
      {resultDialog && <ResultDialog result={resultDialog} stage={stage} elapsed={elapsed} hints={revealedHints.length} onClose={() => setResultDialog(null)} onExit={onExit} onReset={onReset} />}
      {confirmReset && <ConfirmDialog title="ステージをリセット" body="現在の設定変更と調査ログは破棄され、初期状態から再開します。" confirm="リセット" onCancel={() => setConfirmReset(false)} onConfirm={onReset} />}
      {phase === 'INITIALIZING' && <div className="initializing-overlay"><div className="loader-ring" /><strong>ISOLATED RANGE</strong><span>コンテナ構成を復元しています</span></div>}
    </div>
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
            <button className="rewind-button" disabled={phase === 'INITIALIZING' || phase === 'SIMULATING' || phase === 'CLEARED'} onClick={onRewind}><History size={15} /> 過去へ戻る</button>
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
  return (
    <div className="infra-graph">
      <div className="grid-plane" />
      <svg className="connection-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {stage.infra.connections.map((edge) => {
          const from = stage.infra.servers.find((server) => server.id === edge.from)!
          const to = stage.infra.servers.find((server) => server.id === edge.to)!
          const hot = activeTarget === to.id || activeTarget === from.id
          return (
            <g key={`${edge.from}-${edge.to}`} className={hot ? 'hot-edge' : ''}>
              <line x1={from.position.x} y1={from.position.y} x2={to.position.x} y2={to.position.y} vectorEffect="non-scaling-stroke" />
              <text x={(from.position.x + to.position.x) / 2} y={(from.position.y + to.position.y) / 2 - 2}>{edge.label}</text>
            </g>
          )
        })}
      </svg>
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
            {isTarget && <span className="pulse-ring" />}
          </button>
        )
      })}
      <div className="zone-label zone-wan">UNTRUSTED</div>
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

function ServerDetails({ stage, server, settings }: { stage: LoadedStage; server: ServerDefinition; settings: Record<string, boolean> }) {
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
      <div className="detail-section"><h3>APPLIED DEFENSES</h3>{defenses.length ? defenses.map((defense) => <div className="applied-row" key={defense.id}><span className={settings[defense.id] ? 'enabled' : ''}>{settings[defense.id] ? <Check size={13} /> : <X size={13} />}</span><div><strong>{defense.label}</strong><small>{settings[defense.id] ? defense.onLabel : defense.offLabel}</small></div></div>) : <p className="empty-copy">編集可能な設定はありません。</p>}</div>
    </div>
  )
}

function DefenseSettings({
  stage, server, phase, settings, draft, onChange, onApply, changes,
}: {
  stage: LoadedStage; server: ServerDefinition; phase: Phase; settings: Record<string, boolean>; draft: Record<string, boolean>
  onChange: (id: string, value: boolean) => void; onApply: () => void; changes: DefenseDefinition[]
}) {
  const defenses = stage.defenses.filter((defense) => defense.serverId === server.id)
  const editable = phase === 'EDITING'
  return (
    <div className="defense-settings">
      {!editable && <div className="edit-lock"><LockKeyhole size={15} /><span>設定スナップショットは読み取り専用です</span></div>}
      <div className="defense-list scroll-area">
        {defenses.map((defense) => (
          <label className={`defense-control ${!editable ? 'disabled' : ''}`} key={defense.id}>
            <div className="defense-control-copy"><strong>{defense.label}</strong><p>{defense.description}</p><code>{defense.configPath}</code></div>
            <input type="checkbox" checked={draft[defense.id]} disabled={!editable} onChange={(event) => onChange(defense.id, event.target.checked)} />
            <span className="toggle"><i /></span>
            <small className={draft[defense.id] ? 'on' : ''}>{draft[defense.id] ? defense.onLabel : defense.offLabel}</small>
          </label>
        ))}
        {!defenses.length && <div className="empty-state"><ShieldAlert size={24} /><strong>編集対象外ノード</strong><p>このノードに変更可能な防御設定はありません。</p></div>}
      </div>
      {editable && (
        <div className="change-footer">
          <div><span>差分</span><strong>{changes.length ? `${changes.length}件の未適用変更` : '適用済み'}</strong></div>
          <button className="apply-button" disabled={!changes.length} onClick={onApply}><Check size={15} /> 設定を適用</button>
        </div>
      )}
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

function ConfirmDialog({ title, body, confirm, onCancel, onConfirm }: { title: string; body: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true"><div className="confirm-icon"><RotateCcw size={21} /></div><h2>{title}</h2><p>{body}</p><div className="dialog-actions"><button className="secondary-button" onClick={onCancel}>キャンセル</button><button className="danger-button" onClick={onConfirm}>{confirm}</button></div></section>
    </div>
  )
}

export default App
