import { useTranslation } from 'react-i18next'
import type { ActivityEvent } from '../../../shared/library'

export function ActivityLog({ events }: { events: ActivityEvent[] }): React.JSX.Element {
  const { t } = useTranslation()
  if (events.length === 0) return <div className="activity-empty">{t('activity.empty')}</div>
  return (
    <ul className="activity-log">
      {events.map((e) => (
        <li key={e.id} className={`activity activity-${e.type}`}>
          <time dateTime={e.ts}>{new Date(e.ts).toLocaleString()}</time>
          <span>{e.summary}</span>
        </li>
      ))}
    </ul>
  )
}
