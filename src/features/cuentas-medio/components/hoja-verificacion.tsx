"use client"

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChartNoAxesColumn,
  Hash,
  RotateCcw,
  Send,
  X,
} from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SheetClose } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { textoANumero } from "@/features/configuracion/numeros"
import { PLATAFORMAS } from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"

import { generarCodigoVerificacion } from "../actions"
import type { EstadoCuenta } from "../estado-cuenta"
import {
  inicioVerificacion,
  type PasoVerificacion,
  pasoConVuelta,
  tituloPaso,
} from "../flujo-verificacion"
import {
  INSTRUCCIONES_ESTADISTICAS,
  METODOS_VERIFICACION,
  pistaFranja,
} from "../presentacion"
import { esquemaSeguidores } from "../schemas"
import type {
  CodigoGenerado,
  CuentaMedio,
  FranjaSeguidores,
  ParametrosVerificacion,
} from "../tipos"
import { NotaCuenta } from "./aviso-cuenta"
import { CodigoVerificacion, VencimientoCodigo } from "./codigo-verificacion"
import { HojaCuenta } from "./hoja-cuenta"
import { SelectorCaptura } from "./selector-captura"
import type { CargaCaptura, DestinoCaptura } from "./use-carga-captura"

type MetodoElegible = "CODIGO_HISTORIA" | "MANUAL"

export interface HojaVerificacionProps {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  cuenta: Pick<
    CuentaMedio,
    "id" | "plataforma" | "handle" | "verificada" | "verificaciones"
  >
  estado: EstadoCuenta
  franjas: readonly FranjaSeguidores[]
  parametros: ParametrosVerificacion
  carga: CargaCaptura
  /** Código generado en esta visita (el servidor no lo vuelve a entregar). */
  codigo: CodigoGenerado | null
  onCodigo: (codigo: CodigoGenerado) => void
}

function textoSeguidores(valor: number | null): string {
  return valor === null ? "" : formatearNumero(valor)
}

function errorSeguidores(texto: string): string | null {
  const resultado = esquemaSeguidores.safeParse({ seguidores: texto })
  return resultado.success
    ? null
    : (resultado.error.issues[0]?.message ?? "Revisa la cifra.")
}

/** Seguidores de hoy, con lo que significan para la franja. */
function CampoSeguidores({
  valor,
  onCambio,
  error,
  onSalir,
  franjas,
  umbral,
  etiqueta,
  deshabilitado,
}: {
  valor: string
  onCambio: (valor: string) => void
  error: string | null
  onSalir: () => void
  franjas: readonly FranjaSeguidores[]
  umbral: number
  etiqueta: string
  deshabilitado: boolean
}) {
  const id = useId()
  const cantidad = textoANumero(valor)
  const pista = error ? null : pistaFranja(cantidad, franjas, umbral)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        id={id}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        onBlur={onSalir}
        inputMode="numeric"
        autoComplete="off"
        placeholder="45.000"
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-ayuda`}
        className="h-11 text-[0.9375rem] cifras md:text-[0.9375rem]"
      />
      <FieldDescription id={`${id}-ayuda`}>
        {pista?.texto ??
          "El número exacto que muestra hoy la cuenta, sin abreviar (45.000, no 45 mil)."}
      </FieldDescription>
      <FieldError errors={error ? [{ message: error }] : []} />
    </Field>
  )
}

function OpcionMetodo({
  metodo,
  recomendada,
  detalle,
}: {
  metodo: MetodoElegible
  recomendada?: boolean
  detalle: string
}) {
  const { etiqueta } = METODOS_VERIFICACION[metodo]
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl border bg-background/60 p-3.5 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20">
      <RadioGroupItem value={metodo} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {metodo === "CODIGO_HISTORIA" ? (
            <Hash aria-hidden className="size-4 text-primary" />
          ) : (
            <ChartNoAxesColumn aria-hidden className="size-4 text-primary" />
          )}
          {etiqueta}
          {recomendada ? <Badge variant="secondary">Más rápida</Badge> : null}
        </span>
        <span className="text-sm text-pretty text-muted-foreground">
          {detalle}
        </span>
      </span>
    </label>
  )
}

function PasosHistoria({
  plataforma,
  handle,
}: {
  plataforma: string
  handle: string
}) {
  const pasos = [
    `Abre ${plataforma} con la cuenta ${handle}.`,
    "Publica una historia con el código bien visible (como texto o escrito a mano).",
    "Toma una captura de pantalla de la historia publicada donde se vean el código y tu usuario.",
    "Cárgala aquí antes de que venza el código.",
  ]
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {pasos.map((paso, indice) => (
        <li key={paso} className="flex gap-2.5 text-pretty">
          <span
            aria-hidden
            className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold cifras text-primary"
          >
            {indice + 1}
          </span>
          <span>{paso}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Verificar o reverificar una cuenta (MED-005, MED-006): elegir el método;
 * con el código, pedirlo (se muestra una sola vez, con su cuenta regresiva)
 * y cargar la captura de la historia; con las estadísticas, escribir los
 * seguidores y cargar la captura del panel. La subida vive en la tarjeta:
 * cerrar la hoja no la interrumpe.
 */
export function HojaVerificacion({
  abierta,
  onAbiertaChange,
  cuenta,
  estado,
  franjas,
  parametros,
  carga,
  codigo,
  onCodigo,
}: HojaVerificacionProps) {
  const ids = useId()
  const idErrorCaptura = `${ids}-captura-error`
  const inicio = inicioVerificacion(estado, cuenta.verificaciones, codigo)
  const [paso, setPaso] = useState<PasoVerificacion>(inicio.paso)
  const [desde, setDesde] = useState<PasoVerificacion | null>(null)
  const [metodo, setMetodo] = useState<MetodoElegible>("CODIGO_HISTORIA")
  const [seguidores, setSeguidores] = useState(
    textoSeguidores(inicio.seguidores)
  )
  const [errorCifra, setErrorCifra] = useState<string | null>(null)
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [generando, iniciar] = useTransition()

  // Cada vez que se abre, la hoja empieza donde la deja lo que hay en curso.
  const [abiertaPrevia, setAbiertaPrevia] = useState(abierta)
  if (abierta !== abiertaPrevia) {
    setAbiertaPrevia(abierta)
    if (abierta) {
      setPaso(inicio.paso)
      setDesde(null)
      setMetodo("CODIGO_HISTORIA")
      setSeguidores(textoSeguidores(inicio.seguidores))
      setErrorCifra(null)
      setErrorCaptura(null)
      setErrorGeneral(null)
    }
  }

  const handle = formatearHandle(cuenta.handle)
  const plataforma = PLATAFORMAS[cuenta.plataforma]
  const enRevision = estado.enCurso?.tipo === "revision"
  const enviando = carga.subida.activa
  const codigoEnPantalla = paso === "codigo-captura" ? inicio.codigo : null
  const codigoPendiente =
    estado.enCurso?.verificacion.metodo === "CODIGO_HISTORIA"
      ? estado.enCurso
      : null
  const codigoVencido = estado.enCurso?.tipo === "codigo_vencido"
  const volverA = pasoConVuelta(paso) ? desde : null

  // Al cambiar de paso, el foco va al contenido nuevo (el botón pulsado
  // desaparece) y el lector anuncia el paso por su nombre.
  const contenidoPaso = useRef<HTMLDivElement>(null)
  const pasoEnfocado = useRef(paso)
  useEffect(() => {
    if (pasoEnfocado.current === paso) return
    pasoEnfocado.current = paso
    contenidoPaso.current?.focus()
  }, [paso])

  /** Suelta una captura elegida que aún no se envía (no una en curso o fallida). */
  function soltarCapturaSinEnviar() {
    if (carga.elegida && carga.subida.estado === "en-cola") carga.descartar()
  }

  function cambiarAbierta(valor: boolean) {
    if (!valor) soltarCapturaSinEnviar()
    onAbiertaChange(valor)
  }

  function irA(siguiente: PasoVerificacion) {
    setErrorGeneral(null)
    setErrorCaptura(null)
    // La captura de la historia no sirve como captura de estadísticas.
    if (siguiente !== paso) soltarCapturaSinEnviar()
    setDesde(paso)
    setPaso(siguiente)
  }

  function validarCifra(): boolean {
    const error = errorSeguidores(seguidores)
    setErrorCifra(error)
    return error === null
  }

  function generarCodigo() {
    if (!validarCifra()) return
    setErrorGeneral(null)
    iniciar(async () => {
      const resultado = await generarCodigoVerificacion({
        cuentaId: cuenta.id,
        seguidores,
      })
      if (!resultado.ok) {
        const deCampo = resultado.erroresCampo?.seguidores?.[0]
        if (deCampo) setErrorCifra(deCampo)
        else setErrorGeneral(resultado.error)
        return
      }
      onCodigo(resultado.datos)
      irA("codigo-captura")
    })
  }

  /** A qué verificación va la captura; `null` si el código ya no existe. */
  function destino(): DestinoCaptura | null {
    if (paso === "manual") return { metodo: "MANUAL", seguidores }
    const verificacionId =
      codigoEnPantalla?.verificacionId ?? codigoPendiente?.verificacion.id
    return verificacionId ? { metodo: "CODIGO_HISTORIA", verificacionId } : null
  }

  function enviarCaptura() {
    const manual = paso === "manual"
    const cifraValida = manual ? validarCifra() : true
    if (!carga.elegida) {
      setErrorCaptura(
        manual
          ? "Elige la captura de tus estadísticas."
          : "Elige la captura de la historia."
      )
      return
    }
    if (!cifraValida) return
    const elegido = destino()
    if (!elegido) {
      setErrorGeneral("El código ya no está vigente. Pide uno nuevo.")
      return
    }
    setErrorCaptura(null)
    setErrorGeneral(null)
    void carga.enviar(elegido)
  }

  const campoSeguidores = (etiqueta: string) => (
    <CampoSeguidores
      valor={seguidores}
      onCambio={(valor) => {
        setSeguidores(valor)
        if (errorCifra) setErrorCifra(errorSeguidores(valor))
      }}
      onSalir={() => {
        if (seguidores.trim()) validarCifra()
      }}
      error={errorCifra}
      franjas={franjas}
      umbral={parametros.umbralSeguidores}
      etiqueta={etiqueta}
      deshabilitado={generando || enviando}
    />
  )

  const atras = volverA ? (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => irA(volverA)}
      disabled={generando || enviando}
    >
      <ArrowLeft data-icon="inline-start" aria-hidden />
      Atrás
    </Button>
  ) : null

  const cancelarEnvio = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => carga.subida.cancelar()}
    >
      <X data-icon="inline-start" aria-hidden />
      Cancelar envío
    </Button>
  )

  function pie() {
    switch (paso) {
      case "metodo":
        return (
          <>
            <SheetClose
              render={<Button type="button" variant="outline" size="lg" />}
            >
              Cancelar
            </SheetClose>
            <Button
              type="button"
              size="lg"
              onClick={() =>
                irA(metodo === "MANUAL" ? "manual" : "codigo-pedir")
              }
            >
              Continuar
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          </>
        )
      case "codigo-pedir":
        return (
          <>
            {atras}
            <Button
              type="button"
              size="lg"
              onClick={generarCodigo}
              disabled={generando}
            >
              {generando ? (
                <Spinner data-icon="inline-start" aria-hidden />
              ) : (
                <Hash data-icon="inline-start" aria-hidden />
              )}
              {generando ? "Generando…" : "Generar código"}
            </Button>
          </>
        )
      case "codigo-captura":
      case "manual":
        if (paso === "codigo-captura" && codigoVencido && !enviando) {
          return (
            <Button type="button" size="lg" onClick={() => irA("codigo-pedir")}>
              <RotateCcw data-icon="inline-start" aria-hidden />
              Pedir un código nuevo
            </Button>
          )
        }
        return enviando ? (
          cancelarEnvio
        ) : (
          <>
            {atras}
            <Button type="button" size="lg" onClick={enviarCaptura}>
              <Send data-icon="inline-start" aria-hidden />
              {paso === "manual" && !enRevision
                ? "Enviar verificación"
                : "Enviar captura"}
            </Button>
          </>
        )
    }
  }

  const titulo = tituloPaso(paso, cuenta.verificada)

  return (
    <HojaCuenta
      abierta={abierta}
      onAbiertaChange={cambiarAbierta}
      icono={<BadgeCheck />}
      titulo={titulo}
      descripcion={`${plataforma} · ${handle}`}
      pie={pie()}
    >
      <div
        ref={contenidoPaso}
        role="group"
        aria-label={titulo}
        tabIndex={-1}
        className="flex flex-col gap-5 rounded-md outline-none"
      >
        {errorGeneral ? (
          <NotaCuenta tono="peligro" icono="rechazo">
            <p role="alert">{errorGeneral}</p>
          </NotaCuenta>
        ) : null}

        {paso === "metodo" ? (
          <>
            <p className="text-sm text-pretty text-muted-foreground">
              Comprueba que {handle} es tuya y cuántos seguidores tiene. El
              equipo de AMO revisa cada verificación y te avisa cuando la
              resuelve; queda vigente {formatearNumero(parametros.diasVigencia)}{" "}
              días.
            </p>
            <RadioGroup
              value={metodo}
              onValueChange={(valor) => setMetodo(valor as MetodoElegible)}
              aria-label="Cómo quieres verificarla"
              className="flex flex-col gap-2.5"
            >
              <OpcionMetodo
                metodo="CODIGO_HISTORIA"
                recomendada
                detalle={`Te damos un código, lo publicas en una historia de ${handle} y nos envías la captura. Tienes ${formatearNumero(parametros.minutosCodigo)} minutos.`}
              />
              <OpcionMetodo
                metodo="MANUAL"
                detalle="Nos envías una captura del panel de estadísticas de la cuenta donde se vean el usuario, los seguidores y la fecha de hoy."
              />
            </RadioGroup>
          </>
        ) : null}

        {paso === "codigo-pedir" ? (
          <>
            {campoSeguidores("Seguidores que tiene hoy la cuenta")}
            <NotaCuenta tono="info" icono="plazo">
              Al generar el código empieza a correr el tiempo: tendrás{" "}
              <strong>
                {formatearNumero(parametros.minutosCodigo)} minutos
              </strong>{" "}
              para publicarlo en una historia y enviarnos la captura. Ten a mano
              la app de {plataforma}.
            </NotaCuenta>
          </>
        ) : null}

        {paso === "codigo-captura" ? (
          <>
            {codigoVencido ? (
              <NotaCuenta
                tono="aviso"
                icono="vencido"
                titulo="El código venció"
              >
                Pide uno nuevo para terminar la verificación.
              </NotaCuenta>
            ) : codigoEnPantalla ? (
              <>
                <CodigoVerificacion
                  codigo={codigoEnPantalla.codigo}
                  expiraAt={codigoEnPantalla.expiraAt}
                />
                <p className="text-xs text-pretty text-muted-foreground">
                  Anótalo o cópialo: solo lo mostramos ahora. Si lo pierdes,
                  pide uno nuevo.
                </p>
              </>
            ) : codigoPendiente?.verificacion.codigoExpiraAt ? (
              <NotaCuenta
                tono="info"
                icono="captura"
                titulo="Usa el código que te dimos"
              >
                <p>
                  Por seguridad solo lo mostramos cuando lo pides.{" "}
                  {enRevision
                    ? "Si te equivocaste de captura, envía la correcta: revisaremos la más reciente."
                    : "Si no lo tienes, pide uno nuevo."}
                </p>
                <p className="mt-1.5">
                  <VencimientoCodigo
                    expiraAt={codigoPendiente.verificacion.codigoExpiraAt}
                  />
                </p>
              </NotaCuenta>
            ) : null}
            {codigoVencido ? null : (
              <>
                <PasosHistoria plataforma={plataforma} handle={handle} />
                <SelectorCaptura
                  carga={carga}
                  titulo="Captura de la historia"
                  descripcionVista={`Captura de la historia de ${handle} con el código`}
                  error={errorCaptura}
                  idError={idErrorCaptura}
                />
              </>
            )}
            {enRevision || enviando ? null : (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {/* Vencido, «Pedir un código nuevo» ya es el botón del pie. */}
                {codigoVencido ? null : (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0"
                    onClick={() => irA("codigo-pedir")}
                  >
                    <RotateCcw data-icon="inline-start" aria-hidden />
                    Pedir un código nuevo
                  </Button>
                )}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => irA("manual")}
                >
                  <ChartNoAxesColumn data-icon="inline-start" aria-hidden />
                  Usar una captura de estadísticas
                </Button>
              </div>
            )}
          </>
        ) : null}

        {paso === "manual" ? (
          <>
            {enRevision ? (
              <NotaCuenta tono="info" icono="revision">
                Ya enviaste esta verificación. Si te equivocaste, envía la
                captura correcta: revisaremos la más reciente.
              </NotaCuenta>
            ) : codigoPendiente ? (
              <NotaCuenta tono="aviso" icono="captura">
                Al enviar la captura de tus estadísticas, el código que pediste
                deja de valer.
              </NotaCuenta>
            ) : null}
            <p className="text-sm text-pretty text-muted-foreground">
              {INSTRUCCIONES_ESTADISTICAS[cuenta.plataforma]} Toma una captura
              donde se vean{" "}
              <strong className="text-foreground">tu usuario</strong>,{" "}
              <strong className="text-foreground">los seguidores</strong> y{" "}
              <strong className="text-foreground">la fecha de hoy</strong>.
            </p>
            {campoSeguidores("Seguidores que muestra la captura")}
            <SelectorCaptura
              carga={carga}
              titulo="Captura de tus estadísticas"
              descripcionVista={`Captura de las estadísticas de ${handle}`}
              error={errorCaptura}
              idError={idErrorCaptura}
            />
          </>
        ) : null}

        {enviando ? (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Spinner role={undefined} aria-hidden className="size-3.5" />
            Puedes cerrar esta ventana: el envío sigue y te avisamos al
            terminar.
          </p>
        ) : null}
      </div>
    </HojaCuenta>
  )
}
