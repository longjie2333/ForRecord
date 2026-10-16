const minWidth = 220
const maxWidth = 480
const defaultWidth = 304
const step = 16

const clamp = (width: number) => Math.min(maxWidth, Math.max(minWidth, width))

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
    aria-valuemin={minWidth}
    aria-valuemax={maxWidth}
    aria-valuenow={width}
    tabIndex={0}
    onDoubleClick={() => onCommit(defaultWidth)}
    onKeyDown={(event) => {
      const sizes: Record<string, number> = {
        ArrowLeft: width - step,
        ArrowRight: width + step,
        Home: minWidth,
        End: maxWidth,
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
