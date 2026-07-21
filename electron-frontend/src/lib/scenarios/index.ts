import type { ScenarioDefinition } from '../../features/scenario-tutor/types'
import { CAFE_ORDER_SCENARIO } from './cafeOrder'
import { SHINJUKU_DIRECTIONS_SCENARIO } from './shinjukuDirections'

export const SCENARIOS: ScenarioDefinition[] = [CAFE_ORDER_SCENARIO, SHINJUKU_DIRECTIONS_SCENARIO]

export function getScenarioById(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id)
}

export { CAFE_ORDER_SCENARIO, SHINJUKU_DIRECTIONS_SCENARIO }
