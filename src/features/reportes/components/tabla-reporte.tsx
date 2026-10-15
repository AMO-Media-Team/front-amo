"use client"

import {
  BadgeDollarSign,
  ChartNoAxesCombined,
  ClipboardCheck,
  type LucideIcon,
  MapPinned,
  Megaphone,
  ShieldCheck,
  Wallet,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ParserMap } from "nuqs"
import { useMemo } from "react"

import {
  type ColumnaTabla,
  crearColumnas,
  type MetaColumna,
  type RowData,
} from "@/components/data-table/columnas"
import type { DefinicionEstadoTabla } from "@/components/data-table/estado-url"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import {
  TablaDatos,
  type VacioTabla,
} from "@/components/data-table/tabla-datos"
import { cn } from "@/lib/utils"

import type { SlugReporte } from "../catalogo"
import {
  alineaComoNumero,
  type ColumnaReporte,
  esNumerica,
  formatearCelda,
  type TipoColumna,
  type ValorColumna,
} from "../columnas"
import {
  columnasCartera,
  estadoTablaCartera,
  facetasCartera,
} from "../definiciones/cartera"
import {
  columnasCoberturaPara,
  estadoTablaCobertura,
  facetasCobertura,
} from "../definiciones/cobertura-territorial"
import {
  columnasCumplimiento,
  estadoTablaCumplimiento,
  facetasCumplimiento,
} from "../definiciones/cumplimiento-medios"
import {
  columnasDesempeno,
  estadoTablaDesempeno,
  facetasDesempeno,
} from "../definiciones/desempeno-campanas"
import {
  columnasFinanzas,
  estadoTablaFinanzas,
  facetasFinanzas,
} from "../definiciones/finanzas"
import {
  columnasResumen,
  estadoTablaResumen,
  facetasResumen,
} from "../definiciones/resumen-ejecutivo"
import {
  columnasUsuariosAccesos,
  estadoTablaUsuariosAccesos,
  facetasUsuariosAccesos,
  nombreUsuario,
} from "../definiciones/usuarios-accesos"
import { AGRUPACIONES, type Agrupacion } from "../filtros"
import type { OpcionesFacetas, PaginaTablaReporte } from "../pagina-tabla"
import type { FacetaReporte } from "../tabla"
import type { FilaUsuarioAcceso } from "../tipos"

// ── Celdas ───────────────────────────────────────────────────────────────────

function tipoDato(tipo: TipoColumna): MetaColumna["tipoDato"] {
  if (tipo === "texto") return "texto"
  if (tipo === "fecha" || tipo === "fechaHora") return "fecha"
  return "otro"
}

function CeldaReporte({
  valor,
  tipo,
  principal,
  detalle,
  href,
}: {
  valor: ValorColumna
  tipo: TipoColumna
  principal: boolean
  /** Segunda línea atenuada (solo la celda principal). */
  detalle?: string | null
  href?: Route
}) {
  const texto = formatearCelda(valor, tipo)
  if (texto === "—") {
    return <span className="text-muted-foreground/70">—</span>
  }
  if (tipo === "booleano") {
    return (
      <span
        className={cn(
          "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
          valor
            ? "bg-success/12 text-success"
            : "bg-muted text-muted-foreground"
        )}
      >
        {texto}
      </span>
    )
  }
  if (tipo === "fecha" || tipo === "fechaHora") {
    // La tarjeta de móvil recorta cada dato a una línea: la fecha puede
    // partirse en dos antes que perder la hora («30 de sept de 2026, 4:…»).
    return (
      <time dateTime={String(valor)} className="whitespace-normal">
        {texto}
      </time>
    )
  }
  if (!principal) return texto
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {href ? (
        <Link
          href={href}
          className="font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:anillo-foco"
        >
          {texto}
        </Link>
      ) : (
        <span className="font-medium">{texto}</span>
      )}
      {detalle ? (
        // `w-0 min-w-full`: la línea secundaria no ensancha la columna; se recorta.
        <span
          className="block w-0 min-w-full truncate text-xs text-muted-foreground"
          title={detalle}
        >
          {detalle}
        </span>
      ) : null}
    </span>
  )
}

/** Ajuste de la celda: cifras en una línea; textos que pueden envolver. */
function claseCelda<F>(columna: ColumnaReporte<F>, principal: boolean): string {
  if (esNumerica(columna.tipo)) return "cifras whitespace-nowrap"
  if (columna.cifras) return "cifras whitespace-nowrap"
  if (principal) return "min-w-44 max-w-72 whitespace-normal"
  if (columna.envolver) {
    return "min-w-56 text-[0.8125rem] whitespace-normal text-pretty text-muted-foreground"
  }
  return "min-w-24 whitespace-normal"
}

/**
 * Columnas de TanStack a partir de las declaradas en el dominio: el mismo
 * valor, título y formato que el Excel y el PDF. El orden lo resuelve el
 * servidor (el id de la columna es su campo de orden en la URL).
 */
function columnasTabla<F extends RowData>(
  columnas: readonly ColumnaReporte<F>[],
  enlace?: (fila: F) => Route
): ColumnaTabla<F>[] {
  const ayudante = crearColumnas<F>()
  return ayudante.columns(
    columnas.map((columna) => {
      const numerica = alineaComoNumero(columna)
      const principal = columna.tarjeta === "titulo"
      return ayudante.accessor((fila: F) => columna.valor(fila), {
        id: columna.id,
        header: () =>
          columna.tituloCorto ? (
            <span title={columna.titulo}>{columna.tituloCorto}</span>
          ) : (
            columna.titulo
          ),
        enableHiding: !principal,
        meta: {
          titulo: columna.titulo,
          campoOrden: columna.ordenable ? columna.id : undefined,
          alinear: numerica ? "fin" : undefined,
          tarjeta: columna.tarjeta,
          ocultaPorDefecto: columna.ocultaPorDefecto,
          ocultarBajo: columna.ocultarBajo,
          tipoDato: tipoDato(columna.tipo),
          claseCelda: claseCelda(columna, principal),
        },
        cell: ({ row }) => (
          <CeldaReporte
            valor={columna.valor(row.original)}
            tipo={columna.tipo}
            principal={principal}
            detalle={principal ? columna.detalle?.(row.original) : undefined}
            href={principal && enlace ? enlace(row.original) : undefined}
          />
        ),
      })
    })
  ) as ColumnaTabla<F>[]
}

// ── Tabla genérica ───────────────────────────────────────────────────────────

interface TablaDetalleProps<
  F extends RowData,
  C extends string,
  P extends ParserMap,
> {
  titulo: string
  filas: readonly F[]
  total: number
  opciones: OpcionesFacetas
  columnas: readonly ColumnaReporte<F>[]
  facetas: readonly FacetaReporte<F>[]
  estadoTabla: DefinicionEstadoTabla<C, P>
  idFila: (fila: F) => string
  clave: string
  placeholder: string
  vacio: VacioTabla
  /** Estable (módulo): la celda principal enlaza a la ficha. */
  enlace?: (fila: F) => Route
  etiquetaFila?: (fila: F) => string
}

function TablaDetalle<
  F extends RowData,
  C extends string,
  P extends ParserMap,
>({
  titulo,
  filas,
  total,
  opciones,
  columnas,
  facetas,
  estadoTabla,
  idFila,
  clave,
  placeholder,
  vacio,
  enlace,
  etiquetaFila,
}: TablaDetalleProps<F, C, P>) {
  const columnasTanstack = useMemo(
    () => columnasTabla(columnas, enlace),
    [columnas, enlace]
  )
  // Una faceta sin opciones (sin datos) no aporta nada: no se ofrece.
  const filtros = facetas.flatMap(
    (faceta): FiltroFacetado<keyof P & string>[] => {
      const opcionesFaceta = opciones[faceta.clave] ?? []
      return opcionesFaceta.length > 0
        ? [
            {
              clave: faceta.clave as keyof P & string,
              titulo: faceta.titulo,
              opciones: opcionesFaceta,
            },
          ]
        : []
    }
  )
  return (
    <TablaDatos
      titulo={titulo}
      columnas={columnasTanstack}
      filas={filas}
      total={total}
      idFila={idFila}
      estadoTabla={estadoTabla}
      filtros={filtros}
      placeholderBusqueda={placeholder}
      claveAlmacenamiento={`reportes.${clave}`}
      enlaceFila={enlace}
      etiquetaFila={etiquetaFila}
      vacio={vacio}
    />
  )
}

// ── Por reporte ──────────────────────────────────────────────────────────────

/** Columnas de Finanzas por agrupación, creadas una vez (estables). */
const COLUMNAS_FINANZAS = Object.fromEntries(
  AGRUPACIONES.map((agrupacion) => [agrupacion, columnasFinanzas(agrupacion)])
) as Record<Agrupacion, ReturnType<typeof columnasFinanzas>>

const enlaceUsuario = (fila: FilaUsuarioAcceso): Route =>
  `/administracion/usuarios/${fila.id}` as Route

function vacio(
  icono: LucideIcon,
  titulo: string,
  descripcion: string
): VacioTabla {
  return { icono, titulo, descripcion }
}

const VACIOS: Readonly<Record<SlugReporte, VacioTabla>> = {
  "resumen-ejecutivo": vacio(
    ChartNoAxesCombined,
    "Sin indicadores",
    "No se pudieron calcular los indicadores del periodo."
  ),
  "cobertura-territorial": vacio(
    MapPinned,
    "Sin zonas para mostrar",
    "Cuando haya medios verificados, cada zona aparecerá aquí con su pauta y su alcance."
  ),
  "usuarios-accesos": vacio(
    ShieldCheck,
    "Sin usuarios para mostrar",
    "Aquí aparece cada persona con sus ingresos, fallos y verificación en dos pasos."
  ),
  "desempeno-campanas": vacio(
    Megaphone,
    "Sin campañas en el periodo",
    "Las campañas con ofertas publicadas o negocios en el periodo aparecerán aquí."
  ),
  "cumplimiento-medios": vacio(
    ClipboardCheck,
    "Ningún medio tuvo plazos en el periodo",
    "Un medio aparece aquí cuando vence el plazo de publicación de alguna de sus asignaciones."
  ),
  finanzas: vacio(
    BadgeDollarSign,
    "Sin movimientos financieros",
    "Aquí verás el GMV, la comisión, lo facturado y lo recaudado en cuanto haya negocios en el periodo."
  ),
  cartera: vacio(
    Wallet,
    "Sin saldos pendientes al corte",
    "Ningún anunciante debe dinero en esta fecha de corte, o aún no hay facturas emitidas."
  ),
}

/**
 * Tabla de detalle del reporte: búsqueda, facetas, orden y paginación en la
 * URL (el servidor recorta las filas), columnas visibles y densidad
 * recordadas, y vista de tarjetas en móvil. Las columnas son las mismas que
 * salen en el Excel y el PDF.
 */
export function TablaReporte({
  pagina,
  titulo,
}: {
  pagina: PaginaTablaReporte
  titulo: string
}) {
  const comun = {
    titulo,
    filas: pagina.filas,
    total: pagina.total,
    opciones: pagina.opciones,
    clave: pagina.reporte,
    vacio: VACIOS[pagina.reporte],
  }
  switch (pagina.reporte) {
    case "resumen-ejecutivo":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={columnasResumen}
          facetas={facetasResumen}
          estadoTabla={estadoTablaResumen}
          idFila={(fila) => fila.clave}
          placeholder="Buscar indicador…"
        />
      )
    case "cobertura-territorial":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={columnasCoberturaPara(pagina.nivel)}
          facetas={facetasCobertura}
          estadoTabla={estadoTablaCobertura}
          idFila={(fila) => fila.codigo}
          placeholder="Buscar zona o código DANE…"
        />
      )
    case "usuarios-accesos":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={columnasUsuariosAccesos}
          facetas={facetasUsuariosAccesos}
          estadoTabla={estadoTablaUsuariosAccesos}
          idFila={(fila) => fila.id}
          etiquetaFila={nombreUsuario}
          enlace={enlaceUsuario}
          placeholder="Buscar nombre, correo o rol…"
        />
      )
    case "desempeno-campanas":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={columnasDesempeno}
          facetas={facetasDesempeno}
          estadoTabla={estadoTablaDesempeno}
          idFila={(fila) => fila.id}
          placeholder="Buscar campaña o anunciante…"
        />
      )
    case "cumplimiento-medios":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={columnasCumplimiento}
          facetas={facetasCumplimiento}
          estadoTabla={estadoTablaCumplimiento}
          idFila={(fila) => fila.id}
          placeholder="Buscar medio o municipio…"
        />
      )
    case "finanzas":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={COLUMNAS_FINANZAS[pagina.agrupacion]}
          facetas={facetasFinanzas}
          estadoTabla={estadoTablaFinanzas}
          idFila={(fila) => fila.id}
          placeholder={
            pagina.agrupacion === "mes"
              ? "Buscar mes…"
              : pagina.agrupacion === "sector"
                ? "Buscar sector…"
                : "Buscar anunciante…"
          }
        />
      )
    case "cartera":
      return (
        <TablaDetalle
          {...comun}
          filas={pagina.filas}
          columnas={columnasCartera}
          facetas={facetasCartera}
          estadoTabla={estadoTablaCartera}
          idFila={(fila) => fila.id}
          placeholder="Buscar anunciante…"
        />
      )
  }
}
