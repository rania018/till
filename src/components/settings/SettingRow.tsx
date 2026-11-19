import type { ReactNode } from 'react'

/** A setting's name and what it does on the left, its control on the right. Extra controls go below. */
export function SettingRow({ title, hint, control, children }: { title: string; hint?: ReactNode; control?: ReactNode; children?: ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
        {control}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
