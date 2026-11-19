import { useNavigate } from 'react-router'
import { IncomeSources } from '../../components/income/IncomeSources'
import { PayFields } from '../../components/settings/PayFields'
import { usePayDraft } from '../../components/settings/usePayDraft'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { toast } from '../../components/ui/toastStore'
import { t } from '../../i18n'
import { appStore } from '../../store'

/** Settings › Pay and work: the same fields as setup step 2, saved in one go. */
export function PaySettingsPage() {
  const navigate = useNavigate()
  const pay = usePayDraft()
  const copy = t.payPage

  function save() {
    const changes = pay.toProfile()
    if (!changes) return
    try {
      appStore.getState().updateProfile(changes)
      toast(copy.saved, { tone: 'good' })
      navigate('/settings')
    } catch (error) {
      pay.setError((error as Error).message)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title={copy.title}
        backTo="/settings/money"
        showSettings={false}
        actions={
          <Button size="sm" onClick={save}>
            {copy.save}
          </Button>
        }
      />
      <div className="space-y-5">
        <PayFields state={pay} />
        <p className="text-sm text-muted">{copy.paydayNote}</p>
        <Button block size="lg" onClick={save}>
          {copy.save}
        </Button>
        <div className="border-t border-line pt-5">
          <IncomeSources />
        </div>
      </div>
    </div>
  )
}
