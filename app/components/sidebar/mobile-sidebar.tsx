import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Sheet, SheetPopup, SheetTitle, SheetDescription, SheetTrigger, SheetClose } from '../ui/sheet.tsx'
import { Sidebar, type SidebarProps } from './sidebar.tsx'

export const MobileSidebar = ({
  open,
  onOpenChange,
  ...sidebar
}: SidebarProps & { open: boolean; onOpenChange: (open: boolean) => void }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-md:hidden max-md:inline-flex"
          aria-label="打开文章目录"
        />
      }
    >
      <PanelLeftOpenIcon aria-hidden="true" />
    </SheetTrigger>
    <SheetPopup side="left" className="mobile-sidebar" showCloseButton={false}>
      <SheetTitle className="sr-only">文章目录</SheetTitle>
      <SheetDescription className="sr-only">浏览和管理笔记</SheetDescription>
      <Sidebar
        {...sidebar}
        collapseControl={
          <SheetClose render={<Button type="button" variant="ghost" size="icon" aria-label="关闭文章目录" />}>
            <PanelLeftCloseIcon aria-hidden="true" />
          </SheetClose>
        }
      />
    </SheetPopup>
  </Sheet>
)
