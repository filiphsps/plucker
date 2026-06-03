import { describe, it, expect } from 'vitest'
import { shellQuote } from './sudo'

describe('shellQuote', () => {
  it('wraps plain tokens in single quotes', () => {
    expect(shellQuote('chrome')).toBe("'chrome'")
  })

  it('quotes spaces and shell metacharacters safely', () => {
    expect(shellQuote('/tmp/a b/$x.txt')).toBe("'/tmp/a b/$x.txt'")
  })

  it('escapes embedded single quotes', () => {
    // foo'bar -> 'foo'\''bar'
    expect(shellQuote("foo'bar")).toBe("'foo'\\''bar'")
  })
})
