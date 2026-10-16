import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from '../ui/alert-dialog.tsx'
import { Button } from '../ui/button.tsx'

export const DiscardDialog = ({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) => (
  <AlertDialog
    open={open}
    onOpenChange={(visible) => {
      if (!visible) onCancel()
    }}
  >
    <AlertDialogPopup>
      <AlertDialogHeader>
        <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
        <AlertDialogDescription>这篇笔记有尚未保存的内容。继续后，这些修改将丢失。</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter variant="bare">
        <AlertDialogClose render={<Button type="button" variant="ghost" />}>继续编辑</AlertDialogClose>
        <Button type="button" variant="destructive" onClick={onConfirm}>
          放弃修改并继续
        </Button>
      </AlertDialogFooter>
    </AlertDialogPopup>
  </AlertDialog>
)
