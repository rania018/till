import clsx from 'clsx'
import { ArrowLeft as LucideArrowLeft, ArrowRight as LucideArrowRight, ChevronLeft as LucideChevronLeft, ChevronRight as LucideChevronRight, type LucideIcon } from 'lucide-react'

function mirrored(Icon: LucideIcon): LucideIcon {
  return function Mirrored({ className, ...props }) {
    return <Icon {...props} className={clsx('rtl:-scale-x-100', className)} />
  } as LucideIcon
}

// Icons that point along the reading direction: "back" and "go on" swap sides in Arabic.
// Use these instead of the ones from lucide-react.
export const ArrowLeft = mirrored(LucideArrowLeft)
export const ArrowRight = mirrored(LucideArrowRight)
export const ChevronLeft = mirrored(LucideChevronLeft)
export const ChevronRight = mirrored(LucideChevronRight)
