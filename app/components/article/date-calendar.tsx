import { zhCN } from '@daypicker/react/locale'
import { Calendar } from '../ui/calendar.tsx'

// Kept apart from the trigger: day-picker and its date library load only when a popover opens.
export const DateCalendar = ({
  selected,
  from,
  onSelect,
}: {
  selected?: Date
  from?: Date
  onSelect: (date: Date) => void
}) => (
  <Calendar
    mode="single"
    required
    locale={zhCN}
    defaultMonth={selected ?? from}
    selected={selected}
    disabled={from ? { before: from } : undefined}
    labels={{ labelNext: () => '下个月', labelPrevious: () => '上个月' }}
    onSelect={onSelect}
  />
)
