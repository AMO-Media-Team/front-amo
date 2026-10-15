/**
 * Formato de cifras según la preferencia de la persona. Se formatea siempre
 * con es-CO (símbolo `$`, espacios duros, abreviaturas en español) y, para
 * «internacional», solo se intercambian los separadores de miles y decimales:
 * `$ 1.234.567,5` → `$ 1,234,567.5`. Módulo puro.
 */
import { LOCALE, OPCIONES_NUMERO } from "@/lib/format"

import type { FormatoNumeros } from "./preferencias"

const SIN_VALOR = "—"

export interface FormateadorNumeros {
  numero: (valor: number | null | undefined, decimales?: number) => string
  moneda: (valor: number | null | undefined) => string
  porcentaje: (
    fraccion: number | null | undefined,
    decimales?: number
  ) => string
}

const cache = new Map<string, Intl.NumberFormat>()

function formateador(opciones: Intl.NumberFormatOptions): Intl.NumberFormat {
  const clave = JSON.stringify(opciones)
  let formato = cache.get(clave)
  if (!formato) {
    formato = new Intl.NumberFormat(LOCALE, opciones)
    cache.set(clave, formato)
  }
  return formato
}

function aplicarSeparadores(
  formato: Intl.NumberFormat,
  valor: number,
  preferencia: FormatoNumeros
): string {
  if (preferencia === "colombia") return formato.format(valor)
  return formato
    .formatToParts(valor)
    .map((parte) => {
      if (parte.type === "group") return ","
      if (parte.type === "decimal") return "."
      return parte.value
    })
    .join("")
}

function esNumero(valor: number | null | undefined): valor is number {
  return typeof valor === "number" && Number.isFinite(valor)
}

export function crearFormateadorNumeros(
  preferencia: FormatoNumeros
): FormateadorNumeros {
  const con = (
    valor: number | null | undefined,
    opciones: Intl.NumberFormatOptions
  ) =>
    esNumero(valor)
      ? aplicarSeparadores(formateador(opciones), valor, preferencia)
      : SIN_VALOR

  return {
    numero: (valor, decimales = 0) =>
      con(valor, { maximumFractionDigits: decimales }),
    moneda: (valor) => con(valor, OPCIONES_NUMERO.cop),
    porcentaje: (fraccion, decimales = 1) =>
      con(fraccion, {
        style: "percent",
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }),
  }
}
