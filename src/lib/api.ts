import type { ApiResult } from '@shared/types'

export async function callApi<T>(fn: () => Promise<ApiResult<T>>, fallbackMessage = 'Erreur'): Promise<T> {
  if (!window.topFruit) {
    throw new Error('Cette application doit être lancée via Electron (npm run dev), pas dans un navigateur seul.')
  }
  const result = await fn()
  if (!result.ok) throw new Error(result.error || fallbackMessage)
  return result.data as T
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
