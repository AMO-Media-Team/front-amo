/**
 * Muestra un correo sin exponerlo completo (`an•••@gmail.com`): suficiente
 * para que la persona reconozca su cuenta en una pantalla que puede quedar
 * abierta o compartirse.
 */
export function enmascararEmail(
  email: string | null | undefined
): string | null {
  const limpio = email?.trim()
  if (!limpio) return null
  const arroba = limpio.lastIndexOf("@")
  if (arroba <= 0 || arroba === limpio.length - 1) return null

  const local = limpio.slice(0, arroba)
  const dominio = limpio.slice(arroba + 1)
  const visibles = local.length <= 3 ? 1 : 2
  return `${local.slice(0, visibles)}•••@${dominio}`
}
