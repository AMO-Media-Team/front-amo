"use client"

import { ChevronRight, History, Map as IconoMapa, Search } from "lucide-react"
import { useEffect, useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import { MENSAJE_INESPERADO } from "@/features/usuarios/errores"
import { normalizarNombreGeo } from "@/lib/geo/normalizar"
import {
  PATHS_DEPARTAMENTOS,
  RECUADRO_SAN_ANDRES,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"
import { cn } from "@/lib/utils"

import {
  cambiarActivoDepartamento,
  cambiarActivoMunicipios,
  municipiosDeDepartamento,
} from "../actions"
import { pluralizar } from "../presentacion"
import type { DepartamentoTerritorio, MunicipioTerritorio } from "../tipos"
import { Bloque } from "./bloque"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"

type Filtro = "todos" | "activos" | "inactivos"

/**
 * Territorio habilitado: departamentos y municipios que se ofrecen en los
 * formularios (sede de anunciantes y medios, segmentación de ofertas). Un
 * municipio activo exige su departamento activo (lo valida la BD).
 */
export function Territorio({
  departamentos,
}: {
  departamentos: readonly DepartamentoTerritorio[]
}) {
  const permisos = usePermisosConfiguracion()
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [abierto, setAbierto] = useState<string | null>(null)
  const [desactivar, setDesactivar] = useState<DepartamentoTerritorio | null>(
    null
  )
  const [pendiente, iniciar] = useTransition()
  const texto = normalizarNombreGeo(busqueda)
  const activos = departamentos.filter((d) => d.activo).length
  const inactivosMunicipios = departamentos.reduce(
    (total, d) => total + d.municipiosInactivos,
    0
  )
  const visibles = departamentos.filter(
    (d) =>
      (filtro === "todos" || (filtro === "activos" ? d.activo : !d.activo)) &&
      (!texto ||
        normalizarNombreGeo(d.nombre).includes(texto) ||
        d.codigo.startsWith(busqueda.trim()))
  )

  function cambiar(departamento: DepartamentoTerritorio, activo: boolean) {
    if (!activo) {
      setDesactivar(departamento)
      return
    }
    iniciar(async () => {
      // Un fallo de red no debe tumbar la sección (el error subiría al límite).
      try {
        const resultado = await cambiarActivoDepartamento({
          codigo: departamento.codigo,
          activo,
        })
        if (resultado.ok) toast.success(`${departamento.nombre} habilitado`)
        else toast.error(resultado.error)
      } catch {
        toast.error(MENSAJE_INESPERADO)
      }
    })
  }

  function elegirEnMapa(codigo: string) {
    setBusqueda("")
    setFiltro("todos")
    setAbierto(codigo)
    requestAnimationFrame(() =>
      document
        .getElementById(`departamento-${codigo}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    )
  }

  return (
    <Bloque
      id="territorio"
      titulo="Territorio habilitado"
      descripcion="Departamentos y municipios que se ofrecen como sede de anunciantes y medios y para segmentar ofertas."
      icono={IconoMapa}
    >
      <div className="@container">
        <div className="grid @3xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col @3xl:border-r">
            <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
              <InputGroup className="sm:w-56 sm:flex-1 sm:basis-48 xl:max-w-64">
                <InputGroupAddon>
                  <Search aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="Buscar departamento…"
                  aria-label="Buscar departamento"
                />
              </InputGroup>
              <ControlSegmentado<Filtro>
                etiqueta="Filtrar departamentos"
                opciones={[
                  {
                    valor: "todos",
                    etiqueta: "Todos",
                    cantidad: departamentos.length,
                  },
                  {
                    valor: "activos",
                    etiqueta: "Habilitados",
                    cantidad: activos,
                  },
                  {
                    valor: "inactivos",
                    etiqueta: "Deshabilitados",
                    cantidad: departamentos.length - activos,
                  },
                ]}
                valor={filtro}
                onCambio={setFiltro}
                className="sm:shrink-0"
              />
            </div>
            {visibles.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Ningún departamento coincide.
              </p>
            ) : (
              <ul
                className="flex max-h-[36rem] flex-col divide-y overflow-y-auto"
                aria-busy={pendiente || undefined}
              >
                {visibles.map((departamento) => (
                  <FilaDepartamento
                    key={departamento.codigo}
                    departamento={departamento}
                    abierto={abierto === departamento.codigo}
                    onAbrir={(valor) =>
                      setAbierto(valor ? departamento.codigo : null)
                    }
                    editable={permisos.catalogos}
                    deshabilitado={pendiente}
                    onCambiar={(activo) => cambiar(departamento, activo)}
                  />
                ))}
              </ul>
            )}
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
              {activos} de {departamentos.length} departamentos habilitados
              {inactivosMunicipios > 0
                ? ` · ${pluralizar(inactivosMunicipios, "municipio deshabilitado", "municipios deshabilitados")}`
                : " · todos los municipios habilitados"}
            </p>
          </div>
          <MapaTerritorio
            departamentos={departamentos}
            seleccionado={abierto}
            onElegir={elegirEnMapa}
          />
        </div>
      </div>

      <DialogoConfirmacion
        abierto={desactivar !== null}
        onAbiertoChange={(valor) => !valor && setDesactivar(null)}
        titulo={`¿Deshabilitar ${desactivar?.nombre ?? ""}?`}
        descripcion="Deja de ofrecerse, con todos sus municipios, en los formularios y en la segmentación de ofertas. Los anunciantes y medios que ya tienen sede allí no cambian."
        textoConfirmar="Deshabilitar"
        destructivo
        onConfirmar={async () => {
          if (!desactivar) return false
          const resultado = await cambiarActivoDepartamento({
            codigo: desactivar.codigo,
            activo: false,
          })
          if (resultado.ok) toast.success(`${desactivar.nombre} deshabilitado`)
          return resultado
        }}
      />
    </Bloque>
  )
}

function FilaDepartamento({
  departamento,
  abierto,
  onAbrir,
  editable,
  deshabilitado,
  onCambiar,
}: {
  departamento: DepartamentoTerritorio
  abierto: boolean
  onAbrir: (abierto: boolean) => void
  editable: boolean
  deshabilitado: boolean
  onCambiar: (activo: boolean) => void
}) {
  const abrirHistorial = useHistorial()
  const idPanel = useId()
  return (
    <li id={`departamento-${departamento.codigo}`} className="scroll-mt-4">
      <div className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={idPanel}
          onClick={() => onAbrir(!abierto)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:anillo-foco"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              abierto && "rotate-90"
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "truncate text-sm font-medium",
                !departamento.activo && "text-muted-foreground"
              )}
            >
              {departamento.nombre}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {departamento.region} ·{" "}
              {pluralizar(departamento.municipios, "municipio", "municipios")}
              {departamento.municipiosInactivos > 0
                ? ` · ${pluralizar(departamento.municipiosInactivos, "deshabilitado", "deshabilitados")}`
                : ""}
            </span>
          </span>
        </button>
        {abrirHistorial ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Historial de ${departamento.nombre}`}
            onClick={() =>
              abrirHistorial({
                entidad: "departamentos",
                entidadId: departamento.codigo,
                titulo: departamento.nombre,
              })
            }
          >
            <History aria-hidden />
          </Button>
        ) : null}
        <Switch
          checked={departamento.activo}
          onCheckedChange={(valor) => onCambiar(valor)}
          disabled={!editable || deshabilitado}
          aria-label={`${departamento.activo ? "Deshabilitar" : "Habilitar"} ${departamento.nombre}`}
        />
      </div>
      {abierto ? (
        <div id={idPanel} className="border-t bg-muted/20 px-3 py-3 sm:px-5">
          <Municipios
            departamento={departamento}
            editable={editable && departamento.activo}
          />
        </div>
      ) : null}
    </li>
  )
}

function Municipios({
  departamento,
  editable,
}: {
  departamento: DepartamentoTerritorio
  editable: boolean
}) {
  const [municipios, setMunicipios] = useState<MunicipioTerritorio[] | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmarTodos, setConfirmarTodos] = useState(false)
  const [cargando, iniciarCarga] = useTransition()
  const [guardando, iniciar] = useTransition()

  useEffect(() => {
    let vigente = true
    iniciarCarga(async () => {
      try {
        const resultado = await municipiosDeDepartamento({
          codigo: departamento.codigo,
        })
        if (!vigente) return
        if (resultado.ok) setMunicipios(resultado.datos)
        else setError(resultado.error)
      } catch {
        if (vigente) setError(MENSAJE_INESPERADO)
      }
    })
    return () => {
      vigente = false
    }
  }, [departamento.codigo])

  async function aplicar(codigos: string[], activo: boolean) {
    const resultado = await cambiarActivoMunicipios({ codigos, activo })
    if (!resultado.ok) return resultado
    const cambiados = new Set(codigos)
    setMunicipios(
      (actuales) =>
        actuales?.map((m) =>
          cambiados.has(m.codigo) ? { ...m, activo } : m
        ) ?? actuales
    )
    if (codigos.length > 1) {
      toast.success(
        `${pluralizar(resultado.datos.cambiados, "municipio", "municipios")} ${activo ? "habilitados" : "deshabilitados"}`
      )
    }
    return resultado
  }

  function cambiar(codigos: string[], activo: boolean) {
    iniciar(async () => {
      try {
        const resultado = await aplicar(codigos, activo)
        if (!resultado.ok) toast.error(resultado.error)
      } catch {
        toast.error(MENSAJE_INESPERADO)
      }
    })
  }

  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )
  if (!municipios) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-label="Cargando" />
        {cargando ? "Cargando municipios…" : null}
      </p>
    )
  }

  const inactivos = municipios.filter((m) => !m.activo).map((m) => m.codigo)
  const activos = municipios.filter((m) => m.activo).map((m) => m.codigo)

  return (
    <div className="flex flex-col gap-3" aria-busy={guardando || undefined}>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={guardando || inactivos.length === 0}
            onClick={() => cambiar(inactivos.slice(0, 200), true)}
          >
            Habilitar todos
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={guardando || activos.length === 0}
            onClick={() => setConfirmarTodos(true)}
          >
            Deshabilitar todos
          </Button>
          {/* Equivale a sacar el departamento de los formularios: se confirma igual. */}
          <DialogoConfirmacion
            abierto={confirmarTodos}
            onAbiertoChange={setConfirmarTodos}
            titulo={`¿Deshabilitar ${pluralizar(activos.length, "municipio", "municipios")} de ${departamento.nombre}?`}
            descripcion="Dejan de ofrecerse en los formularios y en la segmentación de ofertas. Los anunciantes y medios que ya tienen sede allí no cambian. Puedes volver a habilitarlos cuando quieras."
            textoConfirmar="Deshabilitar todos"
            destructivo
            onConfirmar={() => aplicar(activos.slice(0, 200), false)}
          />
        </div>
      ) : departamento.activo ? null : (
        <p className="text-xs text-muted-foreground">
          Habilita el departamento para cambiar sus municipios.
        </p>
      )}
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {municipios.map((municipio) => (
          <li
            key={municipio.codigo}
            className="flex items-center justify-between gap-2 py-0.5"
          >
            <span
              className={cn(
                "min-w-0 truncate text-sm",
                !municipio.activo &&
                  "text-muted-foreground line-through decoration-muted-foreground/40"
              )}
            >
              {municipio.nombre}
              {municipio.esCapital ? (
                <span className="ml-1.5 text-[0.6875rem] font-medium text-primary no-underline">
                  capital
                </span>
              ) : null}
            </span>
            <Switch
              size="sm"
              checked={municipio.activo}
              disabled={!editable || guardando}
              onCheckedChange={(valor) => cambiar([municipio.codigo], valor)}
              aria-label={`${municipio.activo ? "Deshabilitar" : "Habilitar"} ${municipio.nombre}`}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Mapa de los departamentos habilitados; un clic abre ese departamento en la lista. */
function MapaTerritorio({
  departamentos,
  seleccionado,
  onElegir,
}: {
  departamentos: readonly DepartamentoTerritorio[]
  seleccionado: string | null
  onElegir: (codigo: string) => void
}) {
  const id = useId()
  const porCodigo = new Map(departamentos.map((d) => [d.codigo, d]))
  const patron = `${id}-inactivo`
  return (
    <figure className="hidden flex-col gap-3 p-5 @3xl:flex">
      {/* Atajo visual: la lista de al lado es la vía accesible (teclado y lectores). */}
      <svg viewBox={VIEWBOX_COLOMBIA} aria-hidden className="h-auto w-full">
        <defs>
          <pattern
            id={patron}
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={10} height={10} className="fill-muted" />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={10}
              strokeWidth={3}
              className="stroke-foreground/12"
            />
          </pattern>
        </defs>
        <rect
          x={RECUADRO_SAN_ANDRES.x}
          y={RECUADRO_SAN_ANDRES.y}
          width={RECUADRO_SAN_ANDRES.ancho}
          height={RECUADRO_SAN_ANDRES.alto}
          rx={14}
          className="fill-none stroke-border"
          strokeDasharray="6 6"
          strokeWidth={2}
        />
        {Object.entries(PATHS_DEPARTAMENTOS).map(([codigo, d]) => {
          const departamento = porCodigo.get(codigo)
          const activo = departamento?.activo ?? false
          const nombre = departamento?.nombre ?? codigo
          return (
            <path
              key={codigo}
              d={d}
              fill={activo ? undefined : `url(#${patron})`}
              onClick={() => onElegir(codigo)}
              className={cn(
                "cursor-pointer stroke-background transition-[fill,stroke] duration-200",
                activo && "fill-primary/55 hover:fill-primary/75",
                seleccionado === codigo
                  ? "stroke-foreground [stroke-width:3]"
                  : "[stroke-width:1.5]"
              )}
            >
              <title>{`${nombre}: ${activo ? "habilitado" : "deshabilitado"}`}</title>
            </path>
          )
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-primary/55" />
          Habilitado
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm border bg-muted" />
          Deshabilitado
        </span>
      </figcaption>
    </figure>
  )
}
