/**
 * Valores iniciales y reglas del formulario de campaña (módulo puro). Van tal
 * como se escriben: el presupuesto como texto en es-CO («25.000.000»).
 */
import { numeroAEntrada } from "@/features/configuracion/numeros"

import { limitesFechas, presupuestoMinimo } from "./reglas"
import type {
  EntradaEditarCampana,
  EntradaNuevaCampana,
  ReglasCampana,
} from "./schemas"
import type { MiCampana, OfertaDeCampana } from "./tipos"

export const VALORES_NUEVA_CAMPANA: EntradaNuevaCampana = {
  nombre: "",
  marca: "",
  objetivo: "",
  fechaInicio: "",
  fechaFin: "",
  presupuesto: "",
}

export function valoresEdicion(campana: MiCampana): EntradaEditarCampana {
  return {
    campanaId: campana.id,
    actualizadoAt: campana.actualizadaAt,
    nombre: campana.nombre,
    marca: campana.marca,
    objetivo: campana.objetivo ?? "",
    fechaInicio: campana.fechaInicio,
    fechaFin: campana.fechaFin,
    presupuesto: numeroAEntrada(campana.presupuestoTotal),
  }
}

/** Reglas de una campaña nueva: solo el día de hoy. */
export function reglasNuevaCampana(hoy: string): ReglasCampana {
  return { hoy, presupuestoMinimo: 0 }
}

/** Reglas de la edición: el piso del presupuesto y las ventanas de las ofertas vivas. */
export function reglasEdicion(
  campana: Pick<
    MiCampana,
    | "fechaInicio"
    | "fechaFin"
    | "presupuestoTotal"
    | "presupuestoComprometido"
    | "disponible"
  >,
  ofertas: readonly Pick<
    OfertaDeCampana,
    "estado" | "ventanaInicio" | "ventanaFin"
  >[],
  hoy: string
): ReglasCampana {
  return {
    hoy,
    presupuestoMinimo: presupuestoMinimo(campana),
    fechaInicioActual: campana.fechaInicio,
    fechaFinActual: campana.fechaFin,
    ...limitesFechas(ofertas),
  }
}
