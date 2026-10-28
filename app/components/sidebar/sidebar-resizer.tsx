import { clampSidebarWidth as clamp, sidebarWidth } from '../../../shared/posts.ts'

const step = 16

export const SidebarResizer = ({
  width,
  resizing,
  onPreview,
  onResizingChange,
  onCommit,
}: {
  width: number
  resizing: boolean
  onPreview: (width: number) => void
  onResizingChange: (resizing: boolean) => void
  onCommit: (width: number) => void
}) => (
  <div
    className="sidebar-resizer"
    role="separator"
    aria-label="调整侧边栏宽度"
    aria-orientation="vertical"
    aria-valuemin={sidebarWidth.min}
    aria-valuemax={sidebarWidth.max}
    aria-valuenow={width}
    tabIndex={0}
    onDoubleClick={() => onCommit(sidebarWidth.initial)}
    onKeyDown={(event) => {
      const sizes: Record<string, number> = {
        ArrowLeft: width - step,
        ArrowRight: width + step,
        Home: sidebarWidth.min,
        End: sidebarWidth.max,
      }
      if (event.key in sizes) {
        event.preventDefault()
        onCommit(clamp(sizes[event.key]))
      }
    }}
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      onResizingChange(true)
    }}
    onPointerMove={(event) => {
      if (resizing) onPreview(clamp(Math.min(window.innerWidth / 2, event.clientX)))
    }}
    onPointerUp={() => {
      onResizingChange(false)
      onCommit(width)
    }}
    onPointerCancel={() => onResizingChange(false)}
  />
)
