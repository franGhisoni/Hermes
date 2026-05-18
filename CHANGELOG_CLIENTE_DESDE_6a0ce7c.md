# Informe de cambios realizados en Hermes

Periodo cubierto: desde el commit `6a0ce7c049e7011e01fd2e59da72b1d5753426ef` (`feat: enhance settings management with article retention and cleanup configurations`) hasta el estado actual.

Este documento resume el trabajo realizado sobre la plataforma Hermes desde la ultima version informada al cliente. El foco del desarrollo fue convertir el sistema en una herramienta editorial mas robusta, trazable y operable: mejorar la calidad de imagenes, ampliar la configuracion del scraping y la publicacion, agregar visibilidad sobre decisiones automaticas, reducir fallos silenciosos y hacer mas comodo el trabajo diario del equipo.

## Resumen ejecutivo

Desde el ultimo punto informado se trabajo sobre practicamente todo el circuito operativo de Hermes: ingestion de noticias, procesamiento con IA, busqueda y seleccion de imagenes, publicacion, configuracion, monitoreo, trazabilidad y experiencia de uso.

Los cambios mas importantes fueron:

- Se redisenio el flujo de imagenes editoriales para buscar mejores candidatas, evitar reutilizar fotos originales de terceros, puntuar con IA y conservar una traza detallada de cada decision.
- Se integro SearXNG como proveedor de busqueda de imagenes, reemplazando scrapers mas fragiles y mejorando la estabilidad frente a bloqueos de Google/Bing.
- Se agregaron consultas inteligentes generadas por IA para encontrar imagenes realmente relacionadas con el protagonista o tema de la nota.
- Se amplio fuertemente la configuracion desde pantalla de Settings, reduciendo valores hardcodeados y dando control operativo sobre thresholds, modelos, limites y retencion.
- Se incorporaron notificaciones para problemas de scraping, workflows y publicacion.
- Se agrego configuracion avanzada de secciones, incluyendo limites y overrides por medio.
- Se mejoro el modulo de Flujos con edicion in-place, multiples destinos, republicacion opcional y controles de cron mas flexibles.
- Se robustecio el envio por email, incluyendo mejoras para adjuntar imagenes externas que bloquean requests basicos.
- Se sumaron mejoras de UX para el editor: trazas visibles para admin, ocultamiento de imagenes descartadas, seleccion manual de imagen, regeneracion, busqueda de medio en publicacion y busqueda global de noticias.

## Imagenes editoriales e IA

El bloque de trabajo mas grande estuvo en el pipeline de imagenes. Antes, el sistema tenia mas chances de quedarse con imagenes pobres, repetidas, bloqueadas o demasiado dependientes de la fuente original. Ahora el flujo es mucho mas editorial y auditable.

### Busqueda inteligente de imagenes

- Se agrego una etapa de generacion de queries inteligentes con IA.
- La IA analiza titulo, contenido y, cuando existe, la imagen original para entender quien o que es el protagonista real de la nota.
- A partir de esa lectura genera consultas de busqueda mas precisas, pensadas para encontrar fotos periodisticas reutilizables y no simplemente repetir las palabras del titulo.
- Esto ayuda especialmente en titulos ambiguos, ironicos o poco descriptivos, donde una busqueda literal suele traer malos resultados.

### Scoring editorial de candidatas

- Se amplio el criterio de scoring de imagenes para que la IA evalue cada candidata con un puntaje de 0 a 10.
- Se ajusto el prompt para que no castigue en exceso imagenes razonables: una imagen contextual puede recibir 4, 5 o 6 aunque no sea perfecta.
- Se endurecio el rechazo de imagenes no publicables: zocalos, logos, capturas de TV, marcas de agua, collages, graficas con texto o fotos identicas a la fuente original.
- Se agrego una regla editorial clave: no republicar la misma foto que uso el medio original, incluso si aparece hosteada en otra URL.
- Se ajusto la seleccion para confiar en el mayor puntaje real y no solamente en el indice devuelto por la IA, evitando inconsistencias.

### Mejor manejo de errores de descarga

- Se corrigio un problema donde OpenAI podia fallar al descargar una imagen candidata y dejar todo el lote con puntajes `0/10`.
- Ahora, si OpenAI no puede descargar una URL puntual, el sistema intenta identificarla, quitarla del lote y reintentar con las restantes.
- Tambien se manejo el caso de timeout de descarga, no solo el error `invalid_image_url`.
- Resultado: menos falsos negativos, menos caidas completas del scoring y mas chances de elegir una imagen util sin caer innecesariamente en generacion.

### DALL-E como fallback mejor integrado

- Se corrigio la alineacion entre imagenes candidatas y puntajes cuando se genera una imagen con DALL-E.
- Antes podia quedar un puntaje alto asignado a una candidata incorrecta. Ahora la imagen generada entra explicitamente como candidata con score propio.
- El sistema conserva la generacion como fallback cuando no hay imagenes de busqueda que superen el minimo configurado.

### Trazabilidad completa de decisiones de imagen

- Se agrego una traza de IA visible para administradores.
- La traza registra:
  - protagonista detectado;
  - queries inteligentes usadas;
  - busquedas ejecutadas;
  - proveedor/engine de cada candidata;
  - puntaje asignado;
  - razon corta del puntaje;
  - fallback usado, si corresponde.
- Esto permite auditar por que una imagen fue elegida, por que otra fue descartada y donde fallo la busqueda.

### Mejor experiencia editorial en el Newsroom

- Se ocultan a usuarios no admin las imagenes con score `0`, porque representan descartes duros o fallos de descarga.
- Los administradores siguen pudiendo verlas para diagnostico.
- Se agrego soporte para URL manual de imagen: el editor puede pegar una imagen concreta y dejarla seleccionada.
- Se mantiene la posibilidad de regenerar imagenes cuando ninguna candidata sirve.
- Se muestra mejor contexto sobre la fuente de cada imagen: Google, Bing, DuckDuckGo via SearXNG, DALL-E u original.

## Integracion de SearXNG para busqueda de imagenes

Se incorporo SearXNG como capa de busqueda de imagenes autoalojada.

Este cambio es importante porque reduce la fragilidad del scraping directo contra buscadores. En lugar de depender de automatizaciones de navegador facilmente bloqueables, Hermes consulta una instancia SearXNG con salida JSON y engines configurados.

Trabajo realizado:

- Se agrego servicio `searxng` al `docker-compose.yml`.
- Se agrego `searxng/settings.yml` versionado en el repo.
- Se habilito salida JSON.
- Se configuraron engines de imagenes como Google Images, Bing Images y DuckDuckGo Images.
- Se aplico SafeSearch estricto.
- Se configuro idioma y region orientados a Argentina / espanol.
- Se agrego `SearxngProvider` en backend.
- Se refactorizo `ImageService` para delegar la busqueda a un proveedor, dejando el sistema preparado para cambiar o sumar proveedores en el futuro.
- Se conserva en la traza que engine encontro cada imagen, por ejemplo `searxng-google`, `searxng-bing` o `searxng-duckduckgo`.
- Se agrego soporte para `SEARXNG_URL` y `SEARXNG_PUBLIC_URL`, separando la URL interna del backend y la URL visible para el panel de admin.

## Configuracion avanzada del sistema

Se amplio mucho la pantalla de Settings y el servicio de configuracion.

La idea fue sacar decisiones operativas del codigo y llevarlas a configuracion editable, para que el sistema pueda ajustarse sin redeploy ante cambios de volumen, calidad, costos o criterio editorial.

Entre los parametros expuestos o centralizados se incluyen:

- thresholds de deduplicacion;
- score minimo de imagen;
- tamano del pool de imagenes a evaluar;
- cantidad maxima de retries del scoring;
- modelo usado para scoring de imagenes;
- max tokens del scoring;
- cantidad de caracteres de contenido enviados al scorer;
- limites y comportamiento de queries de imagen;
- timeouts de fetch;
- modelo de generacion de imagenes;
- retencion de noticias;
- limpieza automatica;
- parametros de procesamiento y scraping.

Tambien se reorganizo Settings en pestanas mas claras, separando areas como fuentes, sistema, prompts e imagenes.

## Secciones y fuentes

Se trabajo sobre la configuracion de secciones para que el scraping sea mas granular y controlable.

Cambios principales:

- Se agregaron limites por seccion.
- Se agregaron overrides por medio.
- Una seccion puede tener una ruta global, pero un medio puntual puede usar otra ruta.
- Tambien se puede modificar el limite de scraping por medio y seccion.
- Se puede desactivar una seccion para un medio especifico.
- Se agrego un modal de administracion de overrides por fuente.
- El scraper manual respeta estas configuraciones efectivas.

Esto permite manejar medios con estructuras distintas sin duplicar secciones ni hardcodear casos especiales.

## Flujos de publicacion

Se mejoro el modulo de Flujos para hacerlo mas operativo y menos rigido.

Trabajo realizado:

- Edicion de workflows in-place.
- Soporte para multiples targets de publicacion.
- Distribucion round-robin entre targets.
- Cursor de target para mantener rotacion.
- Republicacion opcional para rellenar cupos cuando no hay suficientes notas nuevas.
- Ventana configurable de articulos.
- Target category configurable.
- Seleccion de fuentes asociadas a un flujo.
- Min score por flujo.
- Pausa/activacion mas clara.
- Builder de cron para facilitar horarios sin escribir expresiones manualmente.
- Registro y notificaciones de ejecucion.

## Publicacion por email

Se robustecio el envio de publicaciones por email.

Cambios principales:

- Mejor manejo de imagenes externas al preparar el email.
- Uso de headers como User-Agent y Referer para descargar imagenes de sitios que bloquean fetch basico.
- Fallbacks mas claros cuando no se puede adjuntar una imagen externa.
- Notificaciones ante errores de publicacion.
- Mejor trazabilidad de los intentos de envio.

## Notificaciones operativas

Se agrego un sistema de notificaciones para que errores importantes no queden perdidos en logs.

Incluye:

- modelo de notificacion en base de datos;
- servicio backend de notificaciones;
- router API;
- panel frontend;
- estados de lectura;
- clasificacion por fuente: scraper, workflow, publish o system;
- niveles de severidad: info, warning y error.

Se usan notificaciones para:

- scraping vacio;
- errores de scraping;
- medios desconocidos;
- problemas de publicacion;
- eventos relevantes de workflows.

## Scraping y fuentes

Se agregaron y ajustaron scrapers para ampliar cobertura y estabilidad.

Cambios incluidos:

- Nuevos scrapers para Ambito y El Cronista.
- Ajustes en scrapers existentes para mejorar extraccion.
- Mejor filtrado de ruido de consola y recursos bloqueados.
- Mejor manejo de secciones efectivas por fuente.
- Respeto de limites configurables por seccion y por fuente.

## Dashboard y experiencia de uso

Se hicieron mejoras de experiencia para que el equipo editorial pueda encontrar y operar noticias mas rapido.

Cambios realizados:

- Logo clickeable para volver al Dashboard.
- Favicon / branding actualizado.
- Dashboard con agrupacion por medio o seccion.
- Filtros por medio, seccion, estado, orden y score.
- Buscador global de noticias agregado en la pagina principal.
- La busqueda consulta backend y aplica sobre todo el conjunto paginado, no solo sobre los articulos visibles.
- La busqueda contempla titulo original, titulo reescrito, contenido, URL, seccion y medio.
- Mensaje claro cuando no hay resultados para los filtros actuales.

## Modal de publicacion manual

Se agrego un buscador de medios dentro del modal de publicacion manual.

Antes, si habia varios targets configurados, el editor tenia que recorrer visualmente toda la lista. Ahora puede filtrar por:

- nombre del medio;
- email de destino.

Tambien se conserva:

- seleccion de categoria;
- precarga de categoria desde la seccion del articulo;
- validacion de target seleccionado;
- estado de carga;
- estado de envio;
- mensaje cuando no hay medios configurados.

## Backend de articulos

Se extendio el endpoint `GET /api/articles` con busqueda textual.

El backend ahora acepta `search` y lo combina con filtros existentes:

- medio;
- seccion;
- estado;
- paginacion;
- orden por fecha o score;
- orden ascendente/descendente.

La busqueda contempla:

- `originalTitle`;
- `rewrittenTitle`;
- `originalContent`;
- `rewrittenContent`;
- `originalUrl`;
- `section`;
- `source.name`.

Esto deja la busqueda integrada de forma limpia con la API existente.

## Seguridad editorial y control de calidad

Varias mejoras apuntan a reducir riesgos editoriales:

- evitar republicar imagenes identicas a la fuente;
- rechazar marcas de agua y capturas con zocalos;
- no depender ciegamente de la imagen original;
- conservar razonamientos y puntajes;
- separar visibilidad admin/editor para imagenes descartadas;
- configurar thresholds sin tocar codigo;
- alertar problemas operativos;
- evitar silencios cuando un scraper no trae resultados.

## Cambios tecnicos destacados

Archivos y modulos relevantes trabajados:

- `apps/server/src/services/AIService.ts`
- `apps/server/src/services/ImageService.ts`
- `apps/server/src/services/ProcessorService.ts`
- `apps/server/src/services/ConfigService.ts`
- `apps/server/src/services/SchedulerService.ts`
- `apps/server/src/services/MailService.ts`
- `apps/server/src/services/NotificationService.ts`
- `apps/server/src/services/imageProviders/SearxngProvider.ts`
- `apps/server/src/routes/NotificationRouter.ts`
- `apps/server/src/routes/SectionRouter.ts`
- `apps/server/src/routes/WorkflowRouter.ts`
- `apps/client/src/pages/Settings.tsx`
- `apps/client/src/pages/Flows.tsx`
- `apps/client/src/pages/Newsroom.tsx`
- `apps/client/src/pages/Dashboard.tsx`
- `apps/client/src/components/NotificationsPanel.tsx`
- `apps/client/src/components/SectionOverridesModal.tsx`
- `apps/client/src/components/ScraperControl.tsx`
- `apps/client/src/components/CronBuilder.tsx`
- `searxng/settings.yml`
- `docker-compose.yml`
- `apps/server/prisma/schema.prisma`

## Migraciones y estructura de datos

Se agregaron cambios de schema y migraciones para soportar:

- notificaciones;
- configuracion de secciones;
- overrides por fuente;
- targets multiples en workflows;
- cursor de distribucion;
- republicacion;
- trazas de IA;
- puntajes de imagenes;
- configuraciones persistidas.

## Resultado final

Hermes queda bastante mas cerca de una herramienta editorial completa:

- procesa noticias;
- reescribe contenido;
- evalua interes;
- busca imagenes mejores y mas seguras;
- evita republicar imagenes problematicas;
- permite diagnosticar decisiones de IA;
- publica a multiples medios;
- automatiza flujos;
- notifica problemas;
- permite ajustar el comportamiento desde UI;
- permite buscar y filtrar noticias;
- permite operar manualmente con menos friccion.

En terminos practicos, el trabajo no fue solo agregar pantallas: se reforzo todo el circuito de punta a punta, desde la entrada de una noticia hasta su publicacion y posterior auditoria.

