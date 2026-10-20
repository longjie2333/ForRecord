import { PanelLeftCloseIcon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Sidebar, type SidebarProps } from './sidebar.tsx'

export const DesktopSidebar = ({
  collapsed,
  onCollapse,
  ...sidebar
}: SidebarProps & { collapsed: boolean; onCollapse: () => void }) => (
  <aside className="desktop-sidebar" aria-label="笔记侧边栏" data-collapsed={collapsed || undefined} inert={collapsed}>
    <Sidebar
      {...sidebar}
      collapseControl={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="收起侧边栏"
          title="收起侧边栏"
          onClick={onCollapse}
        >
          <PanelLeftCloseIcon aria-hidden="true" />
        </Button>
      }
    />
  </aside>
)
