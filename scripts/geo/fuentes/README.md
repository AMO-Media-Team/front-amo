# Fuentes geográficas (snapshots versionados)

Estos archivos son la **entrada** de `pnpm geo:build`. El pipeline no usa la red:
lo que está aquí es lo que se publica. No se sirven al navegador (los derivados
optimizados están en `public/data/geo/`). Consulta de todos los snapshots:
**2026-09-30**.

| Archivo | Contenido | Origen | Licencia |
| --- | --- | --- | --- |
| `internacional.geojson` | Países, Natural Earth Admin 0 – Countries 1:110m (177 unidades, clave `ADM0_A3`) | Entregado por el cliente (antes en `public/data/`); corresponde a <https://www.naturalearthdata.com/downloads/110m-cultural-vectors/> | Dominio público (Natural Earth) |
| `colombia-departamentos.geojson` | 33 departamentos (`DPTO`, `NOMBRE_DPT` sin tildes, `SANTAFE DE BOGOTA D.C`) | Entregado por el cliente; cartografía oficial colombiana (campos del Marco Geoestadístico DANE/IGAC) | Datos abiertos del Estado colombiano; confirmar atribución con el cliente |
| `colombia-municipios.geojson` | 1.122 polígonos municipales (`MPIOS`, `NOMBRE_MPI` con `¥` por `Ñ`, sin tildes) | Entregado por el cliente; misma familia cartográfica (campos `WCOLGEN02_`, `OF_REG`) | Ídem |
| `divipola.json` | DIVIPOLA: 1.122 municipios, áreas no municipalizadas e isla, con tildes, tipo y coordenadas de cabecera (decimal con coma), corte 30-dic-2024 | DANE en datos.gov.co, conjunto `gdxc-w37w`: <https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000> | CC BY-SA 4.0 (DANE) |
| `iso3166-1.json` | ISO 3166-1 completo: 249 códigos alfa-2/alfa-3/numérico con región y subregión UN M49 | <https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json> | CC BY-SA 4.0 |
| `paises-mledoze.json` | Recorte de `mledoze/countries`: nombres oficiales y comunes (inglés y español), variantes (`altSpellings`) y centro aproximado `latlng` (se usa para los países sin polígono) | <https://raw.githubusercontent.com/mledoze/countries/master/countries.json> (se conservan solo `cca2`, `cca3`, `name`, `altSpellings`, `translations.spa`, `latlng`) | ODbL 1.0 |
| `poblacion-departamentos.json` | Población total proyectada **2025** por departamento (33) | DANE, *Proyecciones de población y estudios demográficos (PPED)*: población departamental por área 2018-2050, actualizada el 30-jul-2025, hoja `PobDepartamentalxÁrea`, filas `AÑO = 2025` y `ÁREA GEOGRÁFICA = Total`: <https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Departamental/PPED-AreaDep-2018-2050_VP.xlsx> | Uso libre citando la fuente (DANE) |

Los nombres de países en español no son un archivo: salen de
`Intl.DisplayNames(['es-419', 'es'], { type: 'region' })` (ICU completo de Node 24),
con los ajustes curados de `scripts/geo/datos/paises.ts`.

## Actualizar

```bash
pnpm geo:build --descargar   # re-descarga DIVIPOLA, ISO 3166, mledoze y población DANE
pnpm geo:build               # regenera derivados a partir de los snapshots
```

`--descargar` reescribe los JSON tabulares (un registro por línea, ordenados, para
que el diff muestre exactamente qué cambió). Si el DANE publica una nueva
actualización de proyecciones, cambiar la URL en `scripts/geo/lib/fuentes.ts`.
Los GeoJSON no se descargan: reemplazarlos a mano y revisar los conteos que el
build valida (1.118 polígonos municipales, 33 departamentos, 1.122 municipios).
