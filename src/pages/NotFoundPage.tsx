import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass } from '../components/ui/buttonStyles'
import { EmptyState } from '../components/ui/EmptyState'
import { t } from '../i18n'

export function NotFoundPage() {
  return (
    <div className="pt-6">
      <EmptyState
        icon={MapPinOff}
        title={t.notFound.title}
        headingLevel="h1"
        body={t.notFound.body}
        action={
          <Link to="/" className={buttonClass()}>
            {t.common.goHome}
          </Link>
        }
      />
    </div>
  )
}
