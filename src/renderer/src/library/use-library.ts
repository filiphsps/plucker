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
    // Subscribe first, then fetch in the callback path so the effect body itself does
    // not synchronously setState (which would trigger cascading renders).
    const off = window.plucker.onLibraryChanged(() => {
      void window.plucker.getCollections().then(setCollections)
    })
    void window.plucker.getCollections().then(setCollections)
    return off
  }, [])
  return { collections, refresh }
}
