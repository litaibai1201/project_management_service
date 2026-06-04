import { useState, useEffect, useRef, useCallback } from 'react'
import { userApi } from '@/api/user.api'

type NameMap = Record<string, string>

let _cache: NameMap | null = null
let _promise: Promise<NameMap> | null = null

function loadNameMap(): Promise<NameMap> {
  if (_cache) return Promise.resolve(_cache)
  if (_promise) return _promise
  _promise = userApi.list({ page: 1, size: 2000 }).then((res) => {
    const content = res.content as { data_list?: { work_no: string; name: string }[] }
    const map: NameMap = {}
    ;(content.data_list ?? []).forEach((u) => {
      if (u.work_no) map[u.work_no.toLowerCase()] = u.name ?? u.work_no
    })
    _cache = map
    return map
  }).catch(() => {
    _promise = null
    return {} as NameMap
  })
  return _promise
}

/** Returns a function that maps work_no → display name (falls back to empty string if unknown) */
export function useWorkNoToName(): (workNo: string | null | undefined) => string {
  const [nameMap, setNameMap] = useState<NameMap>(_cache ?? {})
  const nameMapRef = useRef(nameMap)
  nameMapRef.current = nameMap

  useEffect(() => {
    if (_cache) { setNameMap(_cache); return }
    loadNameMap().then(setNameMap)
  }, [])

  // Use useCallback to return a stable function that always reads the latest nameMap
  return useCallback((workNo: string | null | undefined) => {
    if (!workNo) return ''
    return nameMapRef.current[workNo.toLowerCase()] ?? ''
  }, [nameMap]) // eslint-disable-line react-hooks/exhaustive-deps
}
