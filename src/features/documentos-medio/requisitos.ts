/**
 * Qué documentos se le piden al medio (módulo puro). Replica la regla de la
 * BD (`private.validar_verificacion_medio`, docs/modelo-datos.md §3.4): los
 * `documentos_requeridos` del nivel más el certificado del medio de pago que
 * declaró (`CERT_BANCARIA` o `CERT_BILLETERA`). Solo decide qué se muestra:
 * quien verifica y la BD vuelven a exigirlo todo.
 */
import { certificadoDePago } from "@/features/mi-medio/requisitos"

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

/**
 * El certificado según el medio de pago es la misma regla que cuenta la lista
 * de alta de «Mi medio»: una sola fuente para que ambas pantallas coincidan.
 */
export { certificadoDePago }

export const NIVELES: readonly NivelVerificacion[] = [1, 2, 3]

export function esNivel(valor: unknown): valor is NivelVerificacion {
  return (NIVELES as readonly unknown[]).includes(valor)
}

/** Documentos que nunca son obligatorios para verificar pero conviene tener. */
const SIEMPRE_OPCIONALES: readonly TipoDocumentoMedio[] = ["SEG_SOCIAL"]

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

/** Estados en que el medio conserva un nivel verificado (suspendido no lo pierde). */
function conservaNivel(medio: Pick<MedioDocumentos, "estado">): boolean {
  return medio.estado === "VERIFICADO" || medio.estado === "SUSPENDIDO"
}

/** Nivel verificado del medio; `null` mientras esté en alta (o sin nivel). */
export function nivelVerificado(
  medio: Pick<MedioDocumentos, "estado" | "nivel">
): NivelVerificacion | null {
  return conservaNivel(medio) && esNivel(medio.nivel) ? medio.nivel : null
}

/** El nivel con que se verifica a todo medio nuevo (el que lo habilita). */
export const NIVEL_DE_ENTRADA: NivelVerificacion = 1

/**
 * Nivel con que se abre la lista: el verificado del medio (los documentos que
 * debe mantener vigentes) o, en alta, el de entrada. Es el mismo que cuenta la
 * lista de alta de «Mi medio», así que ambas pantallas dicen lo mismo.
 */
export function nivelInicial(
  medio: Pick<MedioDocumentos, "estado" | "nivel">
): NivelVerificacion {
  return nivelVerificado(medio) ?? NIVEL_DE_ENTRADA
}

export type MotivoRecomendacion =
  "persona-juridica" | "obligaciones-tributarias"

export interface Recomendacion {
  nivel: NivelVerificacion
  motivo: MotivoRecomendacion
}

/**
 * Nivel que corresponde a lo que el medio declaró en sus datos de pago, si es
 * mayor que `desde`: con NIT es una persona jurídica (nivel 3); quien declara
 * renta, factura o es responsable de IVA ya tiene RUT (nivel 2). Es solo una
 * sugerencia: el nivel lo decide el equipo AMO al verificar.
 */
export function nivelRecomendado(
  perfil: PerfilTributario,
  desde: NivelVerificacion
): Recomendacion | null {
  const recomendacion: Recomendacion | null =
    perfil.tipoDocumento === "NIT"
      ? { nivel: 3, motivo: "persona-juridica" }
      : perfil.esDeclarante || perfil.obligadoFacturar || perfil.responsableIva
        ? { nivel: 2, motivo: "obligaciones-tributarias" }
        : null
  return recomendacion && recomendacion.nivel > desde ? recomendacion : null
}

/** Por qué se recomienda ese nivel, en una frase para la persona. */
export function explicacionRecomendacion({
  nivel,
  motivo,
}: Recomendacion): string {
  switch (motivo) {
    case "persona-juridica":
      return `Registraste un NIT en tus datos de pago: como empresa, te corresponde el nivel ${nivel}. Puedes cargar desde ya sus documentos.`
    case "obligaciones-tributarias":
      return `Por lo que declaraste en tus datos de pago ya tienes RUT: con él puedes aspirar al nivel ${nivel} y a un tope anual mayor.`
  }
}
