# AMO — Diccionario de KPIs e insights

> Fuente: PDF del cliente v1.1 §7.3.1 (tablero), §7.2.6 y §9 (métricas derivadas), §11 (integridad). Modelo: `docs/modelo-datos.md`.
> Implementación: RPC de analítica (`modelo-datos.md` §5.9), `security invoker` (salvo las del medio, definer con filtro por su medio), `stable`, `set timezone = 'America/Bogota'`. El motor de insights vive en `src/features/dashboard/insights/` (funciones puras con tests).
> Cada KPI declara: **definición de negocio**, **fórmula SQL**, **fecha ancla** (la columna que decide a qué periodo pertenece un hecho), **estados incluidos**, **n mínimo** e **interpretación / insight**.

## 0. Convenciones de cálculo

### 0.1 Periodo
- Parámetros `p_desde date, p_hasta date` inclusivos, en hora de Bogotá, y en toda RPC que devuelva `kpi_fila` el periodo de comparación explícito `p_desde_ant date default null, p_hasta_ant date default null`. Dentro de la función:
  ```sql
  v_ini timestamptz := p_desde::timestamptz;          -- 00:00 Bogotá (la función fija timezone)
  v_fin timestamptz := (p_hasta + 1)::timestamptz;    -- exclusivo
  v_dias int        := p_hasta - p_desde + 1;
  -- periodo de comparación: el que envía la UI; si no viene, mismo largo inmediatamente antes
  v_ini_ant timestamptz := coalesce(p_desde_ant, p_desde - v_dias)::timestamptz;
  v_fin_ant timestamptz := coalesce(p_hasta_ant + 1, p_desde)::timestamptz;
  ```
  (`p_desde_ant` y `p_hasta_ant` van juntos: si solo llega uno ⇒ `AMO_CONFIG_INVALIDA`.)
- **Comparativo «mes contra mes»** (§7.3.1): la UI ofrece presets (este mes vs. mes anterior completo, últimos 30 días vs. 30 anteriores, trimestre, año) y **calcula ella los rangos alineados a meses calendario** que envía en `p_desde_ant/p_hasta_ant`. Para «este mes» incompleto se compara contra **los mismos días** del mes anterior (1..min(hoy, último día del mes anterior)), no contra el mes completo; octubre completo se compara con septiembre completo (31 vs. 30 días), no con los 31 días inmediatamente anteriores.
- `variacion = (valor − valor_anterior) / nullif(valor_anterior, 0)`; si `valor_anterior` es 0 o null, `variacion = null` y la UI muestra «nuevo» o «—». Para KPI en % se muestra además la diferencia en **puntos porcentuales**.

### 0.2 Conjuntos de estados (asignaciones)
| Nombre | Estados |
|---|---|
| `CON_CUPO` | ACEPTADA, CONTENIDO_ENTREGADO, PUBLICADA, EVIDENCIA_VALIDADA, METRICAS_CARGADAS, VERIFICADA, LIQUIDADA, PAGADA, EN_DISPUTA — **salvo** EN_DISPUTA con `estado_previo_disputa = 'VENCIDA_SIN_PUBLICAR'` (reclamo de una vencida: no consume cupo). En SQL siempre `private.consume_cupo(a.estado, a.estado_previo_disputa)` (modelo §3.6) |
| `VIGENTES` | `CON_CUPO` (= comprometidas que siguen en pie) |
| `CUMPLIDAS` | VERIFICADA, LIQUIDADA, PAGADA |
| `CAIDAS` | VENCIDA_SIN_PUBLICAR, CANCELADA, RECHAZADA (después de aceptar) |
| `PENDIENTE_RESULTADO` | resultado de publicación aún desconocido: `estado = 'PUBLICADA'` (evidencia sin validar) o EN_DISPUTA con previo `PUBLICADA` o `VENCIDA_SIN_PUBLICAR` |

**Montos:** `asignaciones.monto_bruto` (GMV) está en `asignaciones`; comisión, valor para el medio, retenciones y neto están en la tabla 1:1 `asignacion_montos` (modelo §3.6), que solo leen internos (`asignaciones.ver`/`liquidaciones.ver`) y las RPC definer del medio. Toda fórmula que use `monto_comision`, `monto_medio` o `monto_neto` hace `join public.asignacion_montos am on am.asignacion_id = a.id`.

### 0.3 Último corte validado por publicación
Base de todas las métricas de desempeño (alcance, impresiones, interacciones, reproducciones, clics). Se toma **el corte más tardío con `estado_validacion = 'APROBADA'`** de cada publicación (D7 > H72 > H24; `PERSONALIZADO` no cuenta), y se suma por asignación. Por rendimiento (p95 < 300 ms), el CTE **parte de las asignaciones ya filtradas** por el ancla del KPI (`verificada_at` en el periodo y estado), nunca recorre todas las métricas:
```sql
with base as (   -- asignaciones del periodo (filtro del KPI; la RLS limita al anunciante cuando aplica)
  select a.id from public.asignaciones a
  where a.verificada_at >= v_ini and a.verificada_at < v_fin and a.estado in ('VERIFICADA','LIQUIDADA','PAGADA')
),
ultimo_corte as (
  select distinct on (m.publicacion_id)
         m.publicacion_id, m.asignacion_id, m.plataforma,
         m.alcance_norm, m.impresiones_norm, m.interacciones, m.clics_enlace, m.reproducciones, m.corte
  from base b
  join public.metricas m on m.asignacion_id = b.id          -- usa metricas (asignacion_id, corte) include (...) where APROBADA
  where m.estado_validacion = 'APROBADA' and m.corte <> 'PERSONALIZADO'
  order by m.publicacion_id, case m.corte when 'D7' then 3 when 'H72' then 2 else 1 end desc
),
desempeno as (   -- una fila por asignación
  select uc.asignacion_id,
         sum(uc.alcance_norm)     as alcance,
         sum(uc.impresiones_norm) as impresiones,
         sum(uc.interacciones)    as interacciones,
         sum(uc.clics_enlace)     as clics,
         sum(uc.reproducciones)   as reproducciones
  from ultimo_corte uc group by uc.asignacion_id
)
```
`alcance_norm = coalesce(alcance, espectadores_unicos)` (TikTok no reporta alcance), `impresiones_norm = coalesce(impresiones, reproducciones)`, `interacciones = me_gusta + comentarios + compartidos + guardados` (nulos como 0). **El alcance sumado entre publicaciones no deduplica personas**: se rotula «alcance acumulado».

### 0.4 Reglas de agregación
- **Razones = cociente de sumas, nunca promedio de razones** (CPM = Σ bruto / Σ impresiones × 1.000, no el promedio de CPMs).
- **n**: toda tasa/razón devuelve `n` (tamaño del denominador en unidades de negocio). El **mínimo** depende del uso:
  - **Agregados, comparativos, rankings e insights** (tablero admin, `mezcla_plataformas`, `top_zonas`, `geo_metricas`, desgloses por departamento/plataforma, motor de insights): si `n < analitica.n_minimo_tasas` (20) la RPC devuelve `valor = null` y la UI muestra «Muestra insuficiente (n = 7)». Es una protección estadística: comparar tasas de grupos pequeños produce conclusiones falsas.
  - **Razones de una entidad concreta** (una campaña, el tablero del propio anunciante, las filas por campaña o por medio de un reporte): devuelven **siempre** `valor` y `n` —son cifras contables exactas que el PDF pide mostrar (§7.2.6)— y la UI añade la nota «n = 7» cuando `n < analitica.n_minimo_tasas`. Si esas filas se **ordenan** o se comparan entre sí (ranking), el ranking solo incluye filas con `n ≥ analitica.n_minimo_tasas`.
  - **Reputación de un medio** (`medios.tasa_cumplimiento`, §7.1.8 y §10.4): mínimo propio `medios.n_minimo_cumplimiento` (3); con menos, «sin historial suficiente».
  - Los conteos y sumas no tienen n mínimo.
- Dinero en COP sin decimales en la UI (`Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`); los cálculos usan `numeric` completo.
- Filas de demo: se incluyen siempre (el entorno demo es el producto a mostrar); en producción no existen.
- Sparkline (`serie`): un punto por día si el periodo ≤ 31 días, por semana ISO si > 31 días, calculado con la misma fórmula y ancla.
- Alcance territorial: la ubicación de una asignación es el **municipio del medio** (`medios.municipio_codigo`); la del anunciante, su `pais_iso2`/`municipio_codigo`.

---

## 1. KPIs del tablero administrativo (`kpis_admin`)

### 1.1 GMV comprometido — `gmv_comprometido`
- **Definición:** valor bruto (lo que paga el anunciante) de los negocios aceptados por medios en el periodo que **siguen en pie**. Mide la demanda cerrada, antes de ejecutarse.
- **Fórmula:**
  ```sql
  select coalesce(sum(a.monto_bruto), 0), count(*)
  from public.asignaciones a
  where a.aceptada_at >= v_ini and a.aceptada_at < v_fin
    and private.consume_cupo(a.estado, a.estado_previo_disputa);   -- CON_CUPO (§0.2)
  ```
- **Fecha ancla:** `asignaciones.aceptada_at`. **Estados:** `CON_CUPO`. **n mínimo:** no aplica.
- **Interpretación:** se recalcula retroactivamente si una asignación del periodo se cae (vencida/cancelada), por eso la UI lo rotula «comprometido vigente». La diferencia `GMV comprometido − GMV verificado` de meses cerrados es la **fuga de ejecución**. Insight: variación significativa (§5, regla 1).

### 1.2 GMV verificado — `gmv_verificado` (el «GMV del periodo» de §7.3.1)
- **Definición:** valor bruto de las asignaciones cuyas métricas fueron validadas por el administrador en el periodo, es decir, negocios **cumplidos y pagables** (§6.2 regla dura).
- **Fórmula:**
  ```sql
  select coalesce(sum(a.monto_bruto), 0), count(*)
  from public.asignaciones a
  where a.verificada_at >= v_ini and a.verificada_at < v_fin
    and a.estado in ('VERIFICADA','LIQUIDADA','PAGADA');
  ```
- **Fecha ancla:** `verificada_at` (primera verificación: modo `PRIMERA`, modelo §4.1; ni la anulación de una liquidación ni la resolución de una disputa la mueven, así el GMV de un periodo cerrado no cambia de mes). **Estados:** `CUMPLIDAS` (una asignación verificada que luego entra EN_DISPUTA sale del GMV hasta que se resuelva). **n mínimo:** no aplica.
- **Interpretación:** es el GMV oficial (base de comisión, liquidación y facturación). Insight: variación significativa con causa principal por departamento y plataforma.

### 1.3 Comisión generada — `comision`
- **Definición:** ingreso de la plataforma sobre el GMV verificado, con el porcentaje **congelado** al aceptar.
- **Fórmula:** `sum(am.monto_comision)` con el mismo filtro que 1.2 y `join public.asignacion_montos am on am.asignacion_id = a.id`.
- **Fecha ancla:** `verificada_at`. **Estados:** `CUMPLIDAS`. **n mínimo:** no aplica.
- **Interpretación:** crece con el GMV; si crece menos que el GMV, aumentó el peso de excepciones de comisión.

### 1.4 Take rate — `take_rate`
- **Definición:** comisión / GMV verificado.
- **Fórmula:** `sum(am.monto_comision) / nullif(sum(a.monto_bruto), 0)` sobre el filtro de 1.2 (con el join a `asignacion_montos`); `n = count(*)`.
- **Fecha ancla:** `verificada_at`. **Estados:** `CUMPLIDAS`. **n mínimo:** `analitica.n_minimo_tasas` asignaciones.
- **Interpretación:** debe rondar `comision.porcentaje_global`; una caída > 2 pp indica concentración en anunciantes/campañas con excepción. Se muestra en %.

### 1.5 Negocios cerrados — `negocios_cerrados`
- **Definición:** número de asignaciones verificadas (§7.3.1).
- **Fórmula:** `count(*)` con el filtro de 1.2.
- **Fecha ancla:** `verificada_at`. **Estados:** `CUMPLIDAS`. **n mínimo:** no aplica.
- **Interpretación:** junto con el ticket promedio separa crecimiento por volumen vs. por precio.

### 1.6 Ofertas publicadas — `ofertas_publicadas`
- **Definición:** ofertas aprobadas por moderación y publicadas al marketplace en el periodo.
- **Fórmula:**
  ```sql
  select count(*) from public.ofertas o
  where o.publicada_at >= v_ini and o.publicada_at < v_fin and o.deleted_at is null;
  ```
- **Fecha ancla:** `ofertas.publicada_at` (primera publicación, modo `PRIMERA`: la vuelta `CUPOS_COMPLETOS → PUBLICADA` no la mueve, así una oferta no cuenta dos veces). **Estados:** cualquiera actual (una oferta publicada y luego cancelada cuenta: sí se publicó). **n mínimo:** no aplica.
- **Interpretación:** oferta de demanda; comparar con medios activos para ver el balance del marketplace.

### 1.7 Tasa de llenado — `tasa_llenado`
- **Definición:** proporción de cupos ofrecidos que fueron tomados, en ofertas cuya **fecha límite de aceptación** cayó en el periodo (ventana de aceptación ya cerrada).
- **Fórmula:**
  ```sql
  with ofertas_cerradas as (
    select o.id, o.cupos_totales
    from public.ofertas o
    where o.fecha_limite_aceptacion >= v_ini and o.fecha_limite_aceptacion < v_fin
      and o.fecha_limite_aceptacion <= private.ahora()
      and o.publicada_at is not null and o.deleted_at is null
      and o.estado <> 'CANCELADA'
  ), tomados as (
    select oc.id, oc.cupos_totales,
           least(count(a.id) filter (where a.aceptada_at is not null and a.aceptada_at <= o.fecha_limite_aceptacion), oc.cupos_totales) as tomados
    from ofertas_cerradas oc
    join public.ofertas o on o.id = oc.id
    left join public.asignaciones a on a.oferta_id = oc.id
    group by oc.id, oc.cupos_totales
  )
  select sum(tomados)::numeric / nullif(sum(cupos_totales), 0), count(*) from tomados;
  ```
  (Se cuentan aceptaciones aunque luego se cayeran —el cupo sí se llenó—, topadas en `cupos_totales` por oferta porque un cupo liberado puede re-tomarse.)
- **Fecha ancla:** `ofertas.fecha_limite_aceptacion`. **Estados:** ofertas publicadas no canceladas. **n mínimo:** `n_minimo_tasas` **ofertas** (n = número de ofertas).
- **Interpretación:** < 60 % sugiere precio poco atractivo para la franja o segmentación muy estrecha; desglosar por franja y plataforma.

### 1.8 Tiempo medio de llenado — `tiempo_medio_llenado_h`
- **Definición:** horas desde la publicación de la oferta hasta la **primera vez que todos sus cupos estuvieron ocupados a la vez** (`ofertas.llena_at`, lo fija `reservar_cupo` en cualquier estado), para ofertas que se llenaron en el periodo. (El k-ésimo `aceptada_at` no sirve: cuenta desistimientos y cupos re-tomados, y `cupos_completos_at` solo existe si se llenó antes de `ventana_inicio`.)
- **Fórmula:**
  ```sql
  select avg(h), count(*), percentile_cont(0.5) within group (order by h)
  from (
    select extract(epoch from (o.llena_at - o.publicada_at)) / 3600.0 as h
    from public.ofertas o
    where o.llena_at >= v_ini and o.llena_at < v_fin and o.publicada_at is not null and o.deleted_at is null
  ) llenado;
  ```
- **Fecha ancla:** `ofertas.llena_at`. **Estados:** cualquier estado actual de oferta. **n mínimo:** `n_minimo_tasas` ofertas llenas (agregado global; en el tablero del anunciante, valor y n).
- **Interpretación:** el PDF pide el promedio; la UI muestra la **mediana** como dato secundario (un par de ofertas lentas distorsionan el promedio). Tiempos muy cortos en franja F3 = riesgo de que las cuentas grandes agoten la oferta (justifica cupos por franja).

### 1.9 Tasa de aceptación — `tasa_aceptacion`
- **Definición:** de los pares (oferta, medio) en que el medio **vio** la oferta en el periodo, cuántos terminaron en aceptación (§7.3.1 «ofertas vistas vs. aceptadas»).
- **Fórmula:**
  ```sql
  select count(*) filter (where exists (
           select 1 from public.asignaciones a
           where a.oferta_id = v.oferta_id and a.medio_id = v.medio_id and a.aceptada_at is not null))::numeric
         / nullif(count(*), 0),
         count(*)
  from public.oferta_vistas v
  where v.primera_vista_at >= v_ini and v.primera_vista_at < v_fin;
  ```
- **Fecha ancla:** `oferta_vistas.primera_vista_at`. **Estados:** cualquier aceptación (incluye las que luego se cayeron; RECHAZADA desde marketplace **no** es aceptación). **n mínimo:** `n_minimo_tasas` vistas.
- **Interpretación:** baja aceptación con alta vista = precio/condiciones poco atractivos; comparar por franja y plataforma. Complemento: **tasa de rechazo explícito** = RECHAZADA sin aceptación / vistas.

### 1.10 Tasa de cumplimiento — `tasa_cumplimiento`
- **Definición:** de las asignaciones aceptadas cuyo plazo de publicación venció en el periodo, cuántas se publicaron efectivamente a tiempo (§7.3.1 «aceptadas vs. publicadas efectivamente»; §10.4 «el incumplimiento afecta la tasa de cumplimiento»). «Efectivamente» = evidencia **validada** por el admin.
- **Fórmula:**
  ```sql
  select count(*) filter (
           where a.evidencia_validada_at is not null
             and a.publicada_at is not null and a.publicada_at <= a.fecha_limite_publicacion
             and a.estado <> 'VENCIDA_SIN_PUBLICAR'
             and a.causa_cancelacion is distinct from 'INCUMPLIMIENTO_MEDIO'
             and a.causa_cancelacion is distinct from 'FRAUDE')::numeric
         / nullif(count(*), 0),
         count(*)
  from public.asignaciones a
  where a.fecha_limite_publicacion >= v_ini and a.fecha_limite_publicacion < v_fin
    and a.fecha_limite_publicacion <= private.ahora()
    and a.aceptada_at is not null
    and a.estado <> 'RECHAZADA'                                                   -- desistimiento antes de descargar (liberó el cupo a tiempo)
    and not (a.estado = 'CANCELADA' and a.causa_cancelacion in ('ADMINISTRATIVA','ACUERDO'))   -- cancelación no imputable al medio
    and not (a.estado = 'PUBLICADA'                                              -- resultado aún desconocido (PENDIENTE_RESULTADO, §0.2)
             or (a.estado = 'EN_DISPUTA' and a.estado_previo_disputa in ('PUBLICADA','VENCIDA_SIN_PUBLICAR')));
  ```
  Casos: evidencia rechazada que luego vence ⇒ `publicada_at` se limpió al rechazarla (modelo §4.1, modo `LIMPIAR`) y el estado es VENCIDA_SIN_PUBLICAR ⇒ **incumplida**; cancelada por reporte falso (§11) o por incumplimiento ⇒ en el denominador y **incumplida**; cancelada por causa administrativa o por acuerdo ⇒ fuera; evidencia pendiente de validar o en disputa sobre la publicación ⇒ fuera hasta que se resuelva; una vencida reabierta por disputa que termina validada ⇒ cumplida (la `fecha_publicacion` declarada debe estar en la ventana original; como la reapertura extiende `fecha_limite_publicacion`, la asignación pasa a contar en el periodo de la nueva fecha).
- **Fecha ancla:** `fecha_limite_publicacion`. **Estados:** denominador = aceptadas con resultado conocido, salvo desistidas y canceladas no imputables; numerador = evidencia validada y publicada a tiempo. **n mínimo:** `n_minimo_tasas` asignaciones en el tablero admin y los desgloses; `medios.n_minimo_cumplimiento` para la reputación de un medio (§0.4).
- **Interpretación:** meta ≥ 90 %. Caída con aumento de `VENCIDA_SIN_PUBLICAR` ⇒ insight regla 2 (con departamento/medios que concentran las vencidas). La misma fórmula en ventana móvil de 180 días alimenta `medios.tasa_cumplimiento` (modelo §5.8).

### 1.11 Alcance total — `alcance_total`
- **Definición:** personas alcanzadas acumuladas (sin deduplicar entre publicaciones) por los negocios verificados en el periodo, según el último corte validado.
- **Fórmula:**
  ```sql
  select coalesce(sum(d.alcance), 0), count(*)
  from public.asignaciones a join desempeno d on d.asignacion_id = a.id
  where a.verificada_at >= v_ini and a.verificada_at < v_fin and a.estado in ('VERIFICADA','LIQUIDADA','PAGADA');
  ```
- **Fecha ancla:** `verificada_at`. **Estados:** `CUMPLIDAS`. **n mínimo:** no aplica.
- **Interpretación:** «alcance total entregado» (§7.3.1). Se muestra con la nota «acumulado, sin deduplicar». Por plataforma, TikTok usa espectadores únicos.

### 1.12 Medios activos — `medios_activos`
- **Definición:** medios **verificados** (estado actual `VERIFICADO`) con al menos una aceptación o una publicación en el periodo.
- **Fórmula:**
  ```sql
  select count(distinct a.medio_id)
  from public.asignaciones a join public.medios m on m.id = a.medio_id
  where m.estado = 'VERIFICADO' and m.deleted_at is null
    and ((a.aceptada_at >= v_ini and a.aceptada_at < v_fin) or (a.publicada_at >= v_ini and a.publicada_at < v_fin));
  ```
- **Fecha ancla:** `aceptada_at` o `publicada_at`. **Estados:** asignación cualquiera; medio `VERIFICADO` (foto actual: un medio suspendido hoy deja de contar también en periodos pasados, igual que en el denominador de la tasa de activación). **n mínimo:** no aplica.
- **Interpretación:** oferta viva del marketplace; comparar con medios verificados totales = **tasa de activación**.

### 1.13 Medios nuevos — `medios_nuevos`
- **Definición:** medios verificados por primera vez en el periodo.
- **Fórmula:** `select count(*) from public.medios m where m.verificado_at >= v_ini and m.verificado_at < v_fin and m.deleted_at is null;`
- **Fecha ancla:** `medios.verificado_at` (primera verificación; modo `PRIMERA` en el modelo §4.1: ni los cambios de nivel ni la reactivación tras una suspensión la mueven). **n mínimo:** no aplica.
- **Interpretación:** crecimiento de inventario; cruzar con departamentos sin medios (cobertura territorial).

### 1.14 Medios en riesgo (churn) — `medios_en_riesgo`
- **Definición:** medios verificados que estuvieron activos en los últimos `medios.dias_actividad` (90) días pero **no aceptan** nada desde hace `medios.dias_riesgo_sin_aceptar` (30) días, medidos al cierre del periodo (`v_fin`).
- **Fórmula:**
  ```sql
  with ref as (select v_fin as t,
                      make_interval(days => private.config_entero('medios.dias_actividad')) as d_act,
                      make_interval(days => private.config_entero('medios.dias_riesgo_sin_aceptar')) as d_riesgo)
  select count(*), coalesce(sum(x.gmv_90d), 0)                                  -- gmv_en_juego
  from (
    select a.medio_id, sum(a.monto_bruto) filter (where a.estado in ('VERIFICADA','LIQUIDADA','PAGADA')) as gmv_90d,
           max(a.aceptada_at) as ultima_aceptacion
    from public.asignaciones a
    join public.medios m on m.id = a.medio_id
    cross join ref
    where m.estado = 'VERIFICADO' and m.deleted_at is null
      and a.aceptada_at >= ref.t - ref.d_act and a.aceptada_at < ref.t
    group by a.medio_id
  ) x
  cross join ref
  where x.ultima_aceptacion < ref.t - ref.d_riesgo;
  ```
- **Fecha ancla:** `v_fin` (foto al cierre). **Estados:** medio VERIFICADO. **n mínimo:** no aplica.
- **Interpretación:** «GMV en juego» = lo que esos medios generaron en 90 días. Insight regla 3. Complementos en `salud_medios`: `activos` (1.12), `nuevos` (1.13), `inactivos` (verificados sin aceptación en 90 días), `suspendidos`.

### 1.15 Anunciantes activos — `anunciantes_activos`
- **Definición:** anunciantes con al menos una asignación aceptada en el periodo (compraron pauta).
- **Fórmula:** `select count(distinct a.anunciante_id) from public.asignaciones a where a.aceptada_at >= v_ini and a.aceptada_at < v_fin and private.consume_cupo(a.estado, a.estado_previo_disputa);`
- **Fecha ancla:** `aceptada_at`. **Estados:** `CON_CUPO`. **n mínimo:** no aplica.
- **Interpretación:** demanda; su mapa por país alimenta «Anunciantes por país».

### 1.16 Ticket promedio — `ticket_promedio`
- **Definición:** GMV comprometido promedio por anunciante activo en el periodo.
- **Fórmula:** `gmv_comprometido / nullif(anunciantes_activos, 0)`; `n = anunciantes_activos`.
- **Fecha ancla:** `aceptada_at`. **Estados:** `CON_CUPO`. **n mínimo:** 5 anunciantes (fijo; con menos, la UI muestra el valor con advertencia).
- **Interpretación:** sube por campañas más grandes o por mezcla hacia franjas altas. Métrica auxiliar en reportes: **precio medio por asignación** = `gmv_comprometido / count(asignaciones)`.

---

## 2. Métricas derivadas de desempeño (§9 y §7.2.6)
Todas usan el CTE `desempeno` (§0.3) unido a asignaciones `CUMPLIDAS` con **ancla `verificada_at`** (solo negocios con métricas validadas). Se calculan a nivel plataforma, campaña, anunciante, medio, municipio/departamento, fecha y total, siempre como cociente de sumas. **n mínimo según §0.4:** en agregados globales, comparativos y rankings, `n_minimo_tasas`; para una campaña o para el propio anunciante, valor y n siempre. Filtro base:
```sql
from public.asignaciones a
join desempeno d on d.asignacion_id = a.id
where a.verificada_at >= v_ini and a.verificada_at < v_fin
  and a.estado in ('VERIFICADA','LIQUIDADA','PAGADA')
```

| KPI (clave) | Definición | Fórmula SQL | n (denominador) | Interpretación / insight |
|---|---|---|---|---|
| CPM efectivo (`cpm_efectivo`) | Costo por mil impresiones (§9) | `sum(a.monto_bruto) / nullif(sum(d.impresiones), 0) * 1000` | asignaciones con `impresiones > 0` (mínimo según §0.4) | Menor = más eficiente. TikTok usa reproducciones (`impresiones_norm`), por eso se compara **dentro** de cada plataforma o se rotula. Insight regla 4 |
| Costo por interacción (`costo_por_interaccion`) | Bruto / (me gusta + comentarios + compartidos + guardados) (§9) | `sum(a.monto_bruto) / nullif(sum(d.interacciones), 0)` | ídem con `interacciones > 0` | Útil para objetivos de conversación; sensible a formatos de historia (pocas interacciones) |
| Tasa de engagement (`engagement`) | Interacciones / alcance (§9) | `sum(d.interacciones)::numeric / nullif(sum(d.alcance), 0)` | ídem con `alcance > 0` | Calidad de audiencia. Valores > 25 % en una publicación son atípicos (revisar) |
| Costo por alcance (`costo_por_alcance`) | Bruto / alcance normalizado (COP por persona alcanzada; §9 sin fórmula en el PDF) | `sum(a.monto_bruto) / nullif(sum(d.alcance), 0)`; la UI también muestra **por mil personas** (`× 1000`) | ídem | Es la métrica hacia la que migra el precio (§7.2.3 bis «costo por alcance mediano») |
| CTR de enlace (`ctr`) | Clics / alcance (auxiliar) | `sum(d.clics)::numeric / nullif(sum(d.alcance), 0)` | asignaciones de ofertas con `enlace_destino` | Solo si el creativo tiene enlace |
| Impresiones (`impresiones`), interacciones (`interacciones`), reproducciones (`reproducciones`), clics (`clics`) | Sumas del último corte validado | `sum(d.impresiones)`, `sum(d.interacciones)`, `sum(d.reproducciones)`, `sum(d.clics)` | — | «Consolidado por campaña: alcance total, impresiones, interacciones, reproducciones, clics» §7.2.6. `reproducciones` solo tiene sentido en video/reel/TikTok (null se suma como 0 y se rotula «n/d» si ninguna publicación del grupo la reporta) |
| Alcance mediano estimado | Para el estimador previo a publicar | `percentile_cont(0.5)` de `cuentas_sociales.alcance_mediano` de las cuentas elegibles × cupos por franja | cuentas con `publicaciones_verificadas_count ≥ calidad.minimo_publicaciones` | Si no hay histórico suficiente se muestra «sin estimación» (§7.2.3 nota del PDF) |

---

## 3. KPIs por rol

### 3.1 Anunciante (`kpis_anunciante`, `desempeno_anunciante`; RLS + `anunciante_id = mi_anunciante_id()`)
Razones con valor y n siempre (una sola entidad, §0.4).
| Clave | Fórmula (misma que la global, filtrada al anunciante) | Ancla |
|---|---|---|
| `inversion_comprometida` | 1.1 | `aceptada_at` |
| `inversion_verificada` | 1.2 | `verificada_at` |
| `campanas_activas` | `count(*) from campanas where estado = 'ACTIVA'` al cierre | foto |
| `ofertas_publicadas` | 1.6 | `publicada_at` |
| `tasa_llenado` | 1.7 | `fecha_limite_aceptacion` |
| `medios_alcanzados` | `count(distinct medio_id)` de asignaciones `CON_CUPO` aceptadas en el periodo | `aceptada_at` |
| `alcance_total`, `impresiones`, `interacciones`, `reproducciones`, `clics` | 1.11 y §2 | `verificada_at` |
| `cpm_efectivo`, `costo_por_interaccion`, `engagement`, `costo_por_alcance` | §2 | `verificada_at` |
| `tasa_cumplimiento` | 1.10 | `fecha_limite_publicacion` |
**Cortes (§7.2.6):** `desempeno_anunciante(p_desde, p_hasta, p_dimension, p_campana_id)` (modelo §5.9) devuelve, por `plataforma`, `medio`, `municipio`, `departamento`, `fecha` (día si ≤ 31 días, semana ISO si más) o `campana`: asignaciones, GMV, alcance, impresiones, interacciones, reproducciones, clics, CPM, costo por interacción, engagement y costo por alcance, con su `n`; la ubicación es el municipio del medio (§0.4) y el nombre del medio sale de `public.medios_publico`. El anunciante **no** ve comisión, valor para el medio, retenciones ni neto: esos montos están en `asignacion_montos`, sin política para él (modelo §3.6).

### 3.2 Medio (`kpis_medio`, `serie_ganancias_medio`; RPC **definer** con `medio_id = mi_medio_id()`)
El medio no lee `asignaciones`/`asignacion_montos` directamente (modelo §3.6); sus RPC son definer y filtran por su medio. Cada monto declara su **base**:
| Clave | Definición | Fórmula | Base | Ancla |
|---|---|---|---|---|
| `ganado_periodo` | Ganado este mes (§7.1.7): valor para el medio de lo verificado | `sum(am.monto_medio)` de `CUMPLIDAS` | antes de retenciones (la UI lo rotula así) | `verificada_at` |
| `pendiente_pago` | Verificado o liquidado aún no pagado | `sum(case a.estado when 'LIQUIDADA' then am.monto_neto else am.monto_medio end)` where estado in ('VERIFICADA','LIQUIDADA') | neto si ya se liquidó; si no, antes de retenciones («estimado: las retenciones se calculan al liquidar») | foto |
| `pagado_historico` | Pagado acumulado | `sum(am.monto_neto)` where estado = 'PAGADA' | neto (lo recibido) | sin periodo |
| `retenciones_historicas` | Retenciones practicadas acumuladas | `sum(am.monto_retenciones)` where estado = 'PAGADA' | — | sin periodo |
| `asignaciones_activas` | En curso | `count(*)` where estado in ('ACEPTADA','CONTENIDO_ENTREGADO','PUBLICADA','EVIDENCIA_VALIDADA','METRICAS_CARGADAS') | — | foto |
| `tasa_cumplimiento` | Reputación (§7.1.8) | 1.10 en ventana de 180 días, n mínimo `medios.n_minimo_cumplimiento` | — | `fecha_limite_publicacion` |
| `publicaciones_realizadas` | | `count(*) from publicaciones` APROBADA de sus asignaciones | — | `fecha_publicacion` |
| `tope_anual`, `consumido_tope`, `porcentaje_tope` | Progreso hacia el tope del nivel (§7.1.1) | tope de `niveles_verificacion`; consumido = `sum(am.monto_medio)` de asignaciones con `consume_cupo` y `aceptada_at` en el año calendario de Bogotá; % = consumido / tope; la UI marca «cerca del tope» desde `porcentaje_alerta` y avisa que desde `porcentaje_bloqueo` no podrá aceptar | antes de retenciones | año en curso |
| `multiplicador_calidad` | Multiplicador vigente más bajo entre sus cuentas (y el próximo si hay cambio anunciado) | `min(cuentas_sociales.multiplicador_calidad)` | — | foto |
**Gráfico semanal y mensual (§7.1.7):** `serie_ganancias_medio(p_desde, p_hasta, p_granularidad in ('semana','mes'))` devuelve por periodo `ganado` (Σ `monto_medio` por `verificada_at`), `pagado` (Σ `monto_neto` por `pagada_at`) y `asignaciones`, con periodos vacíos en 0.
Si `comision.visible_para_medio = true` el detalle por asignación (`mis_asignaciones_medio`) muestra bruto, comisión, valor para el medio, retenciones y neto (§7.1.7); si es false, solo valor para el medio, retenciones y neto.

---

## 4. Accesos y seguridad (`metricas_accesos`, reporte «Usuarios y accesos», mapa de accesos)
Fuente `public.accesos`, ancla `created_at`. Solo usuarios con `accesos.ver`.

| Clave | Definición | Fórmula | n mínimo | Interpretación |
|---|---|---|---|---|
| `accesos_exitosos` | Inicios de sesión correctos | `count(*) filter (where evento = 'LOGIN_EXITOSO')` | — | Uso de la plataforma |
| `accesos_fallidos` | Credenciales inválidas | `count(*) filter (where evento = 'LOGIN_FALLIDO')` | — | |
| `bloqueos` | Intentos rechazados por el limitador | `count(*) filter (where evento = 'LOGIN_BLOQUEADO')` | — | Picos = ataque de fuerza bruta |
| `tasa_fallo` | Fallidos / intentos | `fallidos / nullif(fallidos + exitosos, 0)` | `n_minimo_tasas` intentos | > 20 % sostenido = revisar UX de contraseña o ataque |
| `usuarios_unicos` | Personas que ingresaron | `count(distinct usuario_id) filter (where evento = 'LOGIN_EXITOSO')` | — | Adopción; comparar con perfiles ACTIVO |
| `paises_distintos` | Países de origen de accesos exitosos | `count(distinct pais_iso2) filter (where evento = 'LOGIN_EXITOSO')` | — | |
| `accesos_sospechosos` | Marcados por reglas (país inusual, múltiples fallos) | `count(*) filter (where es_sospechoso)` | — | Insight regla 6 |
| `mfa_fallidos` | Verificaciones TOTP fallidas | `count(*) filter (where evento = 'MFA_FALLIDO')` | — | |
| `sesiones_revocadas` | Cierres forzados y suspensiones | `count(*) filter (where evento in ('SESION_REVOCADA','USUARIO_SUSPENDIDO'))` | — | |
| `admins_sin_mfa` (foto) | Perfiles ACTIVO con rol `requiere_mfa` sin factor TOTP verificado | `count(*)` perfiles ⋈ roles where `requiere_mfa` and not exists `auth.mfa_factors` verificado (vía función definer con `usuarios.ver`) | — | Debe ser 0 |
| `usuarios_inactivos_90d` (foto) | ACTIVO sin `LOGIN_EXITOSO` en 90 días | | — | Candidatos a suspensión (higiene de cuentas) |
Mapa de accesos: `geo_metricas(nivel, 'accesos', ...)` cuenta `LOGIN_EXITOSO` por `pais_iso2` / `departamento_codigo` / `municipio_codigo`; el **modo calor** usa puntos reales `lat/lon` (redondeados a ~1 km). Heatmap día×hora: `actividad_heatmap(..., 'accesos')`.

---

## 5. Motor de insights
Funciones puras en `src/features/dashboard/insights/` (sin I/O; reciben los datos ya consultados por las RPC y devuelven tarjetas). Cada regla tiene tests con fixtures (casos positivo, negativo y borde de n mínimo).

**Entrada:** `{ periodo, kpis: KpiFila[], kpisAnterior, desgloses: { porDepartamento, porPlataforma, porFormato }, saludMedios, mediosEnRiesgo, metricasPendientesConAlerta, accesosSospechosos, config: { umbralVariacion, nMinimo } }`.
**Salida:** `Insight[]` con `{ id: string, regla: 1..6, severidad: 'positivo' | 'info' | 'atencion' | 'critico', titulo: string, detalle: string, metrica?: string, valor?: number, accion?: { etiqueta: string, href: Route } }`.
**Orden:** severidad (`critico` > `atencion` > `positivo` > `info`) y luego magnitud; se muestran **máximo 4** en Inicio; el resto en «Ver todos». Textos en español, cifras con formato es-CO, sin jerga («frente al periodo anterior», no «MoM»).

| # | Regla | Disparo | Cálculo de la causa | Severidad | Texto (plantilla) | Acción |
|---|---|---|---|---|---|---|
| 1 | Variación significativa y su causa principal | Para `gmv_verificado`, `gmv_comprometido`, `negocios_cerrados`, `alcance_total`: `abs(variacion) ≥ analitica.umbral_variacion` (15 %) y `n` actual y anterior ≥ n mínimo | Descomposición aditiva del delta: `Δ_g = valor_g − valor_anterior_g` por departamento y por plataforma; causa = grupo con mayor `abs(Δ_g) / abs(Δ_total)` (si ≥ 30 %); si ninguno supera 30 %, «cambio generalizado» | `positivo` si sube, `atencion` si baja | «El GMV verificado {subió/bajó} {x %} frente al periodo anterior. {Antioquia} explica el {41 %} del cambio{, sobre todo en Instagram}.» | Explorar mapa con filtro del grupo |
| 2 | Caída de cumplimiento con vencidas | `tasa_cumplimiento` baja ≥ 5 pp vs. anterior **o** < 85 %, con n ≥ mínimo, y `VENCIDA_SIN_PUBLICAR` del periodo ≥ 3 | Top 3 medios y departamento con más vencidas | `atencion` (`critico` si < 75 %) | «El cumplimiento cayó a {82 %} ({−6 pp}). {9} asignaciones vencieron sin publicar; {Córdoba} concentra {4}.» | Reporte de cumplimiento de medios filtrado |
| 3 | Medios en riesgo con GMV en juego | `medios_en_riesgo ≥ 1` y `gmv_en_juego > 0` | Top 3 por GMV 90 d | `atencion` si GMV en juego ≥ 5 % del GMV verificado de 90 d; si no `info` | «{12} medios activos no aceptan ofertas hace más de 30 días; representan {$18,4 M} de GMV en los últimos 90 días.» | Lista de medios en riesgo |
| 4 | Plataforma/formato con mejor CPM | Al menos 2 plataformas/formatos con n ≥ mínimo; el mejor CPM es ≥ 20 % menor que el CPM global | Comparación de `cpm_efectivo` por plataforma × formato (dentro de la misma familia de impresiones) | `positivo` | «{Reels de Instagram} entregan el CPM más eficiente: {$14.200}, {28 %} por debajo del promedio.» | Reporte de desempeño por plataforma |
| 5 | Métricas atípicas pendientes | `count(metricas PENDIENTE con alerta_desviacion or alerta_multiplo) ≥ 1` | Cuántas por tipo de alerta y la más antigua | `critico` si alguna lleva > 48 h; si no `atencion` | «{5} reportes de métricas se desvían del histórico del medio y esperan validación (el más antiguo hace {3 días}).» | Cola de validación de métricas |
| 6 | Accesos desde países inusuales | `accesos_sospechosos` con motivo `PAIS_INUSUAL` en el periodo ≥ 1 | Usuarios y países involucrados | `critico` si el usuario es interno (rol ADMIN); si no `atencion` | «{3} inicios de sesión desde países inusuales ({Rusia, Nigeria}) para {2} usuarios.» | Registro de accesos filtrado |
Reglas complementarias (SHOULD, misma interfaz): ofertas con fecha límite en < 48 h y llenado < 50 % (`atencion`); medio cerca del tope de su nivel (> `porcentaje_alerta`) — solo en Inicio Medio (`info` con enlace al instructivo de RUT).

---

## 6. Integridad de métricas (§11) — alertas que calcula `trg_metricas_b_alertas`
| Alerta | Fórmula | Configuración |
|---|---|---|
| `alerta_desviacion` | Sea `h` = mediana de `alcance_norm` (y por separado de `impresiones_norm`) de las últimas `calidad.ventana_publicaciones` (20) métricas APROBADA del **mismo corte** y la misma cuenta social. Si hay al menos `metricas.minimo_historial` (5) valores: alerta si `valor > h × f` o `valor < h / f` | `metricas.factor_desviacion` (3,0), `metricas.minimo_historial` (5) |
| `alerta_multiplo` | `alcance_norm > multiplo[plataforma] × cuentas_sociales.seguidores_verificados` | `metricas.multiplo_alcance_seguidores` (FB 3 · IG 2 · TT 20) |
| Coherencia (bloqueante, CHECK/zod) | `impresiones_norm ≥ alcance_norm`; `interacciones ≤ impresiones_norm`; cortes monotónicos: valor(D7) ≥ valor(H72) ≥ valor(H24) (tolerancia 2 %) — si no, error de validación en el formulario | — |
`detalle_alertas` guarda `{ mediana_historica, factor, seguidores, multiplo, n_historial }` para que el validador vea el porqué. El conteo de alertas por medio alimenta el reporte de cumplimiento y la regla 5.

---

## 7. Resumen de anclas y estados
| KPI | Ancla | Estados |
|---|---|---|
| GMV comprometido, anunciantes activos, ticket promedio, medios alcanzados | `aceptada_at` | `CON_CUPO` (`consume_cupo`) |
| GMV verificado, comisión, take rate, negocios cerrados, alcance, impresiones, interacciones, reproducciones, clics, CPM, CPI, engagement, costo por alcance | `verificada_at` (modo `PRIMERA`) | `CUMPLIDAS` |
| Ofertas publicadas | `publicada_at` (modo `PRIMERA`) | todas |
| Tasa de llenado | `fecha_limite_aceptacion` | ofertas publicadas no canceladas; aceptaciones cualquiera |
| Tiempo medio de llenado | `ofertas.llena_at` | ofertas que se llenaron |
| Tasa de aceptación | `oferta_vistas.primera_vista_at` | aceptación en cualquier estado |
| Tasa de cumplimiento | `fecha_limite_publicacion` | aceptadas con resultado conocido, salvo desistidas y canceladas no imputables al medio; cumplida = evidencia validada a tiempo |
| Medios activos | `aceptada_at` o `publicada_at` | medio `VERIFICADO` |
| Medios nuevos | `medios.verificado_at` (modo `PRIMERA`) | — |
| Ganancias del medio | `verificada_at` (ganado) · `pagada_at` (pagado) | `CUMPLIDAS` · PAGADA |
| Medios en riesgo | fin del periodo (foto) | medio VERIFICADO |
| Accesos | `accesos.created_at` | por evento |
