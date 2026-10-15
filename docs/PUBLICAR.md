# Guía para publicar Diana Legends en Google Play y App Store

Esta guía recorre todo lo que hay que hacer **fuera del código** para tener el juego en las tiendas,
ganando dinero con anuncios y compras y con el modo online funcionando. Sigue los pasos en orden.

> Tiempo aproximado: 1–2 días de trámites (cuentas, fichas, revisión). Apple suele revisar en 24–48 h y Google entre unas horas y 7 días la primera vez.

---

## 0. Antes de empezar: lo que necesitas

| Qué | Coste | Para qué |
|---|---|---|
| Cuenta de **Google Play Console** | 25 $ (pago único) | Publicar en Android |
| Cuenta de **Apple Developer Program** | 99 $/año | Publicar en iOS |
| Un **Mac con Xcode** (o un servicio de compilación en la nube como Codemagic o Ionic Appflow) | — | Firmar y subir la app de iOS |
| Cuenta de **Google AdMob** | Gratis | Anuncios |
| Cuenta de **RevenueCat** | Gratis hasta 2.500 $/mes de ingresos | Compras dentro de la app en ambas tiendas |
| Un hosting para el **servidor online** (Render, Fly.io, Railway, un VPS...) | 0–7 $/mes al empezar | Partidas online, clubes y ranking |
| Una web (puede ser GitHub Pages) con la **política de privacidad** | Gratis | Obligatoria en ambas tiendas |

Datos de la app ya configurados en el proyecto (puedes cambiarlos en `app/capacitor.config.ts`):

- Nombre: **Diana Legends**
- Identificador (bundle id / package): **`com.asquir.dianalegends`** — debe ser único en las tiendas; si ya existiera, cámbialo antes de crear las fichas (en `capacitor.config.ts`, `android/app/build.gradle` → `applicationId` y en Xcode → *Bundle Identifier*).

---

## 1. Servidor online

El servidor está en `server/` y se despliega con Docker. Guarda los datos (cuentas, clubes) en un volumen.

### Opción A — Render.com (lo más fácil)
1. Sube el repositorio a GitHub (ya lo está).
2. En Render: *New → Web Service* → elige el repositorio → *Runtime: Docker* → *Dockerfile path*: `server/Dockerfile`, *Docker build context*: `.` (raíz).
3. Añade un **Disk** montado en `/data` (1 GB es suficiente) para que no se pierdan los datos.
4. Render te dará una URL como `https://diana-legends.onrender.com`. La URL del WebSocket será `wss://diana-legends.onrender.com`.
5. Comprueba que funciona abriendo `https://TU-URL/health` (debe responder `{"ok":true,...}`).

> El plan gratuito de Render "duerme" el servicio si no hay tráfico; para un juego publicado usa al menos el plan Starter para que el online responda siempre.

### Opción B — Cualquier VPS con Docker
```bash
docker build -f server/Dockerfile -t diana-server .
docker run -d --name diana -p 8080:8080 -v diana-data:/data --restart unless-stopped diana-server
```
Ponlo detrás de un proxy con HTTPS (Caddy, Nginx + Let's Encrypt) para tener `wss://`. **Las apps móviles exigen `wss://` (cifrado)**.

### Conectar la app
Pon la URL en `app/.env` (copia `app/.env.example`):
```
VITE_SERVER_URL=wss://diana-legends.onrender.com
```
o, si compilas con GitHub Actions, en *Settings → Secrets and variables → Actions → Variables* crea `VITE_SERVER_URL`.

---

## 2. AdMob (anuncios)

1. Entra en https://admob.google.com y crea una **app para Android** y otra **para iOS** ("Diana Legends").
2. En cada app crea 3 **bloques de anuncios**:
   - *Banner* (opcional; el juego apenas lo usa)
   - *Intersticial*
   - *Bonificado* (rewarded) — es el más importante: el juego lo usa para duplicar premios, cofres, ruleta, etc.
3. Copia los IDs:
   - **ID de app** (con `~`): ponlo en
     - Android: `app/android/app/src/main/res/values/strings.xml` → `admob_app_id`
     - iOS: `app/ios/App/App/Info.plist` → `GADApplicationIdentifier`
   - **IDs de bloques** (con `/`): en `app/.env` → `VITE_ADMOB_ANDROID_*` y `VITE_ADMOB_IOS_*`.
4. Pon `VITE_ADMOB_TESTING=false` **solo** en la versión que subas a la tienda. Mientras pruebas, deja `true`: hacer clic en tus propios anuncios reales puede bloquear tu cuenta de AdMob.
5. **Privacidad y mensajes** (AdMob → *Privacidad y mensajes*): crea un mensaje de consentimiento **GDPR** para Europa y uno de **IDFA/ATT** para iOS. El juego ya llama a estos formularios al arrancar y tiene un botón en Ajustes para cambiar el consentimiento.
6. **app-ads.txt**: AdMob te pedirá publicar un archivo `app-ads.txt` en la web del desarrollador que pongas en la ficha de la tienda. Sigue las instrucciones de AdMob (sin él se ganan menos ingresos).

Dónde aparecen los anuncios (ya programado):
- **Vídeos con recompensa** (el jugador elige verlos): duplicar monedas al ganar, recuperar la entrada al perder, cofre por anuncio (3 al día), −30 min a un cofre, tiradas extra de ruleta.
- **Intersticiales**: como mucho uno cada 2 partidas y 2 minutos, nunca en las 3 primeras partidas, y nunca para quien compre *Sin anuncios* o sea VIP.

---

## 3. Compras dentro de la app (RevenueCat)

Los identificadores de producto ya están definidos en `app/src/services/iap.ts`. Créalos **con el mismo ID** en las tiendas:

| ID | Tipo | Precio sugerido | Contenido |
|---|---|---|---|
| `gems_80` | Consumible | 0,99 € | 80 gemas |
| `gems_500` | Consumible | 4,99 € | 500 + 50 gemas |
| `gems_1200` | Consumible | 9,99 € | 1.200 + 200 gemas |
| `gems_2600` | Consumible | 19,99 € | 2.600 + 500 gemas |
| `gems_7000` | Consumible | 49,99 € | 7.000 + 1.500 gemas |
| `starter_pack` | No consumible | 2,99 € | Pack de Inicio (una vez, 72 h) |
| `remove_ads` | No consumible | 3,99 € | Sin anuncios intersticiales |
| `vip_month` | Consumible | 4,99 € | Club VIP 30 días + 300 gemas |
| `season_pass` | Consumible | 4,99 € | Pase Premium de la temporada actual |
| `pro_bundle` | Consumible | 14,99 € | Pack Leyenda |

> `vip_month` y `season_pass` están como consumibles (se compran de nuevo cada periodo) para simplificar. Si prefieres una **suscripción** auto-renovable para el VIP, créala como suscripción en las tiendas y en RevenueCat como *entitlement* "vip".

Pasos:
1. **Google Play Console** → tu app → *Monetizar → Productos → Productos de la aplicación*: crea cada ID. (Necesitas haber subido antes al menos una versión a una pista de prueba con el permiso de facturación, que el plugin ya añade.)
2. **App Store Connect** → tu app → *Funciones → Compras dentro de la app*: crea cada ID (consumible / no consumible). Rellena nombre, descripción y una captura de la tienda del juego.
3. **RevenueCat** (https://app.revenuecat.com): crea un proyecto, añade la app de Play Store (sube la *service account* JSON de Google Cloud que RevenueCat explica paso a paso) y la de App Store (clave *In-App Purchase Key* de App Store Connect).
4. Importa los productos en RevenueCat y copia las **claves públicas de API** de cada plataforma a `app/.env`:
   ```
   VITE_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx
   VITE_REVENUECAT_IOS_KEY=appl_xxxxxxxx
   ```
5. Prueba compras con **cuentas de prueba**: *License testers* en Google Play y *Sandbox testers* en App Store Connect.

> Importante: las gemas y monedas se guardan en el dispositivo. Para un juego con mucho dinero en juego, el siguiente paso recomendado es validar las compras en el servidor (webhooks de RevenueCat) y guardar el saldo en el servidor para evitar trampas.

---

## 4. Política de privacidad y términos

1. Edita `docs/PRIVACIDAD.md` y `docs/TERMINOS.md` (pon tu nombre/empresa, email y país).
2. Publícalos en una web pública (por ejemplo activa **GitHub Pages** en el repositorio y quedarán en `https://asquir.github.io/Dardos/docs/PRIVACIDAD`) o en tu propia web.
3. Pon las URLs en `app/.env` → `VITE_PRIVACY_URL` y `VITE_TERMS_URL` (aparecen en Ajustes) y en las fichas de las tiendas.

---

## 5. Compilar la versión final

1. Crea `app/.env` con todas las variables (ver `app/.env.example`).
2. Sube la versión en `app/android/app/build.gradle` (`versionCode` +1 y `versionName`) y en Xcode (*Version* y *Build*) en cada actualización.
3. Compila y sincroniza:
   ```bash
   npm install
   cd app
   npm run cap:sync
   ```

### Android (AAB para Google Play)
**Opción A — Android Studio:** `npx cap open android` → *Build → Generate Signed Bundle / APK → Android App Bundle* → crea una **keystore** nueva (¡guárdala y su contraseña en un sitio seguro! sin ella no podrás actualizar la app) → *release*. El archivo queda en `app/android/app/release/app-release.aab`.

**Opción B — GitHub Actions (sin instalar nada):**
1. Crea una keystore una vez (en cualquier ordenador con Java):
   ```bash
   keytool -genkey -v -keystore release.keystore -alias diana -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 release.keystore > keystore.txt
   ```
2. En GitHub → *Settings → Secrets and variables → Actions → Secrets* crea `ANDROID_KEYSTORE_BASE64` (contenido de keystore.txt), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`diana`) y `ANDROID_KEY_PASSWORD`.
3. Crea también las *Variables* `VITE_...` del paso anterior.
4. Haz push. En *Actions* descarga el artefacto **diana-legends-release-aab** (y el APK de prueba para instalar directamente en tu móvil).

> Para probar el APK de prueba en tu Android: descarga `diana-legends-debug-apk` desde Actions, pásalo al móvil y ábrelo (permite "instalar apps desconocidas").

### iOS (IPA para App Store)
Necesitas un Mac con Xcode 16 o superior (o un servicio en la nube como Codemagic):
1. `npx cap open ios`
2. En Xcode: selecciona el proyecto *App* → *Signing & Capabilities* → marca *Automatically manage signing* y elige tu *Team*. Añade la capacidad **In-App Purchase**.
3. Comprueba *Bundle Identifier* = `com.asquir.dianalegends`.
4. Selecciona *Any iOS Device (arm64)* → *Product → Archive* → *Distribute App → App Store Connect → Upload*.

---

## 6. Ficha en Google Play

1. Play Console → *Crear aplicación* → nombre "Diana Legends", juego, gratis.
2. **Ficha de Play Store**: textos de `docs/FICHA-TIENDA.md`, icono 512×512 (`app/assets/icon.png` reducido), gráfico destacado 1024×500 y capturas (`docs/capturas/`; puedes regenerarlas con `node scripts/store-screenshots.cjs`).
3. **Contenido de la aplicación** (todo obligatorio):
   - Política de privacidad: tu URL.
   - **Anuncios**: "Sí, contiene anuncios".
   - Acceso a la app: no requiere cuenta.
   - **Clasificación de contenido** (cuestionario IARC): juego de habilidad sin violencia; marca que hay **compras** y que hay **interacción entre usuarios** (chat de clubes) → normalmente PEGI 3/7 o 12 según las respuestas.
   - **Público objetivo**: elige **13 años o más** (o 16+). No lo dirijas a niños: los anuncios personalizados y los cofres no están permitidos en apps para menores.
   - **Seguridad de los datos**: declara identificadores del dispositivo (anuncios, AdMob), ID de usuario y nombre de jugador (online), historial de compras (RevenueCat), mensajes de chat (clubes). Datos cifrados en tránsito, el usuario puede pedir su borrado (botón *Borrar cuenta* en Ajustes).
   - **ID de publicidad**: "Sí, la app usa el ID de publicidad" (AdMob).
4. **Pruebas**: Google exige a las cuentas personales nuevas una **prueba cerrada con al menos 12 testers durante 14 días** antes de poder publicar en producción. Crea una pista de *Prueba cerrada*, sube el AAB e invita a 12+ amigos.
5. Después: *Producción → Crear versión* → sube el AAB → enviar a revisión.

## 7. Ficha en App Store

1. App Store Connect → *Mis apps → +* → Nueva app (iOS, nombre, idioma principal Español, bundle id, SKU `diana-legends`).
2. **Información**: categoría *Juegos → Deportes* (secundaria *Arcade*), textos de `docs/FICHA-TIENDA.md`, capturas de 6,7" (1290×2796, las de `docs/capturas/`) y 6,5"/5,5" si te las pide.
3. **Privacidad de la app**: declara *Identificadores (publicidad)*, *Datos de uso*, *Compras*, *Contenido del usuario (chat)*, *Identificador de usuario* — vinculados a "anuncios de terceros" y "funcionalidad de la app"; marca que se usan para **rastreo** si activas anuncios personalizados (por eso la app pide permiso ATT).
4. **Clasificación por edades**: responde el cuestionario (sin violencia; "Juegos de azar simulados: Ninguno" — los cofres no son apuestas con dinero real, pero marca que hay **compras dentro de la app**; con chat entre usuarios suele quedar en 12+).
5. **Compras dentro de la app**: asocia los productos a la versión.
6. Sube la build desde Xcode, selecciónala en la versión y *Enviar para revisión*.
7. En las *Notas para el revisor* explica: "El modo online requiere conexión. Los cofres muestran sus probabilidades al tocarlos (botón «Contenido y probabilidades») y antes de comprarlos en la Tienda. La cuenta se puede borrar en Ajustes → Borrar cuenta y datos".

---

## 8. Requisitos de las tiendas que el juego ya cumple

- ✅ **Probabilidades de los cofres visibles** antes de comprarlos (Apple 3.1.1 / Google "loot boxes").
- ✅ **Borrar cuenta y datos** dentro de la app (Apple 5.1.1(v)).
- ✅ **Restaurar compras** (Ajustes y Tienda).
- ✅ **Consentimiento** GDPR (UMP de Google) y **ATT** en iOS antes de anuncios personalizados.
- ✅ **Contenido de usuarios**: filtro de palabras ofensivas en nombres y chat, botón para **bloquear y denunciar** mensajes (Apple 1.2). Las denuncias se guardan en el servidor (`db.json` → `reports`).
- ✅ Los anuncios con recompensa siempre son opcionales y el juego es jugable sin pagar.
- ✅ Funciona sin conexión (excepto online, clubes y ranking).

⚠️ **Países con normas especiales sobre cajas de botín**: Bélgica (y en el futuro posiblemente otros) prohíbe vender cajas aleatorias por dinero real. Si publicas allí, en Play Console/App Store Connect puedes excluir ese país o desactivar la compra de cofres con gemas.

---

## 9. Después de publicar: hacer crecer el juego

- **Temporadas**: cada 30 días empieza una nueva automáticamente (ver `meta/progression.ts`). Cambia las recompensas exclusivas de cada temporada para dar motivos para comprar el pase.
- **Analítica**: añade Firebase Analytics o similar para medir retención (D1/D7/D30) y dónde abandonan los jugadores. Ajusta la economía (`meta/arenas.ts`, `meta/chests.ts`, `meta/catalog.ts`).
- **Eventos**: los desafíos diarios rotan solos; puedes añadir más en `CHALLENGES`.
- **Notificaciones push** (cofre listo, recompensa diaria): se pueden añadir con `@capacitor/local-notifications` sin servidor.
- **Escalar el servidor**: con miles de jugadores simultáneos, cambia `server/src/db.ts` por PostgreSQL/Redis manteniendo la misma interfaz.
