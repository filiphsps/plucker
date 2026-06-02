import { describe, it, expect } from 'vitest'
import { distribute } from './distribute'

describe('distribute', () => {
  it('gives the whole budget to a single job', () => {
    expect(distribute(4, 1)).toEqual([4])
  })
  it('splits evenly when divisible', () => {
    expect(distribute(4, 2)).toEqual([2, 2])
    expect(distribute(6, 3)).toEqual([2, 2, 2])
  })
  it('hands the remainder to the earliest jobs, one extra each', () => {
    expect(distribute(4, 3)).toEqual([2, 1, 1])
    expect(distribute(5, 2)).toEqual([3, 2])
  })
  it('never grants a job fewer than 1 slot', () => {
    expect(distribute(2, 5)).toEqual([1, 1, 1, 1, 1])
  })
  it('returns [] for zero jobs', () => {
    expect(distribute(4, 0)).toEqual([])
  })
  it('treats total < 1 as 1', () => {
    expect(distribute(0, 2)).toEqual([1, 1])
  })
})
