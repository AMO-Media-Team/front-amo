/**
 * auth-js entrega el QR del TOTP como `data:image/svg+xml;utf-8,<svg…>` sin
 * codificar: caracteres como `#` o `%` cortarían la URL en `<img src>`. Se
 * normaliza a una URL de datos SVG bien codificada.
 */
const PREFIJO_SVG = /^data:image\/svg\+xml[^,]*,/i
// Admite la declaración XML y comentarios previos (Supabase los incluye).
const DOCUMENTO_SVG =
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i

export function urlDeDatosSvg(qr: string): string {
  const coincidencia = PREFIJO_SVG.exec(qr)
  const svg = coincidencia ? qr.slice(coincidencia[0].length) : qr
  if (!DOCUMENTO_SVG.test(svg)) {
    throw new Error("El código QR no es un SVG.")
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
