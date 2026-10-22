"use client"

import { MapPin, MapPinned } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useFormContext } from "react-hook-form"

import { ComboTerritorio } from "@/components/territorio/combo-territorio"
import type { EstadoConsulta } from "@/components/territorio/partes"
import { Field, FieldDescription, FieldError } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { departamentoDeMunicipio } from "@/features/territorio/segmentacion"
import type {
  DepartamentoActivo,
  MunicipioActivo,
} from "@/features/territorio/tipos"

import type { EntradaSolicitudVinculacion } from "../schemas"
import type { TerritorioPublico } from "../tipos"
import { useDescripcion } from "./campos-publicos"

/** Los datos ya llegaron con la página: la lista nunca está cargando ni falla. */
function consultaLista<T>(data: readonly T[]): EstadoConsulta & {
  data: readonly T[]
} {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: () => undefined,
  }
}

/**
 * Municipio del medio en el formulario público: departamento → municipio,
 * solo lo habilitado en AMO. Sin sesión no hay acciones de territorio: el
 * catálogo activo llega con la página y se filtra aquí.
 */
export function CampoUbicacion({
  territorio,
  deshabilitado,
}: {
  territorio: TerritorioPublico
  deshabilitado: boolean
}) {
  const { control } = useFormContext<EntradaSolicitudVinculacion>()
  const [departamentoLocal, setDepartamentoLocal] = useState<string | null>(
    null
  )
  const [municipiosAbierto, setMunicipiosAbierto] = useState(false)
  const { id, idAyuda, idError } = useDescripcion(true, true)
  const idDepartamento = `${id}-departamento`

  const porDepartamento = useMemo(() => {
    const grupos = new Map<string, MunicipioActivo[]>()
    for (const municipio of territorio.municipios) {
      const grupo = grupos.get(municipio.departamentoCodigo)
      if (grupo) grupo.push(municipio)
      else grupos.set(municipio.departamentoCodigo, [municipio])
    }
    return grupos
  }, [territorio.municipios])
  const departamentos = useMemo(
    () => consultaLista<DepartamentoActivo>(territorio.departamentos),
    [territorio.departamentos]
  )

  return (
    <Controller
      control={control}
      name="municipioCodigo"
      render={({ field, fieldState }) => {
        const valor = field.value || null
        const departamento = valor
          ? departamentoDeMunicipio(valor)
          : departamentoLocal
        const municipios = consultaLista(
          departamento ? (porDepartamento.get(departamento) ?? []) : []
        )
        const departamentoActual = territorio.departamentos.find(
          (d) => d.codigo === departamento
        )
        const municipioActual = municipios.data.find((m) => m.codigo === valor)
        const describe = fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda

        function elegirDepartamento(codigo: string) {
          setMunicipiosAbierto(true)
          if (codigo === departamento) return
          setDepartamentoLocal(codigo)
          if (valor) field.onChange("")
        }

        return (
          <Field
            data-invalid={fieldState.invalid || undefined}
            className="gap-2"
          >
            {/* Botones de 44 px como el resto del formulario. RHF enfoca el
                primer combo cuando falta el municipio. */}
            <div
              ref={(nodo) =>
                field.ref(
                  nodo
                    ? {
                        focus: () =>
                          document
                            .getElementById(departamento ? id : idDepartamento)
                            ?.focus(),
                      }
                    : null
                )
              }
              className="grid gap-3 sm:grid-cols-2 [&_button[role=combobox]]:h-11 [&_button[role=combobox]]:bg-background/60 [&_button[role=combobox]]:text-[0.9375rem] dark:[&_button[role=combobox]]:bg-input/20"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={idDepartamento}>Departamento</Label>
                <ComboTerritorio
                  id={idDepartamento}
                  valor={departamento}
                  etiquetaValor={
                    departamentoActual?.nombreCorto ?? `Departamento ${departamento}`
                  }
                  placeholder="Elige el departamento"
                  placeholderBusqueda="Busca un departamento…"
                  textoVacio="No hay departamentos habilitados."
                  icono={MapPinned}
                  consulta={departamentos}
                  nombres={(d) => [d.nombreCorto, d.nombre]}
                  contenido={(d) => (
                    <span className="truncate">{d.nombreCorto}</span>
                  )}
                  onElegir={(d) => elegirDepartamento(d.codigo)}
                  focoTrasElegir="ninguno"
                  deshabilitado={deshabilitado}
                  invalido={fieldState.invalid && !departamento}
                  describedBy={describe}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={id}>Municipio</Label>
                <ComboTerritorio
                  id={id}
                  valor={valor}
                  etiquetaValor={municipioActual?.nombre ?? `Código ${valor}`}
                  placeholder={
                    departamento
                      ? "Elige el municipio"
                      : "Primero el departamento"
                  }
                  placeholderBusqueda="Busca un municipio…"
                  textoVacio="Este departamento aún no tiene municipios habilitados."
                  icono={MapPin}
                  consulta={municipios}
                  nombres={(m) => [m.nombre]}
                  contenido={(m) => (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">{m.nombre}</span>
                      {m.esCapital ? (
                        <span className="text-xs text-muted-foreground">
                          Capital
                        </span>
                      ) : null}
                    </span>
                  )}
                  onElegir={(m) => {
                    field.onChange(m.codigo)
                    field.onBlur()
                  }}
                  abierto={municipiosAbierto}
                  onAbiertoChange={setMunicipiosAbierto}
                  deshabilitado={deshabilitado || !departamento}
                  invalido={fieldState.invalid}
                  describedBy={describe}
                />
              </div>
            </div>
            <FieldDescription id={idAyuda}>
              Donde está la mayor parte de tu audiencia.
            </FieldDescription>
            <FieldError id={idError} errors={[fieldState.error]} />
          </Field>
        )
      }}
    />
  )
}
