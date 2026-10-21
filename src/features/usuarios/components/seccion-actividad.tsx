import {
  Activity,
  CircleDot,
  Download,
  History,
  Link2,
  Lock,
  type LucideIcon,
  PencilLine,
  ShieldCheck,
  UserPlus,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Badge } from "@/components/ui/badge"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { type CategoriaEvento, describirEvento } from "../presentacion"
import { actividadUsuario, LIMITE_ACTIVIDAD, rolesVisibles } from "../queries"
import type { EventoActividad } from "../tipos"
import { CLASES_TONO } from "./distintivos"
import { TarjetaFicha } from "./tarjeta-ficha"

const ICONOS: Readonly<Record<CategoriaEvento, LucideIcon>> = {
  creacion: UserPlus,
  estado: CircleDot,
  edicion: PencilLine,
  acceso: Link2,
  seguridad: ShieldCheck,
  exportacion: Download,
  otro: Activity,
}

const ORIGENES: Readonly<Record<string, string>> = {
  DB: "Base de datos",
  API_DIRECTA: "API directa",
  DEMO: "Demo",
}

function autor(evento: EventoActividad, propio: boolean): string {
  if (propio) return "Por el propio usuario"
  if (evento.actorEmail) {
    return `Por ${evento.actorEmail}${evento.actorRol ? ` · ${evento.actorRol}` : ""}`
  }
  return "Por el sistema"
}

/**
 * Pestaña Actividad: línea de tiempo desde la bitácora (lo que se hizo sobre
 * la cuenta y lo que hizo la persona). Los valores sensibles no se muestran:
 * el detalle completo está en Auditoría.
 */
export async function SeccionActividad({
  usuarioId,
  puedeVerAuditoria,
}: {
  usuarioId: string
  /** `auditoria.ver`: sin él la RLS no devuelve la bitácora. */
  puedeVerAuditoria: boolean
}) {
  if (!puedeVerAuditoria) {
    return (
      <EstadoVacio
        icono={Lock}
        titulo="Necesitas el permiso de auditoría"
        descripcion="La línea de tiempo sale de la bitácora; pide a un administrador el permiso «Consultar la bitácora de auditoría»."
        className="flex-none py-12"
      />
    )
  }

  const [eventos, roles] = await Promise.all([
    actividadUsuario(usuarioId),
    rolesVisibles(),
  ])
  const nombresRol = new Map(roles.map((rol) => [rol.id, rol.nombre]))

  return (
    <TarjetaFicha
      titulo="Línea de tiempo"
      descripcion={`Los ${LIMITE_ACTIVIDAD} eventos más recientes de la bitácora.`}
      icono={History}
    >
      {eventos.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={History}
          titulo="Sin actividad registrada"
          descripcion="Aquí aparecerán los cambios de su cuenta y sus acciones."
          className="py-6"
        />
      ) : (
        <ol className="flex flex-col">
          {eventos.map((evento) => {
            const descrito = describirEvento(evento, { usuarioId, nombresRol })
            const Icono = ICONOS[descrito.categoria]
            const tono = CLASES_TONO[descrito.tono]
            return (
              <li
                key={evento.id}
                className="group relative flex gap-4 pb-6 last:pb-0"
              >
                <span
                  aria-hidden
                  className="absolute top-9 bottom-0 left-4 w-px -translate-x-1/2 bg-border group-last:hidden"
                />
                <span
                  className={cn(
                    "relative grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card",
                    tono.insignia
                  )}
                >
                  <Icono className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium">{descrito.titulo}</p>
                    <time
                      dateTime={evento.at}
                      title={formatearFechaHora(evento.at)}
                      className="text-xs cifras text-muted-foreground"
                    >
                      {formatearRelativo(evento.at)}
                    </time>
                  </div>
                  {descrito.detalle ? (
                    <p className="text-sm text-muted-foreground">
                      {descrito.detalle}
                    </p>
                  ) : null}
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {autor(evento, descrito.propio)}
                    {ORIGENES[evento.origen] ? (
                      <Badge
                        variant="outline"
                        className="h-4.5 px-1.5 text-[0.6875rem]"
                      >
                        {ORIGENES[evento.origen]}
                      </Badge>
                    ) : null}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </TarjetaFicha>
  )
}
