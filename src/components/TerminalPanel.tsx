import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { LoadedStage, ServerDefinition } from '../types'

interface TerminalPanelProps {
  server: ServerDefinition
  stage: LoadedStage
  settings: Record<string, boolean>
}

export function TerminalPanel({ server, stage, settings }: TerminalPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    if (!mountRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.45,
      theme: {
        background: '#090b0d',
        foreground: '#ccd3d2',
        cursor: '#73e0c1',
        selectionBackground: '#28483f',
        black: '#101417',
        red: '#ff6b55',
        green: '#73e0c1',
        yellow: '#e4b84b',
        blue: '#79a7ff',
        magenta: '#c993ff',
        cyan: '#67d3e8',
        white: '#e8eceb',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(mountRef.current)
    fit.fit()

    const prompt = () => terminal.write(`\r\n\x1b[32moperator@${server.label.toLowerCase()}\x1b[0m:\x1b[34m~\x1b[0m$ `)
    terminal.writeln(`Back to the Feature // isolated shell // ${server.ip}`)

    if (!server.shell) {
      terminal.writeln('\x1b[31mACCESS DENIED: this node is outside the player trust boundary.\x1b[0m')
    } else {
      terminal.write(`\x1b[32moperator@${server.label.toLowerCase()}\x1b[0m:\x1b[34m~\x1b[0m$ `)
    }

    let line = ''
    const run = (raw: string) => {
      const command = raw.trim()
      if (!command) return
      if (command === 'clear') {
        terminal.clear()
        return
      }
      if (command === 'help') {
        terminal.writeln('help  hostname  whoami  status  ss -lnt  ps  inspect  tail auth.log  clear')
      } else if (command === 'hostname') {
        terminal.writeln(server.label.toLowerCase())
      } else if (command === 'whoami') {
        terminal.writeln('operator')
      } else if (command === 'status') {
        terminal.writeln(`state=running  ip=${server.ip}  services=${server.services.join(',')}`)
      } else if (command === 'ss -lnt' || command === 'ss') {
        terminal.writeln('State   Local Address:Port   Process')
        server.ports.forEach((port) => terminal.writeln(`LISTEN  0.0.0.0:${port}          ${server.services[0] ?? 'service'}`))
      } else if (command === 'ps') {
        terminal.writeln('PID  USER      COMMAND')
        server.services.forEach((service, index) => terminal.writeln(`${118 + index}  service   ${service}`))
      } else if (command === 'inspect') {
        const applied = stage.defenses
          .filter((defense) => defense.serverId === server.id && settingsRef.current[defense.id])
          .map((defense) => defense.label)
        terminal.writeln(`active defenses: ${applied.length ? applied.join(', ') : 'none'}`)
      } else if (command === 'tail auth.log' || command.startsWith('tail ')) {
        terminal.writeln('Aug 31 02:14:12 request source=external status=401')
        terminal.writeln('Aug 31 02:14:28 policy evaluation completed result=allow')
        terminal.writeln('Aug 31 02:14:29 \x1b[33msuspicious session transition detected\x1b[0m')
      } else {
        terminal.writeln(`zsh: command not found: ${command}`)
      }
    }

    const disposable = terminal.onData((data) => {
      if (!server.shell) return
      if (data === '\r') {
        run(line)
        line = ''
        prompt()
      } else if (data === '\u007f') {
        if (line.length > 0) {
          line = line.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (data === '\u000c') {
        terminal.clear()
      } else if (data >= ' ') {
        line += data
        terminal.write(data)
      }
    })

    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(mountRef.current)
    return () => {
      observer.disconnect()
      disposable.dispose()
      terminal.dispose()
    }
  }, [server, stage])

  return <div ref={mountRef} className="terminal-mount" aria-label={`${server.label} terminal`} />
}
