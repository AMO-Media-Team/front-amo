"use client"

import {
  CalendarClock,
  CircleCheck,
  FlaskConical,
  ListOrdered,
  Plus,
  Tags,
  TriangleAlert,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearDelta,
  formatearFecha,
  formatearNumero,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { validarTarifas } from "../actions"
import { nombrePlataforma, pluralizar, rangoSeguidores } from "../presentacion"
import {
  type CeldaTarifa,
  construirMatriz,
  franjasVisibles,
  type GrupoMatriz,
  historialCelda,
  ordenarVersiones,
  resumirTarifas,
  tarifasPendientes,
} from "../tarifas"
import type { Formato, Franja, Tarifa } from "../tipos"
import {
  type EstadoVigencia,
  estadoVigencia,
  textoVigencia,
} from "../vigencias"
import { Bloque } from "./bloque"
import { usePermisosConfiguracion } from "./contexto-configuracion"
import { type CeldaElegida, HojaTarifa } from "./hoja-tarifa"
import { InsigniaVigencia } from "./insignias"

type Vista = "matriz" | "versiones"

interface Seleccion {
  formatoId: string
  franjaId: string
}

/**
 * Tarifario versionado: matriz plataforma × formato × franja con la tarifa
 * vigente y la próxima programada, y la lista de todas las versiones. Cada
 * celda abre su historial y el formulario para programar una nueva vigencia.
 */
export function Tarifario({
  franjas,
  formatos,
  tarifas,
}: {
  franjas: readonly Franja[]
  formatos: readonly Formato[]
  tarifas: readonly Tarifa[]
}) {
  const permisos = usePermisosConfiguracion()
  const [vista, setVista] = useState<Vista>("matriz")
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [validando, setValidando] = useState(false)
  const ahora = new Date()
  const resumen = resumirTarifas(formatos, franjas, tarifas, ahora)
  const matriz = construirMatriz(formatos, franjas, tarifas, ahora)
  const columnas = franjasVisibles(franjas, tarifas)
  const pendientes = tarifasPendientes(tarifas, ahora)

  const celdaElegida: CeldaElegida | null = (() => {
    if (!seleccion) return null
    const formato = formatos.find((f) => f.id === seleccion.formatoId)
    const franja = franjas.find((f) => f.id === seleccion.franjaId)
    if (!formato || !franja) return null
    return {
      formato,
      franja,
      versiones: historialCelda(tarifas, formato.id, franja.id, ahora),
    }
  })()

  function abrir(formatoId: string, franjaId: string) {
    setSeleccion({ formatoId, franjaId })
    setHojaAbierta(true)
  }

  if (formatos.length === 0 || franjas.length === 0) {
    return (
      <Bloque titulo="Tarifario" icono={Tags} id="tarifario">
        <EstadoVacio
          icono={Tags}
          variante="simple"
          titulo="Aún no hay formatos o franjas"
          descripcion="Crea al menos una franja de seguidores y un formato para poder fijar tarifas."
          className="py-10"
        />
      </Bloque>
    )
  }

  return (
    <Bloque
      id="tarifario"
      titulo="Tarifario"
      descripcion={`Tarifa base por plataforma, formato y franja de seguidores. Elige una celda para ver su historial${permisos.tarifas ? " o programar una nueva vigencia" : ""}.`}
      icono={Tags}
      acciones={
        permisos.tarifas && pendientes.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setValidando(true)}
          >
            <CircleCheck data-icon="inline-start" aria-hidden />
            Confirmar cifras sugeridas
          </Button>
        ) : null
      }
    >
      <ResumenTarifario resumen={resumen} />

      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <ControlSegmentado<Vista>
          etiqueta="Vista del tarifario"
          opciones={[
            { valor: "matriz", etiqueta: "Matriz vigente" },
            {
              valor: "versiones",
              etiqueta: "Todas las versiones",
              cantidad: tarifas.length,
            },
          ]}
          valor={vista}
          onCambio={setVista}
        />
        <Leyenda />
      </div>

      {vista === "matriz" ? (
        <div className="flex flex-col divide-y">
          {matriz.map((grupo) => (
            <GrupoPlataforma
              key={grupo.plataforma}
              grupo={grupo}
              columnas={columnas}
              puedeProgramar={permisos.tarifas}
              onElegir={abrir}
            />
          ))}
        </div>
      ) : (
        <ListaVersiones
          tarifas={tarifas}
          formatos={formatos}
          franjas={franjas}
          ahora={ahora}
          onElegir={abrir}
        />
      )}

      <HojaTarifa
        abierta={hojaAbierta}
        onAbiertaChange={setHojaAbierta}
        celda={celdaElegida}
        puedeProgramar={permisos.tarifas}
      />

      <DialogoConfirmacion
        abierto={validando}
        onAbiertoChange={setValidando}
        titulo={`¿Confirmar ${pluralizar(pendientes.length, "tarifa sugerida", "tarifas sugeridas")}?`}
        descripcion="Quedarán marcadas como validadas por negocio. Los valores no cambian y la marca no se puede volver a poner."
        textoConfirmar="Confirmar"
        onConfirmar={async () => {
          const resultado = await validarTarifas({
            tarifaIds: pendientes.slice(0, 500),
          })
          if (resultado.ok) {
            toast.success(
              `${pluralizar(resultado.datos.validadas, "tarifa confirmada", "tarifas confirmadas")}`
            )
          }
          return resultado
        }}
      />
    </Bloque>
  )
}

function ResumenTarifario({
  resumen,
}: {
  resumen: ReturnType<typeof resumirTarifas>
}) {
  const indicadores = [
    {
      etiqueta: "Vigentes",
      valor: resumen.vigentes,
      detalle: "celdas con tarifa hoy",
      icono: Tags,
      tono: "neutro" as const,
    },
    {
      etiqueta: "Sin tarifa",
      valor: resumen.sinTarifa,
      detalle: resumen.sinTarifa > 0 ? "no se pueden cotizar" : "todo cubierto",
      icono: TriangleAlert,
      tono: resumen.sinTarifa > 0 ? ("aviso" as const) : ("neutro" as const),
    },
    {
      etiqueta: "Programadas",
      valor: resumen.programadas,
      detalle: resumen.proximoCambio
        ? `próximo cambio el ${formatearFecha(resumen.proximoCambio, "medio")}`
        : "sin cambios próximos",
      icono: CalendarClock,
      tono: resumen.programadas > 0 ? ("info" as const) : ("neutro" as const),
    },
    {
      etiqueta: "Por validar",
      valor: resumen.pendientes,
      detalle: "cifras sugeridas",
      icono: FlaskConical,
      tono: resumen.pendientes > 0 ? ("aviso" as const) : ("neutro" as const),
    },
  ]
  return (
    <div className="@container border-b">
      <dl className="grid grid-cols-2 @2xl:grid-cols-4">
        {indicadores.map(
          ({ etiqueta, valor, detalle, icono: Icono, tono }, indice) => (
            <div
              key={etiqueta}
              className={cn(
                "flex flex-col gap-0.5 px-4 py-3 sm:px-5",
                indice % 2 === 1 && "border-l",
                indice >= 2 && "border-t @2xl:border-t-0",
                indice === 2 && "@2xl:border-l"
              )}
            >
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icono
                  aria-hidden
                  className={cn(
                    "size-3.5",
                    tono === "aviso" && "text-warning",
                    tono === "info" && "text-info"
                  )}
                />
                {etiqueta}
              </dt>
              <dd className="font-heading text-xl font-semibold cifras">
                {formatearNumero(valor)}
              </dd>
              <dd className="truncate text-xs text-muted-foreground">
                {detalle}
              </dd>
            </div>
          )
        )}
      </dl>
    </div>
  )
}

function Leyenda() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-info" />
        Cambio programado
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-warning" />
        Por validar
      </li>
    </ul>
  )
}

function GrupoPlataforma({
  grupo,
  columnas,
  puedeProgramar,
  onElegir,
}: {
  grupo: GrupoMatriz
  columnas: readonly Franja[]
  puedeProgramar: boolean
  onElegir: (formatoId: string, franjaId: string) => void
}) {
  const franjaDe = new Map(columnas.map((f) => [f.id, f]))
  return (
    <div className="@container flex flex-col gap-3 px-4 py-4 sm:px-5">
      <MarcaPlataforma
        plataforma={grupo.plataforma}
        conNombre
        className="font-medium"
      />

      {/* Con ancho suficiente EN LA TARJETA (no en la ventana): tabla formato × franja. */}
      <div className="hidden overflow-x-auto rounded-lg border @lg:block">
        <table
          className="w-full table-fixed border-collapse text-sm"
          // Cada franja necesita su ancho: con muchas, la tabla se desplaza.
          style={{ minWidth: `${9 + columnas.length * 7.5}rem` }}
        >
          <caption className="sr-only">
            Tarifas de {nombrePlataforma(grupo.plataforma)} por formato y franja
          </caption>
          <thead>
            <tr className="bg-muted/40">
              <th
                scope="col"
                className="w-36 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                Formato
              </th>
              {columnas.map((franja) => (
                <th
                  key={franja.id}
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-medium"
                >
                  <span className="flex flex-col">
                    <span
                      className={cn(!franja.activa && "text-muted-foreground")}
                    >
                      {franja.clave} · {franja.nombre}
                      {franja.activa ? null : " (inactiva)"}
                    </span>
                    <span className="font-normal text-muted-foreground">
                      seguidores
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupo.filas.map((fila) => (
              <tr key={fila.formato.id} className="border-t">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <span
                    className={cn(
                      !fila.formato.activo && "text-muted-foreground"
                    )}
                  >
                    {fila.formato.nombre}
                  </span>
                  {fila.formato.activo ? null : (
                    <span className="block text-xs font-normal text-muted-foreground">
                      Inactivo
                    </span>
                  )}
                </th>
                {fila.celdas.map((celda) => (
                  <td key={celda.franjaId} className="p-1.5">
                    <BotonCelda
                      celda={celda}
                      etiqueta={`${fila.formato.nombre}, franja ${franjaDe.get(celda.franjaId)?.nombre ?? ""}`}
                      puedeProgramar={puedeProgramar}
                      onElegir={onElegir}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tarjeta angosta (móvil, tableta con el menú abierto): una ficha por formato. */}
      <ul className="flex flex-col gap-2.5 @lg:hidden">
        {grupo.filas.map((fila) => (
          <li key={fila.formato.id} className="rounded-lg border">
            <p className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
              {fila.formato.nombre}
              {fila.formato.activo ? null : (
                <span className="text-xs font-normal text-muted-foreground">
                  Inactivo
                </span>
              )}
            </p>
            <ul className="flex flex-col divide-y">
              {fila.celdas.map((celda) => {
                const franja = franjaDe.get(celda.franjaId)
                return (
                  <li
                    key={celda.franjaId}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,auto)] items-center gap-2 px-2 py-1.5"
                  >
                    <span
                      className="px-1 text-xs cifras text-pretty text-muted-foreground"
                      title={
                        franja
                          ? rangoSeguidores(
                              franja.seguidoresMin,
                              franja.seguidoresMax
                            )
                          : undefined
                      }
                    >
                      {franja ? (
                        <>
                          <span className="font-mono font-semibold text-foreground">
                            {franja.clave}
                          </span>
                          {" · "}
                          {franja.nombre}
                        </>
                      ) : null}
                    </span>
                    <BotonCelda
                      celda={celda}
                      etiqueta={`${fila.formato.nombre}, franja ${franja?.nombre ?? ""}`}
                      puedeProgramar={puedeProgramar}
                      onElegir={onElegir}
                    />
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BotonCelda({
  celda,
  etiqueta,
  puedeProgramar,
  onElegir,
}: {
  celda: CeldaTarifa
  etiqueta: string
  /** Sin `configuracion.tarifas` la celda solo abre el historial. */
  puedeProgramar: boolean
  onElegir: (formatoId: string, franjaId: string) => void
}) {
  const { vigente, programada, variacion } = celda
  const descripcion = [
    vigente
      ? `${formatearCOP(vigente.valorBase)} vigente`
      : "sin tarifa vigente",
    programada
      ? `programada ${formatearCOP(programada.valorBase)} desde el ${formatearFecha(programada.vigenteDesde, "medio")}`
      : null,
    vigente?.pendienteValidacion ? "pendiente de validación" : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <button
      type="button"
      onClick={() => onElegir(celda.formatoId, celda.franjaId)}
      aria-label={`${etiqueta}: ${descripcion}. ${puedeProgramar ? "Ver historial y programar" : "Ver historial"}.`}
      className={cn(
        "group/celda relative flex min-h-12 w-full flex-col items-start justify-center gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none hover:bg-muted focus-visible:anillo-foco",
        !vigente && "border border-dashed border-border"
      )}
    >
      {vigente ? (
        <span className="flex items-center gap-1.5 font-semibold cifras">
          {formatearCOP(vigente.valorBase)}
          {vigente.pendienteValidacion ? (
            <span aria-hidden className="size-1.5 rounded-full bg-warning" />
          ) : null}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Plus
            aria-hidden
            className="size-3 opacity-0 transition-opacity group-hover/celda:opacity-100"
          />
          Sin tarifa
        </span>
      )}
      {programada ? (
        <span className="flex items-center gap-1 text-[0.6875rem] cifras text-info">
          <span aria-hidden className="size-1.5 rounded-full bg-info" />
          {formatearCOPCompacto(programada.valorBase)} ·{" "}
          {formatearFecha(programada.vigenteDesde, "medio")}
          {variacion !== null
            ? ` (${formatearDelta(variacion).replace(/^[↑↓→]\s/, "")})`
            : null}
        </span>
      ) : null}
    </button>
  )
}

function ListaVersiones({
  tarifas,
  formatos,
  franjas,
  ahora,
  onElegir,
}: {
  tarifas: readonly Tarifa[]
  formatos: readonly Formato[]
  franjas: readonly Franja[]
  ahora: Date
  onElegir: (formatoId: string, franjaId: string) => void
}) {
  const [filtro, setFiltro] = useState<EstadoVigencia | "todas">("todas")
  const [limite, setLimite] = useState(40)
  const formatoDe = new Map(formatos.map((f) => [f.id, f]))
  const franjaDe = new Map(franjas.map((f) => [f.id, f]))
  const filas = ordenarVersiones(tarifas, formatos, franjas)
    .map((tarifa) => ({
      tarifa,
      estado: estadoVigencia(tarifa.vigenteDesde, tarifa.vigenteHasta, ahora),
    }))
    .filter(({ estado }) => filtro === "todas" || estado === filtro)

  if (tarifas.length === 0) {
    return (
      <EstadoVacio
        icono={ListOrdered}
        variante="simple"
        titulo="Aún no hay tarifas"
        descripcion="Elige una celda en la matriz para programar la primera."
        className="py-10"
      />
    )
  }

  const visibles = filas.slice(0, limite)
  return (
    <div className="@container flex flex-col">
      <div className="border-b px-4 py-2.5 sm:px-5">
        <ControlSegmentado<EstadoVigencia | "todas">
          etiqueta="Filtrar versiones por estado"
          opciones={[
            { valor: "todas", etiqueta: "Todas" },
            { valor: "VIGENTE", etiqueta: "Vigentes" },
            { valor: "PROGRAMADA", etiqueta: "Programadas" },
            { valor: "FINALIZADA", etiqueta: "Finalizadas" },
          ]}
          valor={filtro}
          onCambio={(valor) => {
            setFiltro(valor)
            setLimite(40)
          }}
        />
      </div>
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_7.5rem_minmax(0,1.2fr)_6.5rem] gap-x-6 border-b bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground @3xl:grid"
      >
        <span>Formato</span>
        <span>Franja</span>
        <span className="text-right">Valor</span>
        <span>Vigencia</span>
        <span>Estado</span>
      </div>
      {visibles.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No hay versiones en este estado.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {visibles.map(({ tarifa, estado }) => {
            const formato = formatoDe.get(tarifa.formatoId)
            const franja = franjaDe.get(tarifa.franjaId)
            return (
              <li key={tarifa.id}>
                {/*
                  Angosto: dos columnas (formato y franja | valor y estado) y la
                  vigencia debajo. Desde 48rem de tarjeta (con menos, la vigencia
                  se partía en dos líneas), las cinco columnas del encabezado en
                  el orden del DOM.
                */}
                <button
                  type="button"
                  onClick={() => onElegir(tarifa.formatoId, tarifa.franjaId)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:anillo-foco sm:px-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_7.5rem_minmax(0,1.2fr)_6.5rem] @3xl:items-center @3xl:gap-x-6"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MarcaPlataforma plataforma={tarifa.plataforma} />
                    <span className="truncate font-medium">
                      {formato?.nombre ?? "Formato"}
                    </span>
                  </span>
                  {/* El rango es el dato: se parte en dos líneas antes que recortarse. */}
                  <span className="col-start-1 row-start-2 min-w-0 cifras text-pretty text-muted-foreground @3xl:col-start-auto @3xl:row-start-auto">
                    {franja ? `${franja.clave} · ${franja.nombre}` : "Franja"}
                  </span>
                  <span className="col-start-2 row-start-1 text-right font-semibold cifras @3xl:col-start-auto @3xl:row-start-auto">
                    {formatearCOP(tarifa.valorBase)}
                  </span>
                  <span className="col-span-2 row-start-3 text-xs cifras text-muted-foreground @3xl:col-span-1 @3xl:row-start-auto">
                    {textoVigencia(tarifa.vigenteDesde, tarifa.vigenteHasta)}
                    {tarifa.creadaPor ? (
                      <span className="block truncate">{tarifa.creadaPor}</span>
                    ) : null}
                  </span>
                  <span className="col-start-2 row-start-2 flex flex-wrap justify-end gap-1 @3xl:col-start-auto @3xl:row-start-auto @3xl:justify-start">
                    <InsigniaVigencia estado={estado} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {filas.length > visibles.length ? (
        <div className="border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimite((n) => n + 40)}
          >
            Ver {Math.min(40, filas.length - visibles.length)} más de{" "}
            {formatearNumero(filas.length)}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
