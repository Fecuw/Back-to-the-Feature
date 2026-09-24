import type { LoadedStage, ScenarioDefinition, StageDefinition } from '../types'

const stageFiles = import.meta.glob('./*/stage.json', { eager: true, import: 'default' }) as Record<string, StageDefinition>
const scenarioFiles = import.meta.glob('./*/scenario.json', { eager: true, import: 'default' }) as Record<string, ScenarioDefinition>

export const stages: LoadedStage[] = Object.entries(stageFiles)
  .map(([path, stage]) => {
    const scenarioPath = path.replace('/stage.json', '/scenario.json')
    return { ...stage, scenario: scenarioFiles[scenarioPath] }
  })
  .filter((stage) => Boolean(stage.scenario))
  .sort((a, b) => a.number.localeCompare(b.number))
