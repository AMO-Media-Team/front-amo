"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import {
  type FieldPath,
  FormProvider,
  useForm,
  type UseFormReturn,
} from "react-hook-form"
import { toast } from "sonner"

import { Asistente, type PasoAsistente } from "@/components/asistente/asistente"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import {
  esAsistido,
  GESTION_PROPIA,
  type ModoGestion,
  rutasGestion,
} from "@/features/campanas/rutas-gestion"
import type { EstadoCreativo } from "@/features/creativos/tipos"
import { ZONA } from "@/lib/fechas"
import type { ResultadoFallo } from "@/lib/result"

import {
  descartarOferta,
  type EntradaGuardarOfertas,
  enviarOfertasARevision,
  guardarOfertas,
} from "../actions"
import { OFERTA_CAMBIO_ESTADO } from "../errores"
import { nombreFormato } from "../formatos"
import {
  CAMPOS_PASO,
  PASOS_OFERTA,
  type PasoOferta,
  pasoDeCampo,
  pasosConError,
  primerRechazo,
  rutasConError,
  TITULOS_PASO,
  textoFaltaCompletar,
} from "../pasos"
import { cambiosDeEstado, sincronizarFormatos } from "../persistencia"
import { PARAMETRO_OFERTAS } from "../rutas"
import {
  type ContextoValidacion,
  type DatosOferta,
  esquemaBorradorOferta,
  esquemaOferta,
  type ValoresOferta,
} from "../schemas"
import type {
  CampanaAsistente,
  CatalogoAsistente,
  ConfiguracionAsistente,
  FormatoAsistente,
  OfertaEnCurso,
  RechazoEnvio,
} from "../tipos"
import { PasoCreativo } from "./paso-creativo"
import { PasoCuando } from "./paso-cuando"
import { PasoCuanto } from "./paso-cuanto"
import { PasoEnvio } from "./paso-envio"
import { ID_FORMATOS, PasoQue } from "./paso-que"
import { PasoQuien } from "./paso-quien"
import { formatoFecha } from "@/lib/format"

export interface PropsAsistenteOferta {
  /** `nueva`: uno o varios formatos; `editar`: una oferta en BORRADOR o DEVUELTA. */
  modo: "nueva" | "editar"
  campana: CampanaAsistente
  empresaVerificada: boolean
  catalogo: CatalogoAsistente
  /** Formatos que AMO retiró y usa alguna oferta (solo para nombrarlos). */
  formatosRetirados?: readonly FormatoAsistente[]
  configuracion: ConfiguracionAsistente
  valoresIniciales: ValoresOferta
  /** Ofertas ya creadas (borradores de este asistente o la que se edita). */
  ofertasIniciales: OfertaEnCurso[]
  creativosIniciales: Record<string, EstadoCreativo>
  /** ISO del momento en que el servidor armó la página. */
  ahora: string
  /**
   * El anunciante con lo suyo o el equipo AMO por cuenta de un anunciante
   * (ADM-014): decide los enlaces de salida y la voz de los textos.
   */
  gestion?: ModoGestion
}

interface ErrorDePaso {
  paso: PasoOferta
  mensaje: string
  /** Oferta señalada cuando el asistente tiene varias. */
  oferta: string | null
  ofertaId: string | null
  /** Ofertas que sí quedaron en revisión en el mismo intento. */
  enviadas: number
}

const EDITABLES = new Set(["BORRADOR", "DEVUELTA"])

const horaBogota = formatoFecha({
  timeZone: ZONA,
  hour: "numeric",
  minute: "2-digit",
})

function mismoEstado(a: EstadoCreativo | undefined, b: EstadoCreativo) {
  return (
    a !== undefined &&
    a.listo === b.listo &&
    a.archivos === b.archivos &&
    a.faltan.join("\n") === b.faltan.join("\n")
  )
}

function AvisoErrorPaso({ error }: { error: ErrorDePaso }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/6 p-4 text-sm"
    >
      <CircleAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-destructive">
          {error.paso === "envio"
            ? "No pudimos enviar a revisión"
            : textoFaltaCompletar(error.paso)}
        </p>
        <p>
          {error.oferta ? (
            <span className="font-medium">{error.oferta}: </span>
          ) : null}
          {error.mensaje}
        </p>
        {error.enviadas > 0 ? (
          <p className="text-muted-foreground">
            {error.enviadas === 1
              ? "La otra oferta ya quedó en revisión."
              : "Las demás ofertas ya quedaron en revisión."}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Asistente de oferta (ANU-004…009) sobre el `Asistente` compartido: seis
 * pasos en la URL (`?paso=`), un formulario con los valores agrupados por
 * paso y el mismo esquema que el servidor.
 *
 * - Al salir de «Cuánto» (o con «Guardar borrador») crea un borrador por
 *   formato y la URL lo recuerda (`?ofertas=`); después se actualizan esos
 *   borradores. Quitar un formato con borrador lo descarta (confirmando): se
 *   archiva y deja de verse en la campaña.
 * - «Enviar a revisión» guarda lo último y pasa cada oferta a revisión; si
 *   la BD dice qué falta (`envio_oferta:<paso>`), lleva a ese paso con el
 *   mensaje. Las ofertas que sí pasaron quedan en revisión.
 * - No pisa lo que guardó un compañero (versión de cada oferta), no da por
 *   guardado lo que se escribió mientras se guardaba, avisa si una oferta
 *   cambió de estado por fuera y, si una respuesta se pierde, el reintento
 *   no duplica los borradores.
 */
export function AsistenteOferta({
  modo,
  campana,
  empresaVerificada,
  catalogo,
  formatosRetirados = [],
  configuracion,
  valoresIniciales,
  ofertasIniciales,
  creativosIniciales,
  ahora,
  gestion = GESTION_PROPIA,
}: PropsAsistenteOferta) {
  const router = useRouter()
  const rutas = rutasGestion(gestion)
  const asistido = esAsistido(gestion)
  const [ofertas, setOfertas] = useState<OfertaEnCurso[]>(ofertasIniciales)
  const claveEnviados = ofertas
    .filter((oferta) => !EDITABLES.has(oferta.estado))
    .map((oferta) => oferta.formatoId)
    .join()
  const contexto = useMemo<ContextoValidacion>(
    () => ({
      campana: { fechaInicio: campana.fechaInicio, fechaFin: campana.fechaFin },
      disponible: campana.disponible,
      anticipacionHoras: configuracion.anticipacionHoras,
      minimoCupos: configuracion.minimoMedios,
      formatos: catalogo.formatos,
      enviados: claveEnviados ? claveEnviados.split(",") : [],
    }),
    [campana, configuracion, catalogo.formatos, claveEnviados]
  )
  const esquema = useMemo(() => esquemaOferta(contexto), [contexto])
  const formulario: UseFormReturn<ValoresOferta, unknown, DatosOferta> =
    useForm<ValoresOferta, unknown, DatosOferta>({
      resolver: zodResolver(esquema),
      defaultValues: valoresIniciales,
      mode: "onTouched",
    })
  const { formState, getValues, setValue, setError, clearErrors, reset } =
    formulario

  const [creativos, setCreativos] = useState(creativosIniciales)
  const [errorPaso, setErrorPaso] = useState<ErrorDePaso | null>(null)
  const [guardadoA, setGuardadoA] = useState<Date | null>(null)
  const [pestana, setPestana] = useState<string | null>(null)
  const [descarte, setDescarte] = useState<OfertaEnCurso | null>(null)
  // Tras enviar se sale del asistente: la URL ya no se reescribe (nuqs la
  // aplicaría después de `router.push` y desharía la navegación).
  const saliendo = useRef(false)
  // Inicio (reloj monotónico) del primer intento de guardar que se quedó sin
  // respuesta: el siguiente le pide al servidor adoptar lo que alcanzó a crear.
  const sinRespuestaDesde = useRef<number | null>(null)
  // Un borrador descartado desde el aviso de formatos retirados se lleva su
  // botón: al cerrar el diálogo, el foco va al grupo «Formatos».
  const descarteDesdeAviso = useRef(false)
  const descarteHecho = useRef(false)
  const [idsUrl, setIdsUrl] = useQueryState(
    PARAMETRO_OFERTAS,
    parseAsArrayOf(parseAsString, ",").withOptions({
      history: "replace",
      scroll: false,
    })
  )
  const [pasoUrl, setPasoUrl] = useQueryState(
    "paso",
    parseAsStringLiteral(PASOS_OFERTA).withOptions({
      history: "push",
      scroll: false,
    })
  )

  // `?ofertas=` dice siempre qué borradores tiene el asistente: «Atrás» vuelve
  // a una entrada del historial anterior a crearlos y, sin esto, recargar
  // abriría un asistente vacío que los crearía de nuevo.
  const idsEnCurso = ofertas.map((oferta) => oferta.ofertaId).join(",")
  const idsEnUrl = (idsUrl ?? []).join(",")
  useEffect(() => {
    if (modo !== "nueva" || saliendo.current || idsEnUrl === idsEnCurso) return
    void setIdsUrl(idsEnCurso ? idsEnCurso.split(",") : null)
  }, [modo, idsEnUrl, idsEnCurso, setIdsUrl])

  const fechaAhora = useMemo(() => new Date(ahora), [ahora])
  const hayCambios = formState.isDirty
  const conError = new Set<PasoOferta>(
    pasosConError(rutasConError(formState.errors))
  )
  if (errorPaso) conError.add(errorPaso.paso)

  const nombreDeOferta = (ofertaId: string): string | null => {
    const oferta = ofertas.find((o) => o.ofertaId === ofertaId)
    const formato = [...catalogo.formatos, ...formatosRetirados].find(
      (f) => f.id === oferta?.formatoId
    )
    return formato ? nombreFormato(formato) : null
  }

  // Una función estable por oferta: el panel de creativos puede avisar desde un efecto.
  const alCambiarCreativo = useMemo(() => {
    const funciones = new Map<string, (estado: EstadoCreativo) => void>()
    return (ofertaId: string) => {
      let funcion = funciones.get(ofertaId)
      if (!funcion) {
        funcion = (estado: EstadoCreativo) => {
          setCreativos((previos) =>
            mismoEstado(previos[ofertaId], estado)
              ? previos
              : { ...previos, [ofertaId]: estado }
          )
          if (estado.listo) {
            setErrorPaso((previo) =>
              previo?.paso === "creativo" && previo.ofertaId === ofertaId
                ? null
                : previo
            )
          }
        }
        funciones.set(ofertaId, funcion)
      }
      return funcion
    }
  }, [])

  function irAPaso(paso: PasoOferta) {
    void setPasoUrl(paso === "que" ? null : paso)
  }

  /** Las ofertas del asistente y la URL que las recuerda (se resuelve al escribirla). */
  async function aplicarOfertas(lista: OfertaEnCurso[]): Promise<void> {
    setOfertas(lista)
    if (modo === "nueva") {
      await setIdsUrl(lista.length > 0 ? lista.map((o) => o.ofertaId) : null)
    }
  }

  function referencias() {
    return ofertas.map(({ formatoId, ofertaId, actualizadaAt }) => ({
      formatoId,
      ofertaId,
      actualizadaAt,
    }))
  }

  /**
   * Guarda o envía los valores dados. Si no llega respuesta (falló la red),
   * el servidor pudo crear los borradores igual: el próximo intento le dice
   * cuánto hace de aquel para que los adopte en vez de crear otros. Una
   * respuesta que trae las ofertas lo resuelve.
   */
  async function conRespuesta<R extends { ok: boolean; ofertas?: unknown }>(
    accion: (entrada: EntradaGuardarOfertas) => Promise<R>,
    valores: ValoresOferta
  ): Promise<R> {
    const inicio = performance.now()
    const desde = sinRespuestaDesde.current
    try {
      const resultado = await accion({
        campanaId: campana.id,
        existentes: referencias(),
        valores,
        ...(desde === null
          ? {}
          : { segundosDesdeFallo: Math.ceil((inicio - desde) / 1000) }),
      })
      if (resultado.ok || resultado.ofertas) sinRespuestaDesde.current = null
      return resultado
    } catch (error) {
      sinRespuestaDesde.current ??= inicio
      throw error
    }
  }

  /** Ofertas que cambió de estado otra persona: lo escrito no se guardó en ellas. */
  function avisarCambiadas(cambiadas: readonly OfertaEnCurso[]) {
    const nombre =
      ofertas.length > 1 ? nombreDeOferta(cambiadas[0].ofertaId) : null
    toast.error(
      nombre
        ? `${nombre} ya no se puede editar`
        : "Esta oferta ya no se puede editar",
      { description: OFERTA_CAMBIO_ESTADO }
    )
  }

  /** Errores de campo del servidor a sus campos; lo general, en un aviso. */
  function mostrarFallo(resultado: ResultadoFallo) {
    const campos = Object.entries(resultado.erroresCampo ?? {})
    campos.forEach(([campo, mensajes]) =>
      setError(campo as FieldPath<ValoresOferta>, {
        type: "server",
        message: mensajes[0],
      })
    )
    if (campos.length > 0) {
      const paso = pasoDeCampo(campos[0][0])
      irAPaso(paso)
      toast.error(resultado.error, {
        description: `Revisa «${TITULOS_PASO[paso]}».`,
      })
      return
    }
    toast.error(resultado.error)
  }

  /**
   * Lo que se guardó pasa a ser el punto de partida. Lo que se escribió
   * mientras la solicitud estaba en curso sigue como cambio pendiente.
   */
  function marcarGuardado(guardados: ValoresOferta) {
    reset(guardados, { keepValues: true })
    setGuardadoA(new Date())
  }

  async function persistir(): Promise<boolean> {
    // Copia de lo que se manda: los campos siguen activos mientras se guarda.
    const valores = structuredClone(getValues())
    const resultado = await conRespuesta(guardarOfertas, valores)
    if (!resultado.ok) {
      if (resultado.ofertas) void aplicarOfertas(resultado.ofertas)
      mostrarFallo(resultado)
      return false
    }
    const { cambiadas } = cambiosDeEstado(ofertas, resultado.datos)
    void aplicarOfertas(resultado.datos)
    if (cambiadas.length > 0) {
      avisarCambiadas(cambiadas)
      return false
    }
    marcarGuardado(valores)
    return true
  }

  async function validarPaso(paso: PasoOferta): Promise<boolean> {
    const campos = CAMPOS_PASO[paso] as FieldPath<ValoresOferta>[]
    if (campos.length === 0) return true
    const valido = await formulario.trigger(campos)
    if (valido) {
      setErrorPaso((previo) => (previo?.paso === paso ? null : previo))
    }
    return valido
  }

  function alternarFormato(formatoId: string, marcar: boolean) {
    const actuales = getValues("que.formatoIds")
    if (!marcar) {
      const oferta = ofertas.find((o) => o.formatoId === formatoId)
      if (oferta) {
        // Un borrador ya creado se descarta (con confirmación); uno enviado no se toca.
        if (oferta.estado === "BORRADOR") {
          descarteHecho.current = false
          setDescarte(oferta)
        }
        return
      }
    }
    const orden = catalogo.formatos.map((formato) => formato.id)
    const siguientes = marcar
      ? orden.filter((id) => id === formatoId || actuales.includes(id))
      : actuales.filter((id) => id !== formatoId)
    fijarFormatos(siguientes)
  }

  /** Quita un formato que AMO retiró (su botón desaparece al quitarlo). */
  function quitarRetirado(formatoId: string) {
    descarteDesdeAviso.current = true
    const conBorrador = ofertas.some((o) => o.formatoId === formatoId)
    alternarFormato(formatoId, false)
    if (!conBorrador) {
      requestAnimationFrame(() => document.getElementById(ID_FORMATOS)?.focus())
    }
  }

  function fijarFormatos(formatoIds: string[]) {
    const revalidar = Boolean(formulario.getFieldState("que.formatoIds").error)
    setValue("que.formatoIds", formatoIds, {
      shouldDirty: true,
      shouldValidate: revalidar,
    })
    setValue(
      "cuanto.formatos",
      sincronizarFormatos(
        getValues("cuanto.formatos"),
        formatoIds,
        catalogo.franjas
      ),
      { shouldDirty: true }
    )
  }

  async function guardarBorrador() {
    const borrador = esquemaBorradorOferta.safeParse(getValues())
    if (!borrador.success) {
      clearErrors()
      const rutas = borrador.error.issues.map((issue) => issue.path.join("."))
      borrador.error.issues.forEach((issue, indice) =>
        setError(
          rutas[indice] as FieldPath<ValoresOferta>,
          { type: "borrador", message: issue.message },
          { shouldFocus: indice === 0 }
        )
      )
      const paso = pasoDeCampo(rutas[0] ?? "")
      irAPaso(paso)
      toast.error("Aún no se puede guardar el borrador", {
        description: `Completa lo marcado en «${TITULOS_PASO[paso]}».`,
      })
      return
    }
    if (await persistir()) {
      toast.success(
        modo === "editar" ? "Cambios guardados" : "Borrador guardado"
      )
    }
  }

  async function enviar(): Promise<boolean> {
    setErrorPaso(null)
    const valores = structuredClone(getValues())
    const resultado = await conRespuesta(enviarOfertasARevision, valores)
    if (!resultado.ok) {
      if ("ofertas" in resultado && resultado.ofertas) {
        void aplicarOfertas(resultado.ofertas)
      }
      mostrarFallo(resultado)
      return false
    }
    const { ofertas: lista, rechazos: rechazosBd } = resultado.datos
    // Las que otra persona cambió de estado no se enviaron ni se guardaron.
    const { enviadas, cambiadas } = cambiosDeEstado(
      ofertas,
      lista,
      resultado.datos.enviadas
    )
    const rechazos: RechazoEnvio[] = [
      ...rechazosBd,
      ...cambiadas.map((oferta) => ({
        ofertaId: oferta.ofertaId,
        paso: "envio" as const,
        mensaje: OFERTA_CAMBIO_ESTADO,
      })),
    ]
    if (cambiadas.length === 0) marcarGuardado(valores)
    const rechazo = primerRechazo(rechazos)
    if (!rechazo) {
      // Se sale del asistente: no se reescribe `?ofertas=`, porque nuqs aplica
      // la URL después de `router.push` y desharía la navegación.
      saliendo.current = true
      setOfertas(lista)
      toast.success(
        enviadas.length === 0
          ? "Las ofertas ya estaban en revisión"
          : enviadas.length === 1
            ? "Oferta enviada a revisión"
            : `${enviadas.length} ofertas enviadas a revisión`,
        {
          description: asistido
            ? `Queda en la cola de moderación; ${gestion.anunciante} recibe un aviso.`
            : "AMO la revisa y te avisa cuando quede publicada.",
        }
      )
      const unica = lista.length === 1 ? lista[0] : null
      router.push(
        unica
          ? rutas.oferta(campana.id, unica.ofertaId)
          : rutas.ofertasCampana(campana.id)
      )
      return true
    }
    const urlEscrita = aplicarOfertas(lista)
    const oferta = lista.length > 1 ? nombreDeOferta(rechazo.ofertaId) : null
    setErrorPaso({
      paso: rechazo.paso,
      mensaje: rechazo.mensaje,
      oferta,
      ofertaId: rechazo.ofertaId,
      enviadas: enviadas.length,
    })
    if (rechazo.paso === "creativo") setPestana(rechazo.ofertaId)
    if (enviadas.length > 0) {
      toast.success(
        enviadas.length === 1
          ? "1 oferta quedó en revisión"
          : `${enviadas.length} ofertas quedaron en revisión`
      )
      // Lo enviado ya descuenta del disponible de la campaña: se vuelve a
      // leer (con `?ofertas=` ya escrita, para no abrir otro asistente).
      void urlEscrita.then(() => router.refresh())
    }
    // El aviso del paso (una alerta) es el único anuncio del rechazo.
    irAPaso(rechazo.paso)
    return false
  }

  const hayOfertas = ofertas.length > 0
  const creativosListos =
    hayOfertas &&
    ofertas.every(
      (oferta) =>
        !EDITABLES.has(oferta.estado) || creativos[oferta.ofertaId]?.listo
    )

  function contenido(paso: PasoOferta, cuerpo: ReactNode) {
    // La alerta se monta cuando su paso ya está a la vista: así se anuncia una
    // sola vez y de forma fiable (es el único anuncio del rechazo).
    const visible = (pasoUrl ?? "que") === paso
    return (
      <div className="flex flex-col gap-6">
        {errorPaso?.paso === paso && visible ? (
          <AvisoErrorPaso error={errorPaso} />
        ) : null}
        {cuerpo}
      </div>
    )
  }

  const pasos: PasoAsistente<PasoOferta>[] = [
    {
      id: "que",
      titulo: TITULOS_PASO.que,
      descripcion:
        modo === "nueva"
          ? "Dónde y cómo se publica. Puedes elegir varios formatos a la vez: se crea una oferta por cada uno."
          : "El título y las publicaciones por medio de esta oferta.",
      contenido: contenido(
        "que",
        <PasoQue
          campanaId={campana.id}
          formatos={catalogo.formatos}
          retirados={formatosRetirados}
          ofertas={ofertas}
          formatoFijo={modo === "editar"}
          maximoArchivoMb={configuracion.maximoCreativoMb}
          onAlternarFormato={(formatoId, marcar) => {
            descarteDesdeAviso.current = false
            alternarFormato(formatoId, marcar)
          }}
          onQuitarRetirado={quitarRetirado}
          gestion={gestion}
        />
      ),
      validar: () => validarPaso("que"),
      completo: hayOfertas,
      conError: conError.has("que"),
    },
    {
      id: "quien",
      titulo: TITULOS_PASO.quien,
      descripcion:
        "Qué medios pueden tomar la oferta. Solo medios verificados por AMO.",
      contenido: contenido(
        "quien",
        <PasoQuien
          categorias={catalogo.categorias}
          formatos={catalogo.formatos}
          franjas={catalogo.franjas}
          umbralSeguidores={configuracion.umbralSeguidores}
          estimadorMinimo={configuracion.estimadorMinimo}
        />
      ),
      validar: () => validarPaso("quien"),
      completo: hayOfertas,
      conError: conError.has("quien"),
    },
    {
      id: "cuando",
      titulo: TITULOS_PASO.cuando,
      descripcion: "Las fechas en hora de Colombia.",
      contenido: contenido(
        "cuando",
        <PasoCuando
          campana={campana}
          configuracion={configuracion}
          ahora={fechaAhora}
        />
      ),
      validar: () => validarPaso("cuando"),
      completo: hayOfertas,
      conError: conError.has("cuando"),
    },
    {
      id: "cuanto",
      titulo: TITULOS_PASO.cuanto,
      descripcion: asistido
        ? "El presupuesto y los cupos los defines por cuenta de la empresa; el precio de cada medio lo calcula AMO con sus tarifas."
        : "Tú defines el presupuesto y los cupos; el precio de cada medio lo calcula AMO con sus tarifas.",
      contenido: contenido(
        "cuanto",
        <PasoCuanto
          campana={campana}
          configuracion={configuracion}
          formatos={catalogo.formatos}
          franjas={catalogo.franjas}
          ofertas={ofertas}
        />
      ),
      validar: async () => {
        if (!(await validarPaso("cuanto"))) return false
        // Al enviar, el envío guarda todo: aquí solo se guarda al avanzar.
        if (pasoUrl === "envio") return true
        if (hayOfertas && !formState.isDirty) return true
        return persistir()
      },
      completo: hayOfertas,
      conError: conError.has("cuanto"),
    },
    {
      id: "creativo",
      titulo: TITULOS_PASO.creativo,
      descripcion:
        "Las piezas que publicarán los medios, con su copy y enlace. Los originales se guardan sin recomprimir.",
      contenido: contenido(
        "creativo",
        <PasoCreativo
          ofertas={ofertas}
          formatos={catalogo.formatos}
          creativos={creativos}
          alCambiar={alCambiarCreativo}
          pestana={pestana}
          onPestana={setPestana}
        />
      ),
      completo: creativosListos,
      conError: conError.has("creativo"),
    },
    {
      id: "envio",
      titulo: TITULOS_PASO.envio,
      descripcion: asistido
        ? "Revisa todo antes de enviarla. Queda en la cola de moderación y, si está bien, se publica para los medios elegibles."
        : "Revisa todo antes de enviarla. AMO la modera y, si está bien, la publica para los medios elegibles.",
      contenido: contenido(
        "envio",
        <PasoEnvio
          catalogo={catalogo}
          campana={campana}
          configuracion={configuracion}
          ofertas={ofertas}
          creativos={creativos}
          empresaVerificada={empresaVerificada}
          gestion={gestion}
        />
      ),
      validar: () => validarPaso("envio"),
      conError: conError.has("envio"),
    },
  ]

  const descarteNombre = descarte ? nombreDeOferta(descarte.ofertaId) : null

  return (
    <FormProvider {...formulario}>
      <Asistente
        pasos={pasos}
        etiqueta={modo === "nueva" ? "Nueva oferta" : "Editar oferta"}
        onEnviar={enviar}
        textoEnviar="Enviar a revisión"
        onGuardarBorrador={guardarBorrador}
        textoGuardarBorrador={
          modo === "editar" ? "Guardar cambios" : "Guardar borrador"
        }
        notaBorrador={
          guardadoA
            ? `Guardado a las ${horaBogota.format(guardadoA)}`
            : undefined
        }
        cambiosSinGuardar={hayCambios}
      />
      <DialogoConfirmacion
        abierto={descarte !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setDescarte(null)
        }}
        titulo={`¿Descartar el borrador de ${descarteNombre ?? "este formato"}?`}
        descripcion="La oferta de este formato se quita de la campaña junto con su paquete creativo. Las demás siguen igual. No se puede deshacer."
        textoConfirmar="Descartar borrador"
        textoCancelar="Conservarlo"
        destructivo
        focoAlCerrar={() =>
          descarteDesdeAviso.current && descarteHecho.current
            ? document.getElementById(ID_FORMATOS)
            : null
        }
        onConfirmar={async () => {
          if (!descarte) return true
          const resultado = await descartarOferta({
            ofertaId: descarte.ofertaId,
          })
          if (!resultado.ok) return resultado
          descarteHecho.current = true
          void aplicarOfertas(
            ofertas.filter((o) => o.ofertaId !== descarte.ofertaId)
          )
          fijarFormatos(
            getValues("que.formatoIds").filter(
              (id) => id !== descarte.formatoId
            )
          )
          toast.success("Borrador descartado")
          return resultado
        }}
      />
    </FormProvider>
  )
}
