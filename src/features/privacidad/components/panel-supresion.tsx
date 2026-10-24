"use client"

import {
  CircleAlert,
  Eraser,
  FlaskConical,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearNumero } from "@/lib/format"

import { ejecutarSupresion, simularSupresion } from "../actions"
import {
  ACCIONES_CONTACTO,
  ACCIONES_MEDIO,
  textoRadicado,
} from "../presentacion"
import type { ResultadoSupresion, SupresionEjecutada } from "../tipos"
import { avisoEstadoSolicitud } from "./foco"

/** Qué pasa con cada parte de los datos del titular (simulación o resultado). */
export function VistaSupresion({
  resultado,
  archivos,
}: {
  resultado: ResultadoSupresion
  /** Texto de los archivos (p. ej. «3 borrados» tras ejecutar). */
  archivos?: string
}) {
  const medio = ACCIONES_MEDIO[resultado.medio]
  return (
    <div className="flex flex-col gap-4 text-sm">
      {resultado.bloqueos.length > 0 ? (
        <div className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 p-3">
          <CircleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">
              No procede por un deber legal o contractual
            </p>
            <ul className="list-disc pl-4 text-pretty text-muted-foreground">
              {resultado.bloqueos.map((bloqueo) => (
                <li key={bloqueo}>{bloqueo}</li>
              ))}
            </ul>
            <p className="text-xs text-pretty text-muted-foreground">
              Decreto 1377 de 2013, art. 9: responde «No procede» o «Procede en
              parte» y explica el motivo, o espera a que termine el negocio.
            </p>
          </div>
        </div>
      ) : null}

      <dl className="grid gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">Cuenta</dt>
          <dd className="flex flex-col items-start gap-1">
            <InsigniaTono tono="peligro" etiqueta="Se borra" />
            <span className="text-pretty text-muted-foreground">
              Perfil, datos reservados, notificaciones y sesiones. La persona ya
              no podrá ingresar.
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">Medio</dt>
          <dd className="flex flex-col items-start gap-1">
            <InsigniaTono tono={medio.tono} etiqueta={medio.etiqueta} />
            <span className="text-pretty text-muted-foreground">
              {medio.descripcion}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Contacto de la empresa
          </dt>
          <dd className="text-pretty text-muted-foreground">
            {ACCIONES_CONTACTO[resultado.contactoEmpresa]}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Archivos
          </dt>
          <dd className="text-pretty text-muted-foreground">
            {archivos ??
              (resultado.archivos.length === 0
                ? "No hay archivos que borrar."
                : `${formatearNumero(resultado.archivos.length)} ${
                    resultado.archivos.length === 1
                      ? "carpeta o archivo se borra"
                      : "carpetas o archivos se borran"
                  } de Storage (foto de perfil y documentos).`)}
          </dd>
        </div>
      </dl>

      {resultado.seConserva.length > 0 ? (
        <div className="flex gap-2.5 rounded-lg border bg-muted/30 p-3">
          <ShieldCheck
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">Se conserva</p>
            <ul className="list-disc pl-4 text-pretty text-muted-foreground">
              {resultado.seConserva.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface PanelSupresionProps {
  solicitud: { id: string; numero: number }
  /** De `accionesEquipo`: simular mientras no esté cerrada; ejecutar respondida con procede. */
  puedeSimular: boolean
  puedeEjecutar: boolean
  /** Lo que ya se ejecutó (`supresion_resultado`), si se ejecutó. */
  ejecutada: { at: string; resultado: ResultadoSupresion | null } | null
  /** La persona del equipo es el titular: otra persona la ejecuta. */
  actorEsTitular: boolean
}

/**
 * Supresión de datos del titular (CTA-007): primero se simula (bloqueos, qué
 * se borra, qué se anonimiza y qué se conserva) y, con la solicitud
 * respondida con «procede» o «procede en parte» y sin bloqueos, se ejecuta
 * escribiendo el radicado. Después el servidor borra de Storage los
 * archivos que devuelve la BD y el panel muestra el resultado.
 */
export function PanelSupresion({
  solicitud,
  puedeSimular,
  puedeEjecutar,
  ejecutada,
  actorEsTitular,
}: PanelSupresionProps) {
  const [simulacion, setSimulacion] = useState<ResultadoSupresion | null>(null)
  const [resultado, setResultado] = useState<SupresionEjecutada | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [simulando, iniciar] = useTransition()
  const idAyuda = useId()
  const radicado = textoRadicado(solicitud.numero)

  function simular() {
    iniciar(async () => {
      const respuesta = await simularSupresion({ solicitudId: solicitud.id })
      if (!respuesta.ok) {
        toast.error(respuesta.error)
        return
      }
      setSimulacion(respuesta.datos)
    })
  }

  const sinBloqueos = simulacion !== null && simulacion.bloqueos.length === 0
  const habilitarEjecucion = puedeEjecutar && sinBloqueos
  const ayudaEjecucion = !puedeEjecutar
    ? "Para ejecutarla, responde la solicitud con «Procede» o «Procede en parte»."
    : simulacion === null
      ? "Simula la supresión antes de ejecutarla."
      : sinBloqueos
        ? "No se puede deshacer."
        : "Hay bloqueos: no se puede ejecutar."

  return (
    <TarjetaFicha
      titulo="Supresión de datos"
      icono={Eraser}
      descripcion="Borra la cuenta y los datos del titular, salvo lo que la ley obliga a conservar."
    >
      <div className="flex flex-col gap-4" aria-live="polite">
        {resultado ? (
          <>
            <p className="font-medium" role="status">
              Supresión ejecutada.
            </p>
            <VistaSupresion
              resultado={resultado.resultado}
              archivos={
                resultado.archivosPendientes > 0
                  ? `${formatearNumero(resultado.archivosBorrados)} borrados; ${formatearNumero(resultado.archivosPendientes)} quedan para la limpieza programada.`
                  : `${formatearNumero(resultado.archivosBorrados)} borrados de Storage.`
              }
            />
          </>
        ) : ejecutada ? (
          ejecutada.resultado ? (
            <VistaSupresion
              resultado={ejecutada.resultado}
              archivos="Se borraron de Storage al ejecutarla."
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              La supresión ya se ejecutó.
            </p>
          )
        ) : actorEsTitular ? (
          <p className="text-sm text-pretty text-muted-foreground">
            Eres el titular de esta solicitud: otra persona del equipo ejecuta
            la supresión de tus propios datos.
          </p>
        ) : !puedeSimular ? (
          <p className="text-sm text-pretty text-muted-foreground">
            La solicitud se cerró sin supresión.
          </p>
        ) : simulacion ? (
          <>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Simulación: todavía no se borró nada
            </p>
            <VistaSupresion resultado={simulacion} />
          </>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            Simula la supresión para ver si hay un deber de conservar (negocios
            o pagos en curso) y qué pasará con cada dato. No cambia nada.
          </p>
        )}
      </div>

      {!resultado && !ejecutada && !actorEsTitular && puedeSimular ? (
        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={simulando}
            aria-busy={simulando || undefined}
            onClick={simular}
          >
            {simulando ? (
              <Spinner role={undefined} aria-hidden data-icon="inline-start" />
            ) : (
              <FlaskConical data-icon="inline-start" aria-hidden />
            )}
            {simulacion ? "Volver a simular" : "Simular supresión"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={!habilitarEjecucion}
            focusableWhenDisabled
            aria-describedby={idAyuda}
            onClick={() => setConfirmando(true)}
          >
            <Trash2 data-icon="inline-start" aria-hidden />
            Ejecutar supresión
          </Button>
          <p id={idAyuda} className="text-xs text-pretty text-muted-foreground">
            {ayudaEjecucion}
          </p>
        </div>
      ) : null}

      <DialogoConfirmacion
        abierto={confirmando}
        onAbiertoChange={setConfirmando}
        titulo={`¿Ejecutar la supresión de la solicitud ${radicado}?`}
        descripcion="Se borra la cuenta del titular (ya no podrá ingresar) y, según la simulación, su medio o su contacto. No se puede deshacer: confirma con el número de radicado."
        textoVerificacion={String(solicitud.numero)}
        textoConfirmar="Ejecutar supresión"
        destructivo
        focoAlCerrar={() => avisoEstadoSolicitud()}
        onConfirmar={async () => {
          const respuesta = await ejecutarSupresion({
            solicitudId: solicitud.id,
            radicado: String(solicitud.numero),
          })
          if (respuesta.ok) {
            setResultado(respuesta.datos)
            toast.success("Supresión ejecutada", {
              description:
                respuesta.datos.archivosPendientes > 0
                  ? `Solicitud ${radicado}. Algunos archivos quedan para la limpieza programada.`
                  : `Solicitud ${radicado}.`,
            })
          }
          return respuesta
        }}
      />
    </TarjetaFicha>
  )
}
