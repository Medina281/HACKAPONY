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
npm test         # 25 pruebas automatizadas
```

Desde un celular en la misma red Wi-Fi: usa la dirección que imprime la consola (`http://192.168.x.x:3000`).

### Cuentas de demostración (contraseña `demo1234`)

| Rol | Teléfono | Quién |
|---|---|---|
| Productor | 4430000001 | Ramiro Hernández, Tarímbaro |
| Comprador | 4430000101 | Fonda Doña Lupe, Morelia |
| Administrador | 4430000999 | Administración |

En la pantalla “Entrar” hay botones de un toque para cada cuenta. Para probar WhatsApp con tu propio teléfono, cámbialo en **Perfil**.

## Qué está implementado (demostrable en vivo)

| Requerimiento del reto | Dónde |
|---|---|
| Formulario express (producto, kg, precio de remate, horas de frescura) | `#/publicar` — 5 campos obligatorios, chips de un toque, dictado por voz (principal) y, como opción secundaria, una frase para completar o pegar el mensaje de WhatsApp, vista previa y cálculo en vivo, borrador automático, plantillas, “publicar de nuevo” |
| Feed público con temporizador regresivo y botón “Apartar” | `#/ofertas` — temporizador desde fecha de vencimiento **persistida** y hora del servidor; estados disponible / por vencer / agotado / vencido; filtros y orden |
| Cálculo automático del ahorro | Detalle de oferta: habitual, rescate, ahorro, % y **ahorro neto con costo de traslado** |
| Confirmación lista para recolección | `#/pedido/RD-0001` — folio, código de entrega de 6 dígitos, punto y horario, WhatsApp prellenado, “Cómo llegar” |

Además: reservas parciales con transacciones (sin sobreventa), ciclo de pedido controlado en servidor (apartado → confirmado → listo → recolectado / cancelado / vencido), liberación automática de apartados no recogidos (3 h de tolerancia), entrega confirmada sólo con el código del comprador, panel del productor (3 acciones grandes), panel del comprador, dashboard de impacto en vivo (con interruptor “sólo datos reales”), mapa Leaflet/OSM con respaldo en lista, panel de administración (reportes, moderación, suspensión), reportes de irregularidades, sugerencia de rebaja por reglas (el productor la autoriza), PWA instalable con consulta sin conexión marcada como desactualizada.

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
