import {
  History,
  ListChecks,
  Lock,
  type LucideIcon,
  Minus,
  PencilLine,
  Plus,
  Sparkles,
  Star,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Badge } from "@/components/ui/badge"
import { CLASES_TONO } from "@/features/usuarios/components/distintivos"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { type ClavePermiso, PERMISOS } from "@/lib/auth/permisos"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type ActorEvento,
  CAMPOS_ROL,
  type CambioCampo,
  construirHistorial,
  type EntradaHistorial,
} from "../historial"
import { nombreColor } from "../paleta"
import { pluralizar } from "../presentacion"
import { historialRol, LIMITE_HISTORIAL } from "../queries"

const VISIBLES_POR_GRUPO = 6

const PRESENTACION: Readonly<
  Record<
    EntradaHistorial["tipo"],
    { Icono: LucideIcon; tono: keyof typeof CLASES_TONO }
  >
> = {
  creado: { Icono: Sparkles, tono: "info" },
  editado: { Icono: PencilLine, tono: "neutro" },
  permisos: { Icono: ListChecks, tono: "exito" },
}

const ORIGENES: Readonly<Record<string, string>> = {
  DB: "Base de datos",
  API_DIRECTA: "API directa",
  DEMO: "Demo",
}

function autor(actor: ActorEvento): string {
  if (!actor.email) return "Por el sistema"
  return `Por ${actor.email}${actor.rol ? ` · ${actor.rol}` : ""}`
}

function titulo(entrada: EntradaHistorial): string {
  switch (entrada.tipo) {
    case "creado":
      return "Rol creado"
    case "editado":
      return "Datos del rol actualizados"
    case "permisos": {
      const partes = [
        entrada.agregados.length > 0
          ? pluralizar(
              entrada.agregados.length,
              "permiso otorgado",
              "permisos otorgados"
            )
          : null,
        entrada.quitados.length > 0
          ? pluralizar(
              entrada.quitados.length,
              "permiso retirado",
              "permisos retirados"
            )
          : null,
      ]
      return partes.filter(Boolean).join(" · ")
    }
  }
}

function ValorCampo({
  campo,
  valor,
}: {
  campo: CambioCampo["campo"]
  valor: unknown
}) {
  if (campo === "requiere_mfa")
    return <>{valor === true ? "Exige" : "No exige"}</>
  if (campo === "color" && typeof valor === "string") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-3 rounded-full ring-1 ring-foreground/10"
          style={{ backgroundColor: valor }}
        />
        {nombreColor(valor) ?? valor}
      </span>
    )
  }
  if (typeof valor === "string" && valor.trim()) {
    return <span className="break-words">«{valor}»</span>
  }
  return <span className="italic">vacío</span>
}

function DetalleEdicion({ cambios }: { cambios: CambioCampo[] }) {
  return (
    <dl className="mt-1 flex flex-col gap-1 text-sm">
      {cambios.map(({ campo, antes, despues }) => (
        <div
          key={campo}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
        >
          <dt className="text-muted-foreground">{CAMPOS_ROL[campo]}:</dt>
          <dd className="flex flex-wrap items-center gap-x-1.5">
            <span className="text-muted-foreground line-through decoration-muted-foreground/50">
              <ValorCampo campo={campo} valor={antes} />
            </span>
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <span className="sr-only">pasó a</span>
            <ValorCampo campo={campo} valor={despues} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ListaPermisos({
  claves,
  tipo,
}: {
  claves: ClavePermiso[]
  tipo: "agregado" | "quitado"
}) {
  const Icono = tipo === "agregado" ? Plus : Minus
  const clase = tipo === "agregado" ? "text-success" : "text-destructive"
  const linea = (clave: ClavePermiso) => (
    <li key={clave} className="flex items-start gap-1.5">
      <Icono className={cn("mt-0.5 size-3.5 shrink-0", clase)} aria-hidden />
      <span className="sr-only">
        {tipo === "agregado" ? "Otorgado:" : "Retirado:"}
      </span>
      <span>
        {PERMISOS[clave].descripcion}
        {PERMISOS[clave].esSensible ? (
          <>
            <Star
              className="ml-1 inline size-3 fill-current align-[-1px] text-warning"
              aria-hidden
            />
            <span className="sr-only">(sensible)</span>
          </>
        ) : null}
      </span>
    </li>
  )
  const visibles = claves.slice(0, VISIBLES_POR_GRUPO)
  const resto = claves.slice(VISIBLES_POR_GRUPO)
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {visibles.map(linea)}
      {resto.length > 0 ? (
        <li>
          <details className="group/mas">
            <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open/mas:hidden">
                Ver {resto.length} más
              </span>
              <span className="hidden group-open/mas:inline">Ver menos</span>
            </summary>
            <ul className="mt-1 flex flex-col gap-1">{resto.map(linea)}</ul>
          </details>
        </li>
      ) : null}
    </ul>
  )
}

function Detalle({ entrada }: { entrada: EntradaHistorial }) {
  switch (entrada.tipo) {
    case "creado":
      return entrada.clave ? (
        <p className="text-sm text-muted-foreground">
          Clave <code className="font-mono text-xs">{entrada.clave}</code>
        </p>
      ) : null
    case "editado":
      return <DetalleEdicion cambios={entrada.cambios} />
    case "permisos":
      return (
        <div className="mt-1 flex flex-col gap-2">
          {entrada.agregados.length > 0 ? (
            <ListaPermisos claves={entrada.agregados} tipo="agregado" />
          ) : null}
          {entrada.quitados.length > 0 ? (
            <ListaPermisos claves={entrada.quitados} tipo="quitado" />
          ) : null}
        </div>
      )
  }
}

/**
 * Pestaña Historial: cambios del rol y de sus permisos según la bitácora
 * (RLS: `auditoria.ver`). Los permisos de un mismo guardado se agrupan.
 */
export async function SeccionHistorialRol({
  rolId,
  puedeVerAuditoria,
}: {
  rolId: string
  puedeVerAuditoria: boolean
}) {
  if (!puedeVerAuditoria) {
    return (
      <EstadoVacio
        icono={Lock}
        titulo="Necesitas el permiso de auditoría"
        descripcion="El historial sale de la bitácora; pide a un administrador el permiso «Consultar la bitácora de auditoría»."
        className="flex-none py-12"
      />
    )
  }

  const entradas = construirHistorial(await historialRol(rolId))

  return (
    <TarjetaFicha
      titulo="Historial de cambios"
      descripcion={`Hasta los ${LIMITE_HISTORIAL} registros más recientes de la bitácora sobre este rol.`}
      icono={History}
    >
      {entradas.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={History}
          titulo="Sin cambios registrados"
          descripcion="Aquí aparecerán las ediciones del rol y cada permiso otorgado o retirado."
          className="py-6"
        />
      ) : (
        <ol className="flex flex-col">
          {entradas.map((entrada) => {
            const { Icono, tono } = PRESENTACION[entrada.tipo]
            return (
              <li
                key={entrada.id}
                className="group relative flex gap-4 pb-6 last:pb-0"
              >
                <span
                  aria-hidden
                  className="absolute top-9 bottom-0 left-4 w-px -translate-x-1/2 bg-border group-last:hidden"
                />
                <span
                  className={cn(
                    "relative grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card",
                    CLASES_TONO[tono].insignia
                  )}
                >
                  <Icono className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium">{titulo(entrada)}</p>
                    <time
                      dateTime={entrada.at}
                      title={formatearFechaHora(entrada.at)}
                      className="text-xs cifras text-muted-foreground"
                    >
                      {formatearRelativo(entrada.at)}
                    </time>
                  </div>
                  <Detalle entrada={entrada} />
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {autor(entrada.actor)}
                    {ORIGENES[entrada.origen] ? (
                      <Badge
                        variant="outline"
                        className="h-4.5 px-1.5 text-[0.6875rem]"
                      >
                        {ORIGENES[entrada.origen]}
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
