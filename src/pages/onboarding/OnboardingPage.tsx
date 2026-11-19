import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { toast } from '../../components/ui/toastStore'
import { t } from '../../i18n'
import { appStore } from '../../store'
import { BillsStep } from './BillsStep'
import { GoalStep } from './GoalStep'
import { LimitsStep } from './LimitsStep'
import { MoneyStep } from './MoneyStep'
import { SalaryStep } from './SalaryStep'
import { WelcomeStep } from './WelcomeStep'

// The goal comes before limits so the limits step can show what's left after bills and savings.
const STEPS = [WelcomeStep, SalaryStep, MoneyStep, BillsStep, GoalStep, LimitsStep]

/**
 * Full-screen setup, one step per URL (/onboarding/1 … /6) so the phone's back
 * button goes to the previous step. Each step saves when you continue, so
 * running setup again later works as an editor.
 */
export function OnboardingPage() {
  const params = useParams()
  const navigate = useNavigate()
  const step = Number(params.step)
  const valid = Number.isInteger(step) && step >= 1 && step <= STEPS.length

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo, and React would treat it as a cleanup function.
    window.scrollTo(0, 0)
  }, [step])

  if (!valid) return <Navigate to="/onboarding/1" replace />

  const next = () => {
    if (step < STEPS.length) return navigate(`/onboarding/${step + 1}`)
    appStore.getState().finishOnboarding()
    navigate('/', { replace: true })
    toast(t.onboarding.done, { tone: 'good' })
  }

  const Step = STEPS[step - 1]
  return <Step key={step} step={step} next={next} />
}
