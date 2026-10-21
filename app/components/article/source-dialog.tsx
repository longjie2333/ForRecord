import { useRef } from 'react'
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog.tsx'
import { Textarea } from '../ui/textarea.tsx'
import { Button } from '../ui/button.tsx'

export const SourceDialog = ({
  value,
  onClose,
  onApply,
}: {
  value: string | null
  onClose: () => void
  onApply: (markdown: string) => void
}) => {
  const input = useRef<HTMLTextAreaElement>(null)
  return (
    <Dialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      onOpenChangeComplete={(open) => {
        if (open && input.current) {
          input.current.focus()
          input.current.setSelectionRange(0, 0)
          input.current.scrollTop = 0
        }
      }}
    >
      <DialogPopup
        className="source-dialog h-[86dvh] max-h-[900px] w-[calc(100vw-2rem)] max-w-[1100px] max-md:h-[90dvh] max-md:w-[calc(100vw-1rem)] [&_[data-slot=scroll-area-content]]:h-full"
        bottomStickOnMobile={false}
        closeProps={{ 'aria-label': '关闭源码编辑' }}
      >
        <DialogHeader>
          <DialogTitle>编辑 Markdown 源码</DialogTitle>
        </DialogHeader>
        <DialogPanel className="source-panel flex h-full min-h-0 flex-col">
          <Textarea
            key={value === null ? 'closed' : 'open'}
            ref={input}
            className="source-textarea h-full min-h-0 flex-1 [&_textarea]:h-full [&_textarea]:min-h-0 [&_textarea]:resize-none [&_textarea]:p-4 [&_textarea]:font-mono [&_textarea]:text-sm [&_textarea]:leading-[1.7] [&_textarea]:[field-sizing:fixed] [&_textarea]:[tab-size:4] max-md:[&_textarea]:text-base"
            unstyled={true}
            aria-label="Markdown 源码"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            defaultValue={value ?? ''}
          />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>取消</DialogClose>
          <Button
            type="button"
            onClick={() => {
              if (value === null) return
              const edited = input.current!.value
              onApply(edited === value.replace(/\r\n?/g, '\n') ? value : edited)
            }}
          >
            应用修改
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
