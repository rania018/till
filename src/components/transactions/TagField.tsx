import { Plus, Tag, X } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'
import { t } from '../../i18n'
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags, tagKey } from '../../lib/tags'
import { inputClass } from '../ui/formStyles'

interface TagFieldProps {
  tags: string[]
  onChange: (tags: string[]) => void
  /** What's typed and not added yet. Saving adds it too, so nothing typed is lost. */
  draft: string
  onDraft: (draft: string) => void
  /** Tags already in use, the most recently used first. */
  known: string[]
}

const SUGGESTED = 5
const chip = 'inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border px-3 text-sm font-semibold'

/** Tags on an entry: the ones it has, a few used before, and a field to type a new one. */
export function TagField({ tags, onChange, draft, onDraft, known }: TagFieldProps) {
  const id = useId()
  const copy = t.tags
  const typed = tagKey(draft)
  const suggestions = known.filter((name) => !tags.some((tag) => tagKey(tag) === tagKey(name)) && (!typed || tagKey(name).includes(typed))).slice(0, SUGGESTED)
  const full = tags.length >= MAX_TAGS

  function add(name: string) {
    onChange(normalizeTags([...tags, name], known) ?? [])
    onDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter or a comma adds what's typed, instead of saving the entry.
    if ((event.key === 'Enter' || event.key === ',') && draft.trim()) {
      event.preventDefault()
      add(draft)
    } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
        <Tag aria-hidden className="size-4 text-muted" />
        {copy.label}
        <span className="font-semibold text-muted">{t.common.optional}</span>
      </label>
      {tags.length > 0 && (
        <ul aria-label={copy.chosen} className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="max-w-full">
              <button type="button" onClick={() => onChange(tags.filter((other) => other !== tag))} aria-label={copy.remove(tag)} className={`${chip} border-transparent bg-accent-soft text-accent`}>
                <span className="truncate">{tag}</span>
                <X aria-hidden className="size-3.5 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <input
          id={id}
          value={draft}
          onChange={(e) => onDraft(e.target.value.replace(',', ''))}
          onKeyDown={onKeyDown}
          maxLength={MAX_TAG_LENGTH}
          enterKeyHint="done"
          autoComplete="off"
          placeholder={tags.length > 0 ? copy.another : copy.placeholder}
          className={inputClass({ className: 'min-h-11' })}
        />
      )}
      {!full && suggestions.length > 0 && (
        <div role="group" aria-label={copy.usedBefore} className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <button key={name} type="button" onClick={() => add(name)} aria-label={copy.add(name)} className={`${chip} border-line bg-surface text-ink-2 hover:bg-surface-2`}>
              <Plus aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      )}
      {full && <p className="text-sm text-muted">{copy.full(MAX_TAGS)}</p>}
    </div>
  )
}
