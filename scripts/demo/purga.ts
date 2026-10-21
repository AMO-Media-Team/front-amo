/**
 * Reglas puras de la purga de datos demo (docs/modelo-datos.md §10.5): el SQL
 * del paso de base de datos y el mapa «carpeta de Storage → entidad dueña»
 * (§8) con el que `purgar.ts` decide qué objetos pertenecen a datos demo.
 */

/** Entidad a la que pertenece una carpeta `{tipo}/{id}/…` de Storage. */
export type DuenoStorage =
  | "perfil"
  | "medio"
  | "anunciante"
  | "oferta"
  | "asignacion"
  | "disputa"
  | "liquidacion"
  | "factura"
  | "documento_soporte"
  | "dispersion"

/** Primer segmento de la ruta de cada bucket y la entidad cuyo id va en el segundo. */
export const CARPETAS_STORAGE: Readonly<
  Record<string, Readonly<Record<string, DuenoStorage>>>
> = {
  avatares: { perfil: "perfil", anunciante: "anunciante", medio: "medio" },
  documentos: { medio: "medio", anunciante: "anunciante" },
  creativos: { oferta: "oferta" },
  evidencias: { asignacion: "asignacion", disputa: "disputa" },
  soportes: {
    liquidacion: "liquidacion",
    factura: "factura",
    pago: "factura",
    documento_soporte: "documento_soporte",
    dispersion: "dispersion",
  },
}

/** Capturas compartidas de la demo (`evidencias/muestras/…`): no tienen dueño y siempre se borran. */
export const MUESTRAS_DEMO = {
  bucket: "evidencias",
  carpeta: "muestras",
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuid(texto: string): boolean {
  return UUID.test(texto)
}

/** Parte la lista en trozos de `tamano` elementos como máximo. */
export function enLotes<T>(elementos: readonly T[], tamano: number): T[][] {
  if (!Number.isInteger(tamano) || tamano < 1) {
    throw new Error(`Tamaño de lote inválido: ${tamano}.`)
  }
  const lotes: T[][] = []
  for (let inicio = 0; inicio < elementos.length; inicio += tamano) {
    lotes.push(elementos.slice(inicio, inicio + tamano))
  }
  return lotes
}

/**
 * Transacción de purga. Solo funciona por MCP `execute_sql` (único canal con
 * `session_user = postgres`): por PostgREST los interruptores `amo.*` no
 * tienen efecto y `private.purgar_demo()` responde `AMO_NO_AUTORIZADO`.
 */
export function sqlPurga(): string {
  return [
    "begin;",
    "set local amo.modo_carga = 'on';",
    "set local amo.purga = 'on';",
    "set local statement_timeout = '110s';",
    "select private.purgar_demo();",
    "commit;",
    "",
  ].join("\n")
}
