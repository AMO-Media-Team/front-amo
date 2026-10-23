"use client"

import { Ban, Check, MapPin, Search, X } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { LIMITES_OFERTA } from "../schemas"
import type { MedioExcluido } from "../tipos"
import { useBusquedaMedios } from "./consultas"

export interface PropsBuscadorExclusiones {
  valor: readonly MedioExcluido[]
  onCambio: (valor: MedioExcluido[]) => void
  deshabilitado?: boolean
  /** Id del mensaje de error del campo. */
  describedBy?: string
}

/** Texto del estado de la búsqueda (también para lectores de pantalla). */
export function estadoBusqueda({
  texto,
  consultado,
  buscando,
  error,
  resultados,
}: {
  texto: string
  consultado: string
  buscando: boolean
  error: string | null
  resultados: number | null
}): string {
  const limpio = texto.trim()
  if (limpio.length === 0) return ""
  if (limpio.length < LIMITES_OFERTA.busquedaMin) {
    return `Escribe al menos ${LIMITES_OFERTA.busquedaMin} letras del nombre.`
  }
  if (buscando) return "Buscando…"
  if (error) return error
  if (resultados === null) return ""
  if (resultados === 0) {
    return `No encontramos medios verificados con «${consultado}».`
  }
  return resultados === 1
    ? "1 medio encontrado."
    : `${formatearNumero(resultados)} medios encontrados.`
}

/**
 * Exclusión de medios por su nombre público (ANU-005): se buscan medios
 * verificados (`medios_para_exclusion`) y se muestran solo su nombre y
 * municipio, sin cifras ni datos personales. Los excluidos quedan como
 * fichas que se pueden quitar.
 */
export function BuscadorExclusiones({
  valor,
  onCambio,
  deshabilitado,
  describedBy,
}: PropsBuscadorExclusiones) {
  const base = useId()
  const idEstado = `${base}-estado`
  const idCampo = `${base}-buscar`
  const [texto, setTexto] = useState("")
  const busqueda = useBusquedaMedios(texto, LIMITES_OFERTA.busquedaMin)
  const excluidos = new Set(valor.map((medio) => medio.id))
  const resultados =
    texto.trim().length >= LIMITES_OFERTA.busquedaMin
      ? busqueda.data
      : undefined
  const estado = estadoBusqueda({
    texto,
    consultado: busqueda.consultado,
    buscando: busqueda.esperando || busqueda.isFetching,
    error: busqueda.isError ? busqueda.error.message : null,
    resultados: resultados ? resultados.length : null,
  })

  function excluir(medio: MedioExcluido) {
    if (excluidos.has(medio.id)) return
    onCambio([...valor, medio])
  }

  function quitar(medio: MedioExcluido) {
    onCambio(valor.filter((m) => m.id !== medio.id))
    // La ficha (y su botón) desaparece: el foco vuelve al buscador.
    requestAnimationFrame(() => document.getElementById(idCampo)?.focus())
  }

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          id={idCampo}
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter no avanza el asistente desde el buscador.
            if (evento.key === "Enter") evento.preventDefault()
          }}
          placeholder="Escribe parte del nombre del medio"
          aria-label="Buscar un medio para excluir"
          aria-describedby={[idEstado, describedBy].filter(Boolean).join(" ")}
          maxLength={LIMITES_OFERTA.busquedaMax}
          autoComplete="off"
          disabled={deshabilitado}
        />
        {busqueda.isFetching || busqueda.esperando ? (
          <InputGroupAddon align="inline-end">
            <Spinner aria-hidden />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <p
        id={idEstado}
        role="status"
        className={cn(
          "text-[0.8125rem] text-muted-foreground empty:hidden",
          busqueda.isError && "text-destructive"
        )}
      >
        {estado}
      </p>

      {resultados && resultados.length > 0 ? (
        <ul
          aria-label="Medios encontrados"
          className="flex flex-col divide-y overflow-hidden rounded-lg border"
        >
          {resultados.map((medio) => {
            const yaExcluido = excluidos.has(medio.id)
            return (
              <li
                key={medio.id}
                className="flex min-h-12 items-center gap-3 px-3 py-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {medio.nombre}
                  </span>
                  {medio.municipio ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin aria-hidden className="size-3" />
                      {medio.municipio}
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant={yaExcluido ? "ghost" : "outline"}
                  size="sm"
                  disabled={deshabilitado || yaExcluido}
                  focusableWhenDisabled
                  onClick={() => excluir(medio)}
                  aria-label={
                    yaExcluido
                      ? `${medio.nombre} ya está excluido`
                      : `Excluir ${medio.nombre}`
                  }
                >
                  {yaExcluido ? (
                    <Check data-icon="inline-start" aria-hidden />
                  ) : (
                    <Ban data-icon="inline-start" aria-hidden />
                  )}
                  {yaExcluido ? "Excluido" : "Excluir"}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {valor.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {valor.length === 1
              ? "1 medio excluido"
              : `${formatearNumero(valor.length)} medios excluidos`}
          </p>
          <ul aria-label="Medios excluidos" className="flex flex-wrap gap-1.5">
            {valor.map((medio) => (
              <li
                key={medio.id}
                className="inline-flex h-8 max-w-full items-center gap-1 rounded-full border bg-muted/40 pr-1 pl-3 text-[0.8125rem]"
              >
                <span className="truncate">
                  {medio.nombre}
                  {medio.municipio ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {medio.municipio}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => quitar(medio)}
                  disabled={deshabilitado}
                  aria-label={`Quitar ${medio.nombre} de las exclusiones`}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:anillo-foco"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
