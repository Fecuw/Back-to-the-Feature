export interface GraphBox {
  x: number
  y: number
  width: number
  height: number
}

export function overlaps(a: GraphBox, b: GraphBox, gap = 8) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
}

// Prefer the connection midpoint, then the closest free space around it.
export function placeGraphLabels(nodes: GraphBox[], labels: GraphBox[], width: number, height: number) {
  const occupied = [...nodes]
  return labels.map((label) => {
    const candidates: GraphBox[] = []
    const minX = label.width / 2 + 12
    const minY = label.height / 2 + 36
    for (let y = minY; y <= height - label.height / 2 - 12; y += 8) {
      for (let x = minX; x <= width - label.width / 2 - 12; x += 8) {
        candidates.push({ ...label, x, y })
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - label.x, a.y - label.y) - Math.hypot(b.x - label.x, b.y - label.y))
    const placed = candidates.find((candidate) => occupied.every((box) => !overlaps(candidate, box)))
    if (!placed) throw new Error('Graph canvas has insufficient label space')
    occupied.push(placed)
    return placed
  })
}
