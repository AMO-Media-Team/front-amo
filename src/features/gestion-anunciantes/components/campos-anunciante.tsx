"use client"

import { Building2, MapPin, Receipt } from "lucide-react"
import { type ReactNode, useId } from "react"
import {
  Controller,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { SelectorTerritorio } from "@/components/territorio/selector-territorio"
import { Input } from "@/components/ui/input"
import {
  CampoSelect,
  CampoTexto,
  type OpcionCampo,
} from "@/features/configuracion/components/campos"

import { type EntradaAnunciante, PAIS_COLOMBIA } from "../schemas"
import type { CatalogosAnunciante, OpcionSector } from "../tipos"
import { CamposNit } from "./campos-nit"
import { SelectorPais } from "./selector-pais"

const CAMPOS_COLOMBIA = [
  "nit",
  "digitoVerificacion",
  "municipioCodigo",
] as const
const CAMPOS_EXTRANJERO = [
  "identificacionExtranjera",
  "ciudadExtranjera",
] as const

function Seccion({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Building2
  titulo: string
  children: ReactNode
}) {
  return (
    <FieldSet className="gap-5">
      <FieldLegend className="mb-0 flex items-center gap-2 text-sm font-semibold">
        <Icono aria-hidden className="size-4 text-primary" />
        {titulo}
      </FieldLegend>
      {children}
    </FieldSet>
  )
}

/** Sectores activos y, si ya no lo está, el que tiene hoy el anunciante. */
function opcionesSector(
  sectores: readonly OpcionSector[],
  actual: OpcionSector | null
): OpcionCampo[] {
  const opciones = sectores.map((s) => ({ valor: s.id, etiqueta: s.nombre }))
  if (actual && !sectores.some((s) => s.id === actual.id)) {
    opciones.unshift({
      valor: actual.id,
      etiqueta: `${actual.nombre} (inactivo)`,
    })
  }
  return opciones
}

function CampoPais({
  catalogos,
  deshabilitado,
}: {
  catalogos: CatalogosAnunciante
  deshabilitado?: boolean
}) {
  const { control, clearErrors } = useFormContext<EntradaAnunciante>()
  const id = useId()
  return (
    <Controller
      control={control}
      name="paisIso2"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>País</FieldLabel>
          <SelectorPais
            id={id}
            valor={field.value}
            paises={catalogos.paises}
            invalido={fieldState.invalid}
            deshabilitado={deshabilitado}
            onCambio={(iso2) => {
              // Lo escrito para el otro país se conserva (por si vuelve), sin sus errores.
              clearErrors(
                iso2 === PAIS_COLOMBIA
                  ? [...CAMPOS_EXTRANJERO]
                  : [...CAMPOS_COLOMBIA]
              )
              field.onChange(iso2)
              field.onBlur()
            }}
          />
          <FieldDescription>
            Donde está constituida la empresa.
          </FieldDescription>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

/** Sede en Colombia: departamento → municipio, solo los activos. */
function CampoMunicipio({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<EntradaAnunciante>()
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Controller
      control={control}
      name="municipioCodigo"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <SelectorTerritorio
            modo="municipio"
            id={id}
            valor={field.value}
            invalido={fieldState.invalid}
            deshabilitado={deshabilitado}
            describedBy={fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda}
            onCambio={(municipio) => {
              field.onChange(municipio?.codigo ?? "")
              field.onBlur()
            }}
          />
          <FieldDescription id={idAyuda}>
            Ciudad de la sede principal, como figura en el RUT.
          </FieldDescription>
          <FieldError id={idError} errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

function CampoCorreoFacturacion({
  deshabilitado,
}: {
  deshabilitado?: boolean
}) {
  const { control, register, getFieldState } =
    useFormContext<EntradaAnunciante>()
  const estado = useFormState({ control, name: "emailFacturacion" })
  const { error } = getFieldState("emailFacturacion", estado)
  const id = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        Correo de facturación
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLabel>
      <Input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="off"
        placeholder="facturacion@empresa.com"
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        {...register("emailFacturacion")}
      />
      <FieldDescription>
        Allí llegarán las facturas electrónicas de AMO.
      </FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  )
}

/**
 * Campos del anunciante (registro y edición), dentro de un `FormProvider`:
 * empresa, identificación y ubicación según el país, y facturación.
 */
export function CamposAnunciante({
  catalogos,
  sectorActual = null,
  deshabilitado,
  enfocarPrimero = false,
}: {
  catalogos: CatalogosAnunciante
  /** Edición: el sector vigente, aunque ya no esté activo. */
  sectorActual?: OpcionSector | null
  deshabilitado?: boolean
  enfocarPrimero?: boolean
}) {
  const { control } = useFormContext<EntradaAnunciante>()
  const pais = useWatch({ control, name: "paisIso2" })
  const colombiana = pais === PAIS_COLOMBIA

  return (
    <>
      <Seccion icono={Building2} titulo="Empresa">
        <CampoTexto
          nombre="razonSocial"
          etiqueta="Razón social"
          placeholder="Comercializadora Andina S.A.S."
          descripcion="Tal como aparece en el RUT o en el certificado de existencia."
          deshabilitado={deshabilitado}
          autoFocus={enfocarPrimero}
        />
        <CampoTexto
          nombre="nombreComercial"
          etiqueta="Nombre comercial"
          placeholder="Andina"
          descripcion="Es el nombre que ven los medios en las ofertas."
          deshabilitado={deshabilitado}
        />
        <CampoSelect
          nombre="sectorId"
          etiqueta="Sector"
          placeholder="Elige el sector"
          opciones={opcionesSector(catalogos.sectores, sectorActual)}
          descripcion="Clasifica al anunciante en los reportes y en la exclusividad de las ofertas."
          deshabilitado={deshabilitado}
        />
      </Seccion>

      <Seccion icono={MapPin} titulo="Identificación y ubicación">
        <CampoPais catalogos={catalogos} deshabilitado={deshabilitado} />
        {colombiana ? (
          <>
            <CamposNit deshabilitado={deshabilitado} />
            <CampoMunicipio deshabilitado={deshabilitado} />
          </>
        ) : (
          <>
            <CampoTexto
              nombre="identificacionExtranjera"
              etiqueta="Identificación tributaria"
              placeholder="EIN, RUC, RFC, CUIT…"
              descripcion="Como figura en sus facturas o en el registro de su país."
              deshabilitado={deshabilitado}
            />
            <CampoTexto
              nombre="ciudadExtranjera"
              etiqueta="Ciudad"
              opcional
              placeholder="Miami"
              deshabilitado={deshabilitado}
            />
          </>
        )}
      </Seccion>

      <Seccion icono={Receipt} titulo="Facturación">
        <CampoCorreoFacturacion deshabilitado={deshabilitado} />
      </Seccion>
    </>
  )
}
