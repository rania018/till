import { t } from '../../i18n'
import { nameOf } from '../../lib/transactions'
import type { CycleReview, ReviewTip } from '../../lib/review'
import type { Category } from '../../types'

/** "You finished with 6,500 DA left", "You finished 4,000 DA over", or exactly nothing left. */
export function reviewResult(review: Pick<CycleReview, 'left'>, money: (amount: number) => string): string {
  const copy = t.review
  if (review.left > 0) return copy.left(money(review.left))
  if (review.left < 0) return copy.over(money(-review.left))
  return copy.even
}

/** What a tip says, in a sentence. */
export function tipText(tip: ReviewTip, categories: Category[], money: (amount: number) => string): string {
  const copy = t.review
  switch (tip.kind) {
    case 'raise-limit':
      return copy.raise(nameOf(categories, tip.categoryId), money(tip.from), money(tip.to))
    case 'lower-limit':
      return copy.lower(nameOf(categories, tip.categoryId), money(tip.from), money(tip.to))
    case 'put-aside':
      return copy.putAside(money(tip.amount))
    case 'over':
      return tip.categoryId ? copy.overBy(money(tip.amount), nameOf(categories, tip.categoryId)) : copy.overPlain(money(tip.amount))
  }
}
