"use client"

import { MapPin, MapPinned } from "lucide-react"
import { useId, useState } from "react"

import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { departamentoDeMunicipio } from "@/features/territorio/segmentacion"
import type { MunicipioActivo } from "@/features/territorio/tipos"

import { ComboTerritorio } from "./combo-territorio"
import {
  indicePorCodigo,
  useDepartamentosActivos,
  useMunicipiosActivos,
} from "./consultas"

export interface PropsSelectorUbicacion {
  /** Código DIVIPOLA elegido (`null` o `""` si ninguno). */
  valor: string | null
  /** Recibe el municipio elegido, o `null` al cambiar de departamento. */
  onCambio: (municipio: MunicipioActivo | null) => void
  /** Id del selector de municipio (el valor del campo); el de departamento es `${id}-departamento`. */
  id?: string
  invalido?: boolean
  deshabilitado?: boolean
  /** Id del mensaje de error o ayuda del campo. */
  describedBy?: string
  etiquetas?: { departamento?: string; municipio?: string }
}

function EtiquetaCargando() {
  return (
    <>
      <Skeleton aria-hidden className="inline-block h-3.5 w-28 align-middle" />
      <span className="sr-only">Cargando…</span>
    </>
  )
}

/**
 * Ubicación de un medio o anunciante: departamento → municipio, solo
 * activos. Al elegir el departamento se abre la lista de sus municipios;
 * cambiarlo borra el municipio elegido. Si el municipio guardado ya no está
 * activo lo dice (la BD lo rechazaría al guardar) y pide elegir otro.
 */
export function SelectorUbicacion({
  valor,
  onCambio,
  id,
  invalido,
  deshabilitado,
  describedBy,
  etiquetas,
}: PropsSelectorUbicacion) {
  const idBase = useId()
  const idMunicipio = id ?? `${idBase}-municipio`
  const idDepartamento = `${idMunicipio}-departamento`
  const idAviso = `${idMunicipio}-inactivo`
  const [departamentoLocal, setDepartamentoLocal] = useState<string | null>(
    null
  )
  const [municipiosAbierto, setMunicipiosAbierto] = useState(false)
  const departamento = valor
    ? departamentoDeMunicipio(valor)
    : departamentoLocal

  const departamentos = useDepartamentosActivos()
  const municipios = useMunicipiosActivos(departamento)
  const departamentoActual = departamento
    ? indicePorCodigo(departamentos.data).get(departamento)
    : undefined
  const municipioActual = valor
    ? indicePorCodigo(municipios.data).get(valor)
    : undefined
  const inactivo = Boolean(valor) && municipios.isSuccess && !municipioActual
  const describe = [describedBy, inactivo ? idAviso : null]
    .filter(Boolean)
    .join(" ")

  function elegirDepartamento(codigo: string) {
    if (codigo === departamento) {
      setMunicipiosAbierto(true)
      return
    }
    setDepartamentoLocal(codigo)
    if (valor) onCambio(null)
    // Lo siguiente que se hace es elegir el municipio: se abre su lista.
    setMunicipiosAbierto(true)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={idDepartamento}>
          {etiquetas?.departamento ?? "Departamento"}
        </Label>
        <ComboTerritorio
          id={idDepartamento}
          valor={departamento}
          etiquetaValor={
            departamentoActual?.nombreCorto ??
            (departamentos.isPending ? (
              <EtiquetaCargando />
            ) : (
              `Departamento ${departamento}`
            ))
          }
          placeholder="Elige un departamento"
          placeholderBusqueda="Busca un departamento…"
          textoVacio="No hay departamentos activos."
          icono={MapPinned}
          consulta={departamentos}
          nombres={(d) => [d.nombreCorto, d.nombre]}
          contenido={(d) => <span className="truncate">{d.nombreCorto}</span>}
          onElegir={(d) => elegirDepartamento(d.codigo)}
          focoTrasElegir="ninguno"
          deshabilitado={deshabilitado}
          invalido={invalido && !departamento}
          describedBy={describedBy}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={idMunicipio}>
          {etiquetas?.municipio ?? "Municipio"}
        </Label>
        <ComboTerritorio
          id={idMunicipio}
          valor={valor || null}
          etiquetaValor={
            municipioActual?.nombre ??
            (municipios.isPending ? <EtiquetaCargando /> : `Código ${valor}`)
          }
          placeholder={
            departamento
              ? "Elige un municipio"
              : "Primero elige el departamento"
          }
          placeholderBusqueda="Busca un municipio…"
          textoVacio="Este departamento no tiene municipios activos."
          icono={MapPin}
          consulta={municipios}
          nombres={(m) => [m.nombre]}
          contenido={(m) => (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{m.nombre}</span>
              {m.esCapital ? (
                <span className="text-xs text-muted-foreground">Capital</span>
              ) : null}
            </span>
          )}
          onElegir={(m) => onCambio(m)}
          abierto={municipiosAbierto}
          onAbiertoChange={setMunicipiosAbierto}
          deshabilitado={deshabilitado || !departamento}
          invalido={invalido || inactivo}
          describedBy={describe || undefined}
        />
      </div>
      {inactivo ? (
        <p
          id={idAviso}
          role="alert"
          className="text-[0.8125rem] text-destructive sm:col-span-2"
        >
          El municipio guardado ya no está activo en AMO. Elige otro.
        </p>
      ) : null}
    </div>
  )
}
