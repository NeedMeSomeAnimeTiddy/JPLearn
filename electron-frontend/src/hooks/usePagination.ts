import { useState } from 'react'

interface PaginationResult<T> {
  page: number
  totalPages: number
  items: T[]
  next: () => void
  prev: () => void
  setPage: (page: number) => void
}

export function usePagination<T>(allItems: T[], pageSize: number): PaginationResult<T> {
  const [page, setPageState] = useState(1)
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize))
  const clampedPage = Math.min(page, totalPages)
  const start = (clampedPage - 1) * pageSize
  const items = allItems.slice(start, start + pageSize)

  function next() {
    setPageState((p) => Math.min(totalPages, p + 1))
  }

  function prev() {
    setPageState((p) => Math.max(1, p - 1))
  }

  function setPage(nextPage: number) {
    setPageState(Math.max(1, Math.min(totalPages, nextPage)))
  }

  return { page: clampedPage, totalPages, items, next, prev, setPage }
}
