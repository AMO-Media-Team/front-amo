import { datosCatalogos } from "../queries"
import { CatalogoLista } from "./catalogo-lista"
import { Territorio } from "./territorio"

/** Catálogos: sectores de anunciantes, categorías de medios y territorio habilitado. */
export async function SeccionCatalogos() {
  const catalogos = await datosCatalogos()
  return (
    <>
      {/* Dos columnas solo si el área de contenido las admite (48rem). */}
      <div className="@container">
        <div className="grid gap-6 @3xl:grid-cols-2">
          <CatalogoLista catalogo="sectores" elementos={catalogos.sectores} />
          <CatalogoLista
            catalogo="categorias"
            elementos={catalogos.categorias}
          />
        </div>
      </div>
      <Territorio departamentos={catalogos.departamentos} />
    </>
  )
}
