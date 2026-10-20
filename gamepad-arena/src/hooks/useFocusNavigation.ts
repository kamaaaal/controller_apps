/**
 * Small hook that moves DOM focus between focusable elements using spatial
 * navigation. Kept deliberately tiny — it owns no input source, so it can be
 * driven by a gamepad, keyboard, or tests.
 */

import { useCallback } from 'react'
import {
  findNextFocus,
  findNextInOrder,
  getFocusableElements,
  type NavDirection,
} from '../utils/focusNavigation'

export interface FocusNavigation {
  move: (direction: NavDirection) => void
  focusFirst: () => void
  hasFocusables: () => boolean
}

/**
 * @param getScope Returns the container to navigate within (e.g. the current
 *   screen, or an open modal). Defaults to the document body when null.
 * @param linearVertical When true, up/down walk the controls in reading order
 *   instead of by geometry. Forms behave better this way; grids do not.
 */
export function useFocusNavigation(
  getScope: () => HTMLElement | null,
  linearVertical = false
): FocusNavigation {
  const resolve = useCallback(() => getScope() ?? document.body, [getScope])

  const move = useCallback(
    (direction: NavDirection) => {
      const items = getFocusableElements(resolve())
      if (items.length === 0) return
      const active = document.activeElement as HTMLElement | null
      if (!active || !items.includes(active)) {
        items[0].focus()
        return
      }
      if (linearVertical && (direction === 'up' || direction === 'down')) {
        findNextInOrder(active, items, direction)?.focus()
        return
      }
      findNextFocus(active, items, direction)?.focus()
    },
    [resolve, linearVertical]
  )

  const focusFirst = useCallback(() => {
    getFocusableElements(resolve())[0]?.focus()
  }, [resolve])

  const hasFocusables = useCallback(() => getFocusableElements(resolve()).length > 0, [resolve])

  return { move, focusFirst, hasFocusables }
}
