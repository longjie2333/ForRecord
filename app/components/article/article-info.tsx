import { SaveIcon, Trash2Icon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Field, FieldLabel } from '../ui/field.tsx'
import { Input } from '../ui/input.tsx'
import { DatePicker } from './date-picker.tsx'

export const ArticleInfo = ({
  state,
  title,
  date,
  locked,
  deletable,
  ready,
  writing,
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
    <Field className="title-field">
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
    <Field className="date-field">
      <FieldLabel htmlFor="post-date">日期</FieldLabel>
      <DatePicker id="post-date" value={date} disabled={writing} onChange={onChangeDate} />
    </Field>
    <div className="save-actions flex items-center justify-end gap-2">
      {deletable && (
        <Button
          type="button"
          variant="destructive-outline"
          size="icon"
          aria-label="删除文章"
          title="删除文章"
          onClick={onDelete}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      )}
      <Button type="submit" disabled={!ready} loading={writing}>
        <SaveIcon aria-hidden="true" />
        保存
      </Button>
    </div>
  </form>
)
