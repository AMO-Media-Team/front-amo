"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CircleAlert, CircleCheck, Info } from "lucide-react"
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { ESTADOS_ACTIVOS } from "@/components/archivos/motor-subida"
import { useSubidas } from "@/components/archivos/use-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import {
  confirmarArchivoCreativo,
  guardarCreativo,
  ordenarArchivosCreativo,
  prepararArchivoCreativo,
  quitarArchivoCreativo,
} from "../actions"
import {
  conArchivo,
  conEditable,
  conOrden,
  moverId,
  ordenesSiguientes,
  sinArchivo,
} from "../actualizaciones"
import {
  esCarrusel,
  ETIQUETAS_TIPO,
  maximoArchivos,
  reglasCreativo,
  tipoInicial,
  tiposDeCreativo,
} from "../formatos"
import { type EstadoTextos, evaluarPaquete, mismoEstado } from "../paquete"
import { MAX_ORDEN } from "../schemas"
import type {
  ArchivoCreativo,
  DatosCreativo,
  EstadoCreativo,
  TipoCreativo,
  VersionCreativo,
} from "../tipos"
import { actualizarDatos, CLAVES_CREATIVO } from "./consultas"
import { FormularioTextos } from "./formulario-textos"
import { type Direccion, GaleriaArchivos } from "./galeria-archivos"
import { RequisitosFormato } from "./requisitos-formato"

const SIN_VERSION =
  "No encontramos la versión del creativo. Actualiza la página e inténtalo de nuevo."

const DETALLES_TIPO: Readonly<Record<TipoCreativo, string>> = {
  IMAGEN: "Una foto o pieza gráfica.",
  VIDEO: "Un video con sonido o sin él.",
  CARRUSEL: "Varias piezas en orden.",
}

/** Identifica un archivo elegido en su confirmación (nombre original y peso). */
function claveArchivo(archivo: Pick<ArchivoSubido, "nombre" | "tamano">) {
  return `${archivo.nombre}\u0000${archivo.tamano}`
}

/** Encadena las escrituras de la versión: dos no la crean a la vez. */
function useCadena() {
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  return useCallback(<T,>(operacion: () => Promise<T>): Promise<T> => {
    const resultado = cola.current.then(operacion, operacion)
    cola.current = resultado.catch(() => undefined)
    return resultado
  }, [])
}

function EstadoPaquete({ estado }: { estado: EstadoCreativo }) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        estado.listo
          ? "border-success/30 bg-success/6"
          : "border-warning/35 bg-warning/8"
      )}
    >
      {estado.listo ? (
        <CircleCheck
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-success"
        />
      ) : (
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      {estado.listo ? (
        <p className="font-medium">El paquete creativo está completo.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">Para terminar el paquete creativo:</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-muted-foreground">
            {estado.faltan.map((falta) => (
              <li key={falta} className="text-pretty">
                {falta}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SelectorTipo({
  tipos,
  valor,
  onCambiar,
  bloqueo,
  cambiando,
}: {
  tipos: readonly TipoCreativo[]
  valor: TipoCreativo
  onCambiar: (tipo: TipoCreativo) => void
  bloqueo: string | null
  cambiando: boolean
}) {
  const id = useId()
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={bloqueo ? `${id}-bloqueo` : undefined}
    >
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
        ¿Qué vas a publicar?
        {cambiando ? (
          <Spinner aria-label="Cambiando el tipo" className="size-3.5" />
        ) : null}
      </legend>
      <RadioGroup
        value={valor}
        onValueChange={(nuevo) => onCambiar(nuevo as TipoCreativo)}
        disabled={bloqueo !== null || cambiando}
        className="grid gap-2 sm:grid-cols-2"
      >
        {tipos.map((tipo) => (
          <label
            key={tipo}
            className="flex cursor-pointer gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-70 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
          >
            <RadioGroupItem value={tipo} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">
                {ETIQUETAS_TIPO[tipo]}
              </span>
              <span className="text-xs text-muted-foreground">
                {DETALLES_TIPO[tipo]}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
      {bloqueo ? (
        <p id={`${id}-bloqueo`} className="text-xs text-muted-foreground">
          {bloqueo}
        </p>
      ) : null}
    </fieldset>
  )
}

export interface EditorCreativoProps {
  datos: DatosCreativo
  alCambiar?: (estado: EstadoCreativo) => void
}

/**
 * Edita la versión editable del creativo: tipo (si el formato admite imagen
 * o video), archivos (validación previa, subida directa de los originales con
 * SHA-256, medidas y miniatura, reintentos y pausa sin conexión), orden del
 * carrusel, quitar, y los textos con guardado automático. La versión se crea
 * al cargar el primer archivo o escribir el primer texto. Informa al asistente
 * qué falta con `alCambiar`.
 */
export function EditorCreativo({ datos, alCambiar }: EditorCreativoProps) {
  const cliente = useQueryClient()
  const { ofertaId, formato, limites } = datos
  const version = datos.editable
  const tipos = tiposDeCreativo(formato)
  const [tipoElegido, setTipoElegido] = useState<TipoCreativo>(
    () => version?.tipo ?? tipoInicial(formato)
  )
  const [cambiandoTipo, setCambiandoTipo] = useState(false)
  // Mientras se crea la versión del tipo nuevo, ya se muestra el elegido.
  const tipo = cambiandoTipo ? tipoElegido : (version?.tipo ?? tipoElegido)
  const [ordenando, setOrdenando] = useState(false)
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null)
  const [estadoTextos, setEstadoTextos] = useState<EstadoTextos>("guardados")
  const enCadena = useCadena()
  const idArchivos = useId()
  // Quitar el último archivo hace desaparecer la galería: el foco va al título.
  const tituloArchivos = useRef<HTMLHeadingElement>(null)

  // Las acciones leen la versión del momento en que corren.
  const versionActual = useRef<VersionCreativo | null>(version)
  useEffect(() => {
    versionActual.current = version
  })
  const ordenes = useRef(new Map<string, number>())

  const fijarVersion = useCallback(
    (nueva: VersionCreativo) => {
      versionActual.current = nueva
      actualizarDatos(cliente, ofertaId, (previos) =>
        conEditable(previos, nueva)
      )
    },
    [cliente, ofertaId]
  )

  /** La versión editable con ese tipo: la actual o una nueva (si falta o cambia el tipo). */
  const asegurarVersion = useCallback(
    (tipoDeseado: TipoCreativo) =>
      enCadena(async (): Promise<ResultadoAccion<VersionCreativo>> => {
        const actual = versionActual.current
        if (actual && actual.tipo === tipoDeseado) return exito(actual)
        const resultado = await guardarCreativo({ ofertaId, tipo: tipoDeseado })
        if (resultado.ok) fijarVersion(resultado.datos)
        return resultado
      }),
    [enCadena, fijarVersion, ofertaId]
  )

  const guardarTextos = useCallback(
    (textos: Parameters<typeof guardarCreativo>[0]["textos"]) =>
      enCadena(async () => {
        const resultado = await guardarCreativo({
          ofertaId,
          tipo: versionActual.current?.tipo ?? tipo,
          textos,
        })
        if (resultado.ok) fijarVersion(resultado.datos)
        return resultado
      }),
    [enCadena, fijarVersion, ofertaId, tipo]
  )

  const reglas = useMemo(
    () => reglasCreativo(formato, tipo, limites),
    [formato, tipo, limites]
  )

  const subidas = useSubidas<ArchivoCreativo>({
    preparar: (descripcion) => {
      const actual = versionActual.current
      return actual
        ? prepararArchivoCreativo({
            ofertaId,
            creativoId: actual.id,
            archivo: descripcion,
          })
        : Promise.resolve(fallo(SIN_VERSION))
    },
    confirmar: (archivo) => {
      const actual = versionActual.current
      return actual
        ? confirmarArchivoCreativo({
            ofertaId,
            creativoId: actual.id,
            orden: ordenes.current.get(claveArchivo(archivo)),
            archivo,
          })
        : Promise.resolve(fallo(SIN_VERSION))
    },
    reglas,
    hash: true,
    medidas: true,
    miniatura: true,
    alCompletar: (archivo) =>
      actualizarDatos(cliente, ofertaId, (previos) =>
        conArchivo(previos, archivo)
      ),
  })
  const { elementos, quitarCompletadas } = subidas

  // Lo que terminó de subir pasa a la galería.
  useEffect(() => {
    if (elementos.some((elemento) => elemento.estado === "completada")) {
      quitarCompletadas()
    }
  }, [elementos, quitarCompletadas])

  const enCola = elementos.filter(
    (elemento) =>
      elemento.estado !== "completada" && elemento.estado !== "cancelada"
  ).length
  const subiendo = elementos.filter(
    (elemento) =>
      elemento.estado === "en-cola" || ESTADOS_ACTIVOS.has(elemento.estado)
  ).length
  const fallidas = elementos.filter(
    (elemento) => elemento.estado === "error"
  ).length
  const cargados = version?.archivos ?? []
  const maximo = maximoArchivos(formato)
  const disponibles = Math.max(0, maximo - cargados.length - enCola)

  async function alElegir(archivos: File[]) {
    setErrorArchivos(null)
    const tomados = archivos.slice(0, disponibles)
    if (tomados.length === 0) return
    const asegurada = await asegurarVersion(tipo)
    if (!asegurada.ok) {
      setErrorArchivos(asegurada.error)
      return
    }
    const posiciones = ordenesSiguientes(
      asegurada.datos.archivos,
      enCola,
      tomados.length,
      MAX_ORDEN
    )
    tomados.forEach((archivo, indice) => {
      ordenes.current.set(
        claveArchivo({ nombre: archivo.name, tamano: archivo.size }),
        posiciones[indice]
      )
    })
    if (tomados.length < archivos.length) {
      setErrorArchivos(
        `Solo caben ${disponibles} archivos más: se tomaron los primeros ${tomados.length}.`
      )
    }
    subidas.agregar(tomados)
  }

  async function quitar(archivo: ArchivoCreativo) {
    const resultado = await quitarArchivoCreativo({ archivoId: archivo.id })
    if (resultado.ok) {
      actualizarDatos(cliente, ofertaId, (previos) =>
        sinArchivo(previos, archivo.id)
      )
    }
    return resultado
  }

  function mover(indice: number, direccion: Direccion) {
    const actual = versionActual.current
    if (!actual) return
    const ids = moverId(
      actual.archivos.map((archivo) => archivo.id),
      indice,
      direccion === "antes" ? indice - 1 : indice + 1
    )
    const clave = CLAVES_CREATIVO.datos(ofertaId)
    const previos = cliente.getQueryData<DatosCreativo>(clave)
    setErrorArchivos(null)
    setOrdenando(true)
    actualizarDatos(cliente, ofertaId, (datosPrevios) =>
      conOrden(datosPrevios, ids)
    )
    void enCadena(async () => {
      const resultado = await ordenarArchivosCreativo({
        creativoId: actual.id,
        ids,
      })
      if (resultado.ok) fijarVersion(resultado.datos)
      else {
        // Pudo quedar a medias (un UPDATE por fila): se vuelve a leer lo guardado.
        if (previos) cliente.setQueryData(clave, previos)
        void cliente.invalidateQueries({ queryKey: clave })
        setErrorArchivos(resultado.error)
      }
    }).finally(() => setOrdenando(false))
  }

  async function cambiarTipo(nuevo: TipoCreativo) {
    setErrorArchivos(null)
    const anterior = versionActual.current?.tipo ?? tipoElegido
    setTipoElegido(nuevo)
    if (!versionActual.current) return
    setCambiandoTipo(true)
    const resultado = await asegurarVersion(nuevo)
    setCambiandoTipo(false)
    if (!resultado.ok) {
      setTipoElegido(anterior)
      setErrorArchivos(resultado.error)
    }
  }

  const bloqueoTipo =
    cargados.length > 0 || enCola > 0
      ? "Para cambiar el tipo, primero quita los archivos cargados."
      : version?.pendiente
        ? "La versión en preparación conserva el tipo con que se creó."
        : null

  const estado = evaluarPaquete({
    formato,
    tipo: version?.tipo ?? null,
    archivos: cargados,
    subidasEnCurso: subiendo,
    subidasConError: fallidas,
    textos: estadoTextos,
  })
  const ultimo = useRef<EstadoCreativo | null>(null)
  const avisar = useEffectEvent((actual: EstadoCreativo) => {
    if (ultimo.current && mismoEstado(ultimo.current, actual)) return
    ultimo.current = actual
    alCambiar?.(actual)
  })
  const firmaEstado = JSON.stringify(estado)
  useEffect(() => {
    avisar(JSON.parse(firmaEstado) as EstadoCreativo)
  }, [firmaEstado])

  const multiples = maximo > 1
  const titulo = esCarrusel(formato)
    ? "Sube las piezas del carrusel"
    : multiples
      ? "Sube tus archivos"
      : tipo === "VIDEO"
        ? "Sube el video"
        : "Sube la imagen"

  return (
    <div className="@container flex flex-col gap-6">
      <RequisitosFormato formato={formato} tipo={tipo} limites={limites} />

      {tipos.length > 1 ? (
        <SelectorTipo
          tipos={tipos}
          valor={tipo}
          onCambiar={(nuevo) => void cambiarTipo(nuevo)}
          bloqueo={bloqueoTipo}
          cambiando={cambiandoTipo}
        />
      ) : null}

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby={idArchivos}
          className="@container flex min-w-0 flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4
              ref={tituloArchivos}
              id={idArchivos}
              tabIndex={-1}
              className="rounded-sm text-sm font-semibold outline-none focus-visible:anillo-foco"
            >
              Archivos
            </h4>
            <span className="text-xs cifras text-muted-foreground">
              {cargados.length} de {maximo}
            </span>
          </div>

          {version && cargados.length > 0 ? (
            <GaleriaArchivos
              version={version}
              ordenable={multiples}
              ordenando={ordenando}
              deshabilitada={cambiandoTipo}
              onQuitar={quitar}
              onMover={mover}
              focoSinArchivos={() => tituloArchivos.current}
            />
          ) : null}

          <ListaSubidas
            elementos={elementos}
            etiqueta="Archivos en subida"
            onReintentar={subidas.reintentar}
            onCancelar={subidas.cancelar}
            onQuitar={subidas.quitar}
          />

          {disponibles > 0 ? (
            <ZonaArchivos
              reglas={reglas}
              onArchivos={(archivos) => void alElegir(archivos)}
              multiple={multiples}
              maxArchivos={Math.max(1, disponibles)}
              titulo={titulo}
              deshabilitada={cambiandoTipo}
              compacta={cargados.length > 0}
            />
          ) : (
            <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-pretty text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {maximo === 1
                ? "Para cambiar el archivo, quita el actual y sube otro."
                : `Ya cargaste el máximo de ${maximo} archivos. Quita uno para reemplazarlo.`}
            </p>
          )}

          <div role="alert">
            {errorArchivos ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-pretty">
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
                {errorArchivos}
              </p>
            ) : null}
          </div>
        </section>

        <section
          aria-label="Textos para el medio"
          className="flex min-w-0 flex-col gap-3"
        >
          <h4 className="text-sm font-semibold">Textos para el medio</h4>
          <FormularioTextos
            version={version}
            onGuardar={guardarTextos}
            onEstado={setEstadoTextos}
          />
        </section>
      </div>

      <EstadoPaquete estado={estado} />
    </div>
  )
}
