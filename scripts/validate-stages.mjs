import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../src/stages/', import.meta.url)
const entries = await readdir(root, { withFileTypes: true })
const errors = []
let validated = 0

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const directory = join(root.pathname, entry.name)
  let stage
  let scenario
  try {
    stage = JSON.parse(await readFile(join(directory, 'stage.json'), 'utf8'))
    scenario = JSON.parse(await readFile(join(directory, 'scenario.json'), 'utf8'))
  } catch (error) {
    errors.push(`${entry.name}: ${error.message}`)
    continue
  }

  const prefix = stage.id ?? entry.name
  const checks = stage.availability_checks
  if (!Array.isArray(checks) || checks.length === 0) {
    errors.push(`${prefix}: availability_checks must contain at least one functional check`)
  } else {
    const checkIds = new Set()
    for (const check of checks) {
      if (!check.id || !check.target || !check.entrypoint || !check.settingId || !check.failureStatus) {
        errors.push(`${prefix}: every availability check requires id, target, entrypoint, settingId and failureStatus`)
      }
      if (checkIds.has(check.id)) errors.push(`${prefix}: duplicate availability check id '${check.id}'`)
      checkIds.add(check.id)
      if (!['MUMBLE', 'DOWN', 'CORRUPT'].includes(check.failureStatus)) {
        errors.push(`${prefix}: availability check '${check.id}' has invalid failureStatus`)
      }
    }
  }

  if (!scenario.root || !scenario.nodes?.[scenario.root]) {
    errors.push(`${prefix}: scenario root does not reference a node`)
  }

  for (const [nodeId, node] of Object.entries(scenario.nodes ?? {})) {
    for (const branch of ['on_success', 'on_failure']) {
      if (node[branch] !== null && !scenario.nodes[node[branch]]) {
        errors.push(`${prefix}: ${nodeId}.${branch} references unknown node '${node[branch]}'`)
      }
    }
    const matchingCheck = checks?.some((check) => check.target === node.target)
    if (!matchingCheck) {
      errors.push(`${prefix}: attack node '${nodeId}' has no availability check for target '${node.target}'`)
    }
  }

  const defenseIds = new Set(stage.defenses?.map((defense) => defense.id))
  for (const [nodeId, node] of Object.entries(scenario.nodes ?? {})) {
    for (const defense of node.blockedBy ?? []) {
      if (!defenseIds.has(defense)) errors.push(`${prefix}: ${nodeId} references unknown defense '${defense}'`)
    }
  }

  validated += 1
}

if (errors.length) {
  console.error(`Stage validation failed (${errors.length})`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Validated ${validated} stages: attack paths and mandatory availability checks are consistent.`)
