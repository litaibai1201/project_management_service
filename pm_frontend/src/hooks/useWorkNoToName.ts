import { useState, useEffect } from 'react'
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

/** Returns a function that maps work_no → display name (falls back to work_no if unknown) */
export function useWorkNoToName(): (workNo: string | null | undefined) => string {
  const [nameMap, setNameMap] = useState<NameMap>(_cache ?? {})

  useEffect(() => {
    if (_cache) { setNameMap(_cache); return }
    loadNameMap().then(setNameMap)
  }, [])

  return (workNo: string | null | undefined) => {
    if (!workNo) return ''
    return nameMap[workNo.toLowerCase()] ?? workNo
  }
}
