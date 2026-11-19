import { Fragment } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { language, t } from '../i18n'
import { OPERATOR } from '../privacy/operator'
import { POLICY_DATE, privacyPolicy } from '../privacy/policy'

/** The contact address, wherever it appears, as a link that opens an email. */
function WithEmailLink({ text }: { text: string }) {
  const email = OPERATOR.email.trim()
  if (!email || !text.includes(email)) return <>{text}</>
  return (
    <>
      {text.split(email).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <a href={`mailto:${email}`} dir="ltr" className="font-semibold text-accent underline underline-offset-2">
              {email}
            </a>
          )}
          {part}
        </Fragment>
      ))}
    </>
  )
}

/** /privacy: what leaves the device, who can see it, and how to remove it. Open to anyone, set up or not. */
export function PrivacyPage() {
  const policy = privacyPolicy(language)
  return (
    <div className="max-w-2xl">
      <PageHeader title={t.policy.title} backTo="/settings" />
      <p className="text-sm font-semibold text-muted">{t.policy.updated(t.format.date(POLICY_DATE))}</p>
      <p className="mt-3 text-[1.0625rem] leading-relaxed">{policy.intro}</p>
      {policy.sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="text-lg font-extrabold">{section.title}</h2>
          {section.blocks.map((block, i) =>
            typeof block === 'string' ? (
              <p key={i} className="mt-2 leading-relaxed text-ink-2">
                <WithEmailLink text={block} />
              </p>
            ) : (
              <ul key={i} className="mt-2 list-disc space-y-1.5 ps-5 leading-relaxed text-ink-2 marker:text-muted">
                {block.map((item) => (
                  <li key={item}>
                    <WithEmailLink text={item} />
                  </li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </div>
  )
}
