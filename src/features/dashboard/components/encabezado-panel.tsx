import type { ReactNode } from "react"

import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"

import { fechaDeHoy, saludar } from "../panel"
import { ControlesPeriodo } from "./controles-periodo"

/**
 * Saludo contextual ("Buenos días, Ana", hora de Bogotá), la fecha de hoy y
 * el periodo consultado con su comparativo.
 */
export function EncabezadoPanel({
  nombre,
  ahora,
  descripcion,
  conPeriodo = true,
}: {
  nombre: string
  ahora: Date
  descripcion: ReactNode
  conPeriodo?: boolean
}) {
  return (
    <EncabezadoPagina
      antetitulo={fechaDeHoy(ahora)}
      titulo={saludar(nombre, ahora)}
      descripcion={descripcion}
      acciones={conPeriodo ? <ControlesPeriodo /> : null}
      className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
    />
  )
}
