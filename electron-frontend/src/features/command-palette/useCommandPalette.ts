import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Command } from './types'
import { filterCommands } from './utils'

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const commandsRef = useRef<Command[]>([])

  const registerCommands = useCallback((commands: Command[]) => {
    commandsRef.current = commands
  }, [])

  const open = useCallback(() => {
    setQuery('')
    setSelectedIndex(0)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  const toggle = useCallback(() => {
    if (isOpen) close()
    else open()
  }, [isOpen, open, close])

  const filtered = useMemo(
    () => filterCommands(commandsRef.current, query),
    [query],
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen) return

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((i) => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const cmd = filtered[selectedIndex]
        if (cmd) {
          close()
          cmd.action()
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, filtered, selectedIndex, close])

  return {
    isOpen,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    filtered,
    open,
    close,
    toggle,
    registerCommands,
  }
}
