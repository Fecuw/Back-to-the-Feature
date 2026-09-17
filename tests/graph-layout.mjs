import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { overlaps, placeGraphLabels } from '../src/lib/graphLayout.ts'

for (const id of ['sqli-basic-01', 'lateral-shift-02', 'dependency-ghost-03']) {
  const stage = JSON.parse(readFileSync(new URL(`../src/stages/${id}/stage.json`, import.meta.url)))
  for (const scale of [1, 1.5, 2]) {
    for (const viewport of [{ width: 360, height: 240 }, { width: 1440, height: 800 }]) {
      test(`${id}: scale ${scale}, viewport ${viewport.width}`, () => {
        const nodeWidth = 150 * scale
        const nodeHeight = 80 * scale
        const customer = { x: 9, y: 78 }
        const target = stage.infra.servers.find((server) => server.id === stage.availability_checks[0].target)
        const edges = [
          { from: customer, to: target.position, label: 'NORMAL ACCESS' },
          ...stage.infra.connections.map((edge) => ({
            from: stage.infra.servers.find((server) => server.id === edge.from).position,
            to: stage.infra.servers.find((server) => server.id === edge.to).position,
            label: edge.label,
          })),
        ]
        const width = Math.max(viewport.width, nodeWidth * 8, ...edges.map((edge) => edge.label.length * 8 * scale * 4))
        const height = Math.max(viewport.height, nodeHeight * 6, 20 * scale * 12)
        const nodes = [customer, ...stage.infra.servers.map((server) => server.position)].map((position) => ({
          x: position.x * width / 100, y: position.y * height / 100, width: nodeWidth, height: nodeHeight,
        }))
        const labels = placeGraphLabels(nodes, edges.map((edge) => ({
          x: (edge.from.x + edge.to.x) * width / 200,
          y: (edge.from.y + edge.to.y) * height / 200,
          width: edge.label.length * 8 * scale, height: 20 * scale,
        })), width, height)
        const boxes = [...nodes, ...labels]
        boxes.forEach((box, i) => {
          assert.ok(box.x - box.width / 2 >= 0 && box.x + box.width / 2 <= width)
          assert.ok(box.y - box.height / 2 >= 0 && box.y + box.height / 2 <= height)
          boxes.slice(i + 1).forEach((other) => assert.equal(overlaps(box, other), false))
        })
      })
    }
  }
}
