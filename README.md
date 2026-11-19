# 🌱 Raíz Directa

**Del campo a tu negocio, sin desperdicio.**
Tablero de oferta relámpago para rescatar frutas y verduras locales en Michoacán. HackPony 2026 · Reto 03 Campo y Alimentos · *Cosecha Directa: Rescate de Perecederos Locales*.

## Arranque rápido (sin internet, sin instalar nada)

Requisito: **Node.js 22.5 o superior** (trae SQLite integrado). No hay dependencias de npm.

```bash
npm run demo     # crea la base de demostración y levanta el servidor
# o por separado:
npm run seed     # (re)crea data/raiz.db con datos ficticios de Michoacán
npm start        # http://localhost:3000  (PORT=xxxx para otro puerto)
npm test         # 37 pruebas automatizadas
```

Desde un celular en la misma red Wi-Fi: usa la dirección que imprime la consola (`http://192.168.x.x:3000`).

### Cuentas de demostración (contraseña `demo1234`)

| Rol | Teléfono | Quién |
|---|---|---|
| Productor | 4430000001 | Ramiro Hernández, Tarímbaro |
| Comprador | 4430000101 | Fonda Doña Lupe, Morelia |
| Transportista | 4430000201 | Raúl Pérez, Morelia (camioneta 1.5 t) |
| Administrador | 4430000999 | Administración |

En la pantalla “Entrar” hay botones de un toque para cada cuenta. Para probar WhatsApp con tu propio teléfono, cámbialo en **Perfil**.

## Fotos reales de productos

```
npm run fotos        # Windows PowerShell: npm.cmd run fotos
```
Descarga una sola vez (con internet) fotos reales de Wikimedia Commons a `public/img/productos/`, sólo con licencias libres (CC0, dominio público, CC BY, CC BY-SA; nunca NC/ND), y guarda autor y licencia en `creditos.json` (visibles en `#/creditos`). Después funcionan sin internet. Para cambiar una foto: bórrala y corre `npm run fotos papa`.

## Usar en varias computadoras y celulares al mismo tiempo

| Opción | Comando | Cuándo |
|---|---|---|
| **Enlace público https** (recomendado para el evento) | `npm run publico` (Windows: `npm.cmd run publico`) | Imprime un enlace `https://….trycloudflare.com` que funciona en cualquier celular o computadora, en cualquier red, con cámara y micrófono. La computadora que lo corre debe quedar encendida. El enlace cambia en cada arranque. |
| Misma red Wi-Fi | `npm start` | Los demás abren `http://IP-de-tu-compu:3000` (la terminal la muestra). En celular, cámara y dictado no funcionan sin https. |
| Servidor permanente | Render.com con `render.yaml` | Enlace https fijo; en el plan gratuito los datos vuelven a la demo al reiniciarse. |

Todos ven los mismos datos en tiempo real porque hay un solo servidor y una sola base de datos. En un equipo nuevo la base de demostración se crea sola al arrancar.

## Qué está implementado (demostrable en vivo)

| Requerimiento del reto | Dónde |
|---|---|
| Formulario express (producto, kg, precio de remate, horas de frescura) | `#/publicar` — 5 campos obligatorios, chips de un toque, dictado por voz (principal) y, como opción secundaria, una frase para completar o pegar el mensaje de WhatsApp, vista previa y cálculo en vivo, borrador automático, plantillas, “publicar de nuevo” |
| Feed público con temporizador regresivo y botón “Apartar” | `#/ofertas` — temporizador desde fecha de vencimiento **persistida** y hora del servidor; estados disponible / por vencer / agotado / vencido; filtros y orden |
| Cálculo automático del ahorro | Detalle de oferta: habitual, rescate, ahorro, % y **ahorro neto con costo de traslado** |
| Confirmación lista para recolección | `#/pedido/RD-0001` — folio, código de entrega de 6 dígitos, punto y horario, WhatsApp prellenado, “Cómo llegar” |

Además: reservas parciales con transacciones (sin sobreventa), ciclo de pedido controlado en servidor (apartado → confirmado → listo → recolectado / cancelado / vencido), liberación automática de apartados no recogidos (3 h de tolerancia), entrega confirmada sólo con el código del comprador, panel del productor (3 acciones grandes), panel del comprador, dashboard de impacto en vivo (con interruptor “sólo datos reales”), mapa Leaflet/OSM con respaldo en lista, panel de administración (reportes, moderación, suspensión), reportes de irregularidades, sugerencia de rebaja por reglas (el productor la autoriza), PWA instalable con consulta sin conexión marcada como desactualizada.

## Cuatro interfaces

| Rol | Funciones únicas |
|---|---|
| **Productor** | Publicar por voz/cámara/frase con sólo 5 datos (producto, kilos, **su precio**, estado y horas), varios productos en un dictado, vida útil por clima, precio SNIIM, confirmar pedidos, **dar de alta a su propio transportista** y asignarle las entregas a domicilio. |
| **Comercio** | Tablero con filtros, comparación con precio SNIIM, apartado parcial, calculadora de traslado, **pedir entrega a domicilio** cuando el productor la ofrece, código de entrega. |
| **Transportista** | Es **personal del productor** (lo registra el productor, no se registra solo). Ve sólo las entregas que su productor le asigna: a quién, dirección, ruta en mapa, “ya cargué” y captura del código del comercio al entregar. |
| **Administración** | Reportes con acciones (pausar oferta, suspender productor) y aviso al que reportó, ofertas, pedidos, entregas, usuarios, caché de precios SNIIM. |

El transporte es del propio productor: Raíz Directa no ofrece fletes de terceros ni cobra envíos.

## Precio automático (regla "tramos-v1")

El agricultor sólo dice **su precio por kilo** y **cuántas horas de frescura** tiene el producto. La app pone el precio de rescate y lo baja sola conforme pasan esas horas:

| Tiempo transcurrido de la frescura | Descuento sobre el precio del productor |
|---|---|
| 0–25 % | −20 % |
| 25–50 % | −30 % |
| 50–75 % | −40 % |
| 75–100 % | −50 % |

Redondeo a 50 centavos. El pedido conserva el precio vigente al momento de apartar. Los porcentajes son una **regla de la plataforma (decisión del equipo, ajustable en `public/js/shared/pricing.js`)**, no un dato de mercado.

## Precios reales del SNIIM

El servidor consulta la página de resultados de “Frutas y Hortalizas” del SNIIM (Secretaría de Economía) con el `ProductoId` de cada producto (tomado del mapa del sitio), prefiere el **Mercado de Abasto de Morelia** y, si no hay dato, usa la mediana de los mercados del día. Guarda el resultado 12 h. Si SNIIM no responde, muestra “sin dato” con enlace oficial: **nunca inventa precios**. El precio de referencia de una oferta sólo se marca “SNIIM” si coincide con el dato guardado.
> Limitación: desde el entorno de desarrollo no se pudo abrir la página de resultados del SNIIM, así que el lector se probó con una tabla de ejemplo con el formato esperado. Antes del evento, entra como admin → Precios SNIIM → “Actualizar todos ahora” con internet para verificarlo.

## Fotos

- **Cámara integrada** (botón principal) con visor y marco; galería como respaldo.
- **Formato único 4:3** (960×720, JPEG ~70 %): vertical u horizontal se recorta al centro; todas las tarjetas se ven iguales.
- Si no hay foto del productor, se muestra una **foto real de Wikimedia Commons** con licencia libre, marcada “referencia” (créditos en `#/creditos`). Sin internet se muestra el ícono.

## Asistente de Publicación por Voz

Botón **“Publicar hablando”** en `#/publicar`. Abre una conversación estilo WhatsApp:

- **Grabación como nota de voz:** mantener presionado 🎤 y soltar para enviar; deslizar a la izquierda para cancelar; o tocar una vez y luego ➤. Temporizador, onda animada y transcripción en vivo (Web Speech API, `es-MX`). Límite de 60 s por nota.
- **Extracción:** producto, cantidad y unidad (kilos, toneladas, “media tonelada”, cajas/rejas/costales con su peso), precio de rescate, precio habitual, tiempo (horas, días, semanas), estado, municipio, compra mínima y si el productor lo lleva. Entiende números con palabras (“ciento veinticinco”, “treinta y cinco”) y expresiones como “varos”, “ya mero se pasa”, “me sobraron”.
- **Conversión de unidades** sólo con datos suficientes: “10 cajas de 20 kilos a 300 la caja” → 200 kg a $15/kg. Si no dijo cuánto pesa la caja, lo **pregunta**.
- **Preguntas complementarias** para lo que falte, con respuestas rápidas (chips). Expresiones vagas (“hasta mañana”) no se convierten en horas por adivinanza: se preguntan.
- **Voz del asistente** (speechSynthesis) para preguntas y confirmación, con botón para silenciar.
- **Llena el formulario existente** (editable) y usa las mismas validaciones del servidor.
- **Confirmación obligatoria:** resumen con cálculo de descuento e ingresos potenciales + declaración de apto para consumo. Nada se publica sin “✅ Publicar”. El formulario manual también pasa por confirmación.
- **Alternativas manuales:** escribir en el mismo chat, frase para completar, pegar un mensaje de WhatsApp o el formulario. Sin soporte de dictado, el asistente funciona por texto; sin internet se avisa que el dictado no está disponible.
- **Privacidad:** aviso antes del primer uso del micrófono. El dictado lo hace el navegador (en Chrome se procesa en servidores de Google). Raíz Directa no graba ni guarda audio ni transcripciones; sólo guarda los datos confirmados y el método de captura (`voz`, `frase` o `formulario`).

## Vida útil estimada por clima

Al publicar, se consulta el pronóstico horario de **Open-Meteo** (gratuito para uso no comercial, sin llave, datos CC BY 4.0) para la **cabecera municipal** de recolección (no la ubicación exacta), con caché de 1 h. Con el producto y su estado se calcula una vida útil orientativa:

1. Perecibilidad por tasa de respiración (clasificación de Kader; guayaba no aparece en la fuente → supuesto “moderada”).
2. Horas base a 20 °C por clase y factor por estado declarado — **supuestos del prototipo**, por calibrar con productores e INIFAP.
3. Ajuste por la temperatura promedio prevista con la tabla típica Q10 de vida útil relativa.

El agricultor ve la estimación, el rango y avisos (horas ≥ 30 °C, aire seco) y decide si la usa. La estimación y el clima se guardan con la oferta; en el detalle y en el panel se muestra en vivo el tiempo transcurrido, el % de vida útil usada y la fase (Fresco → Usar pronto → Último momento). Sin internet, el agricultor elige “Fresco / Templado / Caluroso”. No certifica inocuidad.

## Arquitectura

Monolito modular, cero dependencias externas:

```
server.js                 arranque
src/app.js                rutas HTTP + permisos por rol
src/db.js                 esquema SQLite (migraciones, CHECK, FK, índices) y transacciones
src/auth.js               scrypt, sesiones (cookie HttpOnly/SameSite), límite de intentos
src/validate.js           validación del lado del servidor
src/services/lots.js      ofertas, estados, sugerencia de precio, privacidad de ubicación
src/services/orders.js    reservas atómicas, máquina de estados, vencimientos
src/services/stats.js     indicadores de impacto
public/js/shared/         cálculos, catálogo, intérprete de voz y vida útil (compartidos cliente/servidor)
public/js/voice/          asistente de voz (reconocimiento, síntesis, conversación)
public/js/weather.js      pronóstico Open-Meteo con caché
public/js/views/          vistas (SPA ligera sin framework)
public/sw.js              service worker (PWA)
scripts/seed.js           datos de demostración (marcados is_demo = 1)
test/                     pruebas con node:test sobre servidor y base reales
```

**Por qué Node + SQLite nativo y no Laravel:** el entorno del hackatón no tenía red para instalar paquetes; Node 22 trae HTTP, SQLite, criptografía y pruebas integrados. Resultado: se instala con un solo comando, arranca en < 1 s y no depende de internet durante la demo. Migrar a PostgreSQL es directo porque el SQL es estándar.

**Reglas de datos:** dinero en centavos (enteros), cantidades en gramos (enteros), fechas en epoch ms. Nada de flotantes en importes.

**Anti-sobreventa:** `BEGIN IMMEDIATE` + `UPDATE lots SET available_g = available_g - ? WHERE id = ? AND available_g >= ? AND expires_at > now AND status = 'activo'`. Si no afecta exactamente una fila, responde 409. Hay prueba con peticiones simultáneas y con dos conexiones independientes a la base.

**Seguridad:** contraseñas con scrypt + sal, sesiones con token aleatorio guardado como hash SHA-256, cookies HttpOnly/SameSite=Lax, JSON obligatorio en escrituras, CSP estricta sin scripts en línea, escape de HTML en todas las vistas, validación de imágenes por firma de bytes, protección contra path traversal, permisos verificados en cada endpoint, límite de intentos en login y en códigos de entrega. El código de entrega sólo lo ve el comprador; el punto exacto y el teléfono sólo se comparten con la contraparte.

## Limitaciones honestas

- WhatsApp se usa con enlaces `wa.me` y texto prellenado; **no** es WhatsApp Business API ni envía mensajes automáticos.
- No procesa pagos. El pago se acuerda directo (efectivo o transferencia).
- El precio habitual es declarado por el productor; no se valida contra SNIIM (trabajo futuro).
- Distancias en línea recta entre cabeceras municipales (coordenadas aproximadas); el “por carretera” usa un factor de 1.3 estimado.
- El temporizador es una estimación comercial y no certifica inocuidad.
- El mapa requiere internet (Leaflet/OSM); sin red se muestra la lista por municipio.
- El dictado depende del navegador: funciona en Chrome/Edge (Android y escritorio); Safari en iPhone tiene soporte limitado; Firefox no lo trae. En esos casos el asistente funciona por texto.
- Las pruebas del asistente usan un reconocedor simulado: falta probarlo con micrófono real en un teléfono antes del evento.
- La vida útil por clima es una estimación orientativa con supuestos declarados; Open-Meteo gratuito es sólo para uso no comercial (para operar comercialmente hay que contratar su plan o cambiar de proveedor).
- Falta aviso de privacidad formal (LFPDPPP) y revisión legal antes de operar con usuarios reales.
- Los datos de demostración (personas, negocios, teléfonos, precios) son ficticios.

## Seguimiento en vivo de entregas

Cuando el transportista toca **"Ya cargué"**, su teléfono comparte la ubicación (Geolocation API del navegador, sin costo) mientras va en camino. El comercio y el productor de ese pedido ven en el mapa dónde va, cuántos kilómetros faltan y la hora estimada de llegada. La ubicación sólo se comparte en estado "en camino", sólo la ven esas dos partes y se borra al entregar.

- Tiempo estimado = distancia en línea recta × 1.3 (rodeo de carretera) ÷ 35 km/h promedio. Es un **supuesto**, no navegación real.
- El comercio puede marcar su ubicación exacta de entrega; si no, se usa el centro del municipio.
- Limitación: los navegadores pausan la ubicación de una página web en segundo plano; el transportista debe dejar la pantalla abierta (la app pide mantenerla encendida).

## Precios de referencia regionales (archivo del equipo)

`src/data/referencia-precios.json` viene del archivo `sniim_nacional_completo.json` que entregó el equipo (30 variedades, 32 estados, 50 mercados). **No se presenta como precio oficial del SNIIM**: en los 1,500 registros el mínimo es exactamente 0.88× y el máximo 1.15× del precio frecuente, un patrón de datos generados o modelados, no de una consulta real. Por eso aparece como “Referencia regional del equipo (no verificada)”. Se usa para sugerir el precio del productor y las horas de frescura, para comparar en cada oferta y en la demo. La consulta en vivo al SNIIM sigue siendo lo único marcado como “SNIIM”.

## Cuatro interfaces

| Interfaz | Quién | Qué ve |
|---|---|---|
| Proveedor | “Crear cuenta → Vendo” | Su mercancía, pedidos, **Mi transporte**: código de equipo, alta de transportistas, **mapa en vivo de sus transportistas en ruta**. |
| Cliente | “Crear cuenta → Compro” | Todo lo que puede comprar (ofertas y mapa), sus pedidos y **dónde va cada pedido en camino**. |
| Transportista | “Crear cuenta → Transporto” + **código de equipo** del proveedor | Sólo las entregas que su proveedor le asigna: qué, a quién, a dónde, ruta, “Ya cargué” y código de entrega. |
| Administración | Cuenta creada en la base (no se registra) | Reportes, ofertas, pedidos, entregas, usuarios y precios. |

## Precios reales del SNIIM (scraper)

`scripts/sniim/scraper_sniim_real.py` extrae del servidor del SNIIM todos los precios de Frutas y Hortalizas de cada mercado de `#ddlDestino`, con retroceso automático al último día con corte publicado y validación de filas (descarta números del calendario y filas incoherentes). Cada mercado guarda `fecha_corte_sniim` y `url_consulta`; si no cotizó queda `productos: []` y `sin_cotizacion_hoy: true`.

```
pip install requests beautifulsoup4
python scripts/sniim/scraper_sniim_real.py          # genera sniim_real_verificado.json
copy sniim_real_verificado.json src\data\           # (Windows) para que la app lo use
```

Con ese archivo en `src/data/`, la app muestra “SNIIM real · corte AAAA-MM-DD” con enlace a la consulta. `scripts/sniim/sniimService.js` es el módulo para React (`catalogoSNIIM`, `obtenerPrecioRealSNIIM(productoId, estado)`). El script se escribió sin acceso de red al SNIIM: la lectura de tablas está probada con ejemplos, pero la primera corrida real hay que revisarla.

## Estados y municipios reales (INEGI)

`npm run municipios` (en Windows `npm.cmd run municipios`) descarga del INEGI (Catálogo Único de Claves Geoestadísticas, servicio `wscatgeo`) los 32 estados y sus ~2,478 municipios con las coordenadas reales de cada cabecera municipal, y los guarda en `src/data/municipios-inegi.json`. Con ese archivo:

- Registro, perfil, publicar y entrega a domicilio piden **Estado → Municipio** con el catálogo completo.
- Los municipios base (Morelia, Uruapan, Guadalajara…) toman las coordenadas reales del INEGI.
- La demo agrega productores en municipios reales (Tancítaro, Zapopan, Atlixco, Tapachula, Fresnillo…).

Sin el archivo, la app funciona con la lista base de ciudades.
