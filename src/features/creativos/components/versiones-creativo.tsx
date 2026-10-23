"use client"

import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronDown,
  CircleAlert,
  FilePlus2,
  FileStack,
  Rocket,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"
import {
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EstadoError } from "@/components/feedback/estado-error"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import {
  activarVersionCreativo,
  crearVersionPendiente,
  descartarVersionPendiente,
} from "../actions"
import { ETIQUETAS_TIPO, tipoInicial, tiposDeCreativo } from "../formatos"
import { FALTAS } from "../paquete"
import { estadoVersion, fechaVersion, tituloVersion } from "../presentacion"
import type {
  EstadoCreativo,
  FormatoOferta,
  TipoCreativo,
  VersionCreativo,
} from "../tipos"
import {
  CLAVES_CREATIVO,
  MENSAJE_SIN_CONEXION,
  useDatosCreativo,
} from "./consultas"
import { EditorCreativo } from "./editor-creativo"
import { EsqueletoCreativo } from "./esqueleto-creativo"
import { VisorCreativo } from "./visor-creativo"

export interface PropsVersionesCreativo {
  ofertaId: string
  versiones: readonly VersionCreativo[]
  /** Oferta publicada del propio anunciante (o modo asistido): puede preparar y activar una versión nueva. */
  puedeVersionar: boolean
}

function CabeceraVersion({
  version,
  idTitulo,
  nivel: Titulo = "h3",
  refTitulo,
}: {
  version: VersionCreativo
  idTitulo: string
  nivel?: "h3" | "h4"
  /** Título que recibe el foco cuando desaparece el botón que se usó. */
  refTitulo?: RefObject<HTMLHeadingElement | null>
}) {
  const estado = estadoVersion(version)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Titulo
          ref={refTitulo}
          id={idTitulo}
          tabIndex={refTitulo ? -1 : undefined}
          className="rounded-sm text-base font-semibold outline-none focus-visible:anillo-foco"
        >
          {tituloVersion(version)}
        </Titulo>
        <InsigniaTono
          tono={estado.tono}
          etiqueta={estado.etiqueta}
          titulo={estado.descripcion}
        />
      </div>
      <p className="text-xs text-pretty text-muted-foreground">
        {fechaVersion(version)} · {estado.descripcion}
      </p>
    </div>
  )
}

/** Por qué el anunciante no puede activar la versión (empresa sin verificar o suspendida). */
function AvisoActivacion({ motivo }: { motivo: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2.5 text-sm text-pretty">
      <ShieldAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-warning"
      />
      {motivo}
    </p>
  )
}

type Inicio = "conservar" | "cero"

/** Cómo nace la versión nueva: copia de la vigente o en blanco (con su tipo). */
function DialogoVersionNueva({
  abierto,
  onAbiertoChange,
  ofertaId,
  formato,
  vigente,
  alPreparar,
  focoAlCerrar,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  ofertaId: string
  formato: FormatoOferta
  vigente: VersionCreativo | null
  /** `true` al empezar a preparar (el foco irá a la versión nueva); `false` si falla. */
  alPreparar: (preparando: boolean) => void
  /** `finalFocus` del diálogo. */
  focoAlCerrar: () => HTMLElement | boolean
}) {
  const cliente = useQueryClient()
  const tipos = tiposDeCreativo(formato)
  const [inicio, setInicio] = useState<Inicio>(vigente ? "conservar" : "cero")
  const [tipo, setTipo] = useState<TipoCreativo>(
    vigente?.tipo ?? tipoInicial(formato)
  )
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const idError = useId()
  const siguiente = (vigente?.version ?? 0) + 1

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) setError(null)
    onAbiertoChange(valor)
  }

  function preparar() {
    setError(null)
    // Antes de la acción: la página puede refrescarse (y este diálogo
    // desmontarse) en cuanto la versión nueva existe.
    alPreparar(true)
    iniciar(async () => {
      let resultado: Awaited<ReturnType<typeof crearVersionPendiente>>
      try {
        resultado = await crearVersionPendiente({
          ofertaId,
          conservar: inicio === "conservar",
          tipo: inicio === "cero" ? tipo : undefined,
        })
      } catch {
        // Sin red la acción lanza: el diálogo sigue abierto para reintentar.
        alPreparar(false)
        setError(MENSAJE_SIN_CONEXION)
        return
      }
      if (!resultado.ok) {
        alPreparar(false)
        setError(resultado.error)
        return
      }
      await cliente.invalidateQueries({
        queryKey: CLAVES_CREATIVO.datos(ofertaId),
      })
      if (resultado.datos.aviso) {
        toast.warning(
          `Versión ${resultado.datos.version.version} creada con un pendiente`,
          {
            description: resultado.datos.aviso,
          }
        )
      } else {
        toast.success(
          `Versión ${resultado.datos.version.version} lista para editar`,
          {
            description:
              "Los medios siguen viendo la versión vigente hasta que actives la nueva.",
          }
        )
      }
      onAbiertoChange(false)
    })
  }

  const opcion =
    "flex cursor-pointer gap-3 rounded-xl border bg-background/60 p-3.5 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogContent
        showCloseButton={false}
        className="gap-4 sm:max-w-lg"
        finalFocus={focoAlCerrar}
      >
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label="Cerrar"
              disabled={pendiente}
            />
          }
        >
          <X aria-hidden />
        </DialogClose>
        <DialogHeader className="pr-8">
          <DialogTitle>Preparar la versión {siguiente}</DialogTitle>
          <DialogDescription>
            Los medios seguirán viendo la versión vigente mientras preparas la
            nueva. Cuando la actives, los que ya aceptaron reciben un aviso para
            descargarla.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={inicio}
          onValueChange={(valor) => setInicio(valor as Inicio)}
          aria-label="Cómo empezar la versión nueva"
          disabled={pendiente}
          className="flex flex-col gap-2.5"
        >
          {vigente ? (
            <label className={opcion}>
              <RadioGroupItem value="conservar" className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  Partir de la versión {vigente.version}
                </span>
                <span className="text-sm text-pretty text-muted-foreground">
                  Copia sus archivos y textos; luego cambias solo lo que
                  necesites.
                </span>
              </span>
            </label>
          ) : null}
          <label className={opcion}>
            <RadioGroupItem value="cero" className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Empezar desde cero</span>
              <span className="text-sm text-pretty text-muted-foreground">
                Sin archivos ni textos: cargas todo de nuevo.
              </span>
            </span>
          </label>
        </RadioGroup>

        {inicio === "cero" && tipos.length > 1 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              ¿Qué vas a publicar?
            </legend>
            <RadioGroup
              value={tipo}
              onValueChange={(valor) => setTipo(valor as TipoCreativo)}
              disabled={pendiente}
              className="grid gap-2 sm:grid-cols-2"
            >
              {tipos.map((opcionTipo) => (
                <label key={opcionTipo} className={opcion}>
                  <RadioGroupItem value={opcionTipo} className="mt-0.5" />
                  <span className="text-sm font-medium">
                    {ETIQUETAS_TIPO[opcionTipo]}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
        ) : null}

        <div role="alert" id={idError}>
          {error ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={pendiente} />
            }
          >
            Cancelar
          </DialogClose>
          <Button
            type="button"
            onClick={preparar}
            disabled={pendiente}
            aria-describedby={error ? idError : undefined}
          >
            {pendiente ? (
              <Spinner data-icon="inline-start" aria-label="Preparando" />
            ) : (
              <FilePlus2 data-icon="inline-start" aria-hidden />
            )}
            Preparar versión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * La versión en preparación: se edita aquí y se activa cuando está completa,
 * o se descarta (la vigente no cambia).
 */
function VersionPendiente({
  ofertaId,
  pendiente,
  vigente,
  puedeVersionar,
  refTitulo,
  focoTrasResolver,
}: {
  ofertaId: string
  pendiente: VersionCreativo
  vigente: VersionCreativo | null
  puedeVersionar: boolean
  refTitulo: RefObject<HTMLHeadingElement | null>
  /** Destino estable del foco cuando esta versión (y sus botones) desaparece. */
  focoTrasResolver: () => HTMLElement | null
}) {
  const cliente = useQueryClient()
  const consulta = useDatosCreativo(ofertaId)
  const [estado, setEstado] = useState<EstadoCreativo | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  // Se marca antes de la acción: al activarla o descartarla, la página se
  // refresca y esta versión puede desmontarse con el diálogo aún abierto.
  const resuelta = useRef(false)
  const idTitulo = useId()
  const datos = consulta.data
  const editable =
    puedeVersionar && datos?.editable?.id === pendiente.id && !datos.bloqueo
  // La BD no deja activarla si la empresa no está verificada (o está suspendida).
  const bloqueoActivacion = editable ? datos.bloqueoActivacion : null
  const listo = estado?.listo ?? false
  // Una subida en curso terminaría en una carpeta ya borrada.
  const subiendo = estado?.faltan.includes(FALTAS.subiendo) ?? false

  function focoAlCerrar() {
    return resuelta.current ? focoTrasResolver() : null
  }

  /** Corre la acción con la versión marcada como resuelta (si sale bien, queda así). */
  async function resolver<T>(
    accion: Promise<ResultadoAccion<T>>
  ): Promise<ResultadoAccion<T>> {
    resuelta.current = true
    try {
      const resultado = await accion
      resuelta.current = resultado.ok
      return resultado
    } catch (error) {
      resuelta.current = false
      throw error
    }
  }

  async function activar() {
    const resultado = await resolver(
      activarVersionCreativo({ creativoId: pendiente.id })
    )
    if (resultado.ok) {
      await cliente.invalidateQueries({
        queryKey: CLAVES_CREATIVO.datos(ofertaId),
      })
      toast.success(`Versión ${pendiente.version} activada`, {
        description:
          "Los medios con asignaciones en curso recibieron el aviso para descargarla.",
      })
    }
    return resultado
  }

  async function descartar() {
    const resultado = await resolver(
      descartarVersionPendiente({ creativoId: pendiente.id })
    )
    if (resultado.ok) {
      await cliente.invalidateQueries({
        queryKey: CLAVES_CREATIVO.datos(ofertaId),
      })
      toast.success(`Versión ${pendiente.version} descartada`, {
        description: vigente
          ? `Los medios siguen con la versión ${vigente.version}.`
          : "Puedes preparar otra cuando la necesites.",
      })
    }
    return resultado
  }

  return (
    <article
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-xl border border-warning/40 bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CabeceraVersion
          version={pendiente}
          idTitulo={idTitulo}
          refTitulo={refTitulo}
        />
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDescartando(true)}
              disabled={subiendo}
              aria-describedby={idTitulo}
              title={
                subiendo
                  ? "Espera a que terminen de subir los archivos"
                  : undefined
              }
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              Descartar
            </Button>
            {bloqueoActivacion ? null : (
              <Button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={!listo}
                title={listo ? undefined : "Completa el paquete para activarla"}
              >
                <Rocket data-icon="inline-start" aria-hidden />
                Activar versión {pendiente.version}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {bloqueoActivacion ? (
        <AvisoActivacion motivo={bloqueoActivacion} />
      ) : null}
      {puedeVersionar && consulta.isError && !datos ? (
        <EstadoError
          compacto
          nivelTitulo="h3"
          titulo="No pudimos cargar la versión en preparación"
          descripcion={`${consulta.error.message} Mientras tanto no puedes editarla, activarla ni descartarla.`}
          onReintentar={() => void consulta.refetch()}
          className="rounded-lg border border-dashed"
        />
      ) : null}
      {editable && datos ? (
        <EditorCreativo datos={datos} alCambiar={setEstado} />
      ) : puedeVersionar && consulta.isPending ? (
        <EsqueletoCreativo />
      ) : (
        <VisorCreativo version={pendiente} />
      )}
      <DialogoConfirmacion
        abierto={confirmando}
        onAbiertoChange={setConfirmando}
        titulo={`¿Activar la versión ${pendiente.version}?`}
        descripcion={
          vigente
            ? `La versión ${vigente.version} deja de estar vigente y los medios que ya aceptaron la oferta reciben un aviso para descargar la nueva antes de publicar. No se puede deshacer.`
            : "Queda vigente y los medios que ya aceptaron la oferta reciben un aviso para descargarla. No se puede deshacer."
        }
        textoConfirmar="Activar versión"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={activar}
      />
      <DialogoConfirmacion
        abierto={descartando}
        onAbiertoChange={setDescartando}
        titulo={`¿Descartar la versión ${pendiente.version}?`}
        descripcion={`Se borran sus archivos y textos. ${
          vigente
            ? `Los medios siguen con la versión ${vigente.version}, que no cambia.`
            : "Los medios no la han visto."
        } No se puede deshacer.`}
        textoConfirmar="Descartar versión"
        destructivo
        focoAlCerrar={focoAlCerrar}
        onConfirmar={descartar}
      />
    </article>
  )
}

function VersionAnterior({ version }: { version: VersionCreativo }) {
  const [abierta, setAbierta] = useState(false)
  const idTitulo = useId()
  return (
    <li>
      <Collapsible
        open={abierta}
        onOpenChange={setAbierta}
        className="rounded-xl border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
          <CabeceraVersion version={version} idTitulo={idTitulo} nivel="h4" />
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-describedby={idTitulo}
              />
            }
          >
            {abierta ? "Ocultar" : "Ver"}
            <ChevronDown
              data-icon="inline-end"
              aria-hidden
              className={cn(
                "transition-transform duration-200 motion-reduce:transition-none",
                abierta && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="border-t p-3.5">
          {abierta ? <VisorCreativo version={version} /> : null}
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/**
 * Versiones del paquete creativo de una oferta (ANU-010): la que está en
 * preparación (editable, activable o descartable en una oferta publicada), la
 * vigente y el historial. En una oferta publicada, «Preparar versión nueva»
 * crea la pendiente; al activarla, la anterior deja de estar vigente y los
 * medios con asignaciones reciben el aviso; al descartarla, nada cambia para
 * los medios. Va dentro de la sección titulada de la ficha
 * (h2): cada versión es un `h3`. Si la empresa del anunciante no está
 * verificada (o está suspendida), puede preparar la versión pero no activarla,
 * y se le explica. Cuando preparar, activar o descartar hace desaparecer el
 * botón que se usó, el foco pasa al título de la versión que queda.
 */
export function VersionesCreativo({
  ofertaId,
  versiones,
  puedeVersionar,
}: PropsVersionesCreativo) {
  const consulta = useDatosCreativo(ofertaId)
  const [preparando, setPreparando] = useState(false)
  // Cada apertura empieza el diálogo de cero (sin perder su animación de cierre).
  const [aperturas, setAperturas] = useState(0)
  const idVigente = useId()
  const idHistorial = useId()
  const vigente = versiones.find((version) => version.vigente) ?? null
  const pendiente = versiones.find((version) => version.pendiente) ?? null
  const historial = versiones
    .filter((version) => !version.vigente && !version.pendiente)
    .sort((a, b) => b.version - a.version)
  const datos = consulta.data
  const admiteNueva =
    puedeVersionar && !pendiente && datos?.admiteVersionNueva === true
  const tituloVigente = useRef<HTMLHeadingElement>(null)
  const tituloPendiente = useRef<HTMLHeadingElement>(null)
  const focoEnPendiente = useRef(false)
  const idPendiente = pendiente?.id ?? null

  /**
   * «Preparar versión nueva» desaparece con la versión nueva: el foco va a su
   * título. Si aún no se pinta, el diálogo no mueve el foco y lo hace el efecto
   * de abajo cuando llega con el refresco de la página.
   */
  function focoTrasPreparar(): HTMLElement | boolean {
    return focoEnPendiente.current ? (tituloPendiente.current ?? false) : true
  }

  useEffect(() => {
    if (!idPendiente || !focoEnPendiente.current) return
    focoEnPendiente.current = false
    tituloPendiente.current?.focus()
  }, [idPendiente])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {puedeVersionar && !pendiente && consulta.isPending ? (
        <div
          role="status"
          aria-busy="true"
          className="rounded-xl border border-dashed p-3.5"
        >
          <span className="sr-only">Cargando las opciones del creativo…</span>
          <Esqueleto className="h-9 w-full rounded-lg" />
        </div>
      ) : null}
      {puedeVersionar && !pendiente && consulta.isError && !datos ? (
        <EstadoError
          compacto
          nivelTitulo="h3"
          titulo="No pudimos revisar si puedes cambiar el creativo"
          descripcion={consulta.error.message}
          onReintentar={() => void consulta.refetch()}
          className="rounded-xl border border-dashed"
        />
      ) : null}
      {admiteNueva ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className="text-sm text-pretty text-muted-foreground">
              ¿Necesitas cambiar archivos o textos? Prepara una versión nueva:
              los medios siguen con la vigente hasta que la actives.
            </p>
            {datos?.bloqueoActivacion ? (
              <AvisoActivacion motivo={datos.bloqueoActivacion} />
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              setAperturas((previas) => previas + 1)
              setPreparando(true)
            }}
          >
            <FilePlus2 data-icon="inline-start" aria-hidden />
            Preparar versión nueva
          </Button>
        </div>
      ) : null}

      {pendiente ? (
        <VersionPendiente
          key={pendiente.id}
          ofertaId={ofertaId}
          pendiente={pendiente}
          vigente={vigente}
          puedeVersionar={puedeVersionar}
          refTitulo={tituloPendiente}
          focoTrasResolver={() => tituloVigente.current}
        />
      ) : null}

      {vigente ? (
        <article
          aria-labelledby={idVigente}
          className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
        >
          <CabeceraVersion
            version={vigente}
            idTitulo={idVigente}
            refTitulo={tituloVigente}
          />
          <VisorCreativo version={vigente} />
        </article>
      ) : pendiente ? null : (
        <EstadoVacio
          icono={FileStack}
          titulo="Aún no hay paquete creativo"
          descripcion="Cárgalo desde el asistente de la oferta: archivos, copy sugerido, hashtags y enlace de destino."
        />
      )}

      {historial.length > 0 ? (
        <section
          aria-labelledby={idHistorial}
          className="flex flex-col gap-2.5"
        >
          <h3 id={idHistorial} className="text-sm font-semibold">
            Versiones anteriores
          </h3>
          <ul className="flex flex-col gap-2">
            {historial.map((version) => (
              <VersionAnterior key={version.id} version={version} />
            ))}
          </ul>
        </section>
      ) : null}

      {datos && admiteNueva ? (
        <DialogoVersionNueva
          key={aperturas}
          abierto={preparando}
          onAbiertoChange={setPreparando}
          ofertaId={ofertaId}
          formato={datos.formato}
          vigente={vigente}
          alPreparar={(preparando) => {
            focoEnPendiente.current = preparando
          }}
          focoAlCerrar={focoTrasPreparar}
        />
      ) : null}
    </div>
  )
}
