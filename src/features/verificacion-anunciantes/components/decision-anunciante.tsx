"use client"

import {
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import {
  BarraLlenado,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/operacion/components/ficha"
import type { Tono } from "@/features/operacion/estados"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { rechazarAnunciante, verificarAnunciante } from "../actions"
import { type AccionDecision, situacionDecision } from "../decision"
import {
  avisoIdentificacionCambiada,
  MOTIVOS_RECHAZO_EMPRESA,
  PLACEHOLDER_MOTIVO,
  SITUACIONES_REQUISITO_ANUNCIANTE,
} from "../presentacion"
import {
  CLAVE_EXISTENCIA,
  requisitosAnunciante,
  resumirRequisitos,
  type SituacionRequisitoAnunciante,
  tituloRequisito,
} from "../requisitos"
import type { ExpedienteAnunciante } from "../tipos"

const CLASES_AVISO: Readonly<Record<Tono, string>> = {
  exito: "border-success/40 bg-success/8",
  info: "border-info/40 bg-info/8",
  aviso: "border-warning/40 bg-warning/8",
  peligro: "border-destructive/40 bg-destructive/8",
  neutro: "bg-muted/30",
}

function IconoSituacion({
  situacion,
}: {
  situacion: SituacionRequisitoAnunciante
}) {
  const clase = "mt-0.5 size-4 shrink-0"
  switch (situacion) {
    case "aprobado":
      return <CircleCheck aria-hidden className={cn(clase, "text-success")} />
    case "por_revisar":
      return <Clock aria-hidden className={cn(clase, "text-warning")} />
    case "desactualizado":
      return <TriangleAlert aria-hidden className={cn(clase, "text-warning")} />
    case "rechazado":
    case "vencido":
      return <CircleX aria-hidden className={cn(clase, "text-destructive")} />
    case "falta":
      return (
        <CircleDashed
          aria-hidden
          className={cn(clase, "text-muted-foreground")}
        />
      )
  }
}

function FilaRequisito({
  titulo,
  ayuda,
  situacion,
}: {
  titulo: string
  ayuda?: string
  situacion: SituacionRequisitoAnunciante
}) {
  const { etiqueta, tono } = SITUACIONES_REQUISITO_ANUNCIANTE[situacion]
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="flex min-w-0 items-start gap-2 text-sm">
        <IconoSituacion situacion={situacion} />
        <span className="flex min-w-0 flex-col">
          {titulo}
          {ayuda ? (
            <span className="text-xs text-muted-foreground">{ayuda}</span>
          ) : null}
        </span>
      </span>
      <InsigniaTono
        tono={tono}
        etiqueta={etiqueta}
        className="h-5 px-2 text-[0.6875rem]"
      />
    </li>
  )
}

type Dialogo = AccionDecision | null

/**
 * Decisión sobre la empresa: su situación, lo que exige su país con el
 * avance y las acciones que su estado permite. La BD vuelve a comprobarlo
 * todo; si falta algo, su detalle aparece en el diálogo. Tras decidir, los
 * botones desaparecen: el foco va al titular de la situación (que ya dice la
 * nueva) y no se pierde en <body>.
 */
export function DecisionAnunciante({
  expediente,
  acciones,
}: {
  expediente: ExpedienteAnunciante
  /** Lo que la persona puede hacer (`accionesDecision`, en el servidor). */
  acciones: readonly AccionDecision[]
}) {
  const { anunciante, documentos, hoy } = expediente
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const titular = useRef<HTMLParagraphElement>(null)
  // La última confirmación cambió el estado (y quitó los botones).
  const decidida = useRef(false)
  const cambioIdentificacion = anunciante.identificacionCambiadaAt
  const requisitos = requisitosAnunciante(
    anunciante.paisIso2,
    documentos,
    hoy,
    cambioIdentificacion
  )
  const resumen = resumirRequisitos(requisitos)
  const situacion = situacionDecision({
    estado: anunciante.estado,
    enviada: anunciante.enviadoAt !== null,
    motivo: anunciante.motivoEstado,
  })
  const nombre = anunciante.nombreComercial

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  function focoAlCerrar(): HTMLElement | null {
    if (!decidida.current) return null
    decidida.current = false
    return titular.current
  }

  return (
    <TarjetaFicha
      titulo="Decisión"
      icono={ShieldCheck}
      descripcion="Revisa lo que exige la verificación y decide."
    >
      <div className="flex flex-col gap-5">
        <div
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-3.5 text-sm",
            CLASES_AVISO[situacion.tono]
          )}
        >
          <p ref={titular} tabIndex={-1} className="rounded-sm font-semibold">
            {situacion.titulo}
          </p>
          <p className="text-pretty text-muted-foreground">
            {situacion.descripcion}
          </p>
          {anunciante.enviadoAt ? (
            <p className="text-xs text-muted-foreground">
              Enviada{" "}
              <time
                dateTime={anunciante.enviadoAt}
                title={formatearFechaHora(anunciante.enviadoAt)}
                suppressHydrationWarning
              >
                {formatearRelativo(anunciante.enviadoAt)}
              </time>
            </p>
          ) : null}
          {anunciante.estado === "VERIFICADO" && anunciante.verificadoAt ? (
            <p className="text-xs text-muted-foreground">
              Verificada el {formatearFecha(anunciante.verificadoAt)}
              {anunciante.verificadoPor
                ? ` por ${anunciante.verificadoPor}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Documentos exigidos</span>
              <span className="cifras text-muted-foreground">
                {resumen.cumplidos} de {resumen.total} aprobados
              </span>
            </p>
            <BarraLlenado
              fraccion={
                resumen.total > 0 ? resumen.cumplidos / resumen.total : 0
              }
              tono={resumen.listos ? "exito" : "primario"}
            />
          </div>
          {cambioIdentificacion && resumen.desactualizados.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm text-pretty">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              {avisoIdentificacionCambiada(
                cambioIdentificacion,
                resumen.desactualizados.length
              )}
            </p>
          ) : null}
          <ul className="-my-1 divide-y">
            {requisitos.map((requisito) => (
              <FilaRequisito
                key={requisito.clave}
                titulo={tituloRequisito(requisito.clave)}
                ayuda={
                  requisito.clave === CLAVE_EXISTENCIA
                    ? "Cámara de Comercio u otro equivalente de su país."
                    : undefined
                }
                situacion={requisito.situacion}
              />
            ))}
          </ul>
        </div>

        {acciones.length > 0 ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {acciones.includes("rechazar") ? (
              <Button
                variant="destructive"
                size="lg"
                onClick={() => setDialogo("rechazar")}
              >
                <ShieldX data-icon="inline-start" aria-hidden />
                Rechazar
              </Button>
            ) : null}
            {acciones.includes("verificar") ? (
              <Button size="lg" onClick={() => setDialogo("verificar")}>
                <BadgeCheck data-icon="inline-start" aria-hidden />
                Verificar empresa
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogoConfirmacion
        abierto={dialogo === "verificar"}
        onAbiertoChange={cerrar}
        titulo={`¿Verificar a ${nombre}?`}
        descripcion={
          resumen.listos
            ? "Podrá activar campañas y enviar ofertas a revisión. Su equipo recibirá un aviso."
            : "Según lo que ves aún falta algún documento aprobado. La plataforma lo comprobará y, si falta algo, te dirá qué."
        }
        textoConfirmar="Verificar empresa"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async () => {
          const resultado = await verificarAnunciante({
            anuncianteId: anunciante.id,
          })
          decidida.current = resultado.ok
          if (resultado.ok) {
            toast.success("Empresa verificada", { description: nombre })
          }
          return resultado
        }}
      />

      <DialogoMotivo
        abierto={dialogo === "rechazar"}
        onAbiertoChange={cerrar}
        destructivo
        titulo={`¿Rechazar la verificación de ${nombre}?`}
        descripcion="La empresa recibirá un aviso con el motivo. Cuando corrija y la envíe de nuevo, volverá a la cola."
        ayuda="La empresa lo verá tal cual; queda en la bitácora."
        sugerencias={MOTIVOS_RECHAZO_EMPRESA}
        placeholder={PLACEHOLDER_MOTIVO}
        textoConfirmar="Rechazar verificación"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async (motivo) => {
          const resultado = await rechazarAnunciante({
            anuncianteId: anunciante.id,
            motivo,
          })
          decidida.current = resultado.ok
          if (resultado.ok) {
            toast.success("Verificación rechazada", { description: nombre })
          }
          return resultado
        }}
      />
    </TarjetaFicha>
  )
}
