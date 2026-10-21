"use client"

import { LogOut, ShieldCheck, ShieldOff, Users } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"

import { cerrarSesionesMasivo, registrarExportacionUsuarios } from "../actions"
import { estadoTablaUsuarios } from "../estado-tabla"
import {
  ESTADOS_CUENTA,
  estadoMfa,
  nombreVisible,
  TIPOS_ROL_ETIQUETA,
} from "../presentacion"
import type { RolVisible, UsuarioFila } from "../tipos"
import { useGestionUsuarios } from "./contexto-gestion"
import {
  AvatarPersona,
  IndicadorMfa,
  InsigniaEstado,
  InsigniaRol,
} from "./distintivos"
import { rutaUsuario } from "./dialogos-accion-usuario"
import { MenuAccionesUsuario } from "./menu-acciones-usuario"

const columna = crearColumnas<UsuarioFila>()

/** Roles internos (y cualquiera marcado así) exigen verificación en dos pasos. */
function exigeMfa(
  fila: UsuarioFila,
  rolesConMfa: ReadonlySet<string>
): boolean {
  return fila.rol !== null && rolesConMfa.has(fila.rol.id)
}

function CeldaUsuario({
  fila,
  esActor,
}: {
  fila: UsuarioFila
  esActor: boolean
}) {
  const nombre = nombreVisible(fila)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AvatarPersona nombre={nombre} color={fila.rol?.color ?? null} />
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Link
            href={rutaUsuario(fila.id)}
            className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {nombre}
          </Link>
          {esActor ? (
            <Badge
              variant="secondary"
              className="h-4.5 px-1.5 text-[0.6875rem]"
            >
              Tú
            </Badge>
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {fila.email}
        </span>
      </div>
    </div>
  )
}

function CeldaUltimoAcceso({ fila }: { fila: UsuarioFila }) {
  if (fila.ultimoAccesoAt) {
    return (
      // Tiempo relativo: puede diferir un instante entre el render del servidor y la hidratación.
      <time
        dateTime={fila.ultimoAccesoAt}
        title={formatearFechaHora(fila.ultimoAccesoAt)}
        suppressHydrationWarning
      >
        {formatearRelativo(fila.ultimoAccesoAt)}
      </time>
    )
  }
  if (fila.estado === "INVITADO" && fila.invitadoAt) {
    return (
      <span
        className="text-muted-foreground"
        title={formatearFechaHora(fila.invitadoAt)}
        suppressHydrationWarning
      >
        Invitado {formatearRelativo(fila.invitadoAt)}
      </span>
    )
  }
  return <span className="text-muted-foreground">Nunca</span>
}

interface TablaUsuariosProps {
  filas: UsuarioFila[]
  total: number
  /** Todos los roles visibles (filtro y requisito de MFA). */
  roles: readonly RolVisible[]
}

/** Listado de usuarios sobre `TablaDatos` (columnas, filtros y acciones del dominio). */
export function TablaUsuarios({ filas, total, roles }: TablaUsuariosProps) {
  const { actor } = useGestionUsuarios()
  const [cierre, setCierre] = useState<{
    ids: readonly string[]
    limpiar: () => void
  } | null>(null)

  const rolesConMfa = useMemo(
    () => new Set(roles.filter((rol) => rol.requiereMfa).map((rol) => rol.id)),
    [roles]
  )

  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => nombreVisible(fila), {
          id: "usuario",
          header: "Usuario",
          meta: {
            titulo: "Usuario",
            campoOrden: "nombre",
            tarjeta: "titulo",
            claseCelda: "max-w-56 xl:max-w-80",
          },
          enableHiding: false,
          cell: ({ row }) => (
            <CeldaUsuario
              fila={row.original}
              esActor={row.original.id === actor.id}
            />
          ),
        }),
        columna.accessor("email", {
          header: "Correo",
          meta: {
            titulo: "Correo",
            campoOrden: "email",
            ocultaPorDefecto: true,
            tarjeta: "oculta",
            exportacion: "siempre",
          },
          cell: ({ getValue }) => (
            <span className="text-muted-foreground">{getValue()}</span>
          ),
        }),
        columna.accessor((fila) => fila.rol?.nombre ?? null, {
          id: "rol",
          header: "Rol",
          meta: { titulo: "Rol", campoOrden: "rol" },
          cell: ({ row }) => <InsigniaRol rol={row.original.rol} />,
        }),
        columna.accessor((fila) => ESTADOS_CUENTA[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => <InsigniaEstado estado={row.original.estado} />,
        }),
        columna.accessor((fila) => fila.mfaActivo, {
          id: "mfa",
          header: "MFA",
          meta: { titulo: "MFA" },
          cell: ({ row }) => (
            <IndicadorMfa
              compacto="bajo-lg"
              estado={estadoMfa(
                row.original.mfaActivo,
                exigeMfa(row.original, rolesConMfa),
                row.original.estado
              )}
            />
          ),
        }),
        columna.accessor((fila) => fila.ultimoAccesoAt, {
          id: "ultimo_acceso",
          header: "Último acceso",
          meta: {
            titulo: "Último acceso",
            campoOrden: "ultimo_acceso",
            tipoDato: "fecha",
            ocultarBajo: "lg",
            formatoExportacion: "fechaHora",
          },
          cell: ({ row }) => <CeldaUltimoAcceso fila={row.original} />,
        }),
        columna.accessor((fila) => fila.creadoAt, {
          id: "creado",
          header: "Creado",
          meta: {
            titulo: "Creado",
            campoOrden: "creado",
            tipoDato: "fecha",
            tarjeta: "oculta",
            ocultarBajo: "xl",
            formatoExportacion: "fecha",
          },
          cell: ({ getValue }) => (
            <time
              dateTime={getValue()}
              className="cifras text-muted-foreground"
            >
              {formatearFecha(getValue())}
            </time>
          ),
        }),
        columna.display({
          id: ID_COLUMNA_ACCIONES,
          header: () => <span className="sr-only">Acciones</span>,
          meta: { titulo: "Acciones", exportacion: "nunca", alinear: "fin" },
          enableHiding: false,
          cell: ({ row }) => (
            <MenuAccionesUsuario
              variante="fila"
              usuario={{
                id: row.original.id,
                nombre: row.original.nombre,
                email: row.original.email,
                estado: row.original.estado,
                rolId: row.original.rol?.id ?? null,
                mfaActivo: row.original.mfaActivo,
              }}
            />
          ),
        }),
      ]),
    [actor.id, rolesConMfa]
  )

  const filtros = useMemo<FiltroFacetado<"estado" | "rol" | "tipo" | "mfa">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: (
          ["ACTIVO", "INVITADO", "SUSPENDIDO", "DESACTIVADO"] as const
        ).map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_CUENTA[estado].etiqueta,
        })),
      },
      {
        clave: "rol",
        titulo: "Rol",
        opciones: roles.map((rol) => ({
          valor: rol.id,
          etiqueta: rol.nombre,
          color: rol.color,
        })),
      },
      {
        clave: "tipo",
        titulo: "Tipo",
        opciones: (["ADMIN", "ANUNCIANTE", "MEDIO"] as const).map((tipo) => ({
          valor: tipo,
          etiqueta: TIPOS_ROL_ETIQUETA[tipo],
        })),
      },
      {
        clave: "mfa",
        titulo: "MFA",
        opciones: [
          { valor: "CON", etiqueta: "Con verificación", icono: ShieldCheck },
          { valor: "SIN", etiqueta: "Sin verificación", icono: ShieldOff },
        ],
      },
    ],
    [roles]
  )

  const puedeCerrarSesiones = actor.permisos.includes(
    "usuarios.cerrar_sesiones"
  )

  return (
    <>
      <TablaDatos
        titulo="Usuarios de la plataforma"
        columnas={columnas}
        filas={filas}
        total={total}
        idFila={(fila) => fila.id}
        etiquetaFila={nombreVisible}
        estadoTabla={estadoTablaUsuarios}
        filtros={filtros}
        placeholderBusqueda="Buscar por nombre o correo"
        claveAlmacenamiento="usuarios"
        enlaceFila={(fila) => rutaUsuario(fila.id)}
        exportacion={{
          nombre: "Usuarios AMO",
          onExportado: (resumen) => void registrarExportacionUsuarios(resumen),
        }}
        accionesMasivas={
          puedeCerrarSesiones
            ? ({ ids, limpiar }) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCierre({ ids, limpiar })}
                >
                  <LogOut data-icon="inline-start" aria-hidden />
                  Cerrar sesiones
                </Button>
              )
            : undefined
        }
        vacio={{
          icono: Users,
          titulo: "Aún no hay usuarios",
          descripcion:
            "Invita a tu equipo, a los anunciantes y a los medios con «Crear usuario».",
        }}
      />

      <DialogoConfirmacion
        abierto={cierre !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setCierre(null)
        }}
        titulo={`¿Cerrar las sesiones de ${cierre?.ids.length ?? 0} usuarios?`}
        descripcion="Tendrán que volver a ingresar. Tu propia cuenta no se incluye; los usuarios que no puedes gestionar se omiten."
        textoConfirmar="Cerrar sesiones"
        onConfirmar={async () => {
          const resultado = await cerrarSesionesMasivo({
            usuarioIds: [...(cierre?.ids ?? [])],
          })
          if (resultado.ok) {
            cierre?.limpiar()
            const { usuarios, sesiones, omitidos } = resultado.datos
            toast.success(
              `Sesiones cerradas en ${usuarios} ${usuarios === 1 ? "usuario" : "usuarios"}`,
              {
                description: `${sesiones} ${sesiones === 1 ? "sesión" : "sesiones"}${
                  omitidos > 0 ? ` · ${omitidos} omitidos` : ""
                }`,
              }
            )
          }
          return resultado
        }}
      />
    </>
  )
}
