import { describe, it, expect, beforeEach } from 'vitest'
import { getFocusableElements, findNextFocus, findNextInOrder } from './focusNavigation'

function stubRect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

describe('getFocusableElements', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('collects rendered, enabled, non-hidden controls in DOM order', () => {
    document.body.innerHTML = `
      <div id="scope">
        <button id="a">A</button>
        <button id="b" disabled>B</button>
        <button id="c" hidden>C</button>
        <input id="d" />
        <div id="e" tabindex="0"></div>
        <div id="f" tabindex="-1"></div>
      </div>`

    const scope = document.getElementById('scope') as HTMLElement
    expect(getFocusableElements(scope).map((el) => el.id)).toEqual(['a', 'd', 'e'])
  })

  it('skips aria-hidden elements', () => {
    document.body.innerHTML = `
      <div id="scope">
        <button id="a">A</button>
        <button id="b" aria-hidden="true">B</button>
      </div>`

    const scope = document.getElementById('scope') as HTMLElement
    expect(getFocusableElements(scope).map((el) => el.id)).toEqual(['a'])
  })
})

describe('findNextFocus', () => {
  let items: HTMLElement[]
  let a: HTMLElement
  let b: HTMLElement
  let c: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="scope">
        <button id="a">A</button>
        <button id="b">B</button>
        <button id="c">C</button>
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    a = document.getElementById('a') as HTMLElement
    b = document.getElementById('b') as HTMLElement
    c = document.getElementById('c') as HTMLElement
    stubRect(a, 0, 0, 100, 40)
    stubRect(b, 120, 0, 100, 40)
    stubRect(c, 0, 60, 100, 40)
    items = getFocusableElements(scope)
  })

  it('moves right to the same-row neighbour', () => {
    expect(findNextFocus(a, items, 'right')).toBe(b)
  })

  it('moves down to the row below', () => {
    expect(findNextFocus(a, items, 'down')).toBe(c)
  })

  it('moves left back to the previous neighbour', () => {
    expect(findNextFocus(b, items, 'left')).toBe(a)
  })

  it('returns null at the edges', () => {
    expect(findNextFocus(a, items, 'left')).toBeNull()
    expect(findNextFocus(a, items, 'up')).toBeNull()
    expect(findNextFocus(c, items, 'down')).toBeNull()
  })

  it('prefers the aligned neighbour over a diagonal one', () => {
    // From `c` (bottom-left), going right should pick nothing aligned, but from
    // `a` going right must pick `b` rather than the diagonal `c`-less set.
    expect(findNextFocus(a, items, 'right')).toBe(b)
  })

  it('ignores a loosely-aligned element above the row', () => {
    // A filter chip sitting above the grid, slightly to the right, must not
    // win "right" over the actual next card in the row.
    document.body.innerHTML = `
      <div id="scope">
        <button id="chip">Chip</button>
        <div id="card-a" tabindex="0"></div>
        <div id="card-b" tabindex="0"></div>
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    const chip = document.getElementById('chip') as HTMLElement
    const cardA = document.getElementById('card-a') as HTMLElement
    const cardB = document.getElementById('card-b') as HTMLElement
    stubRect(chip, 250, -140, 90, 32)
    stubRect(cardA, 0, 0, 400, 200)
    stubRect(cardB, 420, 0, 400, 200)

    const scopeItems = getFocusableElements(scope)
    expect(findNextFocus(cardA, scopeItems, 'right')).toBe(cardB)
  })

  it('still reaches a control below the last row', () => {
    // When nothing is directly below, the nearest control in that band wins.
    document.body.innerHTML = `
      <div id="scope">
        <div id="card" tabindex="0"></div>
        <button id="play">Play</button>
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    const card = document.getElementById('card') as HTMLElement
    const play = document.getElementById('play') as HTMLElement
    stubRect(card, 0, 0, 400, 200)
    stubRect(play, 0, 300, 400, 44)

    const scopeItems = getFocusableElements(scope)
    expect(findNextFocus(card, scopeItems, 'down')).toBe(play)
  })

  it('steps through controls of different widths in the same column', () => {
    // A wide slider and a narrow checkbox share a column. Centre-distance
    // scoring treats them as misaligned and skips the checkbox; span overlap
    // does not.
    document.body.innerHTML = `
      <div id="scope">
        <input id="slider" type="range" />
        <input id="check-a" type="checkbox" />
        <input id="check-b" type="checkbox" />
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    const slider = document.getElementById('slider') as HTMLElement
    const checkA = document.getElementById('check-a') as HTMLElement
    const checkB = document.getElementById('check-b') as HTMLElement
    // The slider is wide and sits in the same column as the checkboxes.
    stubRect(slider, 500, 0, 240, 40)
    stubRect(checkA, 560, 80, 24, 24)
    stubRect(checkB, 560, 160, 24, 24)

    const scopeItems = getFocusableElements(scope)
    expect(findNextFocus(slider, scopeItems, 'down')).toBe(checkA)
    expect(findNextFocus(checkA, scopeItems, 'down')).toBe(checkB)
    expect(findNextFocus(checkB, scopeItems, 'up')).toBe(checkA)
  })

  it('does not jump to a control in a completely different row', () => {
    // Nothing to the right shares a row, and the only candidate is far above
    // — navigation should stay put rather than leap across the page.
    document.body.innerHTML = `
      <div id="scope">
        <button id="top">Top</button>
        <button id="bottom">Bottom</button>
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    const top = document.getElementById('top') as HTMLElement
    const bottom = document.getElementById('bottom') as HTMLElement
    stubRect(top, 500, 0, 100, 40)
    stubRect(bottom, 0, 500, 100, 40)

    const scopeItems = getFocusableElements(scope)
    expect(findNextFocus(bottom, scopeItems, 'right')).toBeNull()
  })
})

describe('findNextInOrder', () => {
  it('walks the controls in reading order', () => {
    document.body.innerHTML = `
      <div id="scope">
        <input id="a" type="range" />
        <input id="b" type="checkbox" />
        <input id="c" type="checkbox" />
        <button id="d">Done</button>
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    const a = document.getElementById('a') as HTMLElement
    const b = document.getElementById('b') as HTMLElement
    const c = document.getElementById('c') as HTMLElement
    const d = document.getElementById('d') as HTMLElement
    const items = getFocusableElements(scope)

    expect(findNextInOrder(a, items, 'down')).toBe(b)
    expect(findNextInOrder(b, items, 'down')).toBe(c)
    expect(findNextInOrder(c, items, 'down')).toBe(d)
    expect(findNextInOrder(d, items, 'up')).toBe(c)
  })

  it('stops at the ends', () => {
    document.body.innerHTML = `
      <div id="scope">
        <button id="a">A</button>
        <button id="b">B</button>
      </div>`
    const scope = document.getElementById('scope') as HTMLElement
    const a = document.getElementById('a') as HTMLElement
    const b = document.getElementById('b') as HTMLElement
    const items = getFocusableElements(scope)

    expect(findNextInOrder(a, items, 'up')).toBeNull()
    expect(findNextInOrder(b, items, 'down')).toBeNull()
  })

  it('ignores a control that is not in the list', () => {
    document.body.innerHTML = '<div id="scope"><button id="a">A</button></div>'
    const scope = document.getElementById('scope') as HTMLElement
    const items = getFocusableElements(scope)
    const stranger = document.createElement('button')
    expect(findNextInOrder(stranger, items, 'down')).toBeNull()
  })
})
