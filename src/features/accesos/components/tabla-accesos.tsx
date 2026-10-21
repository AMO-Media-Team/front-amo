"use client"

import { Fingerprint, LockKeyhole, UserRoundX } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { AvatarActor } from "@/features/auditoria/components/distintivos"
import { formatearHora } from "@/features/auditoria/linea-tiempo"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import {
  DISPOSITIVOS,
  ETIQUETAS_DISPOSITIVO,
  ETIQUETAS_MOTIVO,
  EVENTOS,
  EVENTOS_ACCESO,
  MOTIVOS_SOSPECHA,
  RESULTADOS,
} from "../catalogo"
import { estadoTablaAccesos, RESULTADOS_FILTRO } from "../estado-accesos"
import type { AccesoFila, OpcionPais } from "../tipos"
import {
  Bandera,
  Dispositivo,
  ICONOS_DISPOSITIVO,
  ICONOS_EVENTO,
  IconoEvento,
  InsigniaResultado,
  InsigniaSospecha,
} from "./distintivos"

const columna = crearColumnas<AccesoFila>()

type ClaveFiltro =
  "resultado" | "evento" | "pais" | "dispositivo" | "sospechoso" | "motivo"

function filtrosFacetados(
  paises: readonly OpcionPais[]
): FiltroFacetado<ClaveFiltro>[] {
  return [
    {
      clave: "resultado",
      titulo: "Resultado",
      opciones: RESULTADOS_FILTRO.map((resultado) => ({
        valor: resultado,
        etiqueta: RESULTADOS[resultado].etiqueta,
      })),
    },
    {
      clave: "evento",
      titulo: "Evento",
      opciones: EVENTOS_ACCESO.map((evento) => ({
        valor: evento,
        etiqueta: EVENTOS[evento].etiqueta,
        icono: ICONOS_EVENTO[evento],
      })),
    },
    {
      clave: "pais",
      titulo: "País",
      opciones: paises.map((pais) => ({
        valor: pais.iso2,
        etiqueta: pais.bandera
          ? `${pais.bandera}  ${pais.nombre}`
          : pais.nombre,
      })),
    },
    {
      clave: "dispositivo",
      titulo: "Dispositivo",
      opciones: DISPOSITIVOS.map((dispositivo) => ({
        valor: dispositivo,
        etiqueta: ETIQUETAS_DISPOSITIVO[dispositivo],
        icono: ICONOS_DISPOSITIVO[dispositivo],
      })),
    },
    {
      clave: "sospechoso",
      titulo: "Sospechosos",
      opciones: [{ valor: "SI", etiqueta: "Solo sospechosos" }],
    },
    {
      clave: "motivo",
      titulo: "Motivo",
      opciones: MOTIVOS_SOSPECHA.map((motivo) => ({
        valor: motivo,
        etiqueta: ETIQUETAS_MOTIVO[motivo],
      })),
    },
  ]
}

function CeldaUsuario({
  fila,
  enlazar,
}: {
  fila: AccesoFila
  enlazar: boolean
}) {
  const { usuario } = fila
  if (!usuario) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border [&_svg]:size-3.5"
        >
          <UserRoundX />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-muted-foreground">
            Sin cuenta en AMO
          </span>
          <span className="truncate text-xs text-muted-foreground">
            Correo no registrado
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <AvatarActor
        actor={{
          nombre: usuario.nombre,
          color: usuario.color,
          esSistema: false,
        }}
      />
      <div className="flex min-w-0 flex-col">
        {enlazar ? (
          <Link
            href={`/administracion/usuarios/${usuario.id}` as Route}
            className="truncate rounded-sm font-medium hover:underline focus-visible:anillo-foco"
          >
            {usuario.nombre}
          </Link>
        ) : (
          <span className="truncate font-medium">{usuario.nombre}</span>
        )}
        <span className="truncate text-xs text-muted-foreground">
          {usuario.rol ?? usuario.email}
        </span>
      </div>
    </div>
  )
}

function CeldaEvento({ fila }: { fila: AccesoFila }) {
  return (
    <div
      className="flex min-w-0 items-start gap-2.5"
      data-sospechoso={fila.sospechoso || undefined}
    >
      <IconoEvento
        evento={fila.evento}
        resultado={fila.resultado}
        className="mt-0.5"
      />
      {/* Envuelve: en la tarjeta móvil la celda mide media tarjeta. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 whitespace-normal">
        <span className="min-w-0 break-words">{fila.etiquetaEvento}</span>
        <InsigniaResultado resultado={fila.resultado} />
        {fila.sospechoso ? (
          <InsigniaSospecha motivo={fila.motivoSospecha} />
        ) : null}
      </div>
    </div>
  )
}

function CeldaUbicacion({ fila }: { fila: AccesoFila }) {
  if (!fila.paisIso2 && !fila.ciudad) {
    return <span className="text-muted-foreground">Sin ubicación</span>
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Bandera bandera={fila.bandera} iso2={fila.paisIso2} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          {fila.ciudad ?? fila.pais ?? fila.paisIso2}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[fila.ciudad ? fila.region : null, fila.paisIso2]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </div>
  )
}

function CeldaDispositivo({ fila }: { fila: AccesoFila }) {
  const agente = [fila.navegador, fila.sistemaOperativo]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Dispositivo dispositivo={fila.dispositivo} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          {fila.dispositivo
            ? ETIQUETAS_DISPOSITIVO[fila.dispositivo]
            : "Desconocido"}
        </span>
        {agente ? (
          <span className="truncate text-xs text-muted-foreground">
            {agente}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function CeldaIp({ fila }: { fila: AccesoFila }) {
  if (!fila.ip) return <span className="text-muted-foreground">—</span>
  const enmascarada = fila.ip.includes("•")
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem] whitespace-nowrap"
      title={
        enmascarada
          ? "IP enmascarada: ver la completa exige el permiso de datos sensibles"
          : undefined
      }
    >
      {enmascarada ? (
        <LockKeyhole
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="Enmascarada"
        />
      ) : null}
      {fila.ip}
    </span>
  )
}

function CeldaFecha({ fila }: { fila: AccesoFila }) {
  return (
    <div className="flex flex-col whitespace-nowrap">
      <time
        dateTime={fila.at}
        title={formatearFechaHora(fila.at)}
        suppressHydrationWarning
      >
        {formatearRelativo(fila.at)}
      </time>
      <span className="text-xs cifras text-muted-foreground">
        {formatearHora(fila.at)}
      </span>
    </div>
  )
}

interface TablaAccesosProps {
  filas: AccesoFila[]
  total: number
  paises: OpcionPais[]
  /** Quien consulta puede abrir la ficha de usuario (`usuarios.ver`). */
  enlazarUsuarios: boolean
}

/**
 * Registro de accesos (paginado en el servidor). Los sospechosos se tiñen y
 * llevan su motivo; la IP llega enmascarada salvo con permiso sensible.
 */
export function TablaAccesos({
  filas,
  total,
  paises,
  enlazarUsuarios,
}: TablaAccesosProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.usuario?.nombre ?? "Sin cuenta", {
          id: "usuario",
          header: "Usuario",
          enableHiding: false,
          meta: {
            titulo: "Usuario",
            tarjeta: "titulo",
            claseCelda: "max-w-60",
          },
          cell: ({ row }) => (
            <CeldaUsuario fila={row.original} enlazar={enlazarUsuarios} />
          ),
        }),
        columna.accessor((fila) => fila.etiquetaEvento, {
          id: "evento",
          header: "Evento",
          meta: {
            titulo: "Evento",
            campoOrden: "evento",
            tipoDato: "otro",
            claseCelda: "max-w-80",
          },
          cell: ({ row }) => <CeldaEvento fila={row.original} />,
        }),
        columna.accessor((fila) => fila.pais ?? fila.paisIso2, {
          id: "pais",
          header: "Ubicación",
          meta: {
            titulo: "Ubicación",
            campoOrden: "pais",
            tipoDato: "texto",
            claseCelda: "max-w-52",
          },
          cell: ({ row }) => <CeldaUbicacion fila={row.original} />,
        }),
        columna.accessor((fila) => fila.navegador, {
          id: "dispositivo",
          header: "Dispositivo",
          meta: {
            titulo: "Dispositivo",
            ocultarBajo: "lg",
            claseCelda: "max-w-52",
          },
          cell: ({ row }) => <CeldaDispositivo fila={row.original} />,
        }),
        columna.accessor((fila) => fila.ip, {
          id: "ip",
          header: "IP",
          meta: { titulo: "IP", ocultarBajo: "xl" },
          cell: ({ row }) => <CeldaIp fila={row.original} />,
        }),
        columna.accessor((fila) => fila.at, {
          id: "fecha",
          header: "Fecha",
          meta: {
            titulo: "Fecha",
            campoOrden: "fecha",
            tipoDato: "fecha",
            formatoExportacion: "fechaHora",
            alinear: "fin",
          },
          cell: ({ row }) => <CeldaFecha fila={row.original} />,
        }),
      ]),
    [enlazarUsuarios]
  )

  const filtros = useMemo(() => filtrosFacetados(paises), [paises])

  return (
    // Los accesos sospechosos se tiñen de ámbar en la tabla (y en las tarjetas móviles).
    <div className="[&_li:has([data-sospechoso])]:bg-warning/6 [&_tr:has([data-sospechoso])]:bg-warning/6">
      <TablaDatos
        titulo="Registro de accesos"
        columnas={columnas}
        filas={filas}
        total={total}
        idFila={(fila) => String(fila.id)}
        etiquetaFila={(fila) =>
          `${fila.etiquetaEvento} de ${fila.usuario?.nombre ?? "un correo sin cuenta"}`
        }
        estadoTabla={estadoTablaAccesos}
        filtros={filtros}
        placeholderBusqueda="Buscar persona o ciudad"
        claveAlmacenamiento="accesos"
        vacio={{
          icono: Fingerprint,
          titulo: "Sin accesos en este periodo",
          descripcion:
            "Aquí aparece cada ingreso, fallo, bloqueo y cierre de sesión. Prueba con un periodo más amplio.",
        }}
      />
    </div>
  )
}
