import { listarPaises } from "@/lib/geo/catalogo"

import { CLAVE_PAISES_HABITUALES } from "../parametros"
import { listarParametros } from "../queries"
import type { Parametro } from "../tipos"
import type { ContextoParametros } from "./fila-parametro"
import { GruposParametros } from "./grupos-parametros"
import { RangoMultiplicador } from "./rango-multiplicador"

function numeroDe(
  parametros: readonly Parametro[],
  clave: string
): number | null {
  const valor = parametros.find((p) => p.clave === clave)?.valor
  return typeof valor === "number" ? valor : null
}

/** Países para «Países habituales»: nombre en español y el ISO2 para buscar. */
function contextoPaises(): ContextoParametros {
  const paises = [...listarPaises()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es-CO")
  )
  return {
    opcionesLista: paises.map((p) => ({
      valor: p.iso2,
      etiqueta: p.nombre,
      detalle: p.iso3,
    })),
  }
}

/** Secciones hechas solo de parámetros: métricas, calidad y seguridad. */
export async function SeccionParametros({
  seccion,
}: {
  seccion: "metricas" | "calidad" | "seguridad"
}) {
  const parametros = await listarParametros()

  if (seccion === "calidad") {
    const piso = numeroDe(parametros, "calidad.multiplicador_piso")
    const techo = numeroDe(parametros, "calidad.multiplicador_techo")
    return (
      <GruposParametros
        parametros={parametros}
        seccion="calidad"
        pie={{
          multiplicador:
            piso !== null && techo !== null ? (
              <RangoMultiplicador piso={piso} techo={techo} />
            ) : null,
        }}
      />
    )
  }

  return (
    <GruposParametros
      parametros={parametros}
      seccion={seccion}
      contextos={
        seccion === "seguridad"
          ? { [CLAVE_PAISES_HABITUALES]: contextoPaises() }
          : undefined
      }
    />
  )
}
