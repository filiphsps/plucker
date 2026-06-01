import React, { Activity } from 'react'

/**
 * Generic page/route wrapper that "freezes" its content when inactive.
 *
 * Built on React 19.2's <Activity>: when `active` is false the children are
 * hidden and their Effects are unmounted (subscriptions/timers stop, so an
 * inactive page costs nothing), while their state and DOM — typed inputs,
 * search queries, scroll position, in-progress edits — are preserved and
 * restored the moment the page becomes active again. Effects re-mount on
 * reactivation, so data-loading pages refetch fresh data on return.
 *
 * Render every page unconditionally and drive visibility through `active`;
 * exactly one page should be active at a time.
 */
export function Page({
  active,
  children
}: {
  active: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return <Activity mode={active ? 'visible' : 'hidden'}>{children}</Activity>
}
