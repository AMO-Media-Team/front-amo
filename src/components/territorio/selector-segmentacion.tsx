"use client"

import { Check, ChevronLeft, ChevronRight, Earth, Plus } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  alternarDepartamento,
  alternarMunicipio,
  departamentoCompleto,
  departamentoDeMunicipio,
  departamentosConMunicipios,
  esSegmentacionVacia,
  municipiosElegidosDe,
  quitarDepartamento,
  quitarMunicipio,
  resumenSegmentacion,
  SEGMENTACION_VACIA,
} from "@/features/territorio/segmentacion"
import type {
  DepartamentoActivo,
  Segmentacion,
} from "@/features/territorio/tipos"
import { cn } from "@/lib/utils"

import { filtrarTerritorio } from "./busqueda"
import {
  type ConsultaDepartamentos,
  indicePorCodigo,
  type MunicipiosDeVarios,
  useDepartamentosActivos,
  useMunicipiosActivos,
  useMunicipiosDeVarios,
} from "./consultas"
import { EstadoLista, type EstadoFicha, FichaTerritorio } from "./partes"

/** Más fichas que estas se pliegan tras «Mostrar N más». */
const FICHAS_VISIBLES = 12

export interface PropsSelectorSegmentacion {
  valor: Segmentacion
  onCambio: (valor: Segmentacion) => void
  /**
   * Id del botón «Agregar…». No le asocies un `<label>`: le quitaría su
   * nombre visible (WCAG 2.5.3). Para titular el campo usa `FieldSet` con
   * `FieldLegend`; el error va en `describedBy`.
   */
  id?: string
  invalido?: boolean
  deshabilitado?: boolean
  /** Id del mensaje de error o ayuda del campo. */
  describedBy?: string
  /** Resumen cuando no hay nada elegido. */
  textoVacio?: string
  /** Explicación cuando no hay nada elegido. */
  descripcionVacio?: string
}

function Casilla({ marcada }: { marcada: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
        marcada
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input"
      )}
    >
      {marcada ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}

interface Ficha {
  clave: string
  tipo: "departamento" | "municipio"
  titulo: string
  detalle?: string
  estado: EstadoFicha
  quitar: (valor: Segmentacion) => Segmentacion
}

function fichasDe(
  valor: Segmentacion,
  departamentos: ConsultaDepartamentos,
  municipios: MunicipiosDeVarios
): Ficha[] {
  const porCodigo = indicePorCodigo(departamentos.data)
  const deDepartamentos = valor.departamentos.map((codigo): Ficha => {
    const departamento = porCodigo.get(codigo)
    return {
      clave: `d-${codigo}`,
      tipo: "departamento",
      titulo: departamento?.nombreCorto ?? `Departamento ${codigo}`,
      detalle: "todo el departamento",
      estado: departamentos.isPending
        ? "cargando"
        : departamento || departamentos.isError
          ? "listo"
          : "no-disponible",
      quitar: (actual) => quitarDepartamento(actual, codigo),
    }
  })
  const deMunicipios = valor.municipios.map((codigo): Ficha => {
    const departamento = departamentoDeMunicipio(codigo)
    const municipio = municipios.porCodigo.get(codigo)
    return {
      clave: `m-${codigo}`,
      tipo: "municipio",
      titulo: municipio?.nombre ?? `Municipio ${codigo}`,
      detalle: porCodigo.get(departamento)?.nombreCorto,
      estado: municipios.cargando.has(departamento)
        ? "cargando"
        : municipio || municipios.conError.has(departamento)
          ? "listo"
          : "no-disponible",
      quitar: (actual) => quitarMunicipio(actual, codigo),
    }
  })
  return [...deDepartamentos, ...deMunicipios]
}

/**
 * Segmentación geográfica: varios departamentos completos y municipios
 * sueltos como fichas. El panel tiene dos niveles (departamentos → sus
 * municipios) y un departamento completo absorbe sus municipios (la regla de
 * elegibilidad es «municipio elegido o departamento elegido»). Vacío = todo
 * el país, y así se dice.
 */
export function SelectorSegmentacion({
  valor,
  onCambio,
  id,
  invalido,
  deshabilitado,
  describedBy,
  textoVacio = "Todo el país",
  descripcionVacio = "Sin restricción geográfica: la oferta llega a medios de todo el país. Agrega departamentos o municipios para acotarla.",
}: PropsSelectorSegmentacion) {
  const idBase = useId()
  const idDisparador = id ?? `${idBase}-agregar`
  const idResumen = `${idBase}-resumen`
  const [abierto, setAbierto] = useState(false)
  // Cada apertura monta un panel nuevo (empieza en los departamentos, sin
  // texto) sin vaciarlo durante la animación de cierre.
  const [apertura, setApertura] = useState(0)
  const [expandido, setExpandido] = useState(false)
  const departamentos = useDepartamentosActivos()
  const municipios = useMunicipiosDeVarios(departamentosConMunicipios(valor))
  const fichas = fichasDe(valor, departamentos, municipios)
  const plegables = fichas.length - FICHAS_VISIBLES
  const visibles = expandido ? fichas : fichas.slice(0, FICHAS_VISIBLES)
  const vacia = esSegmentacionVacia(valor)
  const noDisponibles = fichas.filter((f) => f.estado === "no-disponible")

  function quitar(ficha: Ficha) {
    onCambio(ficha.quitar(valor))
    // La ficha (y su botón) desaparece: el foco vuelve a «Agregar».
    requestAnimationFrame(() => document.getElementById(idDisparador)?.focus())
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p
          id={idResumen}
          className="flex items-center gap-1.5 text-sm font-medium"
          aria-live="polite"
        >
          <Earth aria-hidden className="size-4 text-primary" />
          {resumenSegmentacion(valor, textoVacio)}
        </p>
        {fichas.length >= 2 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onCambio(SEGMENTACION_VACIA)
              requestAnimationFrame(() =>
                document.getElementById(idDisparador)?.focus()
              )
            }}
            disabled={deshabilitado}
          >
            Quitar todo
          </Button>
        ) : null}
      </div>

      {vacia ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-[0.8125rem] text-muted-foreground">
          {descripcionVacio}
        </p>
      ) : (
        <ul aria-label="Territorio elegido" className="flex flex-wrap gap-1.5">
          {visibles.map((ficha) => (
            <FichaTerritorio
              key={ficha.clave}
              tipo={ficha.tipo}
              titulo={ficha.titulo}
              detalle={ficha.detalle}
              estado={ficha.estado}
              onQuitar={() => quitar(ficha)}
              deshabilitado={deshabilitado}
            />
          ))}
          {plegables > 0 ? (
            <li>
              {/* Alterna en el mismo botón: el foco no se pierde al expandir. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full"
                aria-expanded={expandido}
                onClick={() => setExpandido((previo) => !previo)}
              >
                {expandido ? "Mostrar menos" : `Mostrar ${plegables} más`}
              </Button>
            </li>
          ) : null}
        </ul>
      )}

      {noDisponibles.length > 0 ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {noDisponibles.length === 1
            ? "Un territorio elegido ya no está activo: quítalo para poder guardar."
            : `${noDisponibles.length} territorios elegidos ya no están activos: quítalos para poder guardar.`}
        </p>
      ) : null}

      <Popover
        open={abierto}
        onOpenChange={(siguiente) => {
          if (siguiente) setApertura((n) => n + 1)
          setAbierto(siguiente)
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={idDisparador}
              type="button"
              variant="outline"
              aria-invalid={invalido || undefined}
              aria-describedby={
                [idResumen, describedBy].filter(Boolean).join(" ") || undefined
              }
              disabled={deshabilitado}
              className="h-9 w-fit border-dashed"
            />
          }
        >
          <Plus data-icon="inline-start" aria-hidden />
          Agregar departamento o municipio
        </PopoverTrigger>
        <PopoverContent
          className="w-80 max-w-[calc(100vw-2rem)] p-0"
          align="start"
        >
          <PanelSegmentacion
            key={apertura}
            valor={valor}
            onCambio={onCambio}
            departamentos={departamentos}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function PanelSegmentacion({
  valor,
  onCambio,
  departamentos,
}: {
  valor: Segmentacion
  onCambio: (valor: Segmentacion) => void
  departamentos: ConsultaDepartamentos
}) {
  const [abierto, setAbierto] = useState<DepartamentoActivo | null>(null)
  const [texto, setTexto] = useState("")

  function entrar(departamento: DepartamentoActivo) {
    setAbierto(departamento)
    setTexto("")
  }
  function volver() {
    setAbierto(null)
    setTexto("")
  }

  const busqueda = abierto
    ? `Busca un municipio de ${abierto.nombreCorto}…`
    : "Busca un departamento…"

  return (
    <Command
      shouldFilter={false}
      // Nombra el buscador (cmdk anula el `aria-label` del input).
      label={busqueda}
      onKeyDown={(evento) => {
        // Borrar con el buscador vacío vuelve a los departamentos.
        if (evento.key === "Backspace" && texto === "" && abierto) {
          evento.preventDefault()
          volver()
        }
      }}
    >
      <CommandInput
        value={texto}
        onValueChange={setTexto}
        placeholder={busqueda}
      />
      <p className="sr-only" aria-live="polite">
        {abierto
          ? `Municipios de ${abierto.nombreCorto}. Elige varios o todo el departamento.`
          : ""}
      </p>
      {/* Cada nivel pinta su lista y, junto a ella (no dentro: el listbox
          solo contiene opciones), la carga, el error o «sin coincidencias». */}
      {abierto ? (
        <NivelMunicipios
          departamento={abierto}
          texto={texto}
          valor={valor}
          onCambio={onCambio}
          onVolver={volver}
        />
      ) : (
        <NivelDepartamentos
          consulta={departamentos}
          texto={texto}
          valor={valor}
          onEntrar={entrar}
        />
      )}
    </Command>
  )
}

function NivelDepartamentos({
  consulta,
  texto,
  valor,
  onEntrar,
}: {
  consulta: ConsultaDepartamentos
  texto: string
  valor: Segmentacion
  onEntrar: (departamento: DepartamentoActivo) => void
}) {
  const filtrados = consulta.data
    ? filtrarTerritorio(consulta.data, texto, (d) => [d.nombreCorto, d.nombre])
    : []
  return (
    <>
      <EstadoLista
        consulta={consulta}
        hayDatos={consulta.data !== undefined}
        hayFilas={filtrados.length > 0}
        textoVacio={
          texto
            ? `Ningún departamento coincide con «${texto}».`
            : "No hay departamentos activos."
        }
      />
      <CommandList>
        {filtrados.length > 0 ? (
          <CommandGroup heading="Departamentos">
            {filtrados.map((departamento) => {
              const completo = departamentoCompleto(valor, departamento.codigo)
              const elegidos = municipiosElegidosDe(
                valor,
                departamento.codigo
              ).length
              return (
                <CommandItem
                  key={departamento.codigo}
                  value={`d-${departamento.codigo}`}
                  onSelect={() => onEntrar(departamento)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {departamento.nombreCorto}
                  </span>
                  {completo ? (
                    <span className="rounded-full bg-primary/12 px-1.5 text-[0.6875rem] leading-4 font-medium text-primary">
                      Todo
                    </span>
                  ) : elegidos > 0 ? (
                    <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] leading-4 cifras text-muted-foreground">
                      {elegidos}
                    </span>
                  ) : null}
                  <span className="sr-only">
                    {completo
                      ? ", todo el departamento elegido"
                      : elegidos > 0
                        ? `, ${elegidos} ${elegidos === 1 ? "municipio elegido" : "municipios elegidos"}`
                        : ""}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
      </CommandList>
    </>
  )
}

function NivelMunicipios({
  departamento,
  texto,
  valor,
  onCambio,
  onVolver,
}: {
  departamento: DepartamentoActivo
  texto: string
  valor: Segmentacion
  onCambio: (valor: Segmentacion) => void
  onVolver: () => void
}) {
  const consulta = useMunicipiosActivos(departamento.codigo)
  const completo = departamentoCompleto(valor, departamento.codigo)
  const filtrados = consulta.data
    ? filtrarTerritorio(consulta.data, texto, (m) => [m.nombre])
    : []
  const total = consulta.data?.length

  return (
    <>
      <CommandList>
        {/* Borde en lugar de `CommandSeparator`: un `role="separator"` no es
            un hijo válido del listbox. */}
        <CommandGroup className="border-b">
          <CommandItem value="volver" onSelect={onVolver}>
            <ChevronLeft aria-hidden className="text-muted-foreground" />
            Todos los departamentos
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading={departamento.nombreCorto}>
          <CommandItem
            value={`todo-${departamento.codigo}`}
            aria-checked={completo}
            onSelect={() =>
              onCambio(alternarDepartamento(valor, departamento.codigo))
            }
          >
            <Casilla marcada={completo} />
            <span className="min-w-0 flex-1 truncate font-medium">
              Todo {departamento.nombreCorto}
            </span>
            {total !== undefined ? (
              <span className="text-xs cifras text-muted-foreground">
                {total} {total === 1 ? "municipio" : "municipios"}
              </span>
            ) : null}
          </CommandItem>
        </CommandGroup>
        {!completo && filtrados.length > 0 ? (
          <CommandGroup heading="Municipios">
            {filtrados.map((municipio) => {
              const elegido = valor.municipios.includes(municipio.codigo)
              return (
                <CommandItem
                  key={municipio.codigo}
                  value={`m-${municipio.codigo}`}
                  aria-checked={elegido}
                  onSelect={() =>
                    onCambio(alternarMunicipio(valor, municipio.codigo))
                  }
                >
                  <Casilla marcada={elegido} />
                  <span className="min-w-0 flex-1 truncate">
                    {municipio.nombre}
                  </span>
                  {municipio.esCapital ? (
                    <span className="text-xs text-muted-foreground">
                      Capital
                    </span>
                  ) : null}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
      </CommandList>
      {completo ? (
        <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">
          Incluye todos sus municipios. Para elegir solo algunos, desmarca «Todo{" "}
          {departamento.nombreCorto}».
        </p>
      ) : (
        <EstadoLista
          consulta={consulta}
          hayDatos={consulta.data !== undefined}
          hayFilas={filtrados.length > 0}
          textoVacio={
            texto
              ? `Ningún municipio coincide con «${texto}».`
              : "Este departamento no tiene municipios activos."
          }
        />
      )}
    </>
  )
}
