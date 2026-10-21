import { ArrowLeft, Ban, KeyRound, MailClock } from "lucide-react"
import type { ReactNode } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"

import { estadoMfa, nombreVisible, TIPOS_ROL_ETIQUETA } from "../presentacion"
import type { UsuarioDetalle } from "../tipos"
import { RUTA_USUARIOS } from "./dialogos-accion-usuario"
import {
  AvatarPersona,
  IndicadorMfa,
  InsigniaEstado,
  InsigniaRol,
} from "./distintivos"

function AvisoEstado({ usuario }: { usuario: UsuarioDetalle }) {
  if (usuario.estado === "SUSPENDIDO") {
    return (
      <Alert className="border-warning/40 bg-warning/8">
        <Ban className="text-warning" aria-hidden />
        <AlertTitle>
          Suspendida{" "}
          {usuario.suspendidoAt ? formatearRelativo(usuario.suspendidoAt) : ""}
        </AlertTitle>
        <AlertDescription>
          {usuario.motivoEstado
            ? `Motivo: ${usuario.motivoEstado}`
            : "No puede ingresar hasta que se reactive."}
        </AlertDescription>
      </Alert>
    )
  }
  if (usuario.estado === "DESACTIVADO") {
    return (
      <Alert>
        <Ban className="text-muted-foreground" aria-hidden />
        <AlertTitle>
          Cuenta desactivada
          {usuario.desactivadoAt
            ? ` el ${formatearFecha(usuario.desactivadoAt, "largo")}`
            : ""}
        </AlertTitle>
        <AlertDescription>
          {usuario.motivoEstado ? `Motivo: ${usuario.motivoEstado}. ` : ""}Su
          historial se conserva en la bitácora.
        </AlertDescription>
      </Alert>
    )
  }
  if (usuario.estado === "INVITADO") {
    return (
      <Alert className="border-info/40 bg-info/8">
        <MailClock className="text-info" aria-hidden />
        <AlertTitle>Invitación pendiente</AlertTitle>
        <AlertDescription>
          {usuario.invitadoAt
            ? `Invitado ${formatearRelativo(usuario.invitadoAt)}. `
            : ""}
          Aún no activa su cuenta. Si el enlace venció, genera uno nuevo desde
          «Más acciones».
        </AlertDescription>
      </Alert>
    )
  }
  if (usuario.debeCambiarPassword) {
    return (
      <Alert>
        <KeyRound className="text-primary" aria-hidden />
        <AlertTitle>Cambio de contraseña pendiente</AlertTitle>
        <AlertDescription>
          Deberá crear una contraseña nueva la próxima vez que use AMO.
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

/**
 * Cabecera de la ficha: identidad, estado, rol y MFA, con las acciones
 * permitidas a la derecha y el aviso del estado de la cuenta debajo.
 */
export function CabeceraUsuario({
  usuario,
  esActor,
  exigeMfa,
  acciones,
}: {
  usuario: UsuarioDetalle
  esActor: boolean
  exigeMfa: boolean
  acciones: ReactNode
}) {
  const nombre = nombreVisible(usuario)

  return (
    <div className="flex flex-col gap-4">
      <TituloMiga titulo={nombre} />
      <EnlaceBoton
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        href={RUTA_USUARIOS}
      >
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Usuarios
      </EnlaceBoton>
      <header className="relative overflow-hidden rounded-2xl border bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-aurora [mask-image:linear-gradient(to_bottom,black,transparent_85%)] opacity-[0.16] dark:opacity-25"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 patron-puntos opacity-50"
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <AvatarPersona
              nombre={nombre}
              color={usuario.rol?.color ?? null}
              tamano="lg"
              className="shrink-0 data-[size=lg]:size-16 sm:data-[size=lg]:size-18 [&_[data-slot=avatar-fallback]]:text-xl"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
                {usuario.rol ? TIPOS_ROL_ETIQUETA[usuario.rol.tipo] : "Sin rol"}
              </p>
              <h1 className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl leading-tight font-bold sm:text-[1.75rem]">
                <span className="truncate">{nombre}</span>
                {esActor ? <Badge variant="secondary">Tú</Badge> : null}
                {usuario.esDemo ? <Badge variant="outline">Demo</Badge> : null}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {usuario.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <InsigniaEstado estado={usuario.estado} />
                <InsigniaRol rol={usuario.rol} />
                <IndicadorMfa
                  estado={estadoMfa(
                    usuario.mfaActivo,
                    exigeMfa,
                    usuario.estado
                  )}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            {acciones}
            <p
              className="text-xs text-muted-foreground"
              title={formatearFechaHora(usuario.creadoAt)}
            >
              Creado el {formatearFecha(usuario.creadoAt, "largo")}
              {usuario.invitadoPor
                ? ` · invitado por ${nombreVisible(usuario.invitadoPor)}`
                : ""}
            </p>
          </div>
        </div>
      </header>
      <AvisoEstado usuario={usuario} />
    </div>
  )
}
