import { useNavigate } from 'react-router'
import { LimitsEditor } from '../../components/budget/LimitsEditor'
import { useLimitsDraft } from '../../components/budget/useLimitsDraft'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { toast } from '../../components/ui/toastStore'
import { t } from '../../i18n'

export function EditLimitsPage() {
  const navigate = useNavigate()
  const draft = useLimitsDraft()

  function save() {
    draft.save()
    toast(t.editLimits.saved, { tone: 'good' })
    navigate('/plan/budget')
  }

  return (
    <div className="max-w-xl lg:max-w-none">
      <PageHeader
        title={t.editLimits.title}
        backTo="/plan/budget"
        showSettings={false}
        actions={
          <Button size="sm" onClick={save}>
            {t.editLimits.save}
          </Button>
        }
      />
      <LimitsEditor draft={draft} wide />
      <div className="lg:flex lg:justify-end">
        <Button block size="lg" className="mt-6 lg:w-auto" onClick={save}>
          {t.editLimits.save}
        </Button>
      </div>
    </div>
  )
}
