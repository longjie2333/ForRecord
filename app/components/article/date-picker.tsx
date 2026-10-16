import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { zhCN } from '@daypicker/react/locale'
import { Button } from '../ui/button.tsx'
import { Calendar } from '../ui/calendar.tsx'
import { Popover, PopoverPopup, PopoverTrigger } from '../ui/popover.tsx'
import { today } from '../../../shared/posts.ts'

// The coss Date Picker particle composes Calendar and Popover.
export const DatePicker = ({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T12:00:00`) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className="bg-background/80 hover:bg-background/80 data-pressed:bg-background/80"
        disabled={disabled}
        render={<Button type="button" variant="outline" className="w-full justify-start tabular-nums" />}
      >
        <CalendarIcon aria-hidden="true" />
        {value || '选择日期'}
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" className="p-0" aria-label="选择文章日期">
        <Calendar
          mode="single"
          required
          locale={zhCN}
          defaultMonth={selected}
          selected={selected}
          labels={{ labelNext: () => '下个月', labelPrevious: () => '上个月' }}
          onSelect={(date) => {
            onChange(today(date))
            setOpen(false)
          }}
        />
      </PopoverPopup>
    </Popover>
  )
}
