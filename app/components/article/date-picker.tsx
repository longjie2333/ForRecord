import { lazy, Suspense, useState } from 'react'
import { CalendarDaysIcon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Popover, PopoverPopup, PopoverTrigger } from '../ui/popover.tsx'
import { calendarDate } from '../../../shared/posts.ts'
import { cn } from '@/lib/utils.ts'
import { motion } from 'motion/react'
import { shakeAnimation } from '@/components/motion/shake-icon.tsx'

const MotionCalendarIcon = motion.create(CalendarDaysIcon)
const DateCalendar = lazy(async () => ({ default: (await import('./date-calendar.tsx')).DateCalendar }))

export const DatePicker = ({
  id,
  value,
  disabled,
  className,
  btnClassName,
  from,
  collapseOnNarrow = true,
  onChange,
}: {
  id: string
  value: string
  disabled?: boolean
  className?: string
  btnClassName?: string
  from?: Date
  /** A toolbar has no room for the date on a narrow screen; a form field does. */
  collapseOnNarrow?: boolean
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
            className={cn(
              'justify-start tabular-nums',
              collapseOnNarrow && 'max-md:w-9 max-md:justify-center max-md:px-0',
              btnClassName,
            )}
          />
        }
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
      >
        <MotionCalendarIcon aria-hidden="true" {...shakeAnimation(active)} />
        <span className={collapseOnNarrow ? 'max-md:sr-only' : undefined}>{value || '选择日期'}</span>
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" className="p-0" aria-label="选择日期">
        <Suspense fallback={<div className="h-72 w-68.5" />}>
          <DateCalendar
            selected={selected}
            from={from}
            onSelect={(date) => {
              onChange(calendarDate(date))
              setActive(false)
              setOpen(false)
            }}
          />
        </Suspense>
      </PopoverPopup>
    </Popover>
  )
}
