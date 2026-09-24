import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { LoadedStage, ServerDefinition } from '../types'
import { terminalSocketUrl } from '../lib/api'
import { createTerminalFiles } from '../lib/terminalFilesystem'

export interface LiveTerminalConnection {
  sessionId: string
  accessToken: string
}

interface TerminalPanelProps {
  server: ServerDefinition
  stage: LoadedStage
  settings: Record<string, boolean>
  active: boolean
  connection?: LiveTerminalConnection
  onConfigChange: (serverId: string, settingId: string, value: boolean) => { ok: boolean; message?: string }
  onSystemCommand: (serverId: string, command: 'shutdown' | 'reboot') => void
}

const helpEntries = [
  ['help [command]', 'command: optional', '全コマンド、または指定コマンドの詳細を表示'],
  ['hostname', 'none', '現在のコンテナ名を表示'],
  ['whoami', 'none', '非rootのセッションユーザーを表示'],
  ['status [--json]', '--json: JSON出力', 'ノード、ステージ、稼働状態を表示'],
  ['services [--all]', '--all: 補助プロセスも表示', 'このノードのサービス一覧を表示'],
  ['ports [--listen]', '--listen: LISTENのみ', '待受ポートとプロセスを表示'],
  ['ps [--sort cpu|mem]', '--sort: cpu または mem', 'プロセス一覧を指定基準で並び替え'],
  ['logs [service] [--lines N]', 'service; N: 1-200', '隔離されたサービスログを表示'],
  ['inspect [defense|network]', 'section: optional', '防御設定またはネットワーク境界を調査'],
  ['ls [path]', 'path: optional', 'workspace内のREADMEと設定ファイルを一覧表示'],
  ['cat PATH', 'workspace file', 'READMEまたは設定ファイルの内容を表示'],
  ['config get PATH | config set PATH KEY on|off', 'path; setting name; on/off', '設定表示、または防御設定を即時反映'],
  ['shutdown', 'none', '現在のノードを安全に停止'],
  ['reboot', 'none', '現在のノードを再起動'],
] as const

const commandNames = [...helpEntries.map(([usage]) => usage.split(' ')[0]), 'clear']

function normalizeWorkspacePath(path = '.') {
  if (path.includes('..')) return null
  const normalized = path.replace(/^\/workspace\/?/, '').replace(/^\.\//, '').replace(/\/$/, '')
  if (normalized === '.') return ''
  return normalized.startsWith('/') || normalized.includes('/') ? null : normalized
}

export function TerminalPanel({ server, stage, settings, active, connection, onConfigChange, onSystemCommand }: TerminalPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  const onConfigChangeRef = useRef(onConfigChange)
  const onSystemCommandRef = useRef(onSystemCommand)
  const activeRef = useRef(active)
  const activateRef = useRef<() => void>(() => undefined)
  settingsRef.current = settings
  onConfigChangeRef.current = onConfigChange
  onSystemCommandRef.current = onSystemCommand
  activeRef.current = active

  useEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(() => activateRef.current())
    return () => window.cancelAnimationFrame(frame)
  }, [active])

  useEffect(() => {
    if (!mountRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: Number.parseFloat(getComputedStyle(mountRef.current).fontSize),
      lineHeight: 1.45,
      scrollback: 1500,
      theme: {
        background: '#090b0d', foreground: '#ccd3d2', cursor: '#73e0c1', selectionBackground: '#28483f',
        black: '#101417', red: '#ff6b55', green: '#73e0c1', yellow: '#e4b84b', blue: '#79a7ff',
        magenta: '#c993ff', cyan: '#67d3e8', white: '#e8eceb',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(mountRef.current)

    let disposed = false
    let socket: WebSocket | undefined
    const resize = () => {
      if (disposed || !mountRef.current?.clientWidth || !mountRef.current.clientHeight) return
      fit.fit()
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }))
      }
    }
    activateRef.current = () => {
      resize()
      terminal.focus()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mountRef.current)
    if (activeRef.current) window.requestAnimationFrame(resize)

    if (connection) {
      terminal.writeln(`Back to the Feature // connecting ${server.label} ...`)
      socket = new WebSocket(terminalSocketUrl(connection.sessionId, server.id), ['btf-terminal', connection.accessToken])
      socket.binaryType = 'arraybuffer'
      const decoder = new TextDecoder()
      let liveOutputBuffer = ''
      let liveControlBuffer = ''
      let systemCommandSignaled = false
      socket.addEventListener('open', () => {
        if (disposed) return
        resize()
        if (activeRef.current) terminal.focus()
      })
      socket.addEventListener('message', (event) => {
        if (disposed) return
        const chunk = typeof event.data === 'string'
          ? event.data
          : decoder.decode(new Uint8Array(event.data as ArrayBuffer), { stream: true })
        terminal.write(chunk)
        liveControlBuffer = (liveControlBuffer + chunk).slice(-512)
        const systemCommand = liveControlBuffer.match(/\x1b\]777;btf-system-command=(shutdown|reboot)\x07/)
        if (systemCommand && !systemCommandSignaled) {
          systemCommandSignaled = true
          onSystemCommandRef.current(server.id, systemCommand[1] as 'shutdown' | 'reboot')
        }
        liveOutputBuffer = (liveOutputBuffer + chunk).slice(-4096)
        const lines = liveOutputBuffer.split(/\r?\n/)
        liveOutputBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const updated = line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim().match(/^updated (\S+): ([a-z][a-z0-9_]*)=(on|off)$/)
          if (!updated) continue
          const defense = stage.defenses.find((item) => item.serverId === server.id && `${item.id}.conf` === updated[1] && item.id === updated[2])
          if (!defense) continue
          const result = onConfigChangeRef.current(server.id, defense.id, updated[3] === 'on')
          if (!result.ok && result.message) terminal.writeln(`\r\n\x1b[31m${result.message}\x1b[0m`)
        }
      })
      socket.addEventListener('close', (event) => {
        if (disposed) return
        terminal.writeln(`\r\n\r\n\x1b[31m[terminal disconnected: ${event.reason || event.code}]\x1b[0m`)
      })
      socket.addEventListener('error', () => !disposed && terminal.writeln('\r\n\x1b[31m[terminal connection failed]\x1b[0m'))
      const input = terminal.onData((data) => socket?.readyState === WebSocket.OPEN && socket.send(data))
      return () => {
        disposed = true
        activateRef.current = () => undefined
        observer.disconnect()
        input.dispose()
        socket?.close()
        terminal.element?.remove()
        window.setTimeout(() => terminal.dispose(), 250)
      }
    }

    const prompt = () => terminal.write(`\x1b[32moperator@${server.label.toLowerCase()}\x1b[0m:\x1b[34m~\x1b[0m$ `)
    terminal.writeln(`Back to the Feature // ${server.ip} // local simulation`)
    terminal.writeln("Type 'help' to list the available investigation commands.\r\n")

    if (!server.shell) {
      terminal.writeln('\x1b[31mACCESS DENIED: this node is outside the player trust boundary.\x1b[0m')
    } else {
      prompt()
    }

    const tokenize = (command: string) => command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? []
    const output = (lines: string[]) => {
      terminal.writeln('')
      lines.forEach((value) => terminal.writeln(value))
      terminal.writeln('')
    }
    const help = (name?: string) => {
      if (name) {
        const entry = helpEntries.find(([usage]) => usage.split(' ')[0] === name)
        return entry
          ? output([`\x1b[36m${entry[0]}\x1b[0m`, `  引数: ${entry[1]}`, `  説明: ${entry[2]}`])
          : output([`help: '${name}' は登録されていません`])
      }
      output([
        `\x1b[36mBACK TO THE FEATURE - INVESTIGATION COMMANDS (${helpEntries.length})\x1b[0m`,
        '',
        'COMMAND                       ARGUMENTS                         DESCRIPTION',
        ...helpEntries.map(([usage, args, description]) => `${usage.padEnd(29)} ${args.padEnd(33)} ${description}`),
        '',
        '例: config get rate_limit.conf  |  config set rate_limit.conf rate_limit on',
      ])
    }

    let line = ''
    const history: string[] = []
    let historyIndex = 0
    let draftLine = ''
    const workspaceFiles = () => createTerminalFiles(stage, server, settingsRef.current)
    const redrawLine = () => {
      terminal.write('\r\x1b[2K')
      prompt()
      terminal.write(line)
    }
    const completionCandidates = (rawLine: string) => {
      const content = rawLine.trimStart()
      const endsWithSpace = /\s$/.test(content)
      const words = content ? content.split(/\s+/) : []
      const wordIndex = !content ? 0 : endsWithSpace ? words.length : words.length - 1
      const prefix = endsWithSpace ? '' : words[wordIndex] ?? ''
      const name = words[0] ?? ''
      const files = Object.keys(workspaceFiles())
      const fileCandidates = prefix.startsWith('/workspace/') ? files.map((file) => `/workspace/${file}`) : files
      let candidates: string[] = []

      if (wordIndex === 0) candidates = commandNames
      else if (name === 'help' && wordIndex === 1) candidates = commandNames
      else if (name === 'ls' && wordIndex === 1) candidates = ['-l', '.', ...fileCandidates]
      else if (name === 'cat' && wordIndex === 1) candidates = fileCandidates
      else if (name === 'config' && wordIndex === 1) candidates = ['get', 'set']
      else if (name === 'config' && wordIndex === 2) candidates = fileCandidates
      else if (name === 'config' && words[1] === 'set' && wordIndex === 3) {
        const path = normalizeWorkspacePath(words[2])
        const assignment = path ? workspaceFiles()[path]?.match(/^([a-z][a-z0-9_]*)=/m) : undefined
        candidates = assignment ? [assignment[1]] : []
      } else if (name === 'config' && words[1] === 'set' && wordIndex === 4) candidates = ['on', 'off']
      else if (name === 'status' && wordIndex === 1) candidates = ['--json']
      else if (name === 'services' && wordIndex === 1) candidates = ['--all']
      else if (name === 'ports' && wordIndex === 1) candidates = ['--listen']
      else if (name === 'ps' && wordIndex === 1) candidates = ['--sort']
      else if (name === 'ps' && words[wordIndex - 1] === '--sort') candidates = ['cpu', 'mem']
      else if ((name === 'logs' || name === 'tail') && wordIndex > 0) candidates = ['--lines', ...server.services]
      else if (name === 'inspect' && wordIndex === 1) candidates = ['defense', 'network']

      return { prefix, candidates: [...new Set(candidates)].filter((candidate) => candidate.startsWith(prefix)).sort() }
    }
    const complete = () => {
      const { prefix, candidates } = completionCandidates(line)
      if (!candidates.length) {
        terminal.write('\x07')
        return
      }
      const commonPrefix = candidates.reduce((common, candidate) => {
        let index = 0
        while (index < common.length && index < candidate.length && common[index] === candidate[index]) index += 1
        return common.slice(0, index)
      })
      if (candidates.length === 1 || commonPrefix.length > prefix.length) {
        const replacement = candidates.length === 1 ? `${candidates[0]} ` : commonPrefix
        line = `${line.slice(0, line.length - prefix.length)}${replacement}`
        redrawLine()
        return
      }
      terminal.write('\r\n')
      terminal.writeln(candidates.join('  '))
      redrawLine()
    }
    const run = (raw: string) => {
      const [name = '', ...args] = tokenize(raw.trim())
      if (!name) return
      if (name === 'clear') {
        terminal.clear()
        return
      }
      if (name === 'help') {
        help(args[0])
      } else if (name === 'hostname') {
        output([server.label.toLowerCase()])
      } else if (name === 'whoami') {
        output(['operator (uid=10001, non-root)'])
      } else if (name === 'status') {
        if (args[0] === '--json') output([JSON.stringify({ node: server.id, stage: stage.id, health: 'healthy', mode: 'simulation' }, null, 2)])
        else output([`NODE      ${server.label}`, `ADDRESS   ${server.ip}`, 'HEALTH    healthy', `SERVICES  ${server.services.join(', ')}`])
      } else if (name === 'services') {
        output(['SERVICE              PID       STATE', ...server.services.map((service, index) => `${service.padEnd(20)} ${String(118 + index).padEnd(9)} running`)])
      } else if (name === 'ports') {
        output(['STATE    LOCAL ADDRESS           PROCESS', ...server.ports.map((port, index) => `LISTEN   0.0.0.0:${String(port).padEnd(14)} ${server.services[index] ?? server.services[0] ?? 'service'}`)])
      } else if (name === 'ps') {
        output(['PID   USER       CPU   MEM   COMMAND', ...server.services.map((service, index) => `${String(118 + index).padEnd(5)} service    0.${index + 1}   1.${index + 2}   ${service}`)])
      } else if (name === 'logs' || name === 'tail') {
        const requested = Number(args[args.indexOf('--lines') + 1])
        const count = Number.isFinite(requested) ? Math.min(200, Math.max(1, requested)) : 20
        output([`[${server.label}] last ${count} lines`, 'Aug 31 02:14:12 request source=external status=401', 'Aug 31 02:14:28 policy evaluation completed result=allow', 'Aug 31 02:14:29 \x1b[33msuspicious session transition detected\x1b[0m'])
      } else if (name === 'inspect') {
        const applied = stage.defenses.filter((defense) => defense.serverId === server.id && settingsRef.current[defense.id]).map((defense) => defense.label)
        output([`SECTION    ${args[0] ?? 'all'}`, 'NETWORK    isolated / simulated egress denied', 'ROOTFS     read-only base + writable workspace', `DEFENSES   ${applied.length ? applied.join(', ') : 'none'}`])
      } else if (name === 'ls') {
        const requested = args.find((arg) => !arg.startsWith('-')) ?? '.'
        const path = normalizeWorkspacePath(requested)
        const files = workspaceFiles()
        if (path === null) output([`ls: '${requested}': workspace外は参照できません`])
        else if (path && files[path]) output([path])
        else if (path) output([`ls: '${requested}': ファイルまたはディレクトリがありません`])
        else if (args.some((arg) => arg.includes('l'))) {
          output(Object.entries(files).map(([filename, contents]) => `-rw-r--r--  1 operator  operator  ${String(contents.length).padStart(6)}  ${filename}`))
        } else output([Object.keys(files).join('  ')])
      } else if (name === 'cat') {
        const path = normalizeWorkspacePath(args[0])
        const files = workspaceFiles()
        if (!args[0]) output(['usage: cat PATH'])
        else if (path === null) output([`cat: '${args[0]}': workspace外は参照できません`])
        else if (!path || !(path in files)) output([`cat: '${args[0]}': ファイルがありません`])
        else output(files[path].replace(/\n$/, '').split('\n'))
      } else if (name === 'config') {
        const [action, requestedPath, ...valueParts] = args
        const path = normalizeWorkspacePath(requestedPath)
        const files = workspaceFiles()
        if (!['get', 'set'].includes(action) || !requestedPath) output(['usage: config get PATH | config set PATH KEY on|off'])
        else if (path === null) output(['config: PATH must remain below workspace'])
        else if (!path || !(path in files)) output([`config: '${requestedPath}' は見つかりません`])
        else if (action === 'get') output([`${path}:`, ...files[path].replace(/\n$/, '').split('\n')])
        else {
          const assignment = files[path].match(/^([a-z][a-z0-9_]*)=(.*)$/m)
          const [suppliedKey, value, ...extra] = valueParts
          const key = assignment?.[1]
          const defense = stage.defenses.find((item) => item.serverId === server.id && `${item.id}.conf` === path)
          if (!assignment || !suppliedKey || !value || extra.length) output([`usage: config set ${path} ${key ?? 'KEY'} on|off`])
          else if (!defense || key !== defense.id) output([`config: '${path}' は変更可能な防御設定ではありません`])
          else if (suppliedKey !== key) output([`config: '${suppliedKey}' は ${path} の設定名ではありません（expected: ${key}）`])
          else if (!['on', 'off'].includes(value)) output([`config: VALUE は on または off を指定してください`])
          else {
            const result = onConfigChangeRef.current(server.id, defense.id, value === 'on')
            output(result.ok ? [`updated ${path}: ${key}=${value}`] : [result.message ?? 'config: 設定を変更できませんでした'])
          }
        }
      } else if (name === 'shutdown' || name === 'reboot') {
        output(name === 'shutdown'
          ? [`Broadcast message from operator@${server.label.toLowerCase()}`, 'The system is going down for halt NOW!']
          : [`Broadcast message from operator@${server.label.toLowerCase()}`, 'The system is going down for reboot NOW!'])
        onSystemCommandRef.current(server.id, name)
      } else {
        output([`command not found: ${name}`, "利用可能なコマンドは 'help' で確認できます"])
      }
    }

    const disposable = terminal.onData((data) => {
      if (!server.shell) return
      if (data === '\r') {
        terminal.write('\r\n')
        if (line.trim()) history.push(line)
        run(line)
        line = ''
        historyIndex = history.length
        draftLine = ''
        prompt()
      } else if (data === '\t') {
        complete()
      } else if (data === '\x1b[A') {
        if (!history.length) return
        if (historyIndex === history.length) draftLine = line
        historyIndex = Math.max(0, historyIndex - 1)
        line = history[historyIndex]
        redrawLine()
      } else if (data === '\x1b[B') {
        if (historyIndex >= history.length) return
        historyIndex += 1
        line = historyIndex === history.length ? draftLine : history[historyIndex]
        redrawLine()
      } else if (data === '\u007f') {
        if (line.length > 0) {
          line = line.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (data === '\u000c') {
        terminal.clear()
        line = ''
        historyIndex = history.length
        draftLine = ''
        prompt()
      } else if (/^[^\x00-\x1f\x7f]+$/.test(data)) {
        line += data
        terminal.write(data)
      }
    })

    return () => {
      disposed = true
      activateRef.current = () => undefined
      observer.disconnect()
      disposable.dispose()
      terminal.element?.remove()
      window.setTimeout(() => terminal.dispose(), 250)
    }
  }, [connection?.accessToken, connection?.sessionId, server, stage])

  return <div ref={mountRef} className="terminal-mount" aria-label={`${server.label} terminal`} hidden={!active} />
}
