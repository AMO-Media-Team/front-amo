/**
 * Cambios locales sobre lo que pinta el panel (módulo puro): cada acción
 * devuelve la versión o el archivo guardado y el navegador lo funde en la
 * caché sin volver a pedir todo. La versión editable de una oferta sin
 * publicar es también la vigente.
 */
import type { ArchivoCreativo, DatosCreativo, VersionCreativo } from "./tipos"

function porOrden(a: ArchivoCreativo, b: ArchivoCreativo): number {
  return a.orden - b.orden
}

/** La versión editable cambió (textos, tipo o archivos). */
export function conEditable(
  datos: DatosCreativo,
  version: VersionCreativo
): DatosCreativo {
  return {
    ...datos,
    editable: version,
    vigente: version.vigente ? version : datos.vigente,
  }
}

function conArchivosEditables(
  datos: DatosCreativo,
  cambiar: (archivos: ArchivoCreativo[]) => ArchivoCreativo[]
): DatosCreativo {
  const editable = datos.editable
  if (!editable) return datos
  return conEditable(datos, {
    ...editable,
    archivos: cambiar(editable.archivos),
  })
}

/** Archivo recién confirmado (idempotente: una confirmación repetida no lo duplica). */
export function conArchivo(
  datos: DatosCreativo,
  archivo: ArchivoCreativo
): DatosCreativo {
  return conArchivosEditables(datos, (archivos) =>
    archivos.some((actual) => actual.id === archivo.id)
      ? archivos
      : [...archivos, archivo].sort(porOrden)
  )
}

export function sinArchivo(
  datos: DatosCreativo,
  archivoId: string
): DatosCreativo {
  return conArchivosEditables(datos, (archivos) =>
    archivos.filter((archivo) => archivo.id !== archivoId)
  )
}

/** Orden optimista mientras el servidor lo guarda (`ids` de primero a último). */
export function conOrden(
  datos: DatosCreativo,
  ids: readonly string[]
): DatosCreativo {
  return conArchivosEditables(datos, (archivos) => {
    const posicion = new Map(ids.map((id, indice) => [id, indice]))
    return [...archivos]
      .sort(
        (a, b) =>
          (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      )
      .map((archivo, indice) => ({ ...archivo, orden: indice }))
  })
}

/** Ids tras mover el archivo de `desde` a `hasta` (posiciones en la lista). */
export function moverId(
  ids: readonly string[],
  desde: number,
  hasta: number
): string[] {
  if (
    desde === hasta ||
    desde < 0 ||
    hasta < 0 ||
    desde >= ids.length ||
    hasta >= ids.length
  ) {
    return [...ids]
  }
  const resultado = [...ids]
  const [movido] = resultado.splice(desde, 1)
  resultado.splice(hasta, 0, movido)
  return resultado
}

/**
 * Orden con que se registra cada archivo elegido: a continuación de los ya
 * cargados y de los que siguen en cola, en el orden en que se eligieron.
 */
export function ordenesSiguientes(
  cargados: readonly Pick<ArchivoCreativo, "orden">[],
  enCola: number,
  cantidad: number,
  maximo: number
): number[] {
  const base =
    cargados.reduce((mayor, archivo) => Math.max(mayor, archivo.orden), -1) +
    1 +
    enCola
  return Array.from({ length: cantidad }, (_, indice) =>
    Math.min(base + indice, maximo)
  )
}
