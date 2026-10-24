"use client"

import { Banknote, FileText, ImageIcon, RefreshCw, X } from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { instanteDeDia } from "@/features/operacion/formato"
import { formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import { serializarFecha } from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"
import type { ResultadoAccion } from "@/lib/result"

import { confirmarSoportePago, prepararSoportePago } from "../actions"
import { rescatarFoco } from "../foco"
import {
  type ErroresFormularioPago,
  LARGO_MAXIMO_REFERENCIA,
  REGLAS_SOPORTE_PAGO,
  validarFormularioPago,
} from "../schemas"
import type { SoporteCargado } from "../tipos"

type Campo = keyof ErroresFormularioPago
type Fase = "editando" | "subiendo" | "registrando"

const ORDEN_CAMPOS: readonly Campo[] = ["fecha", "referencia", "soporte"]

/** Lo que el diálogo entrega al registrar: el soporte ya está en Storage. */
export interface DatosPago {
  fecha: string
  referencia: string
  soportePath: string
}

/**
 * `aviso` nulo: todo quedó registrado y el diálogo se cierra. Con `aviso`
 * sigue abierto y lo muestra; un fallo lleva cada error a su campo.
 */
export type ResultadoRegistroPago = ResultadoAccion<{ aviso: string | null }>

export interface DialogoRegistrarPagoProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Liquidación en cuya carpeta de pago se sube el soporte. */
  liquidacionSoporteId: string
  titulo: string
  descripcion: ReactNode
  fechaMinima: string
  textoConfirmar?: string
  registrar: (datos: DatosPago) => Promise<ResultadoRegistroPago>
}

interface SoporteSubido {
  archivo: File
  ruta: string
}

/**
 * Registrar un pago (LIQ-006): fecha (entre la mínima y hoy), referencia del
 * banco y soporte (PDF o imagen, subida directa a `liquidacion/{id}/pago/`).
 * Valida como la acción antes de subir; un error queda junto a su campo y el
 * foco va al primero. Si la BD rechaza después de subir, el soporte se
 * conserva para reintentar sin volver a subirlo. Un soporte por liquidación:
 * el medio lo descarga desde Ganancias, así que no debe traer los datos de
 * otros medios (no hay pago en lote con un solo comprobante).
 */
export function DialogoRegistrarPago({
  abierto,
  onAbiertoChange,
  liquidacionSoporteId,
  titulo,
  descripcion,
  fechaMinima,
  textoConfirmar = "Registrar pago",
  registrar,
}: DialogoRegistrarPagoProps) {
  const [hoy, setHoy] = useState(() => serializarFecha(new Date()))
  const [fecha, setFecha] = useState(hoy)
  const [referencia, setReferencia] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subido, setSubido] = useState<SoporteSubido | null>(null)
  const [errores, setErrores] = useState<ErroresFormularioPago>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>("editando")
  const [pendiente, iniciar] = useTransition()
  const ocupado = pendiente || fase !== "editando"

  // Se abre desde fuera: cada apertura empieza en blanco, con la fecha de hoy.
  const [abiertoAntes, setAbiertoAntes] = useState(abierto)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      const ahora = serializarFecha(new Date())
      setHoy(ahora)
      setFecha(ahora)
      setReferencia("")
      setArchivo(null)
      setSubido(null)
      setErrores({})
      setErrorGeneral(null)
      setFase("editando")
    }
  }

  const campoFecha = useRef<HTMLInputElement>(null)
  const campoReferencia = useRef<HTMLInputElement>(null)
  const zonaSoporte = useRef<HTMLDivElement>(null)
  const botonCambiar = useRef<HTMLButtonElement>(null)
  /** Campo con error que recibe el foco cuando vuelve a estar habilitado. */
  const campoConError = useRef<Campo | null>(null)

  const id = useId()
  const ids = {
    fecha: `${id}-fecha`,
    ayudaFecha: `${id}-ayuda-fecha`,
    errorFecha: `${id}-error-fecha`,
    referencia: `${id}-referencia`,
    ayudaReferencia: `${id}-ayuda-referencia`,
    errorReferencia: `${id}-error-referencia`,
    soporte: `${id}-soporte`,
    errorSoporte: `${id}-error-soporte`,
  }

  const subida = useSubida<SoporteCargado>({
    preparar: (descripcionArchivo) =>
      prepararSoportePago({
        liquidacionId: liquidacionSoporteId,
        descripcion: descripcionArchivo,
      }),
    confirmar: (cargado) =>
      confirmarSoportePago({
        liquidacionId: liquidacionSoporteId,
        archivo: cargado,
      }),
    reglas: REGLAS_SOPORTE_PAGO,
    miniatura: false,
  })

  // El foco va al primer campo con error en cuanto se puede enfocar.
  useEffect(() => {
    const campo = campoConError.current
    if (!campo || ocupado) return
    campoConError.current = null
    if (campo === "fecha") campoFecha.current?.focus()
    else if (campo === "referencia") campoReferencia.current?.focus()
    else
      (
        botonCambiar.current ??
        zonaSoporte.current?.querySelector<HTMLElement>("button")
      )?.focus()
  }, [errores, ocupado])

  function cambiarAbierto(valor: boolean) {
    if (ocupado) return
    onAbiertoChange(valor)
  }

  function sinError(campo: Campo) {
    setErrores(({ [campo]: _quitado, ...resto }) => resto)
  }

  function mostrarErrores(porCampo: ErroresFormularioPago): boolean {
    setErrores(porCampo)
    campoConError.current =
      ORDEN_CAMPOS.find((campo) => porCampo[campo]) ?? null
    return campoConError.current !== null
  }

  function elegirArchivo(elegido: File) {
    setArchivo(elegido)
    sinError("soporte")
  }

  function quitarArchivo() {
    setArchivo(null)
    subida.reiniciar()
    requestAnimationFrame(() =>
      zonaSoporte.current?.querySelector<HTMLElement>("button")?.focus()
    )
  }

  /** Sube el soporte (si cambió desde el último intento) y devuelve su ruta. */
  async function rutaSoporte(elegido: File): Promise<string | null> {
    if (subido?.archivo === elegido) return subido.ruta
    setFase("subiendo")
    const resultado = await subida.subir(elegido)
    if (!resultado.ok) {
      if (!resultado.cancelada) mostrarErrores({ soporte: resultado.error })
      return null
    }
    setSubido({ archivo: elegido, ruta: resultado.datos.ruta })
    return resultado.datos.ruta
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (ocupado) return
    setErrorGeneral(null)
    const porCampo = validarFormularioPago(
      { fecha, referencia, conSoporte: archivo !== null },
      fechaMinima
    )
    if (mostrarErrores(porCampo) || !archivo) return

    const elegido = archivo
    iniciar(async () => {
      const ruta = await rutaSoporte(elegido)
      if (!ruta) {
        setFase("editando")
        return
      }
      setFase("registrando")
      const resultado = await registrar({
        fecha,
        referencia,
        soportePath: ruta,
      })
      setFase("editando")
      if (!resultado.ok) {
        const deCampo: ErroresFormularioPago = {}
        for (const campo of ORDEN_CAMPOS) {
          const mensaje = resultado.erroresCampo?.[campo]?.[0]
          if (mensaje) deCampo[campo] = mensaje
        }
        // El soporte ya no está (o no es de esta liquidación): se vuelve a subir.
        if (deCampo.soporte) setSubido(null)
        if (!mostrarErrores(deCampo)) setErrorGeneral(resultado.error)
        return
      }
      if (resultado.datos.aviso) {
        setErrorGeneral(resultado.datos.aviso)
        return
      }
      onAbiertoChange(false)
      rescatarFoco()
    })
  }

  const imagen = archivo
    ? categoriaDe(mimeDeArchivo(archivo)) === "imagen"
    : false
  // Solo mientras sube (progreso, pausa sin conexión, reintentos): un fallo
  // queda como error del campo.
  const elemento: ElementoSubida | null =
    archivo && subida.activa
      ? {
          id: "soporte",
          nombre: archivo.name,
          tamano: archivo.size,
          tipo: mimeDeArchivo(archivo),
          vistaPrevia: null,
          resultado: null,
          estado: subida.estado,
          progreso: subida.progreso,
          error: subida.error,
          intento: subida.intento,
          reanudaEn: subida.reanudaEn,
        }
      : null
  const estadoEnvio =
    fase === "subiendo"
      ? "Subiendo el soporte…"
      : fase === "registrando"
        ? "Registrando el pago…"
        : ""

  return (
    // Tocar fuera no cierra: borraría lo escrito y el soporte elegido.
    <Dialog
      open={abierto}
      onOpenChange={cambiarAbierto}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <form
          onSubmit={enviar}
          noValidate
          aria-busy={ocupado || undefined}
          className="flex flex-col gap-5"
        >
          <DialogHeader className="flex-row items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Banknote className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>{titulo}</DialogTitle>
              <DialogDescription>{descripcion}</DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cerrar"
                  className="ml-auto shrink-0"
                  disabled={ocupado}
                />
              }
            >
              <X aria-hidden />
            </DialogClose>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={ids.fecha}>Fecha del pago</Label>
            <Input
              ref={campoFecha}
              id={ids.fecha}
              type="date"
              value={fecha}
              min={fechaMinima}
              max={hoy}
              required
              disabled={ocupado}
              onChange={(evento) => {
                setFecha(evento.target.value)
                sinError("fecha")
              }}
              aria-invalid={errores.fecha ? true : undefined}
              aria-describedby={
                errores.fecha
                  ? `${ids.errorFecha} ${ids.ayudaFecha}`
                  : ids.ayudaFecha
              }
              className="h-10 cifras sm:h-9 sm:w-56"
            />
            <p
              id={ids.ayudaFecha}
              className="text-xs text-pretty text-muted-foreground"
            >
              El día en que el banco hizo la transferencia: entre el{" "}
              {formatearFecha(instanteDeDia(fechaMinima))} y hoy.
            </p>
            {errores.fecha ? (
              <p
                id={ids.errorFecha}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.fecha}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={ids.referencia}>Referencia del pago</Label>
            <Input
              ref={campoReferencia}
              id={ids.referencia}
              value={referencia}
              maxLength={LARGO_MAXIMO_REFERENCIA}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={ocupado}
              placeholder="Ej.: TRF-20261023-40491"
              onChange={(evento) => {
                setReferencia(evento.target.value)
                sinError("referencia")
              }}
              aria-invalid={errores.referencia ? true : undefined}
              aria-describedby={
                errores.referencia
                  ? `${ids.errorReferencia} ${ids.ayudaReferencia}`
                  : ids.ayudaReferencia
              }
              className="h-10 sm:h-9"
            />
            <p
              id={ids.ayudaReferencia}
              className="text-xs text-pretty text-muted-foreground"
            >
              El número de la transferencia o del comprobante, como aparece en
              el extracto del banco.
            </p>
            {errores.referencia ? (
              <p
                id={ids.errorReferencia}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.referencia}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p id={ids.soporte} className="text-sm font-medium">
              Soporte del pago
            </p>
            {archivo ? (
              <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/70 px-3 py-2 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  {imagen ? (
                    <ImageIcon aria-hidden className="size-4" />
                  ) : (
                    <FileText aria-hidden className="size-4" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium" title={archivo.name}>
                    {archivo.name}
                  </span>
                  <span className="text-xs cifras text-muted-foreground">
                    {formatearTamano(archivo.size)}
                    {subido?.archivo === archivo ? " · Cargado" : ""}
                  </span>
                </span>
                <Button
                  ref={botonCambiar}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={quitarArchivo}
                  disabled={ocupado}
                  aria-describedby={
                    errores.soporte ? ids.errorSoporte : undefined
                  }
                >
                  <RefreshCw data-icon="inline-start" aria-hidden />
                  Cambiar{" "}
                  <span className="sr-only">el soporte {archivo.name}</span>
                </Button>
              </div>
            ) : (
              <div ref={zonaSoporte}>
                <ZonaArchivos
                  reglas={REGLAS_SOPORTE_PAGO}
                  compacta
                  titulo="Comprobante de la transferencia"
                  descripcion="PDF, JPG o PNG de hasta 10 MB. El medio lo puede descargar: que muestre solo su pago, no la planilla del lote."
                  onArchivos={([elegido]) => {
                    if (elegido) elegirArchivo(elegido)
                  }}
                  deshabilitada={ocupado}
                  invalida={Boolean(errores.soporte)}
                  describidaPor={
                    errores.soporte
                      ? `${ids.soporte} ${ids.errorSoporte}`
                      : ids.soporte
                  }
                />
              </div>
            )}
            {elemento ? (
              <ListaSubidas
                elementos={[elemento]}
                etiqueta="Subida del soporte"
                onCancelar={() => subida.cancelar()}
              />
            ) : null}
            {errores.soporte ? (
              <p
                id={ids.errorSoporte}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.soporte}
              </p>
            ) : null}
          </div>

          {errorGeneral ? (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {errorGeneral}
            </p>
          ) : null}
          {/* Vacía sigue en el árbol de accesibilidad: se anuncia el primer estado. */}
          <p
            role="status"
            className="text-sm text-muted-foreground empty:sr-only"
          >
            {estadoEnvio}
          </p>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={ocupado} />
              }
            >
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={ocupado}>
              {ocupado ? (
                <Spinner aria-label="Registrando" data-icon="inline-start" />
              ) : (
                <Banknote data-icon="inline-start" aria-hidden />
              )}
              {textoConfirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
