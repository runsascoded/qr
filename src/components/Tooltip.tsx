import { cloneElement, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  arrow, autoUpdate, flip, FloatingArrow, FloatingPortal, offset, shift,
  useClick, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole,
} from '@floating-ui/react'
import './Tooltip.sass'

// A floating-ui tooltip (hover + focus on desktop; opt into tap-to-toggle via
// `openOnClick` for touch, where there's no hover). The trigger is the single
// child element — its own handlers are composed, not clobbered, so it can still
// do its own onClick (e.g. an icon button that copies).
export default function Tooltip({ label, openOnClick = false, children }: {
  label: ReactNode
  openOnClick?: boolean
  children: ReactElement<Record<string, unknown>>
}) {
  const [open, setOpen] = useState(false)
  const arrowRef = useRef<SVGSVGElement>(null)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    // floating-ui's arrow() reads the ref during positioning (not render), so
    // this is safe despite the react-hooks/refs lint.
    // eslint-disable-next-line react-hooks/refs
    middleware: [offset(6), flip(), shift({ padding: 6 }), arrow({ element: arrowRef })],
    whileElementsMounted: autoUpdate,
  })
  const hover = useHover(context, { move: false })
  const focus = useFocus(context)
  const click = useClick(context, { enabled: openOnClick })
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'tooltip' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role])

  return (
    <>
      {cloneElement(children, { ref: refs.setReference, ...getReferenceProps(children.props) })}
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} className="rtt" style={floatingStyles} {...getFloatingProps()}>
            {label}
            <FloatingArrow ref={arrowRef} context={context} className="rtt-arrow" strokeWidth={1} />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
