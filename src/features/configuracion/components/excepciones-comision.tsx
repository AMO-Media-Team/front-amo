"use client"

import {
  BadgePercent,
  Building2,
  CalendarX,
  EllipsisVertical,
  History,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { eliminarExcepcion, finalizarExcepcion } from "../actions"
import type { ExcepcionComision } from "../tipos"
import { decimalesPorcentaje, redondear } from "../valores"
import {
  type EstadoVigencia,
  estadoVigencia,
  textoVigencia,
} from "../vigencias"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { Bloque } from "./bloque"
import { HojaExcepcion } from "./hoja-excepcion"
import { InsigniaVigencia } from "./insignias"

type Filtro = "activas" | EstadoVigencia | "todas"

type Accion =
  | { tipo: "crear" }
  | { tipo: "editar"; excepcion: ExcepcionComision }
  | { tipo: "finalizar"; excepcion: ExcepcionComision }
  | { tipo: "eliminar"; excepcion: ExcepcionComision }

/** Lo que importa del alta de una excepción en su historial. */
const CAMPOS_CREACION = [
  "porcentaje",
  "vigente_desde",
  "vigente_hasta",
  "motivo",
] as const

function porcentaje(fraccion: number): string {
  return formatearPorcentaje(fraccion, decimalesPorcentaje(fraccion))
}

/** "−5 p. p. frente a la global" · "Igual a la global". */
function frenteGlobal(fraccion: number, global: number | null): string | null {
  if (global === null) return null
  const puntos = redondear((fraccion - global) * 100, 2)
  if (puntos === 0) return "Igual a la global"
  return `${puntos > 0 ? "+" : "−"}${formatearNumero(Math.abs(puntos), 2)} p. p. frente a la global`
}

/**
 * Comisiones de excepción por anunciante o campaña: vigentes, programadas
 * e historial. Crear y editar abren una hoja; finalizar corta la vigencia hoy
 * y eliminar solo procede si nunca se aplicó.
 */
export function ExcepcionesComision({
  excepciones,
  comisionGlobal,
}: {
  excepciones: readonly ExcepcionComision[]
  comisionGlobal: number | null
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [filtro, setFiltro] = useState<Filtro>("activas")
  const [accion, setAccion] = useState<Accion | null>(null)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const ahora = new Date()
  const conEstado = excepciones.map((excepcion) => ({
    excepcion,
    estado: estadoVigencia(
      excepcion.vigenteDesde,
      excepcion.vigenteHasta,
      ahora
    ),
  }))
  const cuenta = (estado: EstadoVigencia) =>
    conEstado.filter((e) => e.estado === estado).length
  const visibles = conEstado.filter(({ estado }) =>
    filtro === "todas"
      ? true
      : filtro === "activas"
        ? estado !== "FINALIZADA"
        : estado === filtro
  )
  const editable = permisos.comisiones

  function abrirHoja(siguiente: Accion) {
    setAccion(siguiente)
    setHojaAbierta(true)
  }

  return (
    <Bloque
      id="excepciones"
      titulo="Comisiones de excepción"
      descripcion="Comisión distinta de la global para un anunciante o una campaña concreta, durante un periodo."
      icono={BadgePercent}
      acciones={
        editable ? (
          <Button size="sm" onClick={() => abrirHoja({ tipo: "crear" })}>
            <Plus data-icon="inline-start" aria-hidden />
            Nueva excepción
          </Button>
        ) : null
      }
    >
      {excepciones.length === 0 ? (
        <EstadoVacio
          icono={BadgePercent}
          variante="simple"
          titulo="Sin comisiones de excepción"
          descripcion={
            comisionGlobal !== null
              ? `Todas las asignaciones usan la comisión global de ${porcentaje(comisionGlobal)}.`
              : "Todas las asignaciones usan la comisión global."
          }
          className="py-10"
        >
          {editable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => abrirHoja({ tipo: "crear" })}
            >
              <Plus data-icon="inline-start" aria-hidden />
              Crear la primera
            </Button>
          ) : null}
        </EstadoVacio>
      ) : (
        <>
          <div className="border-b px-4 py-3 sm:px-5">
            <ControlSegmentado<Filtro>
              etiqueta="Filtrar excepciones por estado"
              opciones={[
                {
                  valor: "activas",
                  etiqueta: "En curso",
                  cantidad: cuenta("VIGENTE") + cuenta("PROGRAMADA"),
                },
                {
                  valor: "VIGENTE",
                  etiqueta: "Vigentes",
                  cantidad: cuenta("VIGENTE"),
                },
                {
                  valor: "PROGRAMADA",
                  etiqueta: "Programadas",
                  cantidad: cuenta("PROGRAMADA"),
                },
                {
                  valor: "FINALIZADA",
                  etiqueta: "Finalizadas",
                  cantidad: cuenta("FINALIZADA"),
                },
                {
                  valor: "todas",
                  etiqueta: "Todas",
                  cantidad: excepciones.length,
                },
              ]}
              valor={filtro}
              onCambio={setFiltro}
            />
          </div>
          {visibles.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No hay excepciones en este estado.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {visibles.map(({ excepcion, estado }) => (
                <FilaExcepcion
                  key={excepcion.id}
                  excepcion={excepcion}
                  estado={estado}
                  comisionGlobal={comisionGlobal}
                  editable={editable}
                  onAccion={(tipo) =>
                    tipo === "editar"
                      ? abrirHoja({ tipo, excepcion })
                      : setAccion({ tipo, excepcion })
                  }
                  onHistorial={
                    abrirHistorial
                      ? () =>
                          abrirHistorial({
                            entidad: "comisiones_excepcion",
                            entidadId: excepcion.id,
                            titulo: `Excepción · ${excepcion.objetivo.nombre}`,
                            // El destinatario ya está en el título; su id no dice nada.
                            camposCreacion: CAMPOS_CREACION,
                          })
                      : null
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}

      <HojaExcepcion
        abierta={hojaAbierta}
        onAbiertaChange={setHojaAbierta}
        excepcion={accion?.tipo === "editar" ? accion.excepcion : null}
        comisionGlobal={comisionGlobal}
      />

      <DialogoConfirmacion
        abierto={accion?.tipo === "finalizar"}
        onAbiertoChange={(abierto) => !abierto && setAccion(null)}
        titulo="¿Finalizar la excepción hoy?"
        descripcion={
          accion?.tipo === "finalizar"
            ? `«${accion.excepcion.objetivo.nombre}» vuelve a la comisión global desde ahora. Las asignaciones ya aceptadas no cambian.`
            : undefined
        }
        textoConfirmar="Finalizar"
        onConfirmar={async () => {
          if (accion?.tipo !== "finalizar") return false
          const resultado = await finalizarExcepcion({
            id: accion.excepcion.id,
            actualizadoAt: accion.excepcion.actualizadoAt,
          })
          if (resultado.ok) toast.success("Excepción finalizada")
          return resultado
        }}
      />

      <DialogoConfirmacion
        abierto={accion?.tipo === "eliminar"}
        onAbiertoChange={(abierto) => !abierto && setAccion(null)}
        titulo="¿Eliminar la excepción?"
        descripcion="Solo se puede eliminar si nunca se aplicó a una asignación. Queda constancia en la bitácora."
        textoConfirmar="Eliminar"
        destructivo
        onConfirmar={async () => {
          if (accion?.tipo !== "eliminar") return false
          const resultado = await eliminarExcepcion({
            id: accion.excepcion.id,
            actualizadoAt: accion.excepcion.actualizadoAt,
          })
          if (resultado.ok) toast.success("Excepción eliminada")
          return resultado
        }}
      />
    </Bloque>
  )
}

function FilaExcepcion({
  excepcion,
  estado,
  comisionGlobal,
  editable,
  onAccion,
  onHistorial,
}: {
  excepcion: ExcepcionComision
  estado: EstadoVigencia
  comisionGlobal: number | null
  editable: boolean
  onAccion: (tipo: "editar" | "finalizar" | "eliminar") => void
  onHistorial: (() => void) | null
}) {
  const Icono = excepcion.objetivo.tipo === "anunciante" ? Building2 : Megaphone
  const comparacion = frenteGlobal(excepcion.porcentaje, comisionGlobal)
  const acciones = {
    editar: editable && estado !== "FINALIZADA",
    finalizar: editable && estado === "VIGENTE",
    eliminar: editable && estado === "PROGRAMADA",
  }
  const conMenu = Object.values(acciones).some(Boolean) || onHistorial !== null

  return (
    <li
      className={cn(
        "grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5",
        estado === "FINALIZADA" && "text-muted-foreground"
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        >
          <Icono className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium text-foreground">
              {excepcion.objetivo.nombre}
            </span>
            <InsigniaVigencia estado={estado} />
          </div>
          <p className="text-xs text-muted-foreground">
            {excepcion.objetivo.tipo === "anunciante"
              ? "Anunciante"
              : "Campaña"}
            {excepcion.objetivo.detalle
              ? ` · ${excepcion.objetivo.detalle}`
              : ""}
            {" · "}
            <span className="cifras">
              {textoVigencia(excepcion.vigenteDesde, excepcion.vigenteHasta)}
            </span>
          </p>
          <p
            className="line-clamp-2 text-sm text-pretty"
            title={excepcion.motivo}
          >
            {excepcion.motivo}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pl-11 sm:justify-end sm:pl-0">
        <div className="flex flex-col sm:items-end">
          <span className="text-lg leading-tight font-semibold cifras text-foreground">
            {porcentaje(excepcion.porcentaje)}
          </span>
          {comparacion ? (
            <span className="text-xs cifras text-muted-foreground">
              {comparacion}
            </span>
          ) : null}
        </div>
        {conMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Acciones de la excepción de ${excepcion.objetivo.nombre}`}
                />
              }
            >
              <EllipsisVertical aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {acciones.editar ? (
                <DropdownMenuItem onClick={() => onAccion("editar")}>
                  <Pencil aria-hidden />
                  Editar
                </DropdownMenuItem>
              ) : null}
              {acciones.finalizar ? (
                <DropdownMenuItem onClick={() => onAccion("finalizar")}>
                  <CalendarX aria-hidden />
                  Finalizar hoy
                </DropdownMenuItem>
              ) : null}
              {onHistorial ? (
                <DropdownMenuItem onClick={onHistorial}>
                  <History aria-hidden />
                  Ver historial
                </DropdownMenuItem>
              ) : null}
              {acciones.eliminar ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onAccion("eliminar")}
                  >
                    <Trash2 aria-hidden />
                    Eliminar
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  )
}
