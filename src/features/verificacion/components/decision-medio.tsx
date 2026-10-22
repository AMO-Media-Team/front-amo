"use client"

import {
  ArrowUpDown,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  ShieldCheck,
  ShieldX,
} from "lucide-react"
import { useState } from "react"
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
  formatearCOPCompacto,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { cambiarNivelMedio, rechazarMedio, verificarMedio } from "../actions"
import {
  accionesDecision,
  type EvaluacionNivel,
  situacionDecision,
} from "../decision"
import {
  MOTIVOS_CAMBIO_NIVEL,
  MOTIVOS_RECHAZO_MEDIO,
  PLACEHOLDER_MOTIVO,
  SITUACIONES_REQUISITO,
  tituloRequisito,
} from "../presentacion"
import type { SituacionRequisito } from "../requisitos"
import type { ExpedienteMedio, NivelExpediente } from "../tipos"
import { SelectorNivel } from "./selector-nivel"

const CLASES_AVISO: Readonly<Record<Tono, string>> = {
  exito: "border-success/40 bg-success/8",
  info: "border-info/40 bg-info/8",
  aviso: "border-warning/40 bg-warning/8",
  peligro: "border-destructive/40 bg-destructive/8",
  neutro: "bg-muted/30",
}

function IconoSituacion({ situacion }: { situacion: SituacionRequisito }) {
  const clase = "mt-0.5 size-4 shrink-0"
  switch (situacion) {
    case "aprobado":
      return <CircleCheck aria-hidden className={cn(clase, "text-success")} />
    case "por_revisar":
      return <Clock aria-hidden className={cn(clase, "text-warning")} />
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
  situacion,
}: {
  titulo: string
  situacion: SituacionRequisito
}) {
  const { etiqueta, tono } = SITUACIONES_REQUISITO[situacion]
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="flex min-w-0 items-start gap-2 text-sm">
        <IconoSituacion situacion={situacion} />
        {titulo}
      </span>
      <InsigniaTono
        tono={tono}
        etiqueta={etiqueta}
        className="h-5 px-2 text-[0.6875rem]"
      />
    </li>
  )
}

/** Lista de lo que exige el nivel con su situación y el avance. */
function Requisitos({ evaluacion }: { evaluacion: EvaluacionNivel }) {
  return (
    <div className="flex flex-col gap-3">
      {evaluacion.cumplidos !== null && evaluacion.total !== null ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              Requisitos del nivel {evaluacion.nivel}
            </span>
            <span className="cifras text-muted-foreground">
              {evaluacion.cumplidos} de {evaluacion.total} al día
            </span>
          </p>
          <BarraLlenado
            fraccion={
              evaluacion.total > 0 ? evaluacion.cumplidos / evaluacion.total : 0
            }
            tono={evaluacion.listo ? "exito" : "primario"}
          />
        </div>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">
          Sin el permiso de datos sensibles no ves los documentos; la plataforma
          los comprobará igual cuando decidas.
        </p>
      )}
      <ul className="-my-1 divide-y">
        {evaluacion.requisitos?.map((requisito) => (
          <FilaRequisito
            key={requisito.clave}
            titulo={tituloRequisito(requisito.clave)}
            situacion={requisito.situacion}
          />
        ))}
        {evaluacion.exigeCuenta ? (
          <FilaRequisito
            titulo="Una cuenta social verificada y vigente"
            situacion={evaluacion.cuentaVigente ? "aprobado" : "falta"}
          />
        ) : null}
      </ul>
    </div>
  )
}

type Dialogo = "verificar" | "rechazar" | "cambiar_nivel" | null

/**
 * Decisión sobre el medio: su situación, el nivel que se evalúa con sus
 * requisitos y las acciones que su estado permite. La BD vuelve a
 * comprobarlo todo; si falta algo, su detalle aparece en el diálogo.
 */
export function DecisionMedio({
  expediente,
  nivel,
  onNivel,
  evaluacion,
}: {
  expediente: ExpedienteMedio
  nivel: NivelExpediente
  onNivel: (nivel: number) => void
  evaluacion: EvaluacionNivel
}) {
  const { medio } = expediente
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const acciones = accionesDecision(medio.estado)
  const situacion = situacionDecision({
    estado: medio.estado,
    nivel: medio.nivel,
    enviado: medio.enviadoAt !== null,
    motivo: medio.motivoEstado,
  })
  const mismoNivel = nivel.nivel === medio.nivel

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  return (
    <TarjetaFicha
      titulo="Decisión"
      icono={ShieldCheck}
      descripcion="Revisa los requisitos del nivel y decide."
    >
      <div className="flex flex-col gap-5">
        <div
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-3.5 text-sm",
            CLASES_AVISO[situacion.tono]
          )}
        >
          <p className="font-semibold">{situacion.titulo}</p>
          <p className="text-pretty text-muted-foreground">
            {situacion.descripcion}
          </p>
          {medio.estado === "PENDIENTE" && medio.enviadoAt ? (
            <p className="text-xs text-muted-foreground">
              Enviado{" "}
              <time
                dateTime={medio.enviadoAt}
                title={formatearFechaHora(medio.enviadoAt)}
                suppressHydrationWarning
              >
                {formatearRelativo(medio.enviadoAt)}
              </time>
            </p>
          ) : null}
        </div>

        <SelectorNivel
          niveles={expediente.niveles}
          valor={nivel.nivel}
          nivelActual={medio.nivel}
          onCambiar={onNivel}
        />

        <Requisitos evaluacion={evaluacion} />

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
                Verificar en el nivel {nivel.nivel}
              </Button>
            ) : null}
            {acciones.includes("cambiar_nivel") ? (
              <Button
                size="lg"
                disabled={mismoNivel}
                onClick={() => setDialogo("cambiar_nivel")}
              >
                <ArrowUpDown data-icon="inline-start" aria-hidden />
                {mismoNivel
                  ? "Elige otro nivel para cambiarlo"
                  : `Cambiar al nivel ${nivel.nivel}`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogoConfirmacion
        abierto={dialogo === "verificar"}
        onAbiertoChange={cerrar}
        titulo={`¿Verificar ${medio.nombre} en el nivel ${nivel.nivel}?`}
        descripcion={
          evaluacion.listo === false
            ? "Según lo que ves aún falta algún requisito. La plataforma lo comprobará y, si falta algo, te dirá qué."
            : `Podrá ver y aceptar ofertas de su nivel${
                nivel.tope === null
                  ? ", sin tope anual"
                  : ` hasta ${formatearCOPCompacto(nivel.tope)} al año`
              }. Recibirá un aviso.`
        }
        textoConfirmar="Verificar"
        onConfirmar={async () => {
          const resultado = await verificarMedio({
            medioId: medio.id,
            nivel: nivel.nivel,
          })
          if (resultado.ok) {
            toast.success("Medio verificado", {
              description: `${medio.nombre} · nivel ${nivel.nivel}`,
            })
          }
          return resultado
        }}
      />

      <DialogoMotivo
        abierto={dialogo === "rechazar"}
        onAbiertoChange={cerrar}
        destructivo
        titulo={`¿Rechazar la verificación de ${medio.nombre}?`}
        descripcion="El medio recibirá un aviso con el motivo. Cuando corrija y vuelva a enviar su perfil, regresará a la cola."
        ayuda="El medio lo verá tal cual; queda en la bitácora."
        sugerencias={MOTIVOS_RECHAZO_MEDIO}
        placeholder={PLACEHOLDER_MOTIVO}
        textoConfirmar="Rechazar verificación"
        onConfirmar={async (motivo) => {
          const resultado = await rechazarMedio({ medioId: medio.id, motivo })
          if (resultado.ok) toast.success("Verificación rechazada")
          return resultado
        }}
      />

      <DialogoMotivo
        abierto={dialogo === "cambiar_nivel"}
        onAbiertoChange={cerrar}
        titulo={`¿Cambiar ${medio.nombre} del nivel ${medio.nivel} al ${nivel.nivel}?`}
        descripcion={`Cambia lo que puede aceptar al año${
          nivel.tope === null
            ? " (el nivel nuevo no tiene tope)"
            : ` (el nivel nuevo tiene un tope de ${formatearCOPCompacto(nivel.tope)})`
        }. El medio recibirá un aviso.`}
        etiqueta="Motivo del cambio"
        ayuda="Queda en la bitácora junto con el cambio."
        sugerencias={MOTIVOS_CAMBIO_NIVEL}
        placeholder={PLACEHOLDER_MOTIVO}
        textoConfirmar={`Cambiar al nivel ${nivel.nivel}`}
        onConfirmar={async (motivo) => {
          const resultado = await cambiarNivelMedio({
            medioId: medio.id,
            nivel: nivel.nivel,
            motivo,
          })
          if (resultado.ok) toast.success(`Nivel cambiado al ${nivel.nivel}`)
          return resultado
        }}
      />
    </TarjetaFicha>
  )
}
