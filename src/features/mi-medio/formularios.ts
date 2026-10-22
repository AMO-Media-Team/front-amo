/**
 * Valores iniciales de los formularios de «Mi medio» a partir de lo guardado
 * (módulo puro). Van tal como se escriben: los porcentajes como texto en
 * es-CO («12,5») y los números de documento y de cuenta SIEMPRE vacíos, porque
 * la interfaz nunca vuelve a mostrarlos (para cambiarlos se escriben de nuevo).
 */
import { numeroAEntrada } from "@/features/configuracion/numeros"

import type { EntradaDatosPago, EntradaPerfilMedio } from "./schemas"
import type { PagoResumen, PerfilEditable } from "./tipos"

export function valoresPerfil({
  medio,
  categoriaIds,
  audiencia,
}: PerfilEditable): EntradaPerfilMedio {
  return {
    actualizadoAt: medio.actualizadoAt,
    nombre: medio.nombre,
    tipo: medio.tipo,
    municipioCodigo: medio.municipioCodigo,
    descripcionAudiencia: medio.descripcionAudiencia ?? "",
    categoriaIds: [...categoriaIds],
    audiencia: audiencia.map((fila) => ({
      paisIso2: fila.paisIso2,
      porcentaje: numeroAEntrada(fila.porcentaje),
    })),
  }
}

export function valoresPago(resumen: PagoResumen): EntradaDatosPago {
  return {
    titularNombre: resumen.titularNombre ?? "",
    tipoDocumento: resumen.tipoDocumento ?? "",
    numeroDocumento: "",
    cambiarCuenta: false,
    metodoPago: resumen.metodoPago ?? "",
    banco: "",
    bancoOtro: "",
    tipoCuenta: "",
    numeroCuenta: "",
    billetera: "",
    billeteraOtra: "",
    numeroBilletera: "",
    esDeclarante: resumen.esDeclarante,
    obligadoFacturar: resumen.obligadoFacturar,
    responsableIva: resumen.responsableIva,
  }
}

/**
 * Los campos de la cuenta vuelven a vacío (al conservar la registrada o
 * cambiar de método): nada de lo que se escribió a medias se envía.
 */
export const CUENTA_VACIA = {
  banco: "",
  bancoOtro: "",
  tipoCuenta: "",
  numeroCuenta: "",
  billetera: "",
  billeteraOtra: "",
  numeroBilletera: "",
} as const satisfies Partial<EntradaDatosPago>
