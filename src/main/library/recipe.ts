import { basename } from 'node:path'
import type { TransformInstance } from '../../shared/transforms'
import type { ChainResult, TransformDefinition, TransformServices } from '../transforms/types'
import { runTransformChain } from '../transforms/run-chain'
import type { Recipe } from '../../shared/library'

/** Build a stored recipe from the instances that ran and the chain's result. */
export function buildRecipe(instances: TransformInstance[], result: ChainResult): Recipe {
  return {
    steps: instances.map((i) => ({ type: i.type, config: i.config })),
    resolved: { tags: result.tags, outputName: basename(result.outputFile).replace(/\.mp3$/i, '') }
  }
}

/** A recipe is replayable iff every step is deterministic given its input blob. */
export function isReplayable(recipe: Recipe, registry: Map<string, TransformDefinition>): boolean {
  return recipe.steps.every((s) => registry.get(s.type)?.deterministicGivenInput === true)
}

/**
 * Recompute a replayable version: re-run its chain on a copy of the parent blob.
 * Caller MUST have verified `isReplayable` (non-replayable versions are pinned and
 * never reach here). Returns the produced file path.
 */
export async function replayChain(
  parentFile: string,
  destFolder: string,
  recipe: Recipe,
  registry: Map<string, TransformDefinition>,
  services: Omit<TransformServices, 'reportProgress'>,
  index = 1
): Promise<string> {
  const instances: TransformInstance[] = recipe.steps.map((s, i) => ({
    instanceId: `${s.type}-${i}`,
    type: s.type,
    enabled: true,
    config: s.config
  }))
  const result = await runTransformChain(
    parentFile,
    destFolder,
    {
      index,
      rawTitle: recipe.resolved?.tags?.title ?? basename(parentFile),
      sourceFile: parentFile
    },
    instances,
    registry,
    services,
    () => {}
  )
  if (result.failed) throw new Error(`replay failed: ${result.reason}`)
  return result.outputFile
}
