/**
 * Per-route gamepad navigation (iteration 13).
 *
 * With real routes, exactly one page is mounted at a time, so each page owns its
 * own navigation wiring through this shared hook instead of one central switch.
 * It bundles:
 * - spatial focus movement within the page's scope (with in-place adjustment of
 *   sliders/selects via `adjustControl`),
 * - confirm (A) on the focused control, vetoable per page (`canConfirm` — the
 *   result screen refuses A so it can never auto-dismiss),
 * - back (B) and start (☰) behaviour supplied by the page,
 * - the transition input lock-out from the app shell,
 * - re-resolving focus onto the page whenever its content (re)mounts or the
 *   route changes, so gamepad navigation survives route transitions,
 * - a `navMode` flag the page can use to keep focus visible for gamepad users.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { adjustControl } from '../utils/controlAdjust'
import { getFocusableElements, type NavDirection } from '../utils/focusNavigation'
import { useFocusNavigation } from './useFocusNavigation'
import { useGamepadNavigation } from './useGamepadNavigation'
import type { InputLockout } from '../utils/inputLockout'
import type { ControllerOverrides } from '../utils/input'

export interface PageNavigationOptions {
  gamepad: Gamepad | null
  /** False while the page should ignore navigation (e.g. active gameplay). */
  enabled: boolean
  deadzone?: number
  /** Per-device overrides (button map, axis map, hat switch). */
  mapping?: ControllerOverrides
  /** Shared transition latch; armed by the shell on route changes/results. */
  lockout?: InputLockout
  /** Container owning this page's focusable controls. */
  getScope: () => HTMLElement | null
  /** Optional selector for the preferred initial focus target (e.g. the selected card). */
  selectedSelector?: string
  /**
   * Navigate up/down in reading order instead of by geometry.
   *
   * Form-like screens (settings) read top to bottom, so a spatial jump from a
   * wide slider to a narrow checkbox further down the page is disorienting.
   * Grids (the games library) keep the spatial behaviour.
   */
  linearVertical?: boolean
  /** Return false to veto A-confirm (e.g. the result screen ignores A entirely). */
  canConfirm?: () => boolean
  onBack: () => void
  onStart?: () => void
}

export function usePageNavigation(options: PageNavigationOptions): { navMode: boolean } {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const getScopeRef = useCallback(() => optionsRef.current.getScope(), [])
  const { move } = useFocusNavigation(getScopeRef, options.linearVertical ?? false)

  const [navMode, setNavMode] = useState(false)
  const handleActivity = useCallback(() => setNavMode(true), [])

  const handleNavigate = useCallback(
    (direction: NavDirection) => {
      const active = document.activeElement as HTMLElement | null
      if (active && adjustControl(active, direction)) return
      move(direction)
    },
    [move]
  )

  const handleConfirm = useCallback(() => {
    const { canConfirm } = optionsRef.current
    if (canConfirm && !canConfirm()) return
    const active = document.activeElement as HTMLElement | null
    if (!active) return
    if (active instanceof HTMLSelectElement) return
    if (active instanceof HTMLInputElement && active.type === 'range') return
    active.click()
  }, [])

  const handleBack = useCallback(() => optionsRef.current.onBack(), [])
  const handleStart = useCallback(() => optionsRef.current.onStart?.(), [])

  useGamepadNavigation({
    gamepad: options.gamepad,
    enabled: options.enabled,
    deadzone: options.deadzone,
    mapping: options.mapping,
    lockout: options.lockout,
    onDirection: handleNavigate,
    onConfirm: handleConfirm,
    onBack: handleBack,
    onStart: handleStart,
    onActivity: handleActivity,
  })

  // Pointer activity exits "gamepad nav" mode (mouse users get hover affordances).
  useEffect(() => {
    if (!navMode) return
    const off = () => setNavMode(false)
    window.addEventListener('pointerdown', off)
    window.addEventListener('mousemove', off)
    return () => {
      window.removeEventListener('pointerdown', off)
      window.removeEventListener('mousemove', off)
    }
  }, [navMode])

  // Re-resolve focus whenever the page content changes (route enter/leave,
  // screen swaps, modal open/close). Skips when focus already lives in scope.
  useEffect(() => {
    const { enabled, gamepad, getScope, selectedSelector } = optionsRef.current
    if (!enabled || !gamepad) return
    const scope = getScope()
    if (!scope) return
    const items = getFocusableElements(scope)
    if (items.length === 0) return
    const active = document.activeElement as HTMLElement | null
    if (active && items.includes(active)) return
    const selected = selectedSelector ? scope.querySelector<HTMLElement>(selectedSelector) : null
    const target = selected && items.includes(selected) ? selected : items[0]
    target.focus()
  })

  return { navMode }
}

