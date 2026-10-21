"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FileDigit, History, Pencil, Plus, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { guardarResolucion } from "../actions"
import { valoresResolucion } from "../formularios"
import { NOMBRES_DOCUMENTO_ELECTRONICO } from "../presentacion"
import {
  type EntradaResolucion,
  esquemaResolucion,
  TIPOS_DOCUMENTO_ELECTRONICO,
} from "../schemas"
import type { ResolucionDian } from "../tipos"
import {
  type AlertaResolucion,
  alertasResolucion,
  consumoResolucion,
} from "../tributario"
import { formatearDia } from "../vigencias"
import { Bloque, CELDA_DIVIDIDA, CUADRICULA_DIVIDIDA } from "./bloque"
import {
  CampoCifra,
  CampoFecha,
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
} from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { Insignia } from "./insignias"
import { useEnvio } from "./use-envio"

const CAMPOS = [
  "tipo",
  "prefijo",
  "numeroResolucion",
  "fechaResolucion",
  "rangoDesde",
  "rangoHasta",
  "vigenteDesde",
  "vigenteHasta",
  "activa",
] as const satisfies readonly (keyof EntradaResolucion)[]

const TEXTO_ALERTA: Readonly<Record<AlertaResolucion, string>> = {
  agotada: "Rango agotado",
  "casi-agotada": "Quedan pocos números",
  "por-vencer": "Vence pronto",
  vencida: "Vencida",
}

/**
 * Resoluciones de numeración de la DIAN para facturas y documentos soporte.
 * Solo una por documento puede estar activa; el consecutivo avanza al
 * emitir (sin huecos) y aquí se ve cuánto queda del rango.
 */
export function ResolucionesDian({
  resoluciones,
}: {
  resoluciones: readonly ResolucionDian[]
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegida, setElegida] = useState<ResolucionDian | null>(null)
  const [abierta, setAbierta] = useState(false)
  const ordenadas = [...resoluciones].sort(
    (a, b) =>
      Number(b.activa) - Number(a.activa) ||
      b.vigenteDesde.localeCompare(a.vigenteDesde)
  )

  function abrir(resolucion: ResolucionDian | null) {
    setElegida(resolucion)
    setAbierta(true)
  }

  return (
    <Bloque
      id="resoluciones"
      titulo="Numeración DIAN"
      descripcion="Resoluciones de facturación y de documento soporte. Los borradores no consumen números."
      icono={FileDigit}
      acciones={
        permisos.tributario ? (
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            Nueva resolución
          </Button>
        ) : null
      }
    >
      {ordenadas.length === 0 ? (
        <EstadoVacio
          icono={FileDigit}
          variante="simple"
          titulo="Sin resoluciones"
          descripcion="Sin una resolución activa no se pueden emitir facturas ni documentos soporte."
          className="py-8"
        >
          {permisos.tributario ? (
            <Button variant="outline" size="sm" onClick={() => abrir(null)}>
              <Plus data-icon="inline-start" aria-hidden />
              Registrar la primera
            </Button>
          ) : null}
        </EstadoVacio>
      ) : (
        <div className="@container">
          <ul className={cn(CUADRICULA_DIVIDIDA, "@2xl:grid-cols-2")}>
            {ordenadas.map((resolucion) => (
              <TarjetaResolucion
                key={resolucion.id}
                resolucion={resolucion}
                editable={permisos.tributario}
                onEditar={() => abrir(resolucion)}
                onHistorial={
                  abrirHistorial
                    ? () =>
                        abrirHistorial({
                          entidad: "resoluciones_dian",
                          entidadId: resolucion.id,
                          titulo: `Resolución ${resolucion.numeroResolucion}`,
                        })
                    : null
                }
              />
            ))}
          </ul>
        </div>
      )}
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={FileDigit}
        titulo={
          elegida
            ? `Resolución ${elegida.numeroResolucion}`
            : "Nueva resolución"
        }
        descripcion="Copia los datos tal como aparecen en la resolución de la DIAN."
      >
        <FormularioResolucion resolucion={elegida} />
      </HojaLateral>
    </Bloque>
  )
}

function TarjetaResolucion({
  resolucion,
  editable,
  onEditar,
  onHistorial,
}: {
  resolucion: ResolucionDian
  editable: boolean
  onEditar: () => void
  onHistorial: (() => void) | null
}) {
  const consumo = consumoResolucion(resolucion)
  const alertas = resolucion.activa ? alertasResolucion(resolucion) : []
  const critico = alertas.includes("agotada") || alertas.includes("vencida")
  return (
    <li
      className={cn(
        CELDA_DIVIDIDA,
        "flex flex-col gap-3 p-4 sm:p-5",
        !resolucion.activa && "text-muted-foreground"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {NOMBRES_DOCUMENTO_ELECTRONICO[resolucion.tipo]}
            </span>
            {resolucion.activa ? (
              <Insignia tono="exito">Activa</Insignia>
            ) : (
              <Insignia tono="neutro">Inactiva</Insignia>
            )}
            {alertas.map((alerta) => (
              <Insignia
                key={alerta}
                tono={critico ? "peligro" : "aviso"}
                icono={TriangleAlert}
              >
                {TEXTO_ALERTA[alerta]}
              </Insignia>
            ))}
          </span>
          <span className="text-xs text-muted-foreground">
            N.º {resolucion.numeroResolucion} del{" "}
            {formatearDia(resolucion.fechaResolucion)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onHistorial ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Historial de la resolución ${resolucion.numeroResolucion}`}
              onClick={onHistorial}
            >
              <History aria-hidden />
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar la resolución ${resolucion.numeroResolucion}`}
              onClick={onEditar}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          {/* Números de documento tal como se imprimen: sin separador de miles. */}
          <span className="font-mono font-semibold text-foreground">
            {resolucion.prefijo}
            {resolucion.rangoDesde} – {resolucion.prefijo}
            {resolucion.rangoHasta}
          </span>
          <span className="text-xs cifras">
            {formatearPorcentaje(consumo.fraccion, 0)} usado
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Consumo del rango de la resolución ${resolucion.numeroResolucion}`}
          aria-valuemin={0}
          aria-valuemax={consumo.total}
          aria-valuenow={consumo.usados}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span
            className={cn(
              "block h-full rounded-full",
              consumo.fraccion >= 0.9 ? "bg-warning" : "bg-primary",
              consumo.disponibles === 0 && "bg-destructive"
            )}
            style={{ width: `${Math.min(100, consumo.fraccion * 100)}%` }}
          />
        </div>
        <p className="flex flex-wrap justify-between gap-x-3 text-xs cifras text-muted-foreground">
          <span>
            {formatearNumero(consumo.usados)} emitidos ·{" "}
            {formatearNumero(consumo.disponibles)} disponibles
          </span>
          <span>
            {consumo.siguiente
              ? `Siguiente: ${consumo.siguiente}`
              : "Sin números disponibles"}
          </span>
        </p>
      </div>

      <p className="text-xs cifras text-muted-foreground">
        Vigente del {formatearDia(resolucion.vigenteDesde)}
        {resolucion.vigenteHasta
          ? ` al ${formatearDia(resolucion.vigenteHasta)}`
          : " sin fecha de fin"}
      </p>
    </li>
  )
}

function FormularioResolucion({
  resolucion,
}: {
  resolucion: ResolucionDian | null
}) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaResolucion),
    defaultValues: valoresResolucion(resolucion),
    mode: "onTouched",
  })
  const vigenteDesde = useWatch({
    control: formulario.control,
    name: "vigenteDesde",
  })
  const emitio =
    resolucion !== null && resolucion.consecutivoActual >= resolucion.rangoDesde
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarResolucion,
    campos: CAMPOS,
    onExito: () => {
      toast.success(resolucion ? "Resolución actualizada" : "Resolución creada")
      cerrar()
    },
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar={resolucion ? "Guardar cambios" : "Crear resolución"}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <CampoSelect
            nombre="tipo"
            etiqueta="Documento"
            opciones={TIPOS_DOCUMENTO_ELECTRONICO.map((t) => ({
              valor: t,
              etiqueta: NOMBRES_DOCUMENTO_ELECTRONICO[t],
            }))}
            deshabilitado={resolucion !== null || pendiente}
          />
          <CampoTexto
            nombre="prefijo"
            etiqueta="Prefijo"
            mayusculas
            opcional
            placeholder="FE"
            deshabilitado={resolucion !== null || pendiente}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            nombre="numeroResolucion"
            etiqueta="Número de resolución"
            placeholder="18764000000000"
            deshabilitado={pendiente}
          />
          <CampoFecha
            nombre="fechaResolucion"
            etiqueta="Fecha de la resolución"
            deshabilitado={pendiente}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoCifra
            nombre="rangoDesde"
            etiqueta="Rango desde"
            deshabilitado={emitio || pendiente}
            descripcion={
              emitio ? "Ya se emitieron números: no cambia." : undefined
            }
          />
          <CampoCifra
            nombre="rangoHasta"
            etiqueta="Rango hasta"
            deshabilitado={pendiente}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoFecha
            nombre="vigenteDesde"
            etiqueta="Vigente desde"
            deshabilitado={pendiente}
          />
          <CampoFecha
            nombre="vigenteHasta"
            etiqueta="Vigente hasta"
            opcional
            minimo={typeof vigenteDesde === "string" ? vigenteDesde : undefined}
            placeholder="Sin fecha de fin"
            deshabilitado={pendiente}
          />
        </div>
        <CampoInterruptor
          nombre="activa"
          etiqueta="Usar para emitir"
          descripcion="Al activarla, la resolución activa anterior del mismo documento queda inactiva."
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}
