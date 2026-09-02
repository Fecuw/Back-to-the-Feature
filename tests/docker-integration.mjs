import WebSocket from 'ws'

const api = process.env.BTF_API_URL ?? 'http://127.0.0.1:18080'
let sessionId = ''
let accessToken = ''
const stripAnsi = (value) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

function terminalCommand(server, command, expected) {
  return new Promise((resolve, reject) => {
    const url = new URL(api)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `/ws/sessions/${sessionId}/terminal`
    url.searchParams.set('server', server)
    const socket = new WebSocket(url, ['btf-terminal', accessToken])
    let output = ''
    let sent = false
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(`${server}: terminal timeout; received ${output.slice(-500)}`))
    }, 8_000)

    socket.on('message', (data) => {
      output += data.toString()
      if (!sent && output.includes('LIVE DOCKER SESSION CONNECTED')) {
        sent = true
        setTimeout(() => socket.send(`${command}\r`), 250)
      }
      if (stripAnsi(output).includes(expected)) {
        clearTimeout(timeout)
        socket.close()
        resolve(output)
      }
    })
    socket.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

try {
  const auth = await jsonRequest('/api/v1/auth/demo', { method: 'POST' })
  accessToken = auth.accessToken
  const session = await jsonRequest('/api/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ stageId: 'sqli-basic-01' }),
  })
  sessionId = session.id

  const gatewayHelp = stripAnsi(await terminalCommand('gateway', 'help', 'config set PATH KEY on|off'))
  const expectedCommands = [
    'help [command]',
    'hostname',
    'whoami',
    'status [--json]',
    'services [--all]',
    'ports [--listen]',
    'ps [--sort cpu|mem]',
    'logs [service] [--lines N]',
    'inspect [defense|network]',
    'ls [path]',
    'cat PATH',
    'config get PATH | config set PATH KEY on|off',
    'shutdown',
    'reboot',
  ]
  if (!gatewayHelp.includes('INVESTIGATION COMMANDS (14)') || !expectedCommands.every((command) => gatewayHelp.includes(command))) {
    throw new Error('container help is missing its fourteen command usages')
  }
  if (gatewayHelp.includes('game over') || gatewayHelp.includes('ゲームオーバ')) throw new Error('container help disclosed the system-command failure condition')

  const completedWhoami = stripAnsi(await terminalCommand('gateway', 'whoa\t', '10001'))
  if (!completedWhoami.includes('10001')) throw new Error('live terminal tab completion did not complete whoami')

  const gatewayFiles = stripAnsi(await terminalCommand('gateway', 'ls', 'rate_limit.conf'))
  if (!gatewayFiles.includes('README.md') || !gatewayFiles.includes('session.conf')) throw new Error('container workspace does not list its README and session settings')
  const rateLimitConfig = stripAnsi(await terminalCommand('gateway', 'cat rate_limit.conf', 'rate_limit=off'))
  if (!rateLimitConfig.includes('# rate_limit:') || !rateLimitConfig.includes('# source:')) throw new Error('setting file is missing inline role comments')
  const rateLimitUpdate = stripAnsi(await terminalCommand('gateway', 'config set rate_limit.conf rate_limit on', 'updated rate_limit.conf: rate_limit=on'))
  if (!rateLimitUpdate.includes('rate_limit=on')) throw new Error('config set did not accept separate path, setting name, and on/off value')
  const invalidKey = stripAnsi(await terminalCommand('gateway', 'config set rate_limit.conf ssh_keys_only off', 'expected: rate_limit'))
  if (!invalidKey.includes('expected: rate_limit')) throw new Error('config set accepted a setting name that does not match the path')
  const invalidValue = stripAnsi(await terminalCommand('gateway', 'config set rate_limit.conf rate_limit enabled', 'VALUE must be on or off'))
  if (!invalidValue.includes('VALUE must be on or off')) throw new Error('config set accepted a value other than on/off')
  const workspaceReadme = stripAnsi(await terminalCommand('gateway', 'cat README.md', 'rate_limit.conf'))
  if (!workspaceReadme.includes('格納する設定') || !workspaceReadme.includes('/etc/nginx/conf.d/auth.conf')) throw new Error('workspace README is missing its file-to-setting map')

  const gatewayStatus = await terminalCommand('gateway', 'status --json', '"node": "gateway"')
  const webStatus = await terminalCommand('web', 'status --json', '"node": "web"')
  if (!stripAnsi(gatewayStatus).includes('sqli-basic-01') || !stripAnsi(webStatus).includes('sqli-basic-01')) throw new Error('terminal stage identity mismatch')

  const shutdownOutput = stripAnsi(await terminalCommand('gateway', 'shutdown', 'halt NOW'))
  if (!shutdownOutput.includes('halt NOW')) throw new Error('shutdown command was not installed in the live terminal')

  console.log(`integration: session ${sessionId.slice(0, 8)} switched gateway -> web and executed live Docker commands`)
} finally {
  if (sessionId && accessToken) await jsonRequest(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined)
}
