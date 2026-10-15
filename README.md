# 🎯 Diana Legends — Dardos 3D

Juego de dardos 3D realista para **iOS y Android** (y navegador), con partidas contra bots y online,
colección de dardos mejorables, cofres, arenas, clubes, pase de temporada, tutorial y monetización
con anuncios y compras.

| Inicio | Partida | Colección | Tienda | Eventos |
|---|---|---|---|---|
| ![](docs/capturas/1-inicio.png) | ![](docs/capturas/2-partida.png) | ![](docs/capturas/3-coleccion.png) | ![](docs/capturas/4-tienda.png) | ![](docs/capturas/5-eventos.png) |

## Qué incluye

**Jugabilidad**
- Diana de sisal con medidas oficiales, araña metálica 3D, números, desgaste y armario de madera con pizarras.
- Control táctil: **arrastra para apuntar**, mantén el dedo quieto para concentrarte (el círculo se encoge) y **desliza rápido hacia arriba** para lanzar. La fuerza y la dirección del gesto influyen en el tiro. Modo "Soltar (fácil)" para accesibilidad, ajuste de sensibilidad y modo zurdo.
- Física de vuelo, vibración al clavarse, rebotes en los alambres, polvo de sisal, resaltado del segmento, cámara que celebra los 180, público y flashes.
- Modos: **301 / 501** (doble para cerrar, legs), **Cricket**, **Alrededor del reloj**, práctica de cierres, lanzamiento libre, partida local de 2 a 4 jugadores, **online 1v1** y salas privadas.
- IA con 7 niveles de dificultad calibrados (de ~20 a ~100 de media) y tabla de cierres profesional; pista de cierre en pantalla.
- 7 arenas con escenarios propios: Pub de Barrio, Taberna del Puerto, Club Neón, Salón Dorado, Gran Arena, Campeonato Mundial y Olimpo de Leyendas.

**Progresión y enganche**
- Monedas, gemas, nivel con recompensas, copas y ascenso de arena.
- 52 piezas coleccionables (cuerpos, cañas, aletas) en 4 rarezas, con estadísticas (Precisión, Estabilidad, Control) y mejoras con cartas + monedas; vista 3D giratoria.
- Cofres con temporizador (4 huecos), cofre gratis cada 4 h, cofre por anuncio, apertura animada en 3D con cartas, **probabilidades visibles** (obligatorio en las tiendas).
- Misiones diarias, recompensa diaria de 7 días, ruleta de la suerte, desafío diario con estrellas, logros, torneo eliminatorio de 8, pase de temporada (gratis + premium) de 35 niveles.
- Editor de personaje 3D (piel, peinados, barba, gafas, gorros, ropa, dorsal), estilos de diana y emotes.
- Tutorial interactivo con entrenadora, guía del primer cofre y desbloqueo progresivo de funciones.

**Social y online** (servidor incluido en `server/`)
- Emparejamiento por copas, partidas arbitradas en el servidor, temporizador de turno, reconexión.
- Salas privadas con código para jugar con amigos, código de amigo, lista de amigos con estado.
- Clubes: crear/unirse, chat con filtro de palabras, bloquear y denunciar, miembros y victorias semanales.
- Clasificación mundial.

**Monetización**
- **AdMob**: vídeos con recompensa (duplicar premio, recuperar entrada, cofres, acelerar cofres, ruleta) e intersticiales con límite de frecuencia (nunca en las primeras partidas). Consentimiento GDPR (UMP) y ATT de iOS.
- **Compras (RevenueCat)**: packs de gemas, Pack de Inicio (72 h), Sin anuncios, Club VIP, Pase de Temporada, Pack Leyenda. Restaurar compras.

## Estructura

```
app/        App (Vite + TypeScript + Three.js + Preact) y proyectos nativos Capacitor (android/, ios/)
  src/engine/   Motor 3D: texturas procedurales, diana, dardos, arenas, cofres, avatar, renderizado
  src/game/     Controlador de partida, bots, online
  src/meta/     Catálogo, economía, cofres, progreso, perfil
  src/ui/       Interfaz (pantallas, modales, tutorial)
  src/services/ Audio procedural, anuncios, compras, red, hápticos, almacenamiento
server/     Servidor online (Node + WebSocket) con Dockerfile
shared/     Reglas, geometría de la diana, IA, checkouts y protocolo (compartido cliente/servidor)
tests/      Tests (vitest): reglas, IA y servidor
docs/       Guía de publicación, privacidad, términos, fichas de tienda y capturas
```

Todo el arte (texturas, modelos 3D, iconos) y el sonido se generan por código: no hay recursos con licencias de terceros.

## Desarrollo

Requisitos: Node 22.

```bash
npm install
npm run dev            # app en http://localhost:5173
npm run dev:server     # servidor online en ws://localhost:8080
npm test               # tests de reglas, IA y servidor
npm run typecheck
```

Para probar el online en local, abre ⚙️ Ajustes → *Servidor online* → `ws://localhost:8080`.
En el navegador, los anuncios y las compras se simulan con ventanas de prueba (sin cobros).

## Compilar las apps

```bash
cd app
npm run cap:sync       # compila la web y la copia a android/ e ios/
npx cap open android   # Android Studio → Run / Build > Generate Signed Bundle
npx cap open ios       # Xcode (macOS) → Product > Archive
```

Cada push a GitHub ejecuta `.github/workflows/build.yml`, que pasa los tests y genera un **APK de prueba**
descargable en *Actions → (ejecución) → Artifacts*, además de comprobar que iOS compila.

👉 **Guía completa para publicar en Google Play y App Store: [docs/PUBLICAR.md](docs/PUBLICAR.md)**
