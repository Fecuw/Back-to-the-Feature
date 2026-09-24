import { create } from 'zustand'
import type { LoadedStage } from './types'

interface ProgressRecord {
  cleared: boolean
  bestTime?: number
  hints: number
  attempts: number
}

interface ProgressStore {
  progress: Record<string, ProgressRecord>
  finish: (stage: LoadedStage, elapsed: number, hints: number) => void
}

const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem('btf-progress') ?? '{}')
  } catch {
    return {}
  }
})()

export const useProgress = create<ProgressStore>((set) => ({
  progress: stored,
  finish: (stage, elapsed, hints) =>
    set((state) => {
      const previous = state.progress[stage.id]
      const next = {
        ...state.progress,
        [stage.id]: {
          cleared: true,
          bestTime: previous?.bestTime ? Math.min(previous.bestTime, elapsed) : elapsed,
          hints,
          attempts: (previous?.attempts ?? 0) + 1,
        },
      }
      localStorage.setItem('btf-progress', JSON.stringify(next))
      return { progress: next }
    }),
}))
