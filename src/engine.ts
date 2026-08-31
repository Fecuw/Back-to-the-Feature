import type { AttackNode, AttackResult, LoadedStage, LogEntry, SimulationResult } from './types'

export function runScenario(stage: LoadedStage, settings: Record<string, boolean>): SimulationResult {
  const results: AttackResult[] = []
  const logs: LogEntry[] = []
  const visited = new Set<string>()
  const randomizedHost = () => `198.51.100.${10 + crypto.getRandomValues(new Uint8Array(1))[0] % 230}`
  const originalAttackerIp = stage.infra.servers.find((server) => server.status === 'restricted')?.ip
  const attackerIp = randomizedHost()
  const randomizeEvidence = (value: string) => originalAttackerIp ? value.replaceAll(originalAttackerIp, attackerIp) : value
  let current: string | null = stage.scenario.root

  while (current) {
    if (visited.has(current)) throw new Error(`Scenario loop detected at ${current}`)
    visited.add(current)
    const node: AttackNode | undefined = stage.scenario.nodes[current]
    if (!node) throw new Error(`Unknown attack node: ${current}`)

    const blocked: boolean = node.blockedBy.some((defense: string) => settings[defense])
    const status = blocked ? 'blocked' : 'success'
    results.push({
      nodeId: current,
      status,
      evidence: randomizeEvidence(blocked ? node.evidenceFailure : node.evidenceSuccess),
      time: node.time,
      severity: node.severity,
    })
    const nodeLogs = blocked ? node.logsFailure : node.logsSuccess
    nodeLogs.forEach((message: string, index: number) => {
      logs.push({
        id: `${current}-${index}-${Date.now()}`,
        time: `00:${String(node.time + index).padStart(2, '0')}`,
        server: node.target,
        level: blocked ? 'BLOCK' : node.severity === 'info' || node.severity === 'low' ? 'WARN' : 'ALERT',
        message: randomizeEvidence(message),
      })
    })
    current = blocked ? node.on_failure : node.on_success
  }

  let checkerIp = randomizedHost()
  while (checkerIp === attackerIp) checkerIp = randomizedHost()
  const checkerIdentity = `sla-${crypto.randomUUID().slice(0, 8)}@${checkerIp}`
  const availabilityResults = stage.availability_checks.map((check) => {
    const passed = settings[check.settingId] === check.expect
    return {
      id: check.id,
      label: check.label,
      target: check.target,
      entrypoint: check.entrypoint,
      status: passed ? 'OK' as const : check.failureStatus,
      evidence: passed
        ? `${checkerIdentity}: 正規操作の応答とデータ整合性を確認`
        : `${checkerIdentity}: 正規操作が期待結果を返さない`,
    }
  })
  const availability = availabilityResults.every((check) => check.status === 'OK')
  const defense = results.length > 0 && results.every((result) => result.status === 'blocked')
  return { results, logs, cleared: availability && defense, availability, availabilityResults, checkerIdentity }
}

export function createDefaultSettings(stage: LoadedStage): Record<string, boolean> {
  return Object.fromEntries(stage.defenses.map((defense) => [defense.id, defense.default]))
}
