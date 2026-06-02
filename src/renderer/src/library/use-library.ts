import { useEffect, useState, useCallback } from 'react'
import type { CollectionView } from '../../../shared/library'

export function useLibrary(): {
  collections: CollectionView[]
  refresh: () => Promise<void>
} {
  const [collections, setCollections] = useState<CollectionView[]>([])
  const refresh = useCallback(async () => {
    setCollections(await window.plucker.getCollections())
  }, [])
  useEffect(() => {
    void refresh()
    return window.plucker.onLibraryChanged(() => void refresh())
  }, [refresh])
  return { collections, refresh }
}
