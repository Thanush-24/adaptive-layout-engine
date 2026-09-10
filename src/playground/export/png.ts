import { toPng } from 'html-to-image'
import { download } from './snippet'

/**
 * Rasterize a DOM node (a rendered ad frame) to a PNG at true device pixels.
 * `node` should be the unscaled frame element; pass the surface's real size.
 */
export async function exportNodeToPng(
  node: HTMLElement,
  size: { w: number; h: number },
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(node, {
    width: size.w,
    height: size.h,
    pixelRatio: 1,
    style: { transform: 'none', margin: '0' },
    cacheBust: true,
  })
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  void download
}
