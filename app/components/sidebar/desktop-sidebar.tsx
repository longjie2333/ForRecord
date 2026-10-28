import { PanelLeftCloseIcon, PanelLeft } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Sidebar, type SidebarProps } from './sidebar.tsx'
import { useHoverActive } from '@/components/motion/hover-active.ts'
import { IconSwap } from '@/components/motion/icon-swap.tsx'

export const DesktopSidebar = ({
  collapsed,
  onCollapse,
  ...sidebar
}: SidebarProps & { collapsed: boolean; onCollapse: () => void }) => {
  const { active, hoverProps } = useHoverActive()
  return (
    <aside
      className="desktop-sidebar"
      aria-label="笔记侧边栏"
      data-collapsed={collapsed || undefined}
      inert={collapsed}
    >
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
            {...hoverProps}
          >
            <IconSwap
              active={active}
              onIcon={<PanelLeftCloseIcon aria-hidden="true" />}
              offIcon={<PanelLeft aria-hidden="true" />}
              animation="slide"
            />
          </Button>
        }
      />
    </aside>
  )
}
