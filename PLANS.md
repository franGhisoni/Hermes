# Hermes — Pendientes

## Búsqueda de imágenes: migrar a SearXNG si Google empieza a bloquear

**Estado actual** (mayo 2026): scraping de Google Images vía puppeteer (engine principal) con fallback a Bing por query. Gratis pero contra ToS de Google y con riesgo de CAPTCHA.

### Las APIs pagas que descartamos

- **Google Custom Search JSON API** — ~$100/mes a nuestro volumen.
- **Brave Search API** — ~$70-80/mes, índice más chico.
- **SerpAPI** — caro a nuestra escala.
- **Bing Image Search API (Azure)** — Microsoft lo discontinuó en agosto 2025.

### El plan: self-hostear SearXNG

SearXNG es un meta-buscador open source. Corre como container Docker, scrapea Google + Bing + DuckDuckGo + Yandex + Qwant *por nosotros* con anti-block interno, y expone una API JSON limpia. **Gratis, sin API keys, sin cuotas.**

#### Cómo se hace

1. Sumar al `docker-compose.yml`:

   ```yaml
   searxng:
     image: searxng/searxng:latest
     container_name: searxng
     ports:
       - "8888:8080"
     environment:
       - BASE_URL=http://localhost:8888/
     restart: unless-stopped
   ```

2. Reemplazar `fetchGoogleResults` + `fetchBingResults` en [ImageService.ts](apps/server/src/services/ImageService.ts) por una sola llamada `fetch` a:

   ```
   http://searxng:8080/search?q=<query>&format=json&categories=images
   ```

3. Eliminar la dependencia de puppeteer del path de búsqueda (se queda solo para el scraping de artículos si todavía hace falta).

#### Cuándo disparar la migración

Si los logs muestran `Google blocked us on "..."` en > 30% de las queries durante varios días, o si la calidad de candidatas vuelve a caer notablemente. Hasta entonces, dejar el puppeteer actual.

#### Pros vs el puppeteer actual

- Anti-block manejado por SearXNG, no por nosotros.
- Más rápido (sin levantar Chromium).
- Múltiples engines combinados → si Google bloquea, sigue funcionando con Bing/DDG/Yandex transparentemente.
- Sigue siendo gratis.

#### Contras

- Un container más en el stack (~100MB RAM).
- Legalmente: sigue siendo scraping bajo el capó. Misma zona gris que hoy.
