# Geodatos

Todo lo geográfico de AMO (mapas, diccionarios, resolución de nombres y códigos,
semilla de la base) sale de un único pipeline determinista:

```bash
pnpm geo:build              # regenera todo desde scripts/geo/fuentes (sin red)
pnpm geo:build --descargar  # antes actualiza los snapshots tabulares
```

Dos ejecuciones seguidas producen archivos idénticos byte a byte. Los archivos
generados llevan la cabecera `Generado por scripts/geo/build-geo.ts — no editar`
y están excluidos de Prettier y ESLint: se cambian editando los datos curados de
`scripts/geo/datos/` o las fuentes, nunca a mano.

## Fuentes

Detalle, URL, fecha de consulta y licencia en
[`scripts/geo/fuentes/README.md`](../scripts/geo/fuentes/README.md). En resumen:

| Nivel         | Geometría                                             | Atributos                                                                    |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Países        | Natural Earth 1:110m (177 unidades → 177 polígonos)   | ISO 3166-1 (249), nombres ICU `es-419`, variantes de mledoze/countries       |
| Departamentos | GeoJSON del cliente (33)                              | DIVIPOLA (DANE), ISO 3166-2:CO, región natural, capital, población DANE 2025 |
| Municipios    | GeoJSON del cliente (1.122 polígonos → 1.118 códigos) | DIVIPOLA (1.122: 1.103 municipios, 18 áreas no municipalizadas, 1 isla)      |

## Salidas

| Archivo                                     | Contenido                                                                                               | Tamaño (gzip)                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `public/data/geo/paises.json`               | 177 polígonos; `{ codigo: ISO2, nombre, adm0_a3 }`                                                      | 132 KB (45 KB)                                         |
| `public/data/geo/departamentos.json`        | 33 polígonos; `{ codigo: DPTO, nombre }`                                                                | 93 KB (28 KB)                                          |
| `public/data/geo/municipios/{DPTO}.json`    | 33 archivos, 1.118 polígonos; `{ codigo, nombre, dpto }`                                                | 1.010 KB en total (252 KB); el mayor, Antioquia, 83 KB |
| `src/lib/geo/diccionarios/paises.ts`        | `PAISES` (250) y `ADM0_A3_A_ISO2`                                                                       | 72 KB                                                  |
| `src/lib/geo/diccionarios/departamentos.ts` | `DEPARTAMENTOS` (33) y `ANIO_POBLACION`                                                                 | 9 KB                                                   |
| `src/lib/geo/diccionarios/municipios.ts`    | `MUNICIPIOS` (1.122, tuplas compactas), `ALIAS_MUNICIPIOS`, `CODIGOS_MUNICIPIO_HISTORICOS`              | 99 KB                                                  |
| `src/lib/geo/svg-departamentos.ts`          | Paths SVG pre-proyectados por departamento, contorno, recuadro de San Andrés y parámetros de proyección | 37 KB                                                  |
| `supabase/seed/geo.sql`                     | `insert … on conflict do update` para `public.paises`, `public.departamentos`, `public.municipios`      | 221 KB                                                 |

Cada feature lleva **solo** esas propiedades. `codigo` es único en cada nivel y es la
clave para Mapbox: `promoteId: 'codigo'` y `feature-state` (Mapbox descarta los `id`
de texto). Los GeoJSON usan precisión 1e-4 (≈ 11 m); países, 1e-3.

## Pipeline

1. **Municipios** (`capas.ts › procesarMunicipios`)
   1. `¥` → `Ñ` solo importa para los alias: el nombre oficial sale siempre de DIVIPOLA.
   2. Códigos históricos (`datos/municipios.ts › CODIGOS_HISTORICOS`):
      `27086 → 27493` (Nuevo Belén de Bajirá), `88000 → 88564` (Santa Catalina se une a
      Providencia), `94663 → 94343` (Mapiripana se une a Barrancominas).
   3. Separación por departamento y, en cada uno, `-dissolve codigo` (une las dos partes
      de Ubalá 25839 y Timbiquí 19809 y los polígonos fusionados del paso 2).
   4. `-simplify interval=<diagonal del departamento / 800> keep-shapes weighting=0.7`,
      `-clean`, precisión 1e-4, envolvente y punto interior de cada polígono.
2. **Departamentos**: archivo del cliente con `snap` de 0,0005° (sus fronteras no
   coinciden vértice a vértice), `-simplify 20% keep-shapes`, `-clean`. El archipiélago
   (88) se sustituye por la unión de sus polígonos municipales: la simplificación
   nacional dejaba Providencia con 7 vértices y borraba Santa Catalina
   (`departamentoDesdeMunicipios`). Nombres oficiales de DIVIPOLA; la envolvente de cada
   departamento es la unión de sus municipios, que es lo que se encuadra al bajar de nivel.
3. **Países**: Natural Earth con `ISO_A2_EH` (Francia, Noruega y Kosovo traen `-99` en
   `ISO_A2`; Taiwán, `CN-TW`), Kosovo como `XK`, Chipre del Norte y Somalilandia
   disueltos en Chipre y Somalia, y la Guayana Francesa (`GF`) y Svalbard (`SJ`)
   separados de Francia y Noruega (`TERRITORIOS_SEPARADOS`): tienen ISO propio y
   `x-vercel-ip-country` los envía así. `-simplify 60% keep-shapes`, precisión 1e-3.
   Los 73 países sin polígono (microestados, islas pequeñas) se dibujan como círculos en
   su `centroide`.
4. **SVG**: departamentos con tolerancia fija de 3 km, proyección Mercator a un lienzo
   de 1000 px de ancho; el archipiélago se dibuja con sus polígonos municipales (más
   detalle) dentro de `RECUADRO_SAN_ANDRES`, en el Caribe al noroeste del Urabá.
5. **Diccionarios y SQL** desde los mismos objetos, con validaciones que detienen el
   build: 1.122 municipios, 33 departamentos, 1.118 polígonos municipales, todo polígono
   con entrada en el diccionario y todo municipio con polígono.

### Decisiones

- **Simplificación por departamento.** Un porcentaje global (como 15 %) dejaba San
  Andrés con 9 vértices y municipios del Quindío con 5, porque Visvalingam elimina
  primero lo pequeño; cada archivo municipal se ve encuadrado en su departamento, así
  que la tolerancia escala con él (≈ 1,4 px en un mapa de ~1100 px de diagonal). Las
  fronteras municipales entre dos departamentos vecinos pueden diferir unos metros
  entre archivos; nunca se muestran juntos.
- **Municipios sin polígono.** La cartografía fuente es anterior a cuatro municipios
  DIVIPOLA. Se dibujan con el polígono del que se segregaron (`codigoGeometria`):
  Norosí 13490 → Río Viejo 13600, Guachené 19300 → Caloto 19142, San José de Uré
  23682 → Montelíbano 23466, Tuchín 23815 → San Andrés de Sotavento 23670. Sus datos
  se agregan a ese polígono con `agregarPorGeometria`; `municipiosRepresentadosPor`
  lista quién comparte polígono (útil para el tooltip).
- **Kosovo (`XK`).** No es ISO 3166-1 oficial, pero Natural Earth lo dibuja y Vercel lo
  envía en `x-vercel-ip-country`; el diccionario tiene 249 códigos ISO + `XK` = 250.
- **Nombres en español.** `Intl.DisplayNames(['es-419','es'])` da la forma
  latinoamericana ("Costa de Marfil", "Arabia Saudita"); `NOMBRE_PREFERIDO` corrige
  rótulos administrativos ("RAE de Hong Kong (China)" → "Hong Kong"). El resultado queda
  congelado en el diccionario generado, así que no depende del ICU de quien lo lea; al
  regenerar con otra versión de Node (otro ICU) conviene revisar el diff de `paises.ts`.
- **Alias.** Se guardan **normalizados**. Los curados (`datos/*.ts`) mandan; los
  automáticos (inglés, oficiales, nombres de Natural Earth y de la cartografía fuente)
  se descartan si nombran a más de un país, coinciden con el nombre de otro o están en
  `ALIAS_EXCLUIDOS` (variantes que en el uso común designan dos territorios: "Islas
  Vírgenes", "Guayana"). En municipios se descarta el alias que coincide con otro
  municipio del mismo departamento.
- **Capital de Cundinamarca** = Bogotá (`11001`), aunque sea otro código de departamento.
- **`centroide`**: países y departamentos usan el punto interior del polígono (cae
  dentro, sirve para etiquetas; el de Bogotá D.C. queda en Sumapaz); los países sin
  polígono usan el centro de mledoze; los municipios usan la **cabecera** DIVIPOLA.
- **Región natural** por departamento según su región predominante (Andina, Caribe,
  Pacífica, Orinoquía, Amazonía, Insular).

### Limitaciones conocidas

- 86 cabeceras DIVIPOLA caen fuera de la envolvente de su polígono; 82 a menos de
  0,045° (≈ 5 km: cabeceras sobre el río o el límite) y 4 más lejos (Arenal 13042 a
  0,17°, El Retorno 95025, Samaná 17662, Suárez 19780): los límites de la cartografía
  fuente son anteriores a ajustes posteriores. El test tolera 0,2°.
- La cartografía municipal no trae la geometría de Norosí, Guachené, San José de Uré ni
  Tuchín (ver arriba). Reemplazar los GeoJSON por el Marco Geoestadístico vigente del
  DANE lo resolvería; el pipeline ya valida conteos y cobertura.

## Uso

```ts
import {
  resolverPais,
  resolverDepartamento,
  resolverMunicipio,
  buscarMunicipiosPorNombre,
  agregarPorGeometria,
} from "@/lib/geo/resolver"
import { obtenerMunicipio, municipiosDeDepartamento } from "@/lib/geo/catalogo"

resolverPais("EE. UU.")?.iso2 // "US" (también "USA", "840", "Estados Unidos")
resolverPais("KOS")?.iso2 // "XK" (ADM0_A3 de Natural Earth)
resolverDepartamento("SANTAFE DE BOGOTA D.C")?.codigo // "11"
resolverDepartamento("ANT")?.codigo // "05" (sufijo de x-vercel-ip-country-region)
resolverMunicipio(5001)?.nombre // "Medellín" (el cero inicial que quita Excel)
resolverMunicipio("27086")?.codigo // "27493" (código histórico)
resolverMunicipio({ departamento: "Antioquia", nombre: "El Peñol" })?.codigo // "05541"
resolverMunicipio("San Andrés") // null: ambiguo (88001 y 68669)
buscarMunicipiosPorNombre("San Andrés") // todos los candidatos, para que el usuario elija

obtenerMunicipio("13490")?.codigoGeometria // "13600" (Norosí se dibuja con Río Viejo)
municipiosDeDepartamento("88").length // 2
```

Reglas de los resolvers: primero códigos (ISO2, ISO3, numérico, ADM0_A3; DANE de 1-2
dígitos o ISO 3166-2 `CO-XXX`/`XXX`; DIVIPOLA de 4-5 dígitos), luego nombres por niveles
—nombre oficial, alias, sin artículo inicial ("Guajira")—. Gana el primer nivel con
coincidencias y, si en ese nivel hay más de una, se devuelve `null`: nunca se adivina.
`normalizarNombreGeo` (`@/lib/geo/normalizar`) es la misma función con la que se
generan `nombreNormalizado` y `alias`, también en la base (`nombre_normalizado`).

### Coropletas

```ts
const { valores, sinResolver } = agregarPorGeometria(conteosPorMunicipio) // suma
const tasas = agregarPorGeometria(tasaPorMunicipio, {
  modo: "promedio",
  pesos: poblacion,
})
const escala = crearEscalaCuantiles(Object.values(valores), { tema: "oscuro" }) // @/lib/geo/escalas
escala.colorPara(valores["13600"]) // HEX; `null`/`undefined` → escala.colorSinDatos
```

`crearEscalaCuantiles` usa 5 clases por cuantiles; con pocos valores distintos o
muchos empates (ceros) crea menos clases, nunca vacías. El cero es un dato (primer
color); "sin datos" tiene color neutro propio (`COLOR_SIN_DATOS`) y en el mapa va
además rayado. Las rampas (`PALETAS_SECUENCIALES`) son de una tonalidad Lila AMO, en
HEX (Chart.js y Mapbox no leen `oklch()`), con luminosidad monótona: en oscuro el
valor alto es el más claro; en claro, el más oscuro.

### Mini-mapas SVG (sin Mapbox)

```tsx
import {
  PATHS_DEPARTAMENTOS,
  RECUADRO_SAN_ANDRES as recuadro,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"
import { proyectarEnMapaColombia } from "@/lib/geo/mapa-svg"

function MiniMapa({ escala, valores, puntos }: MiniMapaProps) {
  return (
    <svg viewBox={VIEWBOX_COLOMBIA} role="img" aria-label="Mapa de Colombia">
      {Object.entries(PATHS_DEPARTAMENTOS).map(([codigo, d]) => (
        <path
          key={codigo}
          d={d}
          fillRule="evenodd"
          fill={escala.colorPara(valores[codigo])}
        />
      ))}
      <rect
        x={recuadro.x}
        y={recuadro.y}
        width={recuadro.ancho}
        height={recuadro.alto}
        fill="none"
      />
      {/* Puntos en el mismo lienzo; los del archipiélago caen en su recuadro. */}
      {puntos.map((posicion, i) => {
        const [x, y] = proyectarEnMapaColombia(posicion)
        return <circle key={i} cx={x} cy={y} r={4} />
      })}
    </svg>
  )
}
```

`CONTORNO_COLOMBIA` es la silueta continental (unión de departamentos) y
`CENTROS_DEPARTAMENTOS` el punto interior proyectado de cada uno.

## Base de datos

`supabase/seed/geo.sql` inserta en este orden y es idempotente:

```sql
public.paises(iso2 char(2) pk, iso3 char(3), numerico char(3), nombre text,
  nombre_normalizado text, alias text[], continente text, subregion text,
  con_geometria boolean, lon numeric(9,6), lat numeric(9,6))
public.departamentos(codigo char(2) pk, nombre text, nombre_corto text,
  nombre_normalizado text, alias text[], iso_3166_2 text, region text,
  capital_codigo char(5), poblacion integer, lon numeric(9,6), lat numeric(9,6),
  bbox numeric[])
public.municipios(codigo char(5) pk, departamento_codigo char(2), nombre text,
  nombre_normalizado text, tipo text, es_capital boolean, lon numeric(9,6),
  lat numeric(9,6), codigo_geometria char(5), bbox numeric[])
```

**Diferencias con el contrato de `docs/modelo-datos.md` que la migración `geo` debe
recoger** (si no, la semilla falla):

- `paises` tiene **250 filas** (249 ISO + `XK`) y `paises.numerico` es `null` para Kosovo,
  que no tiene código numérico ISO: la columna debe ser `char(3) null unique` (el
  `unique` admite varios `null`), no `not null`. Quitar `XK` rompería la FK de los
  accesos que Vercel etiqueta como `XK`.
- `paises.subregion` es `null` para la Antártida (UN M49 no le asigna subregión).

Además (ya previsto en el contrato):

- `departamentos.capital_codigo` referencia un municipio que se inserta después, y
  `municipios.codigo_geometria` de Norosí (13490) apunta a Río Viejo (13600), que va
  después: ambas FK deben ser `deferrable initially deferred` (el seed ejecuta
  `set constraints all deferred` dentro de su transacción).
- `supabase/config.toml` carga hoy `./seed.sql` en `db reset`; para usar esta semilla
  en local hay que añadir `./seed/geo.sql` a `[db.seed] sql_paths`.
- `bbox` es `[oeste, sur, este, norte]`; `alias` ya viene normalizado, así que una
  búsqueda en SQL compara `nombre_normalizado = $1 or $1 = any(alias)` con el texto
  normalizado igual que `normalizarNombreGeo`.
