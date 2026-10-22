/**
 * Del resumen leído de la BD a lo que pintan «Mi medio» y el inicio del medio
 * en alta (módulo puro): situación, pasos de la lista de alta, progreso y si
 * se puede enviar a verificación.
 */
import {
  type DatosAlta,
  enAlta,
  type PasoAlta,
  pasosAlta,
  pasosPorCompletar,
  type ProgresoAlta,
  progresoAlta,
  puedeEnviar,
  type SituacionMedio,
  situacionMedio,
} from "./alta"
import { nivelPorNumero } from "./nivel"
import {
  documentosExigidos,
  type EstadoRequisito,
  estadoRequisitos,
  nivelObjetivo,
} from "./requisitos"
import type { NivelVerificacion, ResumenMiMedio } from "./tipos"

export interface VistaAlta {
  situacion: SituacionMedio
  pasos: PasoAlta[]
  progreso: ProgresoAlta
  /** Obligatorios sin completar (lo que impide enviar). */
  porCompletar: PasoAlta[]
  puedeEnviar: boolean
  /**
   * Nivel cuyos documentos revisa la lista: el 1 durante el alta y el actual
   * después (subir de nivel se ve en «Nivel»).
   */
  nivelDocumentos: { numero: number; nivel: NivelVerificacion | null }
  requisitos: EstadoRequisito[]
  faltaMetodoPago: boolean
}

export function datosAlta(
  resumen: ResumenMiMedio,
  objetivo: number
): DatosAlta & { requisitos: EstadoRequisito[] } {
  const nivel = nivelPorNumero(resumen.niveles, objetivo)
  const exigidos = documentosExigidos(
    nivel?.documentosRequeridos ?? [],
    resumen.pago.metodoPago
  )
  const requisitos = estadoRequisitos(
    exigidos.tipos,
    resumen.documentos,
    resumen.hoy
  )
  return {
    requisitos,
    perfil: {
      tieneDescripcion: Boolean(resumen.medio.descripcionAudiencia?.trim()),
      categorias: resumen.categorias,
      paisesAudiencia: resumen.paisesAudiencia,
    },
    documentos: {
      nivel: objetivo,
      requisitos,
      faltaMetodoPago: exigidos.faltaMetodoPago,
    },
    pago: {
      titular: Boolean(resumen.pago.titularNombre),
      documentoIdentidad:
        resumen.pago.documentoRegistrado && resumen.pago.tipoDocumento !== null,
      cuentaPago: resumen.pago.cuentaRegistrada,
    },
    cuentas: {
      registradas: resumen.cuentas.length,
      verificadas: resumen.cuentas.filter((c) => c.verificada).length,
      enRevision: resumen.cuentas.filter((c) => !c.verificada && c.enRevision)
        .length,
      rechazadas: resumen.cuentas.filter(
        (c) => !c.verificada && !c.enRevision && c.rechazada
      ).length,
    },
    terminos: { pendientes: resumen.terminosPendientes },
  }
}

export function vistaAlta(resumen: ResumenMiMedio): VistaAlta {
  const { medio } = resumen
  const situacion = situacionMedio({
    estado: medio.estado,
    nivel: medio.nivel,
    enviadoVerificacionAt: medio.enviadoVerificacionAt,
    motivoEstado: medio.motivoEstado,
  })
  const numero = enAlta(situacion)
    ? nivelObjetivo(medio.estado, medio.nivel)
    : Math.max(1, medio.nivel)
  const datos = datosAlta(resumen, numero)
  const pasos = pasosAlta(datos)
  return {
    situacion,
    pasos,
    progreso: progresoAlta(pasos),
    porCompletar: pasosPorCompletar(pasos),
    puedeEnviar: puedeEnviar(situacion, pasos),
    nivelDocumentos: { numero, nivel: nivelPorNumero(resumen.niveles, numero) },
    requisitos: datos.requisitos,
    faltaMetodoPago: datos.documentos.faltaMetodoPago,
  }
}
