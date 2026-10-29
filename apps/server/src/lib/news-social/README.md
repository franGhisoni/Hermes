# news-social

Placas periodísticas para redes + publicación en Facebook e Instagram. Es una carpeta
autocontenida que vive copiada en dos proyectos:

| Proyecto | Ruta | Cómo se usa |
|---|---|---|
| Hermes (rama `politicadelsur`) | `apps/server/src/lib/news-social/` | `services/SocialPublishService.ts` |
| Impacto Castex (`code/Sodium/Impacto Castex`) | `src/lib/news-social/` | `src/lib/social.ts` |

**La copia de Hermes es la original.** Si cambiás algo, copialo al otro proyecto con
`scripts/sync-news-social.sh` (en la raíz de Hermes) y corré typecheck/lint en los dos.
No importa nada de los proyectos, así que puede pasar a ser un paquete npm cuando haga falta.

Dependencias: `sharp`, `satori`, `@fontsource/montserrat`, `@fontsource/anton`,
`@fontsource/playfair-display`. Las fuentes se leen de `node_modules` desde
`process.cwd()` (la raíz del proyecto).

## Placas

```ts
import { defineTheme, renderCard } from './news-social';

const theme = defineTheme({
  brandName: 'Política del Sur',
  template: 'banda',            // 'banda' | 'degradado' | 'panel' | 'clasico'
  format: 'portrait',           // 'portrait' (1080×1350) | 'square' | 'story'
  colors: { primary: '#0e4aa3', accent: '#f47b20' },
  fonts: { headline: 'montserrat' },  // 'montserrat' | 'anton' | 'playfair'
  footer: 'politicadelsur.com',
  logoUrl: 'https://…/logo-blanco.png', // opcional; si no, logo de texto
});

const jpeg = await renderCard(
  { headline: 'Pareja delineó *el armado de LLA* en la Provincia', kicker: 'Avellaneda', imageUrl },
  theme,
);
```

- Las palabras entre `*asteriscos*` salen en el color de acento.
- El tamaño del titular se ajusta solo a la caja.
- La foto se recorta con `sharp.strategy.attention` (busca la zona con más detalle, en general las caras).
- Si la foto no baja, la placa sale igual con fondo liso.

| Template | Inspiración |
|---|---|
| `banda` | Política del Sur: foto arriba, volanta en el borde, titular sobre banda de color |
| `degradado` | envica: foto a sangre con degradé y titular abajo a la izquierda |
| `panel` | infobae: foto arriba, filete de color y panel oscuro con marca y titular |
| `clasico` | portada de diario: cabezal serif, filetes, fecha, foto enmarcada y titular serif |

`themeFromEnv(defaults, process.env.SOCIAL_CARD_THEME)` permite cambiar diseño y colores
por variable de entorno con un JSON parcial, sin tocar código.

## Copys

`generateSocialCopy(llm, { title, content, volanta }, brand)` arma el prompt (el de
Política del Sur generalizado), llama a cualquier modelo mediante `llm(prompt) => texto` y
devuelve `{ facebook, instagram, twitter, hashtags, card: { headline, kicker } }`. Si la IA
falla, devuelve un copy básico (`fallbackSocialCopy`). `CARD_PROMPT_SECTION` sirve para
sumar el texto de la placa a un prompt propio.

## Publicar

```ts
const result = await publishNewsToSocial({
  card, copy, link, theme,
  meta: metaConfigFromEnv()!,          // META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_IG_USER_ID
  networks: ['facebook', 'instagram'],
});
// result.facebook / result.instagram: { ok, id, permalink, error }
```

- Facebook: foto en la página con el copy y el link al final.
- Instagram: la Graph API solo acepta imágenes por URL pública, así que la placa se sube a
  la página como foto **no publicada** y se usa esa URL. No hace falta alojar nada.
  El link va como primer comentario (en el texto no se puede tocar).
- Cada red se intenta por separado: si una falla, la otra queda publicada.

### "Conectar con Facebook" (lo hace el cliente desde el panel)

`oauth.ts` resuelve el login con **Facebook Login for Business**: `metaLoginUrl` (pide los permisos de `LOGIN_SCOPES`) → la persona
autoriza → `exchangeCode` (token de usuario de ~60 días) → `listManagedPages` (tokens de página,
que no vencen) → se guarda el de la página elegida, cifrado con `encryptSecret` (AES-256-GCM).

- Hermes: pestaña **Configuración → Redes**. Vuelta en `GET /oauth/meta/callback` del servidor.
- Impacto Castex: **Panel → Redes**. Vuelta en `/panel/redes/callback`.
- Si hay una página conectada se usa esa; si no, las variables `META_PAGE_*` de siempre.

Variables: `META_APP_ID`, `META_APP_SECRET` y `SOCIAL_TOKEN_SECRET` (`META_LOGIN_CONFIG_ID` es opcional: si está, se usa esa configuración de Login for Business en lugar de pedir los permisos; con Sodium Redes el diálogo falló así que no se usa)
(si falta, se cifra con `META_APP_SECRET`; cambiar cualquiera de las dos obliga a reconectar).

### Credenciales de Meta

1. App de Meta (tipo Business) con los permisos `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `instagram_basic` e `instagram_content_publish`.
2. La cuenta de Instagram tiene que ser profesional y estar vinculada a la página.
3. Token de página de larga duración: token de usuario largo →
   `GET /me/accounts` → `access_token` de la página (no vence mientras no cambie la contraseña).
4. `META_IG_USER_ID`: `GET /{page-id}?fields=instagram_business_account`.
