import type { Account, ID } from '../../types'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'

/** Segments split the row evenly, so names stop fitting from three wallets. */
const MOST_SEGMENTS = 2

interface WalletPickerProps {
  wallets: Pick<Account, 'id' | 'name'>[]
  value: ID
  onChange: (id: ID) => void
  /** Names the control for screen readers. */
  label: string
}

/** Choose a wallet: one tap for one or two, a dropdown for any number more. */
export function WalletPicker({ wallets, value, onChange, label }: WalletPickerProps) {
  if (wallets.length <= MOST_SEGMENTS) {
    return <SegmentedControl label={label} value={value} onChange={onChange} options={wallets.map((w) => ({ value: w.id, label: w.name }))} />
  }
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {wallets.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </Select>
  )
}
