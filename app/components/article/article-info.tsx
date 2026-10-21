import { motion } from 'motion/react'
import { CheckIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Field, FieldLabel } from '../ui/field.tsx'
import { Input } from '../ui/input.tsx'
import { IconSwap } from '../motion/icon-swap.tsx'
import { shakeAnimation, useShakeOnHover } from '../motion/shake-icon.tsx'
import { DatePicker } from './date-picker.tsx'

// Motion wraps one component per icon, so build the shaking trash once.
const MotionTrashIcon = motion.create(Trash2Icon)
const MotionSaveIcon = motion.create(SaveIcon)

const DeleteButton = ({ onDelete }: { onDelete: () => void }) => {
  const { shaking, shakeProps } = useShakeOnHover()
  return (
    <Button
      className="hover:bg-background/80"
      type="button"
      variant="destructive-outline"
      size="icon"
      aria-label="删除文章"
      title="删除文章"
      {...shakeProps}
      onClick={onDelete}
    >
      <MotionTrashIcon aria-hidden="true" {...shakeAnimation(shaking)} />
    </Button>
  )
}

const SaveButton = ({ ready, writing, saved }: { ready: boolean; writing: boolean; saved: boolean }) => {
  const { shaking, shakeProps } = useShakeOnHover()
  return (
    <Button type="submit" disabled={!ready} loading={writing} {...shakeProps}>
      <IconSwap active={saved} onIcon={<CheckIcon />} offIcon={<MotionSaveIcon {...shakeAnimation(shaking)} />} />
      保存
    </Button>
  )
}

export const ArticleInfo = ({
  state,
  title,
  date,
  locked,
  deletable,
  ready,
  writing,
  saved,
  onChangeTitle,
  onChangeDate,
  onSave,
  onDelete,
}: {
  state: 'open' | 'closed'
  title: string
  date: string
  locked: boolean
  deletable: boolean
  ready: boolean
  writing: boolean
  saved: boolean
  onChangeTitle: (title: string) => void
  onChangeDate: (date: string) => void
  onSave: () => void
  onDelete: () => void
}) => (
  <form
    className="edit-footer floating-surface"
    data-state={state}
    inert={state === 'closed'}
    onSubmit={(event) => {
      event.preventDefault()
      onSave()
    }}
  >
    <Field className="min-w-0 flex-1 max-lg:col-span-full">
      <FieldLabel>标题</FieldLabel>
      <Input
        className="bg-background/80"
        type="text"
        value={title}
        required
        readOnly={locked}
        disabled={writing}
        placeholder="例如：生活 / 一些小事"
        onChange={(event) => onChangeTitle(event.target.value)}
      />
    </Field>
    <Field className="w-[154px] flex-none max-lg:w-auto">
      <FieldLabel htmlFor="post-date">日期</FieldLabel>
      <DatePicker id="post-date" value={date} disabled={writing} onChange={onChangeDate} />
    </Field>
    <div className="save-actions flex items-center justify-end gap-2">
      {deletable && <DeleteButton onDelete={onDelete} />}
      <SaveButton ready={ready} writing={writing} saved={saved} />
    </div>
  </form>
)
