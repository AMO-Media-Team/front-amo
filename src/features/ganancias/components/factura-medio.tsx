"use client"

import { FileText, ReceiptText, RefreshCw, Send, X } from "lucide-react"
import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { useCargaCaptura } from "@/components/archivos/use-carga-captura"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearTamano } from "@/lib/archivos/formato"
import { cn } from "@/lib/utils"

import {
  confirmarFacturaMedio,
  prepararFacturaMedio,
  registrarFacturaMedio,
} from "../actions"
import { MENSAJES_GANANCIAS } from "../errores"
import { ID_SECCION_FACTURA } from "../presentacion"
import {
  esquemaFormularioFactura,
  LARGO_MAXIMO_NUMERO_FACTURA,
  REGLAS_FACTURA,
} from "../schemas"
import type { FacturaMedio } from "../tipos"
import { BotonDescargaLiquidacion } from "./descarga-liquidacion"

interface PropsFormulario {
  liquidacionId: string
  /** Al reemplazar: el formulario se puede cerrar sin enviar. */
  onCancelar?: () => void
  onEnviada: (numero: string) => void
}

/** Control que recibe el foco cuando cambia el PDF elegido. */
type DestinoFoco = "quitar" | "zona"

/**
 * Número y PDF de la factura (D83). El PDF se sube en cuanto se elige,
 * mientras la persona escribe el número; al enviar se espera lo que falte y
 * se registra con `registrar_factura_medio_srv`. Cada error queda junto a su
 * campo y el foco va al primero que hay que corregir.
 */
function FormularioFactura({
  liquidacionId,
  onCancelar,
  onEnviada,
}: PropsFormulario) {
  const [numero, setNumero] = useState("")
  const [errorNumero, setErrorNumero] = useState<string | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const campoNumero = useRef<HTMLInputElement>(null)
  const zona = useRef<HTMLDivElement>(null)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const destinoFoco = useRef<DestinoFoco | null>(null)
  /** Tras un error del servidor, el foco va al campo cuando deja de estar deshabilitado. */
  const focoTrasEnvio = useRef<"numero" | "archivo" | "general" | null>(null)
  const errorGeneralRef = useRef<HTMLParagraphElement>(null)
  const id = useId()
  const idNumero = `${id}-numero`
  const idAyudaNumero = `${id}-ayuda-numero`
  const idErrorNumero = `${id}-error-numero`
  const idErrorArchivo = `${id}-error-archivo`

  const carga = useCargaCaptura({
    preparar: (descripcion) =>
      prepararFacturaMedio({ liquidacionId, descripcion }),
    confirmar: (archivo) => confirmarFacturaMedio({ liquidacionId, archivo }),
    reglas: REGLAS_FACTURA,
    miniatura: false,
  })
  const { elegida } = carga

  // Elegir o quitar el PDF desmonta el control que se acaba de usar.
  useEffect(() => {
    const destino = destinoFoco.current
    if (!destino) return
    destinoFoco.current = null
    if (destino === "quitar") botonQuitar.current?.focus()
    else zona.current?.querySelector<HTMLButtonElement>("button")?.focus()
  }, [elegida])

  useEffect(() => {
    if (pendiente || !focoTrasEnvio.current) return
    const destino = focoTrasEnvio.current
    focoTrasEnvio.current = null
    if (destino === "numero") campoNumero.current?.focus()
    else if (destino === "archivo") enfocarArchivo()
    else errorGeneralRef.current?.focus()
  }, [pendiente])

  function enfocarArchivo() {
    if (botonQuitar.current) botonQuitar.current.focus()
    else zona.current?.querySelector<HTMLButtonElement>("button")?.focus()
  }

  function elegirArchivo(archivo: File) {
    destinoFoco.current = "quitar"
    setErrorArchivo(null)
    carga.elegir(archivo)
  }

  function quitarArchivo() {
    destinoFoco.current = "zona"
    setErrorArchivo(null)
    carga.descartar()
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (pendiente) return
    setErrorGeneral(null)
    const validacion = esquemaFormularioFactura.safeParse({
      liquidacionId,
      numero,
    })
    const problemaNumero = validacion.success
      ? null
      : (validacion.error.issues.find((issue) => issue.path[0] === "numero")
          ?.message ?? "Escribe el número de tu factura.")
    const problemaArchivo = elegida ? null : MENSAJES_GANANCIAS.archivoRequerido
    setErrorNumero(problemaNumero)
    setErrorArchivo(problemaArchivo)
    if (problemaNumero) {
      campoNumero.current?.focus()
      return
    }
    if (problemaArchivo) {
      enfocarArchivo()
      return
    }
    iniciar(async () => {
      const lista = await carga.obtener()
      if (!lista?.ok) {
        setErrorArchivo(lista?.error ?? MENSAJES_GANANCIAS.archivoNoCargado)
        focoTrasEnvio.current = "archivo"
        return
      }
      const resultado = await registrarFacturaMedio({
        liquidacionId,
        numero,
        archivoPath: lista.captura.ruta,
      })
      if (!resultado.ok) {
        const deNumero = resultado.erroresCampo?.numero?.[0]
        const deArchivo = resultado.erroresCampo?.archivo?.[0]
        if (deNumero) setErrorNumero(deNumero)
        if (deArchivo) {
          setErrorArchivo(deArchivo)
          carga.descartar()
        }
        if (!deNumero && !deArchivo) setErrorGeneral(resultado.error)
        focoTrasEnvio.current = deNumero
          ? "numero"
          : deArchivo
            ? "archivo"
            : "general"
        return
      }
      const registrado = validacion.success ? validacion.data.numero : numero
      toast.success("Recibimos tu factura", {
        description: "El equipo de Finanzas la revisará para pagarte.",
      })
      onEnviada(registrado)
    })
  }

  const describeNumero = [idAyudaNumero, errorNumero ? idErrorNumero : null]
    .filter(Boolean)
    .join(" ")

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-label="Carga tu factura"
      aria-busy={pendiente || undefined}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-2">
        <Label htmlFor={idNumero}>Número de la factura</Label>
        <Input
          ref={campoNumero}
          id={idNumero}
          value={numero}
          onChange={(evento) => {
            setNumero(evento.target.value)
            if (errorNumero) setErrorNumero(null)
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={LARGO_MAXIMO_NUMERO_FACTURA + 10}
          disabled={pendiente}
          aria-invalid={errorNumero ? true : undefined}
          aria-describedby={describeNumero}
          placeholder="FE-1234"
          className="h-10 uppercase placeholder:normal-case"
        />
        <p id={idAyudaNumero} className="text-xs text-muted-foreground">
          Como aparece en tu factura electrónica, con su prefijo.
        </p>
        {errorNumero ? (
          <p id={idErrorNumero} className="text-sm text-destructive">
            {errorNumero}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {elegida ? (
          <>
            <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/70 px-3 py-2 text-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <FileText aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium" title={elegida.name}>
                  {elegida.name}
                </span>
                <span className="text-xs cifras text-muted-foreground">
                  {formatearTamano(elegida.size)}
                  {carga.lista ? " · Listo para enviar" : ""}
                </span>
              </span>
              <Button
                ref={botonQuitar}
                type="button"
                variant="ghost"
                size="sm"
                onClick={quitarArchivo}
                disabled={pendiente}
                aria-describedby={errorArchivo ? idErrorArchivo : undefined}
              >
                <X data-icon="inline-start" aria-hidden />
                Quitar <span className="sr-only">el PDF {elegida.name}</span>
              </Button>
            </div>
            {carga.elemento ? (
              <ListaSubidas
                elementos={[carga.elemento]}
                etiqueta="Envío del PDF de la factura"
                onReintentar={() => carga.reintentar()}
                onCancelar={() => carga.subida.cancelar()}
                onQuitar={quitarArchivo}
              />
            ) : null}
          </>
        ) : (
          <div ref={zona}>
            <ZonaArchivos
              reglas={REGLAS_FACTURA}
              compacta
              titulo="PDF de la factura"
              descripcion="El PDF de tu factura electrónica, de hasta 10 MB."
              onArchivos={([archivo]) => {
                if (archivo) elegirArchivo(archivo)
              }}
              deshabilitada={pendiente}
              invalida={Boolean(errorArchivo)}
              describidaPor={errorArchivo ? idErrorArchivo : undefined}
            />
          </div>
        )}
        {errorArchivo ? (
          <p id={idErrorArchivo} className="text-sm text-destructive">
            {errorArchivo}
          </p>
        ) : null}
      </div>

      {errorGeneral ? (
        <p
          ref={errorGeneralRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-sm text-destructive outline-none"
        >
          {errorGeneral}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancelar ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelar}
            disabled={pendiente}
            className="w-full sm:w-auto"
          >
            No reemplazar
          </Button>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={pendiente}
          className="w-full sm:w-auto"
        >
          {pendiente ? (
            <Spinner data-icon="inline-start" role={undefined} aria-hidden />
          ) : (
            <Send data-icon="inline-start" aria-hidden />
          )}
          {pendiente ? "Enviando…" : "Enviar factura"}
        </Button>
      </div>
    </form>
  )
}

/**
 * «Tu factura» en el detalle de la liquidación del medio que factura (D83):
 * la registrada (número y PDF) y, mientras no se pague, el formulario para
 * cargarla o reemplazarla. Tras enviar, el foco llega a la constancia de la
 * factura registrada, que se anuncia.
 */
export function SeccionFacturaMedio({
  liquidacionId,
  factura,
  puedeCargar,
  periodo,
}: {
  liquidacionId: string
  factura: FacturaMedio
  /** Liquidación en revisión o aprobada (aún no se paga). */
  puedeCargar: boolean
  /** "1 – 15 oct 2026": distingue la descarga para el lector de pantalla. */
  periodo: string
}) {
  const [reemplazando, setReemplazando] = useState(false)
  /** Lo recién enviado, mientras `refresh()` trae la factura registrada. */
  const [enviada, setEnviada] = useState<string | null>(null)
  const constancia = useRef<HTMLDivElement>(null)
  const botonReemplazar = useRef<HTMLButtonElement>(null)
  const enfocar = useRef<"constancia" | "reemplazar" | null>(null)
  const numero = enviada ?? factura.numero
  const mostrarFormulario = puedeCargar && (numero === null || reemplazando)

  useEffect(() => {
    const destino = enfocar.current
    if (!destino) return
    enfocar.current = null
    if (destino === "constancia") constancia.current?.focus()
    else botonReemplazar.current?.focus()
  })

  function alEnviar(registrado: string) {
    setEnviada(registrado)
    setReemplazando(false)
    enfocar.current = "constancia"
  }

  return (
    <div id={ID_SECCION_FACTURA} className="scroll-mt-20">
      <TarjetaFicha
        titulo="Tu factura"
        icono={ReceiptText}
        descripcion={
          puedeCargar
            ? "Facturas tus servicios: para pagarte necesitamos el número y el PDF de tu factura por el valor de esta liquidación."
            : "La factura con que respaldaste este pago."
        }
      >
        <div className="flex flex-col gap-4">
          {numero ? (
            <div
              ref={constancia}
              tabIndex={-1}
              role="status"
              className="flex flex-col gap-3 rounded-xl border bg-background/50 p-3 outline-none focus-visible:anillo-foco sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground">
                  {enviada ? "Factura registrada" : "Factura"}
                </span>
                <span className="font-semibold cifras break-all">{numero}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {factura.conArchivo || enviada ? (
                  <BotonDescargaLiquidacion
                    liquidacionId={liquidacionId}
                    archivo="factura"
                    contexto={`del periodo ${periodo}`}
                  />
                ) : null}
                {puedeCargar && !reemplazando ? (
                  <Button
                    ref={botonReemplazar}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setReemplazando(true)}
                  >
                    <RefreshCw data-icon="inline-start" aria-hidden />
                    Reemplazar factura
                  </Button>
                ) : null}
              </div>
            </div>
          ) : !puedeCargar ? (
            <p className="text-sm text-muted-foreground">
              No hay factura registrada para esta liquidación.
            </p>
          ) : null}

          {mostrarFormulario ? (
            <div className={cn(numero ? "border-t pt-4" : "")}>
              <FormularioFactura
                key={reemplazando ? "reemplazo" : "carga"}
                liquidacionId={liquidacionId}
                onEnviada={alEnviar}
                onCancelar={
                  numero
                    ? () => {
                        setReemplazando(false)
                        enfocar.current = "reemplazar"
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
        </div>
      </TarjetaFicha>
    </div>
  )
}
