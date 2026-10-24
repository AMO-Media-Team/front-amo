"use client"

import {
  CalendarClock,
  Inbox,
  type LucideIcon,
  MessageSquareReply,
  MessageSquareWarning,
  Undo2,
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { SeccionCuenta } from "@/features/cuenta/components/seccion-cuenta"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { formatearFechaHora } from "@/lib/format"
import { fallo } from "@/lib/result"
import { cn } from "@/lib/utils"

import { aportarInformacion, desistirSolicitud } from "../actions"
import {
  accionesTitular,
  DECISIONES,
  estaAbierta,
  formatearDia,
  listaDatos,
  textoRadicado,
  TIPOS,
} from "../presentacion"
import type { SolicitudPropia } from "../tipos"
import { BotonSoporte } from "./boton-soporte"
import { InsigniaEstadoSolicitud } from "./estado-solicitud"

/** Id del elemento de una solicitud (destino de `?solicitud=` y de la confirmación). */
export function idSolicitudPropia(id: string): string {
  return `solicitud-${id}`
}

function enfocarSolicitud(id: string): HTMLElement | null {
  return document.getElementById(idSolicitudPropia(id))
}

/** Id del título de la tarjeta: destino del foco tras desistir o responder. */
function idTituloSolicitud(id: string): string {
  return `${idSolicitudPropia(id)}-titulo`
}

function Fecha({ valor }: { valor: string }) {
  return <time dateTime={valor}>{formatearFechaHora(valor)}</time>
}

/** «Te responderemos a más tardar el…» según el estado; nada si ya se cerró. */
function TextoPlazo({ solicitud }: { solicitud: SolicitudPropia }) {
  if (!estaAbierta(solicitud.estado)) return null
  return (
    <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
      <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
      {solicitud.estado === "REQUIERE_INFORMACION" ? (
        <span>
          Respóndenos para continuar: el plazo legal vuelve a contar desde el
          día en que nos envíes la información.
        </span>
      ) : (
        <span>
          Te responderemos a más tardar el{" "}
          <strong className="font-medium text-foreground">
            {formatearDia(solicitud.plazoVence, "largo")}
          </strong>
          .
        </span>
      )}
    </p>
  )
}

function Bloque({
  icono: Icono,
  titulo,
  tono = "neutro",
  children,
}: {
  icono: LucideIcon
  titulo: string
  tono?: "neutro" | "aviso" | "exito"
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-sm",
        tono === "aviso" && "border-warning/45 bg-warning/10",
        tono === "exito" && "border-success/40 bg-success/8",
        tono === "neutro" && "bg-muted/30"
      )}
    >
      <Icono
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tono === "aviso"
            ? "text-warning"
            : tono === "exito"
              ? "text-success"
              : "text-muted-foreground"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{titulo}</p>
        {children}
      </div>
    </div>
  )
}

function TarjetaSolicitud({
  solicitud,
  resaltada,
  onAportar,
  onDesistir,
}: {
  solicitud: SolicitudPropia
  resaltada: boolean
  onAportar: () => void
  onDesistir: () => void
}) {
  const acciones = accionesTitular(solicitud.estado)
  const idTitulo = idTituloSolicitud(solicitud.id)
  return (
    <li>
      <article
        id={idSolicitudPropia(solicitud.id)}
        tabIndex={-1}
        aria-labelledby={idTitulo}
        className={cn(
          "flex scroll-mt-24 flex-col gap-4 rounded-xl border bg-background/60 p-4 outline-none focus-visible:anillo-foco sm:p-5",
          resaltada && "border-primary/60 ring-2 ring-primary/30"
        )}
      >
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs font-medium cifras text-muted-foreground">
              {textoRadicado(solicitud.numero)}
            </p>
            <h3
              id={idTitulo}
              tabIndex={-1}
              className="rounded-sm text-[0.9375rem] font-semibold outline-none focus-visible:anillo-foco"
            >
              {TIPOS[solicitud.tipo].etiqueta}
            </h3>
            <p className="text-xs text-muted-foreground">
              Recibida el <Fecha valor={solicitud.recibidaAt} />
            </p>
          </div>
          <InsigniaEstadoSolicitud
            estado={solicitud.estado}
            perspectiva="titular"
          />
        </header>

        <TextoPlazo solicitud={solicitud} />

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Lo que pediste
          </p>
          <p className="text-sm text-pretty break-words whitespace-pre-line">
            {solicitud.descripcion}
          </p>
          {solicitud.datosAfectados.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Datos: {listaDatos(solicitud.datosAfectados)}
            </p>
          ) : null}
        </div>

        {solicitud.requerimiento ? (
          <Bloque
            icono={MessageSquareWarning}
            titulo="Te pedimos más información"
            tono={
              solicitud.estado === "REQUIERE_INFORMACION" ? "aviso" : "neutro"
            }
          >
            <p className="text-pretty break-words whitespace-pre-line text-muted-foreground">
              {solicitud.requerimiento}
            </p>
            {solicitud.informacionAportada ? (
              <p className="text-pretty break-words whitespace-pre-line">
                <span className="font-medium">Tu respuesta: </span>
                {solicitud.informacionAportada}
              </p>
            ) : null}
            {acciones.aportar ? (
              <Button
                type="button"
                size="sm"
                className="mt-1 w-full sm:w-fit"
                onClick={onAportar}
              >
                <MessageSquareReply data-icon="inline-start" aria-hidden />
                Responder{" "}
                <span className="sr-only">
                  el requerimiento de la solicitud{" "}
                  {textoRadicado(solicitud.numero)}
                </span>
              </Button>
            ) : null}
          </Bloque>
        ) : null}

        {solicitud.prorrogadaAt && solicitud.prorrogaMotivo ? (
          <Bloque icono={CalendarClock} titulo="Ampliamos el plazo">
            <p className="text-pretty text-muted-foreground">
              Nueva fecha límite: {formatearDia(solicitud.plazoVence, "largo")}.
              Motivo: {solicitud.prorrogaMotivo}
            </p>
          </Bloque>
        ) : null}

        {solicitud.estado === "RESPONDIDA" && solicitud.respuesta ? (
          <Bloque
            icono={Inbox}
            titulo={
              solicitud.decision
                ? DECISIONES[solicitud.decision].titular
                : "Nuestra respuesta"
            }
            tono="exito"
          >
            <p className="text-pretty break-words whitespace-pre-line">
              {solicitud.respuesta}
            </p>
            {solicitud.respondidaAt ? (
              <p className="text-xs text-muted-foreground">
                Respondida el <Fecha valor={solicitud.respondidaAt} />
              </p>
            ) : null}
            {solicitud.tieneSoporte ? (
              <div className="mt-1">
                <BotonSoporte
                  solicitudId={solicitud.id}
                  numero={solicitud.numero}
                  perspectiva="titular"
                  className="w-full sm:w-fit"
                />
              </div>
            ) : null}
          </Bloque>
        ) : null}

        {acciones.desistir ? (
          <div className="flex justify-end border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground sm:w-fit"
              onClick={onDesistir}
            >
              <Undo2 data-icon="inline-start" aria-hidden />
              Desistir{" "}
              <span className="sr-only">
                de la solicitud {textoRadicado(solicitud.numero)}
              </span>
            </Button>
          </div>
        ) : null}
      </article>
    </li>
  )
}

type Dialogo = { tipo: "aportar" | "desistir"; solicitud: SolicitudPropia }

/**
 * «Mis solicitudes» (CTA-007): radicado, tipo, estado en voz del titular,
 * fecha límite, el requerimiento con «Responder», la prórroga y su motivo, la
 * respuesta con su soporte y «Desistir». Con `?solicitud=` (enlace de un
 * aviso), esa solicitud se resalta y recibe el foco.
 */
export function MisSolicitudes({
  solicitudes,
  resaltada,
}: {
  solicitudes: SolicitudPropia[]
  resaltada: string | null
}) {
  // El contenido del diálogo se conserva al cerrarlo (la animación de salida
  // no queda sin radicado). Tras desistir o responder, el botón que abrió el
  // diálogo desaparece: el foco va al título de la tarjeta, cuyo id vive en un
  // ref (Base UI lee el último `focoAlCerrar` al desmontar). No a la tarjeta:
  // Base UI enfocaría su primer botón, que puede desaparecer en ese mismo
  // render. Al cancelar, vuelve al botón.
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [abierto, setAbierto] = useState(false)
  const idEnfocar = useRef<string | null>(null)

  useEffect(() => {
    if (!resaltada) return
    const elemento = enfocarSolicitud(resaltada)
    if (!elemento) return
    elemento.focus({ preventScroll: true })
    const reducido = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    elemento.scrollIntoView({
      behavior: reducido ? "auto" : "smooth",
      block: "start",
    })
  }, [resaltada])

  function abrir(tipo: Dialogo["tipo"], solicitud: SolicitudPropia) {
    idEnfocar.current = null
    setDialogo({ tipo, solicitud })
    setAbierto(true)
  }

  function cerrar(valor: boolean) {
    if (!valor) setAbierto(false)
  }

  function focoAlCerrar(): HTMLElement | null {
    return idEnfocar.current
      ? document.getElementById(idTituloSolicitud(idEnfocar.current))
      : null
  }

  const actual = dialogo?.solicitud
  const radicado = actual ? textoRadicado(actual.numero) : ""

  return (
    <SeccionCuenta
      id="mis-solicitudes"
      titulo="Mis solicitudes"
      icono={Inbox}
      descripcion="Lo que has pedido sobre tus datos personales y su respuesta."
    >
      {solicitudes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no has hecho solicitudes. Cuando radiques una, la verás aquí con
          su estado y su fecha límite.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {solicitudes.map((solicitud) => (
            <TarjetaSolicitud
              key={solicitud.id}
              solicitud={solicitud}
              resaltada={solicitud.id === resaltada}
              onAportar={() => abrir("aportar", solicitud)}
              onDesistir={() => abrir("desistir", solicitud)}
            />
          ))}
        </ul>
      )}

      <DialogoMotivo
        abierto={abierto && dialogo?.tipo === "aportar"}
        onAbiertoChange={cerrar}
        titulo={`Responder: solicitud ${radicado}`}
        descripcion={
          actual?.requerimiento ??
          "Escribe la información que te pedimos para atender tu solicitud."
        }
        etiqueta="Tu respuesta"
        placeholder="Escribe aquí la información que te pedimos…"
        ayuda="Al enviarla, el plazo legal para responderte vuelve a contar desde hoy."
        textoConfirmar="Enviar respuesta"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async (informacion) => {
          if (!actual) return fallo("La solicitud ya no está disponible.")
          const resultado = await aportarInformacion({
            solicitudId: actual.id,
            informacion,
          })
          if (resultado.ok) {
            idEnfocar.current = actual.id
            toast.success("Enviamos tu respuesta", {
              description: `Solicitud ${radicado}: el equipo la retoma.`,
            })
          }
          return resultado
        }}
      />
      <DialogoConfirmacion
        abierto={abierto && dialogo?.tipo === "desistir"}
        onAbiertoChange={cerrar}
        titulo={`¿Desistir de la solicitud ${radicado}?`}
        descripcion="La cerramos sin respuesta de fondo. Si lo necesitas, puedes radicar otra después."
        textoConfirmar="Desistir"
        textoCancelar="Volver"
        destructivo
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async () => {
          if (!actual) return false
          const resultado = await desistirSolicitud({ solicitudId: actual.id })
          if (resultado.ok) {
            idEnfocar.current = actual.id
            toast.success("Cerramos tu solicitud", {
              description: `Solicitud ${radicado}.`,
            })
          }
          return resultado
        }}
      />
    </SeccionCuenta>
  )
}
