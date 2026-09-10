import { renderToHtml } from '../../render/html'
import type { Creative, ResolvedLayout } from '@engine/types'

/** Standalone HTML document for a resolved layout — no JS, no dependencies. */
export function toStandaloneHtml(layout: ResolvedLayout, creative: Creative): string {
  return renderToHtml(layout, { brandColor: creative.brandColor, document: true })
}

export function download(filename: string, text: string, mime = 'text/html'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
