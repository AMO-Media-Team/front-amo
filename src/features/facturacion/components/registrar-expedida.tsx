"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FileCheck } from "lucide-react"
import { useId, useMemo, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { numeroAEntrada } from "@/features/configuracion/numeros"
import { formatearCOP } from "@/lib/format"

import {
  confirmarArchivoFactura,
  prepararArchivoFactura,
  registrarFacturaExpedida,
} from "../actions"
import { describir, repartirErrores } from "../errores-formulario"
import { avisoEstadoFactura } from "../foco"
import {
  formatearDia,
  type NumeracionSugerida,
  normalizarCodigoDian,
  vencimientoSugerido,
} from "../presentacion"
import {
  esquemaFormularioExpedida,
  hoyEnBogota,
  LIMITES_ARCHIVO,
  type ValoresFormularioExpedida,
} from "../schemas"
import { CampoArchivo } from "./campo-archivo"
import { DialogoFormulario } from "./dialogo-formulario"
import { useArchivoSoporte } from "./use-archivo-soporte"

type Campo = Exclude<keyof ValoresFormularioExpedida, "facturaId">

const CAMPOS: readonly Campo[] = [
  "prefijo",
  "consecutivo",
  "fechaEmision",
  "fechaVencimiento",
  "cufe",
  "total",
]

export interface RegistrarExpedidaProps {
  facturaId: string
  anunciante: string
  totalBorrador: number
  sugerencia: NumeracionSugerida | null
  /** Número de la resolución de facturación activa (para la ayuda). */
  resolucion: string | null
  diasVencimiento: number | null
}

function valoresIniciales(
  facturaId: string,
  sugerencia: NumeracionSugerida | null
): ValoresFormularioExpedida {
  return {
    facturaId,
    prefijo: sugerencia?.prefijo ?? "",
    consecutivo: sugerencia?.consecutivo ? String(sugerencia.consecutivo) : "",
    fechaEmision: hoyEnBogota(),
    fechaVencimiento: "",
    cufe: "",
    total: "",
  }
}

/**
 * «Registrar factura expedida» (LIQ-008 c1): la factura se expide en el
 * software de AMO y aquí se registran su número (prefijo sugerido por la
 * resolución activa), fechas, CUFE, el total —que debe coincidir con el del
 * borrador— y el PDF. Queda EMITIDA y el anunciante la ve.
 */
export function RegistrarExpedida({
  facturaId,
  anunciante,
  totalBorrador,
  sugerencia,
  resolucion,
  diasVencimiento,
}: RegistrarExpedidaProps) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const id = useId()
  const idFormulario = `${id}-formulario`
  const esquema = useMemo(
    () => esquemaFormularioExpedida(totalBorrador),
    [totalBorrador]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(facturaId, sugerencia),
    mode: "onTouched",
  })
  const { register, formState, setError, control } = formulario
  const [fechaEmision, cufe] = useWatch({
    control,
    name: ["fechaEmision", "cufe"],
  })
  const archivo = useArchivoSoporte({
    preparar: (descripcion) =>
      prepararArchivoFactura({ facturaId, destino: "factura", descripcion }),
    confirmar: (subido) =>
      confirmarArchivoFactura({
        facturaId,
        destino: "factura",
        archivo: subido,
      }),
    reglas: LIMITES_ARCHIVO.factura,
  })
  const vencePorDefecto = vencimientoSugerido(fechaEmision, diasVencimiento)
  const largoCufe = normalizarCodigoDian(cufe).length

  function cambiarAbierto(valor: boolean) {
    if (!valor) {
      formulario.reset(valoresIniciales(facturaId, sugerencia))
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
        setErrorArchivo("Carga el PDF de la factura expedida.")
        return
      }
      const listo = await archivo.obtener()
      if (!listo?.ok) {
        setErrorArchivo(listo?.error ?? "Carga el PDF de la factura expedida.")
        return
      }
      const resultado = await registrarFacturaExpedida({
        ...formulario.getValues(),
        facturaId,
        archivoPath: listo.ruta,
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
      toast.success(`Factura ${resultado.datos.numero} registrada`, {
        description: `Quedó emitida y ${anunciante} ya la ve en su portal.`,
      })
      cambiarAbierto(false)
    })
  )

  const ayudaNumero = sugerencia
    ? sugerencia.agotada
      ? `La resolución ${resolucion ?? "activa"} ya no tiene números disponibles: registra la nueva resolución en Configuración.`
      : `Sugerido por la resolución ${resolucion ?? "activa"}: ${sugerencia.prefijo}${sugerencia.consecutivo}. Escribe el que asignó el software de facturación.`
    : "Escribe el prefijo y el número que asignó el software de facturación."

  return (
    <>
      <Button type="button" onClick={() => setAbierto(true)}>
        <FileCheck data-icon="inline-start" aria-hidden />
        Registrar factura expedida
      </Button>
      <DialogoFormulario
        abierto={abierto}
        onAbiertoChange={cambiarAbierto}
        icono={FileCheck}
        titulo="Registrar factura expedida"
        descripcion={`Copia los datos de la factura que expediste en el software de facturación para ${anunciante}. El total debe ser ${formatearCOP(totalBorrador)}.`}
        idFormulario={idFormulario}
        textoConfirmar="Registrar factura"
        textoPendiente="Registrando la factura"
        pendiente={pendiente}
        errorGeneral={errorGeneral}
        focoAlCerrar={avisoEstadoFactura}
      >
        <form id={idFormulario} onSubmit={enviar} noValidate>
          <FieldGroup>
            <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-3">
              <Field data-invalid={formState.errors.prefijo ? true : undefined}>
                <FieldLabel htmlFor={`${id}-prefijo`}>Prefijo</FieldLabel>
                <Input
                  id={`${id}-prefijo`}
                  maxLength={4}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={pendiente}
                  aria-invalid={formState.errors.prefijo ? true : undefined}
                  aria-describedby={describir(
                    `${id}-numero-ayuda`,
                    formState.errors.prefijo && `${id}-prefijo-error`
                  )}
                  className="h-10 cifras uppercase sm:h-9"
                  {...register("prefijo")}
                />
                <FieldError
                  id={`${id}-prefijo-error`}
                  errors={[formState.errors.prefijo]}
                />
              </Field>
              <Field
                data-invalid={formState.errors.consecutivo ? true : undefined}
              >
                <FieldLabel htmlFor={`${id}-consecutivo`}>Número</FieldLabel>
                <Input
                  id={`${id}-consecutivo`}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={pendiente}
                  aria-invalid={formState.errors.consecutivo ? true : undefined}
                  aria-describedby={describir(
                    `${id}-numero-ayuda`,
                    formState.errors.consecutivo && `${id}-consecutivo-error`
                  )}
                  className="h-10 cifras sm:h-9"
                  {...register("consecutivo")}
                />
                <FieldError
                  id={`${id}-consecutivo-error`}
                  errors={[formState.errors.consecutivo]}
                />
              </Field>
              <FieldDescription
                id={`${id}-numero-ayuda`}
                className="col-span-2"
              >
                {ayudaNumero}
              </FieldDescription>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                data-invalid={formState.errors.fechaEmision ? true : undefined}
              >
                <FieldLabel htmlFor={`${id}-emision`}>
                  Fecha de emisión
                </FieldLabel>
                <Input
                  id={`${id}-emision`}
                  type="date"
                  max={hoyEnBogota()}
                  disabled={pendiente}
                  aria-invalid={
                    formState.errors.fechaEmision ? true : undefined
                  }
                  aria-describedby={describir(
                    formState.errors.fechaEmision && `${id}-fechaEmision-error`
                  )}
                  className="h-10 sm:h-9"
                  {...register("fechaEmision")}
                />
                <FieldError
                  id={`${id}-fechaEmision-error`}
                  errors={[formState.errors.fechaEmision]}
                />
              </Field>
              <Field
                data-invalid={
                  formState.errors.fechaVencimiento ? true : undefined
                }
              >
                <FieldLabel htmlFor={`${id}-vence`}>
                  Vencimiento{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </FieldLabel>
                <Input
                  id={`${id}-vence`}
                  type="date"
                  min={fechaEmision || undefined}
                  disabled={pendiente}
                  aria-invalid={
                    formState.errors.fechaVencimiento ? true : undefined
                  }
                  aria-describedby={describir(
                    `${id}-vence-ayuda`,
                    formState.errors.fechaVencimiento &&
                      `${id}-fechaVencimiento-error`
                  )}
                  className="h-10 sm:h-9"
                  {...register("fechaVencimiento")}
                />
                <FieldDescription id={`${id}-vence-ayuda`}>
                  {vencePorDefecto
                    ? `Vacío: vence el ${formatearDia(vencePorDefecto, "largo")} (${diasVencimiento} días).`
                    : "Vacío: se usan los días de vencimiento configurados."}
                </FieldDescription>
                <FieldError
                  id={`${id}-fechaVencimiento-error`}
                  errors={[formState.errors.fechaVencimiento]}
                />
              </Field>
            </div>

            <Field data-invalid={formState.errors.cufe ? true : undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor={`${id}-cufe`}>CUFE</FieldLabel>
                <span
                  className="text-xs cifras text-muted-foreground"
                  aria-hidden
                >
                  {largoCufe}/96
                </span>
              </div>
              <Textarea
                id={`${id}-cufe`}
                rows={3}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                disabled={pendiente}
                aria-invalid={formState.errors.cufe ? true : undefined}
                aria-describedby={describir(
                  `${id}-cufe-ayuda`,
                  formState.errors.cufe && `${id}-cufe-error`
                )}
                className="font-mono text-xs break-all md:text-xs"
                {...register("cufe")}
              />
              <FieldDescription id={`${id}-cufe-ayuda`}>
                Cópialo del software de facturación o del PDF: 96 caracteres.
                Puedes pegarlo con espacios o saltos de línea.
              </FieldDescription>
              <FieldError
                id={`${id}-cufe-error`}
                errors={[formState.errors.cufe]}
              />
            </Field>

            <Field data-invalid={formState.errors.total ? true : undefined}>
              <FieldLabel htmlFor={`${id}-total`}>
                Total de la factura expedida
              </FieldLabel>
              <InputGroup className="h-10 sm:h-9">
                <InputGroupAddon align="inline-start" className="pl-3">
                  <span aria-hidden className="text-sm text-muted-foreground">
                    $
                  </span>
                </InputGroupAddon>
                <InputGroupInput
                  id={`${id}-total`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={numeroAEntrada(totalBorrador)}
                  disabled={pendiente}
                  aria-invalid={formState.errors.total ? true : undefined}
                  aria-describedby={describir(
                    `${id}-total-ayuda`,
                    formState.errors.total && `${id}-total-error`
                  )}
                  className="h-full cifras"
                  {...register("total")}
                />
              </InputGroup>
              <FieldDescription id={`${id}-total-ayuda`}>
                Escríbelo como aparece en la factura. Debe coincidir con el del
                borrador: {formatearCOP(totalBorrador)}.
              </FieldDescription>
              <FieldError
                id={`${id}-total-error`}
                errors={[formState.errors.total]}
              />
            </Field>

            <CampoArchivo
              titulo="PDF de la factura expedida"
              descripcion="El PDF que generó el software de facturación (hasta 10 MB). Lo verá el anunciante."
              reglas={LIMITES_ARCHIVO.factura}
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
