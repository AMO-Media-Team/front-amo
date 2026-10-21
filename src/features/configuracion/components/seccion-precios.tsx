import { datosPrecios, listarParametros } from "../queries"
import { FormatosPlataforma, FranjasSeguidores } from "./franjas-formatos"
import { GruposParametros } from "./grupos-parametros"
import { Tarifario } from "./tarifario"

/** Precios: tarifario versionado, ajustes del cálculo, franjas y formatos. */
export async function SeccionPrecios() {
  const [precios, parametros] = await Promise.all([
    datosPrecios(),
    listarParametros(),
  ])
  return (
    <>
      <Tarifario
        franjas={precios.franjas}
        formatos={precios.formatos}
        tarifas={precios.tarifas}
      />
      <GruposParametros parametros={parametros} seccion="precios" />
      <FranjasSeguidores franjas={precios.franjas} />
      <FormatosPlataforma formatos={precios.formatos} />
    </>
  )
}
