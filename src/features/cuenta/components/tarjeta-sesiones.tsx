import {
  Info,
  MapPin,
  Monitor,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  Tablet,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { sesionesPropias } from "../queries"
import type { SesionPropia } from "../tipos"
import { BotonCerrarOtrasSesiones } from "./boton-cerrar-sesiones"
import { SeccionCuenta } from "./seccion-cuenta"

function IconoDispositivo({
  dispositivo,
}: {
  dispositivo: SesionPropia["dispositivo"]
}) {
  switch (dispositivo) {
    case "ESCRITORIO":
      return <Monitor className="size-[1.125rem]" aria-hidden />
    case "MOVIL":
      return <Smartphone className="size-[1.125rem]" aria-hidden />
    case "TABLETA":
      return <Tablet className="size-[1.125rem]" aria-hidden />
    default:
      return <MonitorSmartphone className="size-[1.125rem]" aria-hidden />
  }
}

function FilaSesion({ sesion }: { sesion: SesionPropia }) {
  const origen = [sesion.ubicacion, sesion.ip].filter(Boolean)

  return (
    <li
      className={cn(
        "flex items-start gap-3.5 px-5 py-4 sm:px-6",
        sesion.esActual && "bg-primary/[0.04]"
      )}
    >
      <span
        className={cn(
          "relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl",
          sesion.esActual
            ? "bg-primary/12 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        <IconoDispositivo dispositivo={sesion.dispositivo} />
        {sesion.esActual ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex size-2.5"
          >
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success ring-2 ring-card" />
          </span>
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <span>{sesion.navegador ?? "Navegador desconocido"}</span>
          {sesion.esActual ? (
            <Badge className="h-5 bg-primary/15 px-2 text-[0.6875rem] text-lila-700 hover:bg-primary/15 dark:text-primary">
              Este dispositivo
            </Badge>
          ) : null}
          {sesion.conVerificacion ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-success">
              <ShieldCheck aria-hidden className="size-3.5" />
              Con verificación
            </span>
          ) : null}
        </p>
        {origen.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 break-words">
              {sesion.ubicacion ?? "Ubicación desconocida"}
              {sesion.ip ? (
                <>
                  {" · "}
                  <span className="cifras">{sesion.ip}</span>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {sesion.esActual ? (
            "Activa ahora"
          ) : sesion.ultimaActividadAt ? (
            <span title={formatearFechaHora(sesion.ultimaActividadAt)}>
              Última actividad {formatearRelativo(sesion.ultimaActividadAt)}
            </span>
          ) : (
            "Sin actividad registrada"
          )}
          {" · "}
          Inició el {formatearFechaHora(sesion.iniciadaAt)}
        </p>
      </div>
    </li>
  )
}

/**
 * Sesiones abiertas de la propia cuenta, con la actual primero y la opción de
 * cerrar las demás (Auth `signOut({ scope: "others" })`).
 */
export async function TarjetaSesiones({ usuario }: { usuario: UsuarioSesion }) {
  const estado = await sesionesPropias(usuario)
  const sesiones = estado.disponible ? estado.sesiones : [estado.actual]
  const otras = estado.disponible ? sesiones.length - 1 : null

  return (
    <SeccionCuenta
      id="sesiones"
      titulo="Sesiones activas"
      icono={MonitorSmartphone}
      descripcion={
        otras === null
          ? "Dispositivos donde tu cuenta tiene la sesión abierta."
          : otras === 0
            ? "Solo tienes la sesión abierta en este dispositivo."
            : `Tu cuenta está abierta en ${sesiones.length} dispositivos.`
      }
      sinRelleno
      pie={
        <>
          <p className="text-xs text-muted-foreground">
            ¿No reconoces un dispositivo? Cierra las demás sesiones y cambia tu
            contraseña.
          </p>
          <BotonCerrarOtrasSesiones otras={otras} />
        </>
      }
    >
      <ul className="flex flex-col divide-y border-t">
        {sesiones.map((sesion) => (
          <FilaSesion key={sesion.id} sesion={sesion} />
        ))}
      </ul>
      {!estado.disponible ? (
        <p className="flex items-start gap-2 border-t px-5 py-3.5 text-xs text-muted-foreground sm:px-6">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          Pronto verás aquí tus otros dispositivos. Mientras tanto, puedes
          cerrar todas las demás sesiones con el botón de abajo.
        </p>
      ) : null}
    </SeccionCuenta>
  )
}
