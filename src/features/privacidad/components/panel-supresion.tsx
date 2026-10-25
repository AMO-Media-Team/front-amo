"use client"

import {
  CircleAlert,
  Eraser,
  FlaskConical,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import {
  ejecutarSupresion,
  reintentarBorradoArchivos,
  simularSupresion,
} from "../actions"
import {
  ACCIONES_CONTACTO,
  ACCIONES_MEDIO,
  cantidadArchivos,
  clasificarBloqueos,
  textoArchivosEjecutada,
  textoArchivosSimulacion,
  textoBorrado,
  textoRadicado,
  textoSolicitudesVinculacion,
} from "../presentacion"
import type {
  BorradoArchivos,
  ResultadoSupresion,
  SupresionEjecutada,
} from "../tipos"
import { avisoEstadoSolicitud } from "./foco"

/** Un grupo de bloqueos de la simulación, con lo que se puede hacer. */
function Bloqueos({
  titulo,
  bloqueos,
  nota,
}: {
  titulo: string
  bloqueos: readonly string[]
  nota: string
}) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 p-3">
      <CircleAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{titulo}</p>
        <ul className="list-disc pl-4 text-pretty text-muted-foreground">
          {bloqueos.map((bloqueo) => (
            <li key={bloqueo}>{bloqueo}</li>
          ))}
        </ul>
        <p className="text-xs text-pretty text-muted-foreground">{nota}</p>
      </div>
    </div>
  )
}

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
  const bloqueos = clasificarBloqueos(resultado.bloqueos)
  return (
    <div className="flex flex-col gap-4 text-sm">
      {bloqueos.legales.length > 0 ? (
        <Bloqueos
          titulo="No procede por un deber legal o contractual"
          bloqueos={bloqueos.legales}
          nota="Decreto 1377 de 2013, art. 9: responde «No procede» o «Procede en parte» y explica el motivo, o espera a que termine el negocio."
        />
      ) : null}
      {bloqueos.otros.length > 0 ? (
        <Bloqueos
          titulo="No se puede ejecutar desde tu cuenta"
          bloqueos={bloqueos.otros}
          nota="Una cuenta con más privilegios la suprime un superadministrador, y siempre debe quedar uno activo."
        />
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
            Solicitudes de vinculación
          </dt>
          <dd className="text-pretty text-muted-foreground">
            {textoSolicitudesVinculacion(resultado.solicitudesVinculacion)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Archivos
          </dt>
          <dd className="text-pretty text-muted-foreground">
            {archivos ?? textoArchivosSimulacion(resultado.archivos.length)}
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
 * Los archivos que siguen en Storage tras la supresión y «Reintentar el
 * borrado de archivos». Tras reintentar, el foco va al resultado (el botón
 * desaparece si ya no queda nada).
 */
function ArchivosPendientes({
  solicitudId,
  pendientes,
  onReintento,
}: {
  solicitudId: string
  pendientes: number
  onReintento: (borrado: BorradoArchivos) => void
}) {
  const [reintentando, iniciar] = useTransition()
  const idAyuda = useId()

  function reintentar() {
    iniciar(async () => {
      const respuesta = await reintentarBorradoArchivos({ solicitudId })
      if (!respuesta.ok) {
        toast.error(respuesta.error)
        return
      }
      onReintento(respuesta.datos)
      if (respuesta.datos.archivosPendientes === 0) {
        toast.success("Archivos borrados de Storage")
      } else {
        toast.warning("Algunos archivos siguen en Storage", {
          description: "Vuelve a intentarlo en unos minutos.",
        })
      }
    })
  }

  if (pendientes === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/45 bg-warning/10 p-3 text-sm">
      <p id={idAyuda} className="text-pretty">
        Storage no confirmó el borrado de {cantidadArchivos(pendientes)}.
        Reintenta: lo que ya no exista se omite.
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={reintentando}
        aria-busy={reintentando || undefined}
        aria-describedby={idAyuda}
        onClick={reintentar}
      >
        {reintentando ? (
          <Spinner role={undefined} aria-hidden data-icon="inline-start" />
        ) : (
          <RotateCcw data-icon="inline-start" aria-hidden />
        )}
        Reintentar el borrado de archivos
      </Button>
    </div>
  )
}

/**
 * Supresión de datos del titular (CTA-007): primero se simula (bloqueos, qué
 * se borra, qué se anonimiza y qué se conserva) y, con la solicitud
 * respondida con «procede» o «procede en parte» y sin bloqueos, se ejecuta
 * escribiendo el radicado. Después el servidor borra de Storage los
 * archivos que devuelve la BD y el panel muestra el resultado; lo que
 * Storage no borró queda registrado y se puede reintentar.
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
  const [reintento, setReintento] = useState<BorradoArchivos | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [simulando, iniciar] = useTransition()
  // Al cerrar la confirmación: si se ejecutó, el foco va al aviso del estado;
  // si se canceló, vuelve a «Ejecutar supresión».
  const ejecutadaAhora = useRef(false)
  const estadoArchivos = useRef<HTMLParagraphElement>(null)
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

  // Lo último que se sabe de Storage: el reintento, la ejecución de ahora o
  // lo que guardó la BD.
  const resultadoEjecutado = resultado?.resultado ?? ejecutada?.resultado
  const pendientes =
    (reintento ?? resultado)?.archivosPendientes ??
    ejecutada?.resultado?.archivosPendientes?.length ??
    0

  function alReintentar(nuevo: BorradoArchivos) {
    setReintento(nuevo)
    // El botón puede desaparecer: el foco va al resultado, que lo anuncia.
    setTimeout(() => estadoArchivos.current?.focus(), 0)
  }

  return (
    <TarjetaFicha
      titulo="Supresión de datos"
      icono={Eraser}
      descripcion="Borra la cuenta y los datos del titular, salvo lo que la ley obliga a conservar."
    >
      <div className="flex flex-col gap-4" aria-live="polite">
        {resultadoEjecutado ? (
          <>
            <p
              ref={estadoArchivos}
              tabIndex={-1}
              className="font-medium outline-none focus-visible:anillo-foco"
              role="status"
            >
              Supresión ejecutada.
              {reintento ? (
                <span className="mt-1 block font-normal text-pretty text-muted-foreground">
                  Reintento del borrado: {textoBorrado(reintento)}
                </span>
              ) : null}
            </p>
            <VistaSupresion
              resultado={resultadoEjecutado}
              archivos={
                reintento
                  ? textoArchivosEjecutada(
                      resultadoEjecutado.archivos.length,
                      reintento.archivosPendientes
                    )
                  : resultado
                    ? textoBorrado(resultado)
                    : textoArchivosEjecutada(
                        resultadoEjecutado.archivos.length,
                        resultadoEjecutado.archivosPendientes?.length ?? null
                      )
              }
            />
            <ArchivosPendientes
              solicitudId={solicitud.id}
              pendientes={pendientes}
              onReintento={alReintentar}
            />
          </>
        ) : ejecutada ? (
          <p className="text-sm text-muted-foreground">
            La supresión ya se ejecutó.
          </p>
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
            onClick={() => {
              ejecutadaAhora.current = false
              setConfirmando(true)
            }}
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
        focoAlCerrar={() =>
          ejecutadaAhora.current ? avisoEstadoSolicitud() : null
        }
        onConfirmar={async () => {
          const respuesta = await ejecutarSupresion({
            solicitudId: solicitud.id,
            radicado: String(solicitud.numero),
          })
          if (respuesta.ok) {
            ejecutadaAhora.current = true
            setResultado(respuesta.datos)
            toast.success("Supresión ejecutada", {
              description:
                respuesta.datos.archivosPendientes > 0
                  ? `Solicitud ${radicado}. Algunos archivos siguen en Storage: reintenta el borrado en la ficha.`
                  : `Solicitud ${radicado}.`,
            })
          }
          return respuesta
        }}
      />
    </TarjetaFicha>
  )
}
