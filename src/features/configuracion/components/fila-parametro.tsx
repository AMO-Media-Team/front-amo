"use client"

import {
  Check,
  EllipsisVertical,
  History,
  Pencil,
  RotateCcw,
  TriangleAlert,
} from "lucide-react"
import { type RefObject, useEffect, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { guardarParametro } from "../actions"
import {
  type Borrador,
  borradorInicial,
  interpretarBorrador,
  textoRango,
} from "../edicion"
import { fichaDe, tituloParametro } from "../parametros"
import { puedeEditarParametro } from "../permisos"
import type { Parametro, ValorParametro } from "../tipos"
import {
  type ContextoPresentacion,
  describirDiferencia,
  leerValor,
  presentarValor,
  sonIguales,
} from "../valores"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { DialogoRevision } from "./dialogo-revision"
import { EditorValor } from "./editor-valor"
import { InsigniaPendiente, InsigniaPublica } from "./insignias"
import {
  DetalleDiferencia,
  NotaImpacto,
  ParAntesDespues,
} from "./revision-valor"
import type { OpcionSelector } from "./selector-opciones"

/** Nombres y opciones que viven en otras tablas (países, municipios). */
export interface ContextoParametros {
  /** Nombre de cada valor posible (sin `opcionesLista`, p. ej. el municipio elegido). */
  etiquetas?: Readonly<Record<string, string>>
  /** Opciones de una lista abierta (países habituales); también dan los nombres. */
  opcionesLista?: readonly OpcionSelector[]
}

interface Propuesta {
  valor: ValorParametro
  /** "Restablecer" muestra otro título en la confirmación. */
  restablecer: boolean
}

/**
 * Un parámetro de `configuracion`: valor vigente con su unidad, rango y
 * valor de fábrica; edición en línea según su tipo, confirmación con la
 * diferencia y el impacto, e historial de la bitácora.
 */
export function FilaParametro({
  parametro,
  contexto = {},
}: {
  parametro: Parametro
  contexto?: ContextoParametros
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const ficha = fichaDe(parametro.clave)
  const titulo = tituloParametro(parametro.clave)
  // Nombres de valores elegidos durante la edición (un municipio buscado).
  const [etiquetasNuevas, setEtiquetasNuevas] = useState<
    Record<string, string>
  >({})
  const etiquetas = {
    ...(contexto.etiquetas ??
      Object.fromEntries(
        (contexto.opcionesLista ?? []).map((o) => [o.valor, o.etiqueta])
      )),
    ...etiquetasNuevas,
  }
  const presentacion: ContextoPresentacion = {
    etiquetas,
    booleano: ficha?.booleano,
  }
  const editable = puedeEditarParametro(parametro.clave, permisos)

  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const idBase = useId()
  const idCampo = `${idBase}-campo`
  const idAyuda = `${idBase}-ayuda`
  const botonEditar = useRef<HTMLButtonElement>(null)
  const devolverFoco = useRef(false)

  // Al cerrar el editor (Escape, Cancelar o tras guardar) el campo desaparece:
  // sin esto el foco caería en <body> y quien usa teclado perdería su lugar.
  useEffect(() => {
    if (!devolverFoco.current || borrador !== null || propuesta !== null) return
    devolverFoco.current = false
    botonEditar.current?.focus()
  }, [borrador, propuesta])

  const actual = presentarValor(parametro, parametro.valor, presentacion)
  const defecto = ficha
    ? presentarValor(parametro, ficha.defecto, presentacion)
    : null
  const modificado =
    ficha !== null &&
    parametro.valor !== null &&
    !sonIguales(parametro.valor, ficha.defecto)
  const rango = textoRango(parametro)

  function empezar() {
    setError(null)
    setBorrador(borradorInicial(parametro, parametro.valor))
  }

  function cancelar() {
    devolverFoco.current = true
    setBorrador(null)
    setError(null)
  }

  function revisar() {
    if (!borrador) return
    const resultado = interpretarBorrador(parametro, borrador)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    if (sonIguales(resultado.valor, parametro.valor)) {
      cancelar()
      return
    }
    setPropuesta({ valor: resultado.valor, restablecer: false })
  }

  async function confirmar() {
    if (!propuesta) return { ok: false as const, error: "Nada que guardar." }
    const resultado = await guardarParametro({
      clave: parametro.clave,
      valor: propuesta.valor,
      actualizadoAt: parametro.actualizadoAt,
    })
    if (resultado.ok) {
      toast.success(`${titulo} actualizado`, {
        description: presentarValor(parametro, propuesta.valor, presentacion)
          .texto,
      })
      cancelar()
    } else if (resultado.erroresCampo?.valor && borrador) {
      setError(resultado.erroresCampo.valor[0] ?? resultado.error)
    }
    return resultado
  }

  function historial() {
    abrirHistorial?.({
      entidad: "configuracion",
      entidadId: parametro.clave,
      titulo,
      camposCreacion: ["valor"],
      formatearCampo: (campo, valor) =>
        campo === "valor"
          ? presentarValor(
              parametro,
              leerValor(parametro.tipo, valor),
              presentacion
            ).texto
          : null,
    })
  }

  const enEdicion = borrador !== null

  return (
    <li
      className={cn(
        "group/fila @container flex flex-col gap-3 px-4 py-4 transition-[background-color,box-shadow] sm:px-5",
        // La fila en edición se marca con una barra lateral. El tinte solo va en
        // oscuro: en claro bajaba a 4,44:1 el contraste de «Por validar» (AA pide 4,5).
        enEdicion &&
          "shadow-[inset_2px_0_0_var(--primary)] dark:bg-primary/[0.035]"
      )}
    >
      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-start @xl:justify-between @xl:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-sm font-medium">{titulo}</h4>
            {parametro.pendienteValidacion ? (
              <InsigniaPendiente compacta />
            ) : null}
            {parametro.esPublica ? <InsigniaPublica /> : null}
          </div>
          <p className="text-sm text-pretty text-muted-foreground">
            {parametro.descripcion}
          </p>
          <MetaParametro
            rango={rango}
            defecto={defecto?.texto ?? null}
            modificado={modificado}
          />
        </div>

        <div
          className={cn(
            "flex items-start gap-2 @xl:justify-end",
            // En edición solo queda el menú: va al final, no suelto a la izquierda.
            enEdicion ? "justify-end" : "justify-between"
          )}
        >
          {enEdicion ? null : (
            // El desplazamiento centra la primera línea del valor con el botón «Editar».
            <div className="flex min-w-0 flex-col pt-[0.1875rem] @xl:items-end">
              <span
                className={cn(
                  "text-[0.9375rem] font-semibold cifras text-pretty @xl:text-right",
                  parametro.valor === null && "text-destructive"
                )}
              >
                {actual.texto}
              </span>
              {actual.equivalencia ? (
                <span className="text-xs text-muted-foreground">
                  {actual.equivalencia}
                </span>
              ) : null}
            </div>
          )}
          <AccionesFila
            titulo={titulo}
            refEditar={botonEditar}
            editable={editable && !enEdicion}
            restablecible={editable && modificado && !enEdicion}
            onEditar={empezar}
            onHistorial={abrirHistorial ? historial : null}
            onRestablecer={() =>
              ficha && setPropuesta({ valor: ficha.defecto, restablecer: true })
            }
          />
        </div>
      </div>

      {borrador ? (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-background/60 p-3 sm:p-4">
          <label htmlFor={idCampo} className="sr-only">
            Nuevo valor de {titulo}
          </label>
          <EditorValor
            parametro={parametro}
            borrador={borrador}
            onCambio={(siguiente) => {
              setBorrador(siguiente)
              setError(null)
            }}
            idCampo={idCampo}
            idDescripcion={idAyuda}
            invalido={error !== null}
            deshabilitado={false}
            etiquetas={etiquetas}
            onEtiqueta={(valor, etiqueta) =>
              setEtiquetasNuevas((actuales) => ({
                ...actuales,
                [valor]: etiqueta,
              }))
            }
            opciones={contexto.opcionesLista}
            booleano={ficha?.booleano}
            onEnviar={revisar}
            onCancelar={cancelar}
          />
          <div id={idAyuda} className="flex flex-col gap-1 text-xs">
            {error ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-sm text-destructive"
              >
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                {error}
              </p>
            ) : rango ? (
              <p className="text-muted-foreground">{rango}.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={revisar}>
              <Check data-icon="inline-start" aria-hidden />
              Revisar cambio
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {propuesta ? (
        <DialogoRevision
          abierto
          onAbiertoChange={(abierto) => {
            if (!abierto) setPropuesta(null)
          }}
          titulo={
            propuesta.restablecer
              ? `¿Restablecer «${titulo}»?`
              : `¿Cambiar «${titulo}»?`
          }
          descripcion={
            propuesta.restablecer
              ? "Vuelve al valor con el que se configuró la plataforma."
              : "Revisa el cambio antes de aplicarlo. Quedará registrado en la bitácora."
          }
          icono={propuesta.restablecer ? RotateCcw : undefined}
          textoConfirmar={
            propuesta.restablecer ? "Restablecer" : "Aplicar cambio"
          }
          // Tras guardar, el campo que tenía el foco ya no existe.
          focoAlCerrar={() => botonEditar.current}
          onConfirmar={confirmar}
        >
          <ParAntesDespues
            antes={actual}
            despues={presentarValor(parametro, propuesta.valor, presentacion)}
          />
          <DetalleDiferencia
            diferencia={describirDiferencia(
              parametro,
              parametro.valor,
              propuesta.valor,
              presentacion
            )}
          />
          {ficha?.impacto ? <NotaImpacto>{ficha.impacto}</NotaImpacto> : null}
        </DialogoRevision>
      ) : null}
    </li>
  )
}

function MetaParametro({
  rango,
  defecto,
  modificado,
}: {
  rango: string | null
  defecto: string | null
  modificado: boolean
}) {
  if (!rango && !defecto) return null
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {rango ? <span>{rango}</span> : null}
      {defecto ? (
        <span className="inline-flex items-center gap-1.5">
          {modificado ? (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-primary"
              title="Distinto del valor predeterminado"
            />
          ) : null}
          Predeterminado: <span className="cifras">{defecto}</span>
          {modificado ? <span className="sr-only">(modificado)</span> : null}
        </span>
      ) : null}
    </p>
  )
}

function AccionesFila({
  titulo,
  refEditar,
  editable,
  restablecible,
  onEditar,
  onHistorial,
  onRestablecer,
}: {
  titulo: string
  refEditar: RefObject<HTMLButtonElement | null>
  editable: boolean
  restablecible: boolean
  onEditar: () => void
  onHistorial: (() => void) | null
  onRestablecer: () => void
}) {
  const menu = onHistorial !== null || restablecible
  if (!editable && !menu) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {editable ? (
        <Button
          ref={refEditar}
          variant="outline"
          size="sm"
          onClick={onEditar}
          aria-label={`Editar ${titulo}`}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          <span aria-hidden>Editar</span>
        </Button>
      ) : null}
      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Más acciones de ${titulo}`}
              />
            }
          >
            <EllipsisVertical aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {onHistorial ? (
              <DropdownMenuItem onClick={onHistorial}>
                <History aria-hidden />
                Ver historial de cambios
              </DropdownMenuItem>
            ) : null}
            {restablecible ? (
              <DropdownMenuItem onClick={onRestablecer}>
                <RotateCcw aria-hidden />
                Restablecer valor predeterminado
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
