import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { CheckIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { InputGroup, InputGroupInput, InputGroupAddon } from '../ui/input-group.tsx'
import { IconSwap } from '../motion/icon-swap.tsx'
import { useHoverActive } from '../motion/hover-active.ts'
import { shakeAnimation } from '../motion/shake-icon.tsx'
import { DatePicker } from './date-picker.tsx'

// Motion wraps one component per icon, so build the shaking trash once.
const MotionTrashIcon = motion.create(Trash2Icon)
const MotionSaveIcon = motion.create(SaveIcon)

const DeleteButton = ({ onDelete }: { onDelete: () => void }) => {
  const { active, hoverProps } = useHoverActive()
  return (
    <Button
      className="hover:text-destructive-foreground"
      type="button"
      variant="ghost"
      size="icon"
      aria-label="删除文章"
      title="删除文章"
      {...hoverProps}
      onClick={onDelete}
    >
      <MotionTrashIcon aria-hidden="true" {...shakeAnimation(active)} />
    </Button>
  )
}

const SaveButton = ({ ready, writing, saved }: { ready: boolean; writing: boolean; saved: boolean }) => {
  const { active, hoverProps } = useHoverActive()
  return (
    <Button type="submit" disabled={!ready} loading={writing} {...hoverProps}>
      <IconSwap active={saved} onIcon={<CheckIcon />} offIcon={<MotionSaveIcon {...shakeAnimation(active)} />} />
      保存
    </Button>
  )
}

// Publishes the floating bar's rendered height as the `--edit-footer-height`
// custom property so distant UI (e.g. the sidebar's new-post button) can match
// it without a hardcoded pixel value that would drift on font or zoom changes.
const useFooterHeightVar = () => {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const update = () => root.style.setProperty('--edit-footer-height', `${el.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--edit-footer-height')
    }
  }, [])
  return ref
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
}) => {
  const footerRef = useFooterHeightVar()
  return (
    <form
      ref={footerRef}
      className="edit-footer floating-surface"
      data-state={state}
      inert={state === 'closed'}
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <InputGroup className="px-0.5 py-1.5 bg-background/80 rounded-xl">
        <InputGroupInput
          required
          readOnly={locked}
          disabled={writing}
          value={title}
          placeholder="请输入笔记标题"
          onChange={(event) => onChangeTitle(event.target.value)}
        />
        <InputGroupAddon>
          <DatePicker
            id="post-date"
            value={date}
            disabled={writing}
            onChange={onChangeDate}
            className="font-normal bg-transparent"
            btnClassName="border-none shadow-none before:!shadow-none"
          />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          {deletable && <DeleteButton onDelete={onDelete} />}
          <SaveButton ready={ready} writing={writing} saved={saved} />
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
