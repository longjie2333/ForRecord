import { useMemo, useRef } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Maximize2Icon, MinusIcon, PlusIcon, XIcon } from 'lucide-react'
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  useTransformEffect,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'

// mermaid writes the diagram into the article at column width and caps it with an
// inline `max-width`. That cap would also cap the canvas, so the clone takes its box
// from the viewBox instead: the canvas then owns every pixel of scale.
const toCanvasHtml = (svg: SVGSVGElement) => {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const box = svg.viewBox.baseVal
  clone.removeAttribute('style')
  if (box.width > 0 && box.height > 0) {
    clone.setAttribute('width', String(box.width))
    clone.setAttribute('height', String(box.height))
  }
  return clone.outerHTML
}

// Fitting is not what the library does on its own: `fitOnInit` would blow a small
// diagram up to `maxScale` to fill the window. A diagram opens at the size the
// article shows it, or smaller when it does not fit, and the reader zooms from there.
const fitOnOpen = (ref: ReactZoomPanPinchRef) => {
  requestAnimationFrame(() => {
    if (ref.instance.contentComponent?.offsetWidth) void ref.fitToView({ maxScale: 1 })
  })
}

const ViewerControls = () => {
  const { zoomIn, zoomOut, fitToView } = useControls()
  const readout = useRef<HTMLSpanElement>(null)
  // A wheel gesture transforms many times per second: writing the readout directly
  // keeps it off the render path, which would otherwise diff the diagram each frame.
  useTransformEffect(({ state }) => {
    if (readout.current) readout.current.textContent = `${Math.round(state.scale * 100)}%`
  })
  const button =
    'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover/90 p-1 text-popover-foreground shadow-lg/5 backdrop-blur">
      <button type="button" className={button} aria-label="缩小" onClick={() => void zoomOut()}>
        <MinusIcon aria-hidden="true" className="size-4" />
      </button>
      <span ref={readout} className="min-w-11 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
        100%
      </span>
      <button type="button" className={button} aria-label="放大" onClick={() => void zoomIn()}>
        <PlusIcon aria-hidden="true" className="size-4" />
      </button>
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
      <button
        type="button"
        className={button}
        aria-label="适应窗口"
        onClick={() => void fitToView({ maxScale: 1, animationTime: 200 })}
      >
        <Maximize2Icon aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

export const MermaidViewer = ({ svg, onClose }: { svg: SVGSVGElement | null; onClose: () => void }) => {
  const html = useMemo(() => (svg ? toCanvasHtml(svg) : null), [svg])
  return (
    <DialogPrimitive.Root
      open={svg !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        {/* The canvas is opaque: a diagram read against blurred page text is harder
            to follow than the same diagram on a plain surface. */}
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          aria-label="图表全屏查看"
          className="fixed inset-0 z-50 overflow-hidden outline-none transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          {html !== null && (
            <>
              <TransformWrapper
                minScale={0.1}
                maxScale={8}
                limitToBounds
                // Inertia after a drag overshoots the diagram past the pointer; a canvas
                // wants to track the hand exactly.
                panning={{ velocityDisabled: true }}
                // Smooth zoom multiplies the step by the wheel delta, whose unit depends
                // on the device; a fixed step per event keeps a trackpad and a wheel
                // close enough to feel the same.
                smooth={false}
                wheel={{ step: 0.1 }}
                doubleClick={{ mode: 'zoomIn', step: 0.7 }}
                onInit={fitOnOpen}
              >
                <TransformComponent
                  // The library sizes its wrapper to the content; here the canvas is
                  // the viewport, so the box has to come from the popup instead.
                  wrapperClass="size-full! cursor-grab touch-none active:cursor-grabbing"
                  contentClass="select-none"
                >
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </TransformComponent>
                <ViewerControls />
              </TransformWrapper>
              <DialogPrimitive.Close
                aria-label="关闭"
                className="absolute end-4 top-4 grid size-9 place-items-center rounded-lg border bg-popover/90 text-muted-foreground shadow-lg/5 backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </DialogPrimitive.Close>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
