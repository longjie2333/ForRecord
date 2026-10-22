import { useState } from 'react'
import { CalendarDaysIcon } from 'lucide-react'
import { zhCN } from '@daypicker/react/locale'
import { Button } from '../ui/button.tsx'
import { Calendar } from '../ui/calendar.tsx'
import { Popover, PopoverPopup, PopoverTrigger } from '../ui/popover.tsx'
import { today } from '../../../shared/posts.ts'
import { cn } from '@/lib/utils.ts'
import { motion } from 'motion/react'
import { shakeAnimation } from '@/components/motion/shake-icon.tsx'

const MotionCalendarIcon = motion.create(CalendarDaysIcon)

// The coss Date Picker particle composes Calendar and Popover.
export const DatePicker = ({
  id,
  value,
  disabled,
  className,
  btnClassName,
  onChange,
}: {
  id: string
  value: string
  disabled?: boolean
  className?: string
  btnClassName?: string
  onChange: (value: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)
  const selected = value ? new Date(`${value}T12:00:00`) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className={cn('bg-background hover:bg-accent data-pressed:bg-accent', className)}
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn('justify-start tabular-nums max-md:w-9 max-md:justify-center max-md:px-0', btnClassName)}
          />
        }
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
      >
        <MotionCalendarIcon aria-hidden="true" {...shakeAnimation(active)} />
        <span className="max-md:sr-only">{value || '选择日期'}</span>
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
            setActive(false)
            setOpen(false)
          }}
        />
      </PopoverPopup>
    </Popover>
  )
}
