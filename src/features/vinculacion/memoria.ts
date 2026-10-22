/**
 * Memoria con vigencia para datos públicos que cambian poco (el territorio
 * activo y la política de datos del formulario `/vincular`): una página
 * pública no debe consultar la BD en cada visita. Vive en el proceso del
 * servidor; un fallo no se memoriza. Módulo puro (el reloj se inyecta).
 */
export function conVigencia<T>(
  cargar: () => Promise<T>,
  vigenciaMs: number,
  ahora: () => number = Date.now
): () => Promise<T> {
  let guardado: { promesa: Promise<T>; vence: number } | null = null

  return () => {
    const instante = ahora()
    if (guardado && instante < guardado.vence) return guardado.promesa
    const promesa = cargar()
    const actual = { promesa, vence: instante + vigenciaMs }
    guardado = actual
    // Si falla, la siguiente visita vuelve a intentarlo (sin pisar una carga más nueva).
    promesa.catch(() => {
      if (guardado === actual) guardado = null
    })
    return promesa
  }
}
