export type Phase = 'INITIALIZING' | 'OBSERVING' | 'EDITING' | 'SIMULATING' | 'CLEARED'
export type ResultStatus = 'success' | 'blocked' | 'skipped'
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type AvailabilityStatus = 'OK' | 'MUMBLE' | 'DOWN' | 'CORRUPT'

export interface ServerDefinition {
  id: string
  label: string
  role: string
  ip: string
  status: 'online' | 'restricted'
  services: string[]
  ports: number[]
  shell: boolean
  position: { x: number; y: number }
}

export interface DefenseDefinition {
  id: string
  serverId: string
  label: string
  description: string
  onLabel: string
  offLabel: string
  default: boolean
  configPath: string
}

export interface StageDefinition {
  id: string
  number: string
  title: string
  codename: string
  description: string
  difficulty: number
  category: string[]
  estimatedMinutes: number
  accent: string
  evaluation: 'single_path' | 'all_paths'
  briefing: string
  objective: string
  infra: {
    servers: ServerDefinition[]
    connections: { from: string; to: string; label: string }[]
  }
  checkpoints: { id: string; time: number; label: string }[]
  defenses: DefenseDefinition[]
  availability_checks: {
    id: string
    settingId: string
    label: string
    target: string
    entrypoint: string
    expect: boolean
    failureStatus: Exclude<AvailabilityStatus, 'OK'>
  }[]
}

export interface AttackNode {
  title: string
  time: number
  target: string
  severity: Severity
  action: string
  blockedBy: string[]
  on_success: string | null
  on_failure: string | null
  evidenceSuccess: string
  evidenceFailure: string
  logsSuccess: string[]
  logsFailure: string[]
  hints: string[]
}

export interface ScenarioDefinition {
  root: string
  nodes: Record<string, AttackNode>
}

export interface LoadedStage extends StageDefinition {
  scenario: ScenarioDefinition
}

export interface AttackResult {
  nodeId: string
  status: ResultStatus
  evidence: string
  time: number
  severity: Severity
}

export interface SimulationResult {
  results: AttackResult[]
  logs: LogEntry[]
  cleared: boolean
  availability: boolean
  availabilityResults: {
    id: string
    label: string
    target: string
    entrypoint: string
    status: AvailabilityStatus
    evidence: string
  }[]
  checkerIdentity: string
}

export interface LogEntry {
  id: string
  time: string
  server: string
  level: 'INFO' | 'WARN' | 'ALERT' | 'BLOCK'
  message: string
}
