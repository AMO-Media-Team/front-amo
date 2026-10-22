/**
 * Qué documentos se le piden al medio (módulo puro). Replica la regla de la
 * BD (`private.validar_verificacion_medio`, docs/modelo-datos.md §3.4): los
 * `documentos_requeridos` del nivel más el certificado del medio de pago que
 * declaró (`CERT_BANCARIA` o `CERT_BILLETERA`). Solo decide qué se muestra:
 * quien verifica y la BD vuelven a exigirlo todo.
 */
import { ORDEN_DOCUMENTOS } from "./catalogo"
import type {
  DocumentoCargado,
  MedioDocumentos,
  MetodoPago,
  NivelVerificacion,
  PerfilTributario,
  RequisitosNivel,
  TipoDocumentoMedio,
} from "./tipos"

export const NIVELES: readonly NivelVerificacion[] = [1, 2, 3]

export function esNivel(valor: unknown): valor is NivelVerificacion {
  return (NIVELES as readonly unknown[]).includes(valor)
}

/** Documentos que nunca son obligatorios para verificar pero conviene tener. */
const SIEMPRE_OPCIONALES: readonly TipoDocumentoMedio[] = ["SEG_SOCIAL"]

const CERTIFICADO_DE_PAGO: Readonly<Record<MetodoPago, TipoDocumentoMedio>> = {
  BANCARIO: "CERT_BANCARIA",
  BILLETERA: "CERT_BILLETERA",
}

export function certificadoDePago(
  metodo: MetodoPago | null
): TipoDocumentoMedio | null {
  return metodo ? CERTIFICADO_DE_PAGO[metodo] : null
}

function enOrden(tipos: Iterable<TipoDocumentoMedio>): TipoDocumentoMedio[] {
  const elegidos = new Set(tipos)
  return ORDEN_DOCUMENTOS.filter((tipo) => elegidos.has(tipo))
}

/**
 * Documentos que exige el nivel con el medio de pago declarado. Sin medio de
 * pago no se sabe qué certificado pedir: la interfaz pide primero los datos
 * de pago (`pagoPendiente`).
 */
export function documentosExigidos(
  requisitos: RequisitosNivel | undefined,
  metodoPago: MetodoPago | null
): TipoDocumentoMedio[] {
  const certificado = certificadoDePago(metodoPago)
  return enOrden([
    ...(requisitos?.documentos ?? []),
    ...(certificado ? [certificado] : []),
  ])
}

/**
 * Los que no exige el nivel pero se pueden cargar: la seguridad social
 * siempre, y cualquier tipo que el medio ya haya cargado (nada de lo que subió
 * desaparece de la vista al cambiar de nivel).
 */
export function documentosOpcionales(
  exigidos: readonly TipoDocumentoMedio[],
  documentos: readonly Pick<DocumentoCargado, "tipo">[]
): TipoDocumentoMedio[] {
  const fuera = new Set(exigidos)
  return enOrden(
    [...SIEMPRE_OPCIONALES, ...documentos.map((d) => d.tipo)].filter(
      (tipo) => !fuera.has(tipo)
    )
  )
}

export type MotivoNivel =
  | "verificado"
  | "persona-juridica"
  | "obligaciones-tributarias"
  | "inicial"

export interface NivelSugerido {
  nivel: NivelVerificacion
  motivo: MotivoNivel
}

/**
 * Nivel con que se abre la lista. Un medio verificado ve el suyo (los
 * documentos que debe mantener vigentes). Uno en alta, el que corresponde a
 * lo que declaró en sus datos de pago: con NIT es una persona jurídica (nivel
 * 3); quien declara renta, factura o es responsable de IVA ya tiene RUT y
 * puede aspirar al nivel 2; los demás empiezan por el 1.
 */
export function nivelSugerido(
  medio: Pick<MedioDocumentos, "estado" | "nivel">,
  perfil: PerfilTributario
): NivelSugerido {
  if (medio.estado !== "PENDIENTE" && medio.estado !== "RECHAZADO") {
    if (esNivel(medio.nivel)) return { nivel: medio.nivel, motivo: "verificado" }
  }
  if (perfil.tipoDocumento === "NIT") {
    return { nivel: 3, motivo: "persona-juridica" }
  }
  if (perfil.esDeclarante || perfil.obligadoFacturar || perfil.responsableIva) {
    return { nivel: 2, motivo: "obligaciones-tributarias" }
  }
  return { nivel: 1, motivo: "inicial" }
}

/** Por qué se sugiere ese nivel, en una frase para la persona. */
export function explicacionNivel({ nivel, motivo }: NivelSugerido): string {
  switch (motivo) {
    case "verificado":
      return nivel < 3
        ? "Es tu nivel actual: mantén estos documentos vigentes. Para subir de nivel, elige el siguiente y carga lo que falte."
        : "Es tu nivel actual, el más alto: mantén estos documentos vigentes."
    case "persona-juridica":
      return "Registraste un NIT en tus datos de pago: como empresa, te corresponde el nivel 3."
    case "obligaciones-tributarias":
      return "Por lo que declaraste en tus datos de pago ya tienes RUT: con él puedes aspirar al nivel 2 y a un tope anual mayor."
    case "inicial":
      return "Es el nivel de entrada para personas naturales. Cuando tengas RUT, puedes aspirar al nivel 2."
  }
}
