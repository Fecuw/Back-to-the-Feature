import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config.js'

interface StageServer {
  id: string
  label: string
  role: string
  shell: boolean
}

interface StageDefense {
  id: string
  serverId: string
  label: string
  description: string
  onLabel: string
  offLabel: string
  default: boolean
  configPath: string
}

interface StageFile {
  id: string
  title: string
  difficulty: number
  category: string[]
  infra: { servers: StageServer[] }
  defenses: StageDefense[]
}

export async function loadStages(): Promise<StageFile[]> {
  const entries = await readdir(config.STAGE_ROOT, { withFileTypes: true })
  const stages = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const source = await readFile(join(config.STAGE_ROOT, entry.name, 'stage.json'), 'utf8')
    return JSON.parse(source) as StageFile
  }))
  return stages.sort((a, b) => a.id.localeCompare(b.id))
}

export async function loadStage(stageId: string) {
  if (!/^[a-z0-9-]+$/.test(stageId)) return null
  return (await loadStages()).find((stage) => stage.id === stageId) ?? null
}
