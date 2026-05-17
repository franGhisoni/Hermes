# Hermes — Pendientes

## ❗ EN PROGRESO: Migración del módulo de búsqueda de imágenes a SearXNG

### Contexto / por qué

El scraping actual con puppeteer está completamente roto en producción:

- **Google scraper devuelve 0 en el 100% de las queries** — probablemente detección de bot y nos sirve una página falsa.
- **Bing scraper devuelve basura totalmente inconexa**: porno japonés (javhd.pics), wallpapers de anime (alphacoders.com), diagramas científicos. Las URLs no tienen ninguna relación con la query (ej. "Movistar Arena events" → ian-hanasaki porn). Hipótesis: Bing detecta puppeteer y sirve un fallback con widgets de "popular searches" / "trending" que nuestro selector pesca.
- Cuando vos abrís el link de Bing del trace en el browser, viene bien — confirma que es bot detection.
- SafeSearch + geo Argentina ya están en código pero no ayudan porque la página servida al bot no respeta esos params.

**Riesgo de adulto**: bajo en la práctica porque el scorer rechaza casi todo con 0 — pero conceptualmente está mal.

### Decisión

Reemplazar puppeteer-scraping por **SearXNG self-hosted**. Meta-buscador open source en Docker que hace el scraping correctamente con anti-bot interno, agrega Google/Bing/DDG/Yandex/Qwant, y expone JSON limpio.

**No mantener providers de puppeteer como fallback** — código muerto, SearXNG ya wrappea todos esos engines internamente con manejo correcto.

### Diseño confirmado

#### Backend

1. **Interface única** (`apps/server/src/services/imageProviders/types.ts`):
   ```ts
   export interface ImageSearchProvider {
       name: string;
       search(query: string, options?: ImageSearchOptions): Promise<{
           url: string;       // URL pública de búsqueda (para traza)
           results: string[]; // URLs de imágenes
           engineByUrl: Record<string, string>;
       }>;
   }
   ```

2. **Una sola implementación**: `SearxngProvider` (fetch JSON al container).

3. **ImageService refactorizado**: en vez del bloque puppeteer + Google + Bing, recibe un `ImageSearchProvider` (o lista) y delega. La traza (`SearchExecution[]` + `sourceByUrl`) se sigue construyendo igual, pero el `sourceEngine` puede ser `searxng-google`, `searxng-bing`, etc. (lo devuelve SearXNG en la response).

4. **Borrar** `fetchGoogleResults` y `fetchBingResults` del código actual.

#### Stack

5. **docker-compose.yml**: nuevo servicio
   ```yaml
   searxng:
     image: searxng/searxng:latest
     ports: ["8888:8080"]
     environment:
       - BASE_URL=http://localhost:8888/
     volumes:
       - ./searxng:/etc/searxng
     restart: unless-stopped
   ```

6. **`searxng/settings.yml`** (versionado en el repo): habilitar `format: [html, json]` (JSON viene off por seguridad por defecto), usar `keep_only` para Google Images + Bing Images + DuckDuckGo Images, set `safe_search: 2` (strict), region/locale Argentina. Qwant queda deshabilitado por ahora porque la imagen actual de SearXNG crashea con `KeyError: 'qwant'`.

#### Config

7. **Env vars**: `SEARXNG_URL` (default local `http://localhost:8888`; en deploy containerizado usar `http://searxng:8080`) y `SEARXNG_PUBLIC_URL` para los links clickeables de la traza cuando la URL interna no sea accesible desde el navegador. El usuario las agrega a su `.env` cuando despliegue prod.

#### Frontend

8. **AdminAiTracePanel** ([Newsroom.tsx](apps/client/src/pages/Newsroom.tsx)) — el badge de engine ya soporta strings arbitrarios; solo agregar colores específicos para `searxng-google`, `searxng-bing`, etc.

### Tareas (en orden)

- [x] Crear `apps/server/src/services/imageProviders/types.ts` con la interface
- [x] Crear `apps/server/src/services/imageProviders/SearxngProvider.ts`
- [x] Refactorizar `ImageService.searchImages` para usar el provider
- [x] Borrar `fetchGoogleResults` y `fetchBingResults` (y limpiar imports/types asociados)
- [x] Agregar `searxng` al `docker-compose.yml`
- [x] Crear `searxng/settings.yml` con JSON enabled + engines + safe search + región AR
- [x] Actualizar la sección "Sistema → Imágenes" en Settings UI para que muestre estado del provider activo
- [x] Limpiar settings ahora obsoletos: `image_search_query_template`, `image_search_url_template`, `image_engine_failure_threshold` (no aplican más)
- [x] Limpiar restos del scraper viejo: `image_search_page_timeout_ms`, `image_search_selector_timeout_ms` y dependencia `duck-duck-scrape`
- [x] Verificar `npm run build` en server + client y `docker compose config`
- [x] Probar `SearxngProvider` con `fetch` mockeado (parseo JSON, filtro por tamaño, normalización de engine)
- [x] Levantar `docker compose up -d searxng`
- [x] Probar `SearxngProvider` real contra `http://localhost:8888`
- [x] Probar `ImageService.searchImages` contra SearXNG local (3 queries, 35 resultados por query, 7 candidatas validadas)
- [x] Corregir scoring de imágenes cuando OpenAI no puede descargar la imagen original de referencia: ahora reintenta sin referencia en vez de devolver todos los scores en 0 sin razones
- [ ] Procesar un artículo real end-to-end
- [ ] Push (sin scrapers de Ambito/Cronista como siempre)

> Nota 2026-05-17: el primer arranque falló por `KeyError: 'qwant'`; se corrigió removiendo Qwant del `keep_only`. SearXNG quedó respondiendo en `http://localhost:8888`.

### Cosas a NO olvidar

- El user pidió no pushear `apps/server/src/scrapers/AmbitoScraper.ts` ni `apps/server/src/scrapers/CronistaScraper.ts` — quedan en working tree.
- La traza AI (`aiDecisions` en `Article`) sigue como está — solo se actualiza el contenido del campo `sourceEngine` por candidata.
- El prompt IMAGE_SELECT en DB sigue siendo el del usuario — no tocar.

---

## Cosas terminadas que vale la pena recordar

- **Per-section + per-source scrape limits**: configurable por sección con override por medio. UI en Settings → Fuentes.
- **Workflow republish + round-robin cursor**: cuando hay menos notas que destinos, el workflow rota destinos cada ciclo y/o republica con reescritura.
- **AI trace persistida** en `Article.aiDecisions`: protagonista, smart queries, scoring + razón por candidata, fallback usado. Visible solo a admins en el editor de Newsroom.
- **Notificaciones**: schema + servicio + panel ya pusheados.
- **gpt-4o como modelo de scoring** (no mini) — los modelos están configurables en Settings → Sistema.
- **Filtros de candidatas score=0** en el carrusel del editor — ocultas a non-admin, visibles a admin con badge.

## Sin commitear (no pushear hasta nuevo aviso)

- `apps/server/src/scrapers/AmbitoScraper.ts`
- `apps/server/src/scrapers/CronistaScraper.ts`
