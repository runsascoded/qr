import { useEffect } from 'react'

// First image file in a paste event's clipboard, else null.
export function clipboardImage(e: ClipboardEvent): File | null {
  for (const item of e.clipboardData?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

// True if the paste landed in something the browser would insert into itself.
export function isEditableTarget(e: Event): boolean {
  const el = e.target
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  return (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && !el.readOnly && !el.disabled
}

// Page-wide paste handling. Images always go to `onImage` (a textarea can't
// take one anyway); text goes to `onText` only when pasted outside an editable
// field, so normal typing/pasting into inputs is untouched.
export function usePagePaste({ onImage, onText }: {
  onImage?: (file: File) => void
  onText?: (text: string) => void
}) {
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const img = clipboardImage(e)
      if (img) {
        if (!onImage) return
        e.preventDefault()
        onImage(img)
        return
      }
      if (!onText || isEditableTarget(e)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return
      e.preventDefault()
      onText(text)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [onImage, onText])
}
