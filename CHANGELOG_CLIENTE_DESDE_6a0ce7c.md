# Resumen de mejoras realizadas en Hermes

Periodo cubierto: desde la ultima version informada al cliente, correspondiente al commit `6a0ce7c049e7011e01fd2e59da72b1d5753426ef`, hasta la version actual.

Durante este periodo se realizo una evolucion importante de Hermes. El trabajo no se limito a ajustes visuales o correcciones puntuales: se reforzo el proceso completo de trabajo, desde la captura de noticias hasta la seleccion de imagenes, la preparacion editorial, la publicacion, el monitoreo y la operacion diaria.

El resultado es una plataforma mas estable, mas controlable y mas alineada con un uso real de redaccion.

## Vision general

Hermes paso de ser una herramienta funcional de procesamiento automatico a una plataforma mucho mas completa para operar noticias con criterio editorial.

Se trabajo especialmente en cuatro objetivos:

- Mejorar la calidad del contenido final.
- Reducir errores operativos y decisiones automaticas poco claras.
- Dar mas control al equipo sobre fuentes, secciones, imagenes y publicaciones.
- Hacer que la plataforma sea mas comoda y confiable para el uso diario.

En terminos practicos, hoy Hermes no solo procesa noticias: tambien ayuda a elegir mejores imagenes, informa cuando algo falla, permite configurar reglas por medio, distribuye publicaciones, organiza flujos de trabajo y deja mas visibles las decisiones tomadas por el sistema.

## Mejoras en imagenes editoriales

Uno de los bloques de trabajo mas importantes fue la mejora del sistema de imagenes.

Antes, la seleccion de imagenes podia depender demasiado de la imagen original de la fuente o de resultados de busqueda poco precisos. Eso generaba riesgos editoriales: imagenes con marcas de agua, capturas de TV, graficas con texto, fotos repetidas del medio original o imagenes poco representativas de la nota.

Ahora el proceso es mucho mas cuidadoso:

- El sistema busca imagenes alternativas para cada noticia.
- Analiza que persona, entidad, lugar o tema es realmente protagonista.
- Evalua distintas candidatas y les asigna una calificacion.
- Prioriza imagenes limpias, periodisticas y utilizables.
- Penaliza imagenes con logos, zocalos, marcas de agua o apariencia poco profesional.
- Evita reutilizar la misma imagen que uso la fuente original.
- Si no encuentra una imagen adecuada, puede recurrir a una imagen generada como alternativa.

Esto mejora tanto la calidad visual como la seguridad editorial del contenido publicado.

## Mejor criterio editorial en la seleccion automatica

Se ajusto el comportamiento de la inteligencia artificial para que actue mas parecido a un editor.

El sistema ahora distingue mejor entre:

- una imagen perfecta para la nota;
- una imagen aceptable pero no ideal;
- una imagen relacionada pero floja;
- una imagen que directamente no conviene usar.

Tambien se redujo el problema de rechazar imagenes razonables por no ser exactas. En muchos casos, para una nota es preferible usar una imagen contextual buena antes que forzar una generacion o quedarse sin alternativa. Ese criterio fue afinado.

## Menos fallos silenciosos con imagenes

Se corrigieron casos donde algunos servicios externos no podian descargar una imagen puntual y eso provocaba que todo el grupo de candidatas quedara descartado.

Ahora, cuando una imagen falla, Hermes intenta aislar esa imagen problematica y continuar con las demas. Esto hace que el sistema sea mas resistente y evita perder buenas opciones por un error puntual de una URL o de un proveedor externo.

## Busqueda de imagenes mas estable

Se incorporo una nueva capa de busqueda de imagenes mas robusta.

Esto permite depender menos de comportamientos inestables de buscadores tradicionales, que suelen bloquear o limitar automatizaciones. La plataforma ahora cuenta con una forma mas ordenada de consultar multiples fuentes de imagenes y conservar informacion sobre de donde vino cada resultado.

Para el cliente, el beneficio concreto es:

- mas estabilidad en la busqueda;
- mejores resultados;
- menos bloqueos;
- mas variedad de candidatas;
- mayor capacidad de diagnostico cuando algo no sale bien.

## Mayor transparencia sobre las decisiones de IA

Se agrego mas visibilidad sobre lo que hace Hermes cuando procesa una noticia.

Ahora los administradores pueden revisar informacion como:

- que interpreto el sistema como protagonista de la nota;
- que busquedas realizo;
- que imagenes considero;
- que puntaje recibio cada imagen;
- por que una imagen fue aceptada o descartada;
- si se uso una imagen encontrada, generada o la original.

Esto es clave para confiar en la automatizacion. En lugar de que el sistema tome decisiones como una caja negra, ahora deja una explicacion revisable.

## Mejoras para el equipo editorial

Se incorporaron varias mejoras pensadas para el trabajo diario de quienes revisan y publican notas.

Entre ellas:

- posibilidad de cambiar la imagen principal;
- posibilidad de pegar una imagen manualmente;
- opcion para regenerar imagen cuando ninguna candidata sirve;
- ocultamiento de imagenes claramente descartadas para no ensuciar la vista de trabajo;
- mejor visualizacion de candidatas;
- mayor claridad sobre el estado de cada articulo;
- mejoras en la pantalla de revision y publicacion.

Estas mejoras reducen friccion y aceleran la tarea de edicion.

## Buscador de noticias en la pagina principal

Se agrego un buscador global de noticias en el Dashboard principal.

Ahora el equipo puede buscar noticias por:

- titulo;
- contenido;
- medio;
- seccion;
- URL;
- texto reescrito.

La busqueda no se limita a lo que se ve en pantalla: consulta el conjunto de noticias disponible y respeta los filtros existentes.

Esto hace mucho mas facil encontrar notas ya procesadas, revisar historicos, ubicar una publicacion especifica o filtrar rapidamente una cobertura.

## Buscador de medio al publicar manualmente

Se agrego un buscador dentro del modal de publicacion manual.

Cuando hay varios medios o destinos configurados, el usuario ya no necesita recorrer la lista completa. Puede buscar por nombre o email y seleccionar rapidamente el destino correcto.

Esta mejora es simple en apariencia, pero importante para el uso diario: reduce errores, acelera la publicacion y hace mas clara la operacion cuando crece la cantidad de destinos.

## Mejoras en flujos de publicacion

Se amplio el modulo de flujos para soportar operaciones mas reales y flexibles.

Ahora Hermes permite configurar mejor como se distribuyen las noticias, a que destinos se envian y bajo que condiciones.

Se trabajo sobre:

- flujos mas faciles de editar;
- seleccion de fuentes para cada flujo;
- configuracion de categorias;
- criterios de score minimo;
- multiples destinos;
- distribucion rotativa entre destinos;
- posibilidad de republicar contenido para completar cupos;
- pausado y reactivacion de flujos;
- configuracion mas flexible de horarios.

Esto permite que la plataforma se adapte mejor a distintas rutinas editoriales y comerciales.

## Mejoras en configuracion de fuentes y secciones

Se amplio mucho el control sobre fuentes y secciones.

Ahora es posible manejar diferencias entre medios sin tener que tocar codigo o forzar configuraciones generales.

Por ejemplo:

- una seccion puede existir de forma general;
- cada medio puede tener una ruta distinta para esa seccion;
- se puede definir un limite particular de noticias por medio;
- se puede desactivar una seccion solo para un medio puntual.

Esto da mucha mas flexibilidad para trabajar con medios que no tienen la misma estructura o que requieren tratamientos distintos.

## Panel de configuracion mas completo

Se reorganizo y amplio el panel de configuracion.

El objetivo fue que mas decisiones puedan gestionarse desde la interfaz y no queden escondidas en el sistema.

Ahora hay mas control sobre:

- comportamiento del procesamiento;
- parametros de imagenes;
- limites;
- modelos utilizados;
- thresholds;
- retencion de noticias;
- limpieza automatica;
- fuentes;
- secciones;
- prompts y reglas.

Esto facilita ajustar la plataforma sin depender siempre de un cambio tecnico.

## Notificaciones operativas

Se agrego un sistema de notificaciones para que los problemas relevantes no queden perdidos en registros internos.

Hermes puede informar situaciones como:

- un scraping que no trajo resultados;
- un error al scrapear un medio;
- problemas de publicacion;
- eventos de flujos automaticos;
- situaciones que requieren revision.

Esto ayuda a operar la plataforma con mas control, especialmente cuando hay procesos automaticos corriendo en segundo plano.

## Mejoras en publicacion por email

Se reforzo el envio de publicaciones por email.

Algunos medios o proveedores de imagen bloquean descargas automaticas si no se hacen de forma similar a un navegador real. Se ajusto el sistema para mejorar la capacidad de obtener esas imagenes y adjuntarlas correctamente.

Tambien se mejoro el manejo de errores para que, si algo falla, sea mas facil entender que ocurrio.

## Nuevas fuentes y mejoras de scraping

Se amplio y ajusto el trabajo de scraping.

Se agrego soporte para nuevas fuentes y se mejoro la extraccion en fuentes existentes. Tambien se redujo ruido operativo y se mejoro la forma en que se manejan secciones, limites y casos vacios.

Esto aporta mas cobertura y una operacion mas estable.

## Mejoras visuales y de navegacion

Se realizaron ajustes de experiencia de usuario para que la plataforma sea mas clara y agradable de usar.

Entre ellos:

- logo clickeable para volver al inicio;
- mejoras de branding;
- organizacion mas clara del panel de configuracion;
- mejor disposicion de flujos;
- dashboard con filtros y agrupaciones;
- mensajes mas claros cuando no hay resultados;
- mejor separacion entre vistas operativas.

## Control de calidad y reduccion de riesgos

Varios cambios apuntan directamente a reducir riesgos en una operacion editorial real:

- evitar imagenes con marcas de agua;
- evitar republicar fotos de la fuente original;
- detectar mejor imagenes no utilizables;
- no descartar todo un lote por una imagen fallida;
- mostrar motivos de decisiones automaticas;
- alertar errores importantes;
- permitir ajustes desde interfaz;
- mejorar busqueda y seleccion manual.

Esto hace que Hermes sea mas confiable tanto para automatizar como para revisar manualmente.

## Resultado final

La plataforma queda significativamente mas completa que en la ultima version informada.

Hoy Hermes permite:

- capturar noticias de distintas fuentes;
- procesarlas con IA;
- reescribirlas;
- evaluar su interes;
- buscar imagenes adecuadas;
- elegir o generar imagen principal;
- revisar decisiones automaticas;
- publicar manual o automaticamente;
- distribuir contenido entre destinos;
- configurar flujos;
- recibir notificaciones;
- buscar noticias procesadas;
- ajustar reglas desde paneles administrativos.

En resumen, se avanzo de una herramienta automatizada a una plataforma editorial mucho mas madura, configurable y preparada para operacion diaria.

El trabajo realizado mejora calidad, control, estabilidad y velocidad de uso. Tambien deja una base mas solida para seguir creciendo sin que cada nueva necesidad requiera rehacer partes centrales del sistema.
