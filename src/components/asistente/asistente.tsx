"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import {
  createContext,
  type FormEvent,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { cn } from "@/lib/utils"

import { IndicadorPasos } from "./indicador-pasos"
import {
  alcanceInicial,
  avanzar,
  type EstadoNavegacion,
  exigeValidacion,
  indiceDe,
  pasoVisible,
  retroceder,
  saltarA,
  textoPaso,
} from "./navegacion"
import { type AccionAsistente, PieAsistente } from "./pie-asistente"
import { useGuardiaSalida } from "./use-guardia-salida"

export interface PasoAsistente<Id extends string = string> {
  /** Identificador estable; es el valor de `?paso=` en la URL. */
  id: Id
  titulo: string
  descripcion?: ReactNode
  contenido: ReactNode
  /**
   * Valida el paso antes de avanzar (p. ej. `() => formulario.trigger([...])`).
   * Al fallar, el foco va al primer campo con `aria-invalid="true"`.
   */
  validar?: () => boolean | Promise<boolean>
  /** Ya tiene lo obligatorio (borrador reabierto): permite abrir los siguientes. */
  completo?: boolean
  /** Marca el paso en el indicador (p. ej. errores devueltos al enviar). */
  conError?: boolean
  opcional?: boolean
}

export interface ApiAsistente<Id extends string = string> {
  pasoActual: Id
  indiceActual: number
  total: number
  /** Va al paso: hacia atrás siempre; hacia adelante valida el actual. */
  irA: (id: Id) => Promise<void>
  /** Valida el paso actual y avanza; devuelve si avanzó. */
  siguiente: () => Promise<boolean>
  anterior: () => void
}

const ContextoAsistente = createContext<ApiAsistente | null>(null)

/** API del asistente para el contenido de los pasos (p. ej. «Editar» en la revisión). */
export function useAsistente<Id extends string = string>(): ApiAsistente<Id> {
  const api = use(ContextoAsistente)
  if (!api) throw new Error("useAsistente debe usarse dentro de <Asistente>.")
  return api as unknown as ApiAsistente<Id>
}

export interface AsistenteProps<Id extends string> {
  pasos: readonly PasoAsistente<Id>[]
  /** Nombre del asistente para lectores de pantalla («Nueva oferta»). */
  etiqueta: string
  /** Parámetro de la URL con el paso actual. */
  parametroUrl?: string
  /**
   * Se llama tras validar todos los pasos. Devuelve `true` si se envió y vas
   * a navegar: el asistente queda bloqueado (sin parpadeo ni doble envío) y la
   * guardia de salida se apaga.
   */
  onEnviar: (api: ApiAsistente<Id>) => unknown
  textoEnviar?: string
  /** Guarda sin validar. Sin él no se ofrece «Guardar borrador». */
  onGuardarBorrador?: (api: ApiAsistente<Id>) => unknown
  textoGuardarBorrador?: string
  /** «Guardado a las 10:42»: se muestra en el pie y se anuncia con cortesía. */
  notaBorrador?: ReactNode
  /** Hay cambios sin guardar: pide confirmación al salir por un enlace o al cerrar. */
  cambiosSinGuardar?: boolean
  deshabilitado?: boolean
  nivelTitulo?: "h2" | "h3"
  className?: string
}

const MENSAJE_FALLO =
  "No se pudo completar la acción. Revisa tu conexión e intenta de nuevo."

type ModoFoco = "titulo" | "invalido"

/**
 * Asistente por pasos. El paso actual vive en la URL (`?paso=`, con historial:
 * el botón «atrás» del navegador o del teléfono vuelve al paso anterior) y
 * nunca se muestra uno bloqueado: si la URL pide un paso más allá de lo
 * alcanzado, se corrige. Cada paso se monta la primera vez que se alcanza y
 * después solo se oculta, así conserva su estado (archivos, campos locales).
 *
 * Accesibilidad: al cambiar de paso el foco va a su título (que dice «Paso 2
 * de 6: …»); si un paso no valida, va al primer campo inválido y un aviso
 * cortés lo explica. Enter en un campo avanza; en el último paso no envía
 * (enviar es siempre una decisión explícita).
 *
 * El contenido de los pasos no debe contener `<form>` (el asistente ya es
 * uno); los diálogos con formulario propio funcionan porque van en un portal.
 */
export function Asistente<Id extends string>({
  pasos,
  etiqueta,
  parametroUrl = "paso",
  onEnviar,
  textoEnviar = "Enviar",
  onGuardarBorrador,
  textoGuardarBorrador,
  notaBorrador,
  cambiosSinGuardar = false,
  deshabilitado = false,
  nivelTitulo: Titulo = "h2",
  className,
}: AsistenteProps<Id>) {
  const router = useRouter()
  const base = useId()
  const total = pasos.length

  const claveIds = JSON.stringify(pasos.map((paso) => paso.id))
  const ids = useMemo(() => JSON.parse(claveIds) as Id[], [claveIds])
  const parser = useMemo(
    () =>
      parseAsStringLiteral(ids).withOptions({ history: "push", scroll: false }),
    [ids]
  )
  const [pasoUrl, setPasoUrl] = useQueryState(parametroUrl, parser)

  const [alcanzadoValidado, setAlcanzado] = useState(() =>
    alcanceInicial(pasos)
  )
  // Un borrador que se completa (o llega después) abre los pasos siguientes.
  const alcanzado = Math.max(alcanzadoValidado, alcanceInicial(pasos))
  const pedido = indiceDe(ids, pasoUrl)
  const actual = pasoVisible(pedido, alcanzado)
  const navegacion: EstadoNavegacion = { actual, alcanzado }
  const esUltimo = actual >= total - 1

  const [ocupado, setOcupado] = useState<AccionAsistente | null>(null)
  const ocupadoRef = useRef(false)
  const [enviado, setEnviado] = useState(false)
  const [aviso, setAviso] = useState("")
  const [destinoSalida, setDestinoSalida] = useState<string | null>(null)
  const focoPendiente = useRef<ModoFoco | null>(null)
  const actualPrevio = useRef(actual)

  const idPaso = (indice: number) => `${base}-paso-${indice}`
  const idTitulo = (indice: number) => `${base}-titulo-${indice}`

  useGuardiaSalida(cambiosSinGuardar && !enviado, setDestinoSalida)

  // La URL pide un paso aún bloqueado (recarga, enlace compartido): se corrige.
  useEffect(() => {
    if (pedido > actual) {
      void setPasoUrl(actual === 0 ? null : ids[actual], { history: "replace" })
    }
  }, [pedido, actual, ids, setPasoUrl])

  // Al cambiar de paso (botones, indicador o historial del navegador).
  const alCambiarPaso = useEffectEvent((indice: number) => {
    const modo = focoPendiente.current ?? "titulo"
    focoPendiente.current = null
    // El aviso de «revisa los campos» era del paso anterior: no debe quedar
    // en la región viva cuando ese paso ya se superó.
    if (modo === "titulo") setAviso("")
    llevarFoco(indice, modo)
  })
  useEffect(() => {
    if (actualPrevio.current === actual) return
    actualPrevio.current = actual
    alCambiarPaso(actual)
  }, [actual])

  function llevarFoco(indice: number, modo: ModoFoco) {
    const contenedor = document.getElementById(idPaso(indice))
    const titulo = document.getElementById(idTitulo(indice))
    if (!contenedor || !titulo) return
    const invalido =
      modo === "invalido"
        ? contenedor.querySelector<HTMLElement>('[aria-invalid="true"]')
        : null
    const objetivo = invalido ?? titulo
    objetivo.focus({ preventScroll: true })
    // Sin `behavior`: sigue `scroll-behavior` del documento, que ya respeta el
    // movimiento reducido (del sistema y de la cuenta).
    if (invalido) invalido.scrollIntoView({ block: "center" })
    else if (contenedor.getBoundingClientRect().top < 0) {
      contenedor.scrollIntoView({ block: "start" })
    }
  }

  function anunciar(mensaje: string) {
    setAviso("")
    requestAnimationFrame(() => setAviso(mensaje))
  }

  function mostrar(indice: number, modo: ModoFoco = "titulo") {
    if (indice === actual) {
      requestAnimationFrame(() => llevarFoco(indice, modo))
      return
    }
    focoPendiente.current = modo
    void setPasoUrl(indice === 0 ? null : ids[indice])
  }

  async function validarPaso(indice: number): Promise<boolean> {
    const validar = pasos[indice]?.validar
    if (!validar) return true
    const valido = await validar()
    if (!valido) {
      anunciar(
        `Revisa los campos marcados en «${pasos[indice].titulo}» para continuar.`
      )
    }
    return valido
  }

  async function ejecutar(
    accion: AccionAsistente,
    tarea: () => Promise<boolean | void>
  ) {
    if (ocupadoRef.current || deshabilitado) return
    ocupadoRef.current = true
    setOcupado(accion)
    let mantenerBloqueo = false
    try {
      mantenerBloqueo = (await tarea()) === true
    } catch {
      toast.error(MENSAJE_FALLO)
    } finally {
      if (!mantenerBloqueo) {
        ocupadoRef.current = false
        setOcupado(null)
      }
    }
  }

  async function siguiente(): Promise<boolean> {
    if (esUltimo) return false
    let avanzo = false
    await ejecutar("siguiente", async () => {
      if (!(await validarPaso(actual))) {
        mostrar(actual, "invalido")
        return
      }
      const destino = avanzar(navegacion, total)
      setAlcanzado((previo) => Math.max(previo, destino.alcanzado))
      mostrar(destino.actual)
      avanzo = true
    })
    return avanzo
  }

  function anterior() {
    if (ocupadoRef.current) return
    const destino = retroceder(navegacion).actual
    if (destino !== actual) mostrar(destino)
  }

  async function irAIndice(indice: number) {
    // Un paso aún bloqueado (o inexistente) no cambia nada.
    const destino = saltarA(navegacion, indice, total).actual
    if (destino === actual) return
    if (!exigeValidacion(navegacion, destino)) {
      if (!ocupadoRef.current) mostrar(destino)
      return
    }
    await ejecutar("siguiente", async () => {
      if (await validarPaso(actual)) mostrar(destino)
      else mostrar(actual, "invalido")
    })
  }

  const api: ApiAsistente<Id> = {
    pasoActual: ids[actual],
    indiceActual: actual,
    total,
    irA: (id) => irAIndice(ids.indexOf(id)),
    siguiente,
    anterior,
  }

  function enviar() {
    void ejecutar("enviar", async () => {
      for (let indice = 0; indice < total; indice++) {
        if (!(await validarPaso(indice))) {
          mostrar(indice, "invalido")
          return
        }
      }
      const exito = (await onEnviar(api)) === true
      if (exito) setEnviado(true)
      return exito
    })
  }

  function guardarBorrador() {
    if (!onGuardarBorrador) return
    void ejecutar("borrador", async () => {
      await onGuardarBorrador(api)
    })
  }

  function alEnviarFormulario(evento: FormEvent<HTMLFormElement>) {
    // El submit de un formulario dentro de un portal (diálogo) también burbujea
    // por el árbol de React: no es nuestro y no se toca.
    if (evento.target !== evento.currentTarget) return
    evento.preventDefault()
    if (!esUltimo) void siguiente()
  }

  const montarHasta = Math.max(alcanzado, actual)

  return (
    <ContextoAsistente value={api as unknown as ApiAsistente}>
      <div
        role="region"
        aria-label={etiqueta}
        className={cn("flex flex-col gap-6", className)}
      >
        <IndicadorPasos
          pasos={pasos}
          actual={actual}
          alcanzado={alcanzado}
          onIrA={(indice) => void irAIndice(indice)}
          deshabilitado={deshabilitado || ocupado !== null}
        />
        <form
          noValidate
          onSubmit={alEnviarFormulario}
          aria-busy={ocupado !== null || undefined}
          className="flex flex-col gap-6"
        >
          {pasos.map((paso, indice) =>
            indice > montarHasta ? null : (
              <div
                key={paso.id}
                id={idPaso(indice)}
                role="group"
                aria-labelledby={idTitulo(indice)}
                hidden={indice !== actual}
                className="flex animate-aparecer-arriba scroll-mt-20 flex-col gap-5"
              >
                <header className="flex flex-col gap-1">
                  <p
                    aria-hidden
                    className="text-[0.6875rem] font-semibold cifras tracking-[0.08em] text-primary uppercase"
                  >
                    {textoPaso(indice, total)}
                    {paso.opcional ? " · Opcional" : ""}
                  </p>
                  <Titulo
                    id={idTitulo(indice)}
                    tabIndex={-1}
                    className="text-xl leading-tight font-semibold outline-none"
                  >
                    {/* Los espacios van fuera de los `sr-only`: dentro, algunos
                        cálculos del nombre accesible los recortan. */}
                    <span className="sr-only">{textoPaso(indice, total)}:</span>{" "}
                    {paso.titulo}
                    {paso.opcional ? (
                      <>
                        {" "}
                        <span className="sr-only">(opcional)</span>
                      </>
                    ) : null}
                  </Titulo>
                  {paso.descripcion ? (
                    <div className="max-w-2xl text-sm text-muted-foreground">
                      {paso.descripcion}
                    </div>
                  ) : null}
                </header>
                {paso.contenido}
              </div>
            )
          )}
          <PieAsistente
            indice={actual}
            total={total}
            ocupado={ocupado}
            onAnterior={anterior}
            onEnviar={enviar}
            onGuardarBorrador={onGuardarBorrador ? guardarBorrador : undefined}
            textoEnviar={textoEnviar}
            textoGuardarBorrador={textoGuardarBorrador}
            notaBorrador={notaBorrador}
            deshabilitado={deshabilitado}
          />
        </form>
        <p role="status" className="sr-only">
          {aviso}
        </p>
      </div>
      <DialogoConfirmacion
        abierto={destinoSalida !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setDestinoSalida(null)
        }}
        titulo="¿Salir sin guardar?"
        descripcion={
          onGuardarBorrador
            ? "Tienes cambios sin guardar. Si sales ahora se perderán; puedes quedarte y guardar el borrador."
            : "Tienes cambios sin guardar. Si sales ahora, se perderán."
        }
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={() => {
          if (destinoSalida) router.push(destinoSalida as Route)
        }}
      />
    </ContextoAsistente>
  )
}
