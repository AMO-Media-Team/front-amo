"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { HandCoins } from "lucide-react"
import { useId, useMemo, useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { textoANumero } from "@/features/configuracion/numeros"
import { formatearCOP } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  confirmarArchivoFactura,
  prepararArchivoFactura,
  registrarPagoFactura,
} from "../actions"
import { describir, repartirErrores } from "../errores-formulario"
import { avisoEstadoFactura } from "../foco"
import { efectoPago, ETIQUETAS_MEDIO_PAGO } from "../presentacion"
import {
  esquemaFormularioPago,
  hoyEnBogota,
  LIMITES_ARCHIVO,
  type ValoresFormularioPago,
} from "../schemas"
import { MEDIOS_PAGO } from "../tipos"
import { CampoArchivo } from "./campo-archivo"
import { DialogoFormulario } from "./dialogo-formulario"
import { useArchivoSoporte } from "./use-archivo-soporte"

type Campo = Exclude<keyof ValoresFormularioPago, "facturaId">

const CAMPOS: readonly Campo[] = [
  "fecha",
  "monto",
  "retenciones",
  "medioPago",
  "referencia",
]

export interface RegistrarPagoProps {
  facturaId: string
  numero: string
  anunciante: string
  saldo: number
  /** `YYYY-MM-DD`: un pago no puede ser anterior a la emisión. */
  fechaEmision: string
}

function valoresIniciales(facturaId: string): ValoresFormularioPago {
  return {
    facturaId,
    fecha: hoyEnBogota(),
    monto: "",
    retenciones: "",
    medioPago: "TRANSFERENCIA",
    referencia: "",
  }
}

function pesos(texto: unknown): number {
  if (typeof texto === "number") return texto
  return typeof texto === "string" ? (textoANumero(texto) ?? 0) : 0
}

/** Lo que pasa con la factura si se registra lo escrito. */
function EfectoDelPago({
  monto,
  retenciones,
  saldo,
}: {
  monto: number
  retenciones: number
  saldo: number
}) {
  const { efecto, saldoRestante } = efectoPago({ monto, retenciones, saldo })
  if (efecto === "vacio" || efecto === "excede") return null
  return (
    <p
      aria-live="polite"
      className={cn(
        "rounded-lg px-3 py-2.5 text-sm text-pretty",
        efecto === "total" ? "bg-success/10" : "bg-muted/60"
      )}
    >
      {efecto === "total"
        ? "Con este pago la factura queda pagada."
        : `Queda un saldo de ${formatearCOP(saldoRestante)}: la factura pasa a pago parcial.`}
    </p>
  )
}

/**
 * «Registrar pago» del anunciante (LIQ-008 c2): valor recibido, retenciones
 * que practicó (cuentan para el saldo), medio, referencia, fecha y soporte
 * obligatorio. Antes de enviar dice si la factura queda pagada o con qué
 * saldo.
 */
export function RegistrarPago({
  facturaId,
  numero,
  anunciante,
  saldo,
  fechaEmision,
}: RegistrarPagoProps) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const id = useId()
  const idFormulario = `${id}-formulario`
  const esquema = useMemo(
    () => esquemaFormularioPago({ saldo, fechaEmision }),
    [saldo, fechaEmision]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(facturaId),
    mode: "onTouched",
  })
  const { register, formState, setError, control } = formulario
  const [monto, retenciones] = useWatch({
    control,
    name: ["monto", "retenciones"],
  })
  const archivo = useArchivoSoporte({
    preparar: (descripcion) =>
      prepararArchivoFactura({ facturaId, destino: "pago", descripcion }),
    confirmar: (subido) =>
      confirmarArchivoFactura({ facturaId, destino: "pago", archivo: subido }),
    reglas: LIMITES_ARCHIVO.pago,
  })

  function cambiarAbierto(valor: boolean) {
    if (!valor) {
      formulario.reset(valoresIniciales(facturaId))
      archivo.descartar()
      setErrorArchivo(null)
      setErrorGeneral(null)
    }
    setAbierto(valor)
  }

  const enviar = formulario.handleSubmit(() =>
    iniciar(async () => {
      setErrorGeneral(null)
      if (!archivo.elegido) {
        setErrorArchivo("Carga el soporte del pago.")
        return
      }
      const listo = await archivo.obtener()
      if (!listo?.ok) {
        setErrorArchivo(listo?.error ?? "Carga el soporte del pago.")
        return
      }
      const resultado = await registrarPagoFactura({
        ...formulario.getValues(),
        facturaId,
        soportePath: listo.ruta,
      })
      if (!resultado.ok) {
        const errores = repartirErrores(resultado, CAMPOS)
        errores.campos.forEach(([campo, mensaje], indice) =>
          setError(
            campo,
            { type: "server", message: mensaje },
            { shouldFocus: indice === 0 }
          )
        )
        setErrorArchivo(errores.archivo)
        setErrorGeneral(errores.general)
        return
      }
      const pagada = resultado.datos.estado === "PAGADA"
      toast.success("Pago registrado", {
        description: pagada
          ? `La factura ${numero} quedó pagada.`
          : `Saldo de la factura ${numero}: ${formatearCOP(resultado.datos.saldo)}.`,
      })
      cambiarAbierto(false)
    })
  )

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAbierto(true)}>
        <HandCoins data-icon="inline-start" aria-hidden />
        Registrar pago
      </Button>
      <DialogoFormulario
        abierto={abierto}
        onAbiertoChange={cambiarAbierto}
        icono={HandCoins}
        titulo="Registrar pago"
        descripcion={`Pago de ${anunciante} a la factura ${numero}. Saldo: ${formatearCOP(saldo)}.`}
        idFormulario={idFormulario}
        textoConfirmar="Registrar pago"
        textoPendiente="Registrando el pago"
        pendiente={pendiente}
        errorGeneral={errorGeneral}
        focoAlCerrar={avisoEstadoFactura}
      >
        <form id={idFormulario} onSubmit={enviar} noValidate>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={formState.errors.monto ? true : undefined}>
                <FieldLabel htmlFor={`${id}-monto`}>Valor recibido</FieldLabel>
                <InputGroup className="h-10 sm:h-9">
                  <InputGroupAddon align="inline-start" className="pl-3">
                    <span aria-hidden className="text-sm text-muted-foreground">
                      $
                    </span>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-monto`}
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={pendiente}
                    aria-invalid={formState.errors.monto ? true : undefined}
                    aria-describedby={describir(
                      `${id}-monto-ayuda`,
                      formState.errors.monto && `${id}-monto-error`
                    )}
                    className="h-full cifras"
                    {...register("monto")}
                  />
                </InputGroup>
                <FieldDescription id={`${id}-monto-ayuda`}>
                  Lo que llegó a la cuenta de AMO.
                </FieldDescription>
                <FieldError
                  id={`${id}-monto-error`}
                  errors={[formState.errors.monto]}
                />
              </Field>
              <Field
                data-invalid={formState.errors.retenciones ? true : undefined}
              >
                <FieldLabel htmlFor={`${id}-retenciones`}>
                  Retenciones{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </FieldLabel>
                <InputGroup className="h-10 sm:h-9">
                  <InputGroupAddon align="inline-start" className="pl-3">
                    <span aria-hidden className="text-sm text-muted-foreground">
                      $
                    </span>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-retenciones`}
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={pendiente}
                    aria-invalid={
                      formState.errors.retenciones ? true : undefined
                    }
                    aria-describedby={describir(
                      `${id}-retenciones-ayuda`,
                      formState.errors.retenciones && `${id}-retenciones-error`
                    )}
                    className="h-full cifras"
                    {...register("retenciones")}
                  />
                </InputGroup>
                <FieldDescription id={`${id}-retenciones-ayuda`}>
                  Lo que el anunciante retuvo (retención en la fuente, ReteICA,
                  ReteIVA) y certificará. Cuenta como pagado.
                </FieldDescription>
                <FieldError
                  id={`${id}-retenciones-error`}
                  errors={[formState.errors.retenciones]}
                />
              </Field>
            </div>

            <EfectoDelPago
              monto={pesos(monto)}
              retenciones={pesos(retenciones)}
              saldo={saldo}
            />

            <Controller
              control={control}
              name="medioPago"
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid || undefined}>
                  <FieldLegend id={`${id}-medio`} variant="label">
                    Medio de pago
                  </FieldLegend>
                  <RadioGroup
                    value={field.value}
                    onValueChange={(valor) => {
                      field.onChange(valor)
                      field.onBlur()
                    }}
                    disabled={pendiente}
                    aria-labelledby={`${id}-medio`}
                    aria-invalid={fieldState.invalid || undefined}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                  >
                    {MEDIOS_PAGO.map((medio) => (
                      <label
                        key={medio}
                        className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background/60 px-3 text-sm transition-colors hover:bg-muted/60 has-data-checked:border-primary has-data-checked:bg-primary/8 has-data-checked:font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
                      >
                        <RadioGroupItem value={medio} />
                        {ETIQUETAS_MEDIO_PAGO[medio]}
                      </label>
                    ))}
                  </RadioGroup>
                  <FieldError errors={[fieldState.error]} />
                </FieldSet>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={formState.errors.fecha ? true : undefined}>
                <FieldLabel htmlFor={`${id}-fecha`}>Fecha del pago</FieldLabel>
                <Input
                  id={`${id}-fecha`}
                  type="date"
                  min={fechaEmision}
                  max={hoyEnBogota()}
                  disabled={pendiente}
                  aria-invalid={formState.errors.fecha ? true : undefined}
                  aria-describedby={describir(
                    formState.errors.fecha && `${id}-fecha-error`
                  )}
                  className="h-10 sm:h-9"
                  {...register("fecha")}
                />
                <FieldError
                  id={`${id}-fecha-error`}
                  errors={[formState.errors.fecha]}
                />
              </Field>
              <Field
                data-invalid={formState.errors.referencia ? true : undefined}
              >
                <FieldLabel htmlFor={`${id}-referencia`}>
                  Referencia{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </FieldLabel>
                <Input
                  id={`${id}-referencia`}
                  maxLength={120}
                  autoComplete="off"
                  disabled={pendiente}
                  placeholder="Ej.: CUS 1234567 o comprobante 889"
                  aria-invalid={formState.errors.referencia ? true : undefined}
                  aria-describedby={describir(
                    formState.errors.referencia && `${id}-referencia-error`
                  )}
                  className="h-10 sm:h-9"
                  {...register("referencia")}
                />
                <FieldError
                  id={`${id}-referencia-error`}
                  errors={[formState.errors.referencia]}
                />
              </Field>
            </div>

            <CampoArchivo
              titulo="Soporte del pago"
              descripcion="El comprobante del banco o de PSE: PDF, JPG o PNG de hasta 10 MB."
              reglas={LIMITES_ARCHIVO.pago}
              archivo={archivo}
              error={errorArchivo}
              onCambio={() => setErrorArchivo(null)}
              deshabilitado={pendiente}
            />
          </FieldGroup>
        </form>
      </DialogoFormulario>
    </>
  )
}
