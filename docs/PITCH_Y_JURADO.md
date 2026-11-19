# Raíz Directa — Pitch, demo y preparación para el jurado

> Convención: **[Dato]** = fuente verificable · **[Estimación]** = supuesto razonado a validar · **[Hipótesis]** = por comprobar con usuarios · **[Simulado]** = datos de demostración.

## 1. Datos de contexto (con fuente)

- **[Dato]** Banco Mundial (2017), *Pérdidas y desperdicios de alimentos en México*: ~20.4 millones de toneladas al año, ~34% de lo producido para consumo humano, costo estimado de 491 mil millones de pesos (~2.5% del PIB). Muestra de 79 productos. Es una estimación de 2017, no una medición reciente.
- **[Dato]** El Índice de Desperdicio de Alimentos 2024 del PNUMA sitúa a México en más de 13 millones de toneladas, pero sólo cubre comercio, servicios de alimentos y hogares, así que no es comparable con la cifra del Banco Mundial (citado por The Food Tech).
- **[Dato]** Michoacán produjo alrededor de 2 millones de toneladas de aguacate en 2025, ~74% del volumen nacional (DGSIAP, vía UnoTV). SADER Michoacán reporta el primer lugar nacional en aguacate y fresa, entre otros cultivos.
- **[Hipótesis]** Una parte de esa merma ocurre porque al lote le faltan *horas* (retraso, comprador que no llegó), no calidad. Hay que validarlo con 10–15 entrevistas a productores de Tarímbaro, Cuitzeo y Zinapécuaro y a comercios de Morelia. **No se han hecho entrevistas; no hay que presentar resultados.**

## 2. Guion de exposición general (5 min)

| Tiempo | Contenido |
|---|---|
| 0:00–0:45 | **Problema.** “Don Ramiro tiene 100 kg de jitomate maduro. Su comprador no llegó. Mañana valen cero.” Se cita la cifra del Banco Mundial con su año. |
| 0:45–1:30 | **Usuarios.** Productores y distribuidores pequeños y medianos que ya venden por WhatsApp; fondas, fruterías, juguerías y comedores que compran a diario y cuidan cada peso. |
| 1:30–2:15 | **Propuesta.** Una salida rápida *adicional*, no reemplaza la central ni al intermediario. Publicas en menos de 1 minuto y el comercio cercano aparta al instante. Pago directo y coordinación por WhatsApp. |
| 2:15–4:00 | **Demo en vivo** (ver §4). |
| 4:00–4:40 | **Viabilidad.** Piloto gratuito Morelia + 30 km; costos bajos (§6); ingresos futuros por suscripción de comercios y herramientas para distribuidores, nunca cobrando antes de demostrar valor. |
| 4:40–5:00 | **Impacto medible.** “Sólo contamos como rescatado lo que se entregó con código. Hoy el tablero muestra eso, en vivo.” |

## 3. Guion técnico (5 min)

1. **Arquitectura** (40 s): monolito modular en Node 22 sin dependencias; SQLite nativo; SPA ligera + PWA. Por qué: sin red en el entorno, instalación de un comando, demo estable.
2. **Base de datos** (40 s): 11 tablas con FK, CHECK (`rescate < habitual`, `0 ≤ disponible ≤ total`), índices. Centavos y gramos enteros.
3. **Reservas e inventario** (60 s): mostrar `src/services/orders.js` → `BEGIN IMMEDIATE` + UPDATE condicional. Explicar el 409.
4. **Temporizadores** (30 s): `expires_at` persistido; el cliente corrige con `server_now`; al llegar a cero se desactiva el botón y el servidor también rechaza.
5. **Estados del pedido** (30 s): máquina de transiciones validada en servidor; vencimiento automático con 3 h de tolerancia libera inventario.
6. **Seguridad** (40 s): scrypt, sesiones con hash, CSP, permisos por endpoint, código de entrega sólo para el comprador, ubicación exacta oculta.
7. **Pruebas** (40 s): ejecutar `npm test` en vivo → 12/12 (incluye sobreventa simultánea y persistencia tras reinicio).
8. **Navegación completa** (40 s): mapa, panel de administración, modo sin conexión.

## 4. Demo en vivo paso a paso (~2 min)

Preparación: `npm run demo`, dos navegadores (o celular + laptop), el dashboard en “Sólo reales” mostrando ceros.

1. **Productor** (4430000001) → *Publicar producto* → en el cuadro de voz: “Tengo 100 kilos de jitomate a 12 pesos el kilo, normalmente a 25, me quedan 24 horas” → *Llenar* → marcar la declaración → *Publicar*. La pantalla muestra los segundos que tardó.
2. **Comprador** (4430000101) → Ofertas → Jitomate → 20 kg → el sistema muestra $500 / $240 / ahorro $260 / 52% → abrir “¿Me conviene por el traslado?” → *Apartar*.
3. Confirmación **RD-00xx** con código de 6 dígitos y botón de WhatsApp con el mensaje prellenado. Volver a la oferta: **80 kg disponibles**.
4. **Productor**: aparece 🔔 → *Revisar pedidos* → Confirmar → Listo → captura un código equivocado (se rechaza) y luego el correcto → **Recolectado**.
5. **Impacto → Sólo reales**: 20 kg rescatados · $240 para el productor · $260 de ahorro.
6. (Si sobra tiempo) Intentar apartar 999 kg → “Sólo quedan 80 kg”.

**Variante con el asistente de voz (diferenciador, ~40 s):** *Publicar hablando* → mantener 🎤 y decir “Tengo cien kilos de jitomate a doce pesos el kilo, normalmente a veinticinco, me quedan hasta mañana” → el asistente anota los datos, pregunta el estado y, como “hasta mañana” no es un número, pregunta las horas ofreciendo la estimación por clima → resumen → marcar declaración → ✅ Publicar. Ensayarlo antes en el teléfono del evento con Chrome, con internet y con el permiso del micrófono ya concedido.

Respaldo: si falla el Wi-Fi, todo corre en `localhost`; sólo el mapa necesita internet y tiene lista de respaldo. Llevar capturas de pantalla y el `.zip` en USB.

## 5. Preguntas del jurado

**¿Por qué usaría esto en lugar de WhatsApp?** No lo reemplaza: lo usa. WhatsApp no tiene inventario compartido, temporizador, control de apartados ni cálculo de ahorro; en un grupo, tres personas dicen “yo me lo llevo” por los mismos kilos. Aquí el inventario se descuenta solo y luego coordinan por WhatsApp con el mensaje ya escrito.

**¿Qué lo diferencia de Facebook Marketplace?** Está hecho para lotes B2B que se echan a perder en horas: urgencia visible, apartado parcial con folio, sin sobreventa, privacidad de ubicación, código de entrega, comercios identificados y métricas de rescate. Marketplace es para artículos sueltos, sin inventario ni vencimiento.

**¿Cómo competirían con los intermediarios?** No competimos: atendemos lo que el intermediario *no se llevó*. El mismo intermediario o distribuidor puede publicar sus excedentes.

**¿Cómo conseguirán los primeros usuarios?** [Plan] Empezar por el lado del comprador en Morelia (fondas y fruterías del centro y alrededores de mercados municipales), porque traen la demanda; luego invitar productores de Tarímbaro, Cuitzeo y Zinapécuaro, publicando *por* ellos al principio a partir de un mensaje de WhatsApp. Compartir ofertas en grupos con el botón integrado. El riesgo de poca oferta inicial es real (ver §7).

**¿Cómo funciona sin conexión estable?** Es una PWA ligera (sin fuentes externas, fotos reducidas en el teléfono, mapa sólo bajo demanda). Sin señal se pueden consultar las ofertas guardadas, marcadas como desactualizadas, y el formulario guarda borrador. Apartar y publicar **requieren** confirmación del servidor; nunca se simula un apartado sin conexión.

**¿Quién se encarga del transporte?** Transportistas independientes registrados toman los fletes que pide el comercio; la entrega se verifica con dos códigos (recolección y entrega). No ofrecemos flotilla propia. Antes: El comprador recoge, o el productor si marcó “puedo llevarlo” (costo a acordar). No prometemos logística propia. La calculadora de ahorro neto ayuda a decidir si conviene el viaje.

**¿Y si el alimento no es apto para consumo?** No existe la opción “no apto” para publicar; hay una declaración obligatoria y estados declarados (excedente, imperfección, maduro, próximo a perder valor). Al recoger, el comprador puede cancelar con “no corresponde”: se abre un reporte, el inventario no se reactiva y la oferta se pausa para revisión. El temporizador no certifica inocuidad y así se indica.

**¿Cómo garantizan que no haya sobreventas?** Transacción con candado de escritura y UPDATE condicional; prueba automatizada con peticiones simultáneas y con dos conexiones a la base. En vivo se puede ejecutar `npm test`.

**¿Qué pasa si el comprador nunca llega?** El pedido tiene hora acordada + 3 h de tolerancia; después pasa a “vencido” solo y los kilos regresan a la oferta si sigue vigente. El productor también puede cancelar con “no se presentó”. Futuro: reputación por porcentaje de pedidos recogidos.

**¿Cómo obtendrán ingresos?** Publicar gratis siempre. [Estimación/plan] Después de demostrar valor: suscripción opcional para comercios (alertas de producto, compras recurrentes), herramientas para distribuidores (multiusuario, reportes), comisiones sólo cuando exista pago procesado de verdad, convenios con municipios o programas de abasto. No dependemos de subsidios para operar.

**¿Cuánto cuesta implementar?** Ver §6. Para un piloto: dominio, un servidor pequeño y tiempo de soporte; todo lo demás (mapas OSM, WhatsApp por enlace) no tiene costo por uso.

**¿Cómo medirán realmente el impacto?** Kilos con entrega confirmada por código, ingresos del productor y ahorro del comercio, ya en el dashboard. También medimos lo que **no** funcionó: kilos que vencieron sin venderse y pedidos cancelados o vencidos. No mostramos CO₂ porque no tenemos factores con fuente verificable.

**¿Por qué es pertinente para México?** Usa lo que ya existe: celular, WhatsApp, efectivo o transferencia, venta de proximidad. Michoacán concentra producción perecedera de alto valor y tiene una red densa de fondas y fruterías urbanas.

**¿Cómo escalaría a otros estados?** Catálogo de municipios y productos configurable, base de datos estándar (migrable a PostgreSQL), sin dependencias de terceros. Se replica por regiones con un “operador local” que active a la oferta.

**¿Por qué no usan IA para entender la voz?** Usamos el reconocimiento de voz gratuito del navegador y un intérprete por reglas, auditable y probado con 25 pruebas. Sin costos por uso y sin inventar datos: lo que no entiende, lo pregunta.

**¿Qué tan confiable es la vida útil por clima?** Es orientativa: combina la perecibilidad por tasa de respiración (Kader), el estado declarado y la temperatura prevista de Open-Meteo con la regla Q10. Las horas base son supuestos que hay que calibrar con productores; por eso es una sugerencia y la decisión es del agricultor.

**¿Qué está implementado y qué es futuro?** Implementado: todo lo de la tabla del README, probado. Futuro: validar precios con SNIIM, notificaciones por SMS/WhatsApp Business, reputación, pagos integrados, aviso de privacidad formal, distancias reales por carretera.

## 6. Costos para un piloto (todas son estimaciones por confirmar)

| Concepto | Supuesto | Tipo |
|---|---|---|
| Dominio .mx | Pago anual a un registrador | [Estimación] cotizar |
| Hospedaje | 1 VPS pequeño (1–2 GB RAM) basta: la app usa una sola instancia con SQLite | [Estimación] cotizar |
| Base de datos | SQLite en el mismo servidor (sin costo adicional); PostgreSQL administrado sólo al crecer | [Dato técnico] |
| Almacenamiento | Fotos reducidas en el teléfono a ~100 KB | [Estimación] |
| Mensajería | Enlaces wa.me: sin costo. WhatsApp Business API tendría costo por conversación | [Dato técnico] / cotizar |
| Mapas | Teselas de OpenStreetMap (sujeto a su política de uso; para alto tráfico usar un proveedor) | [Dato técnico] |
| Soporte y adquisición | Principal costo real: tiempo de personas visitando comercios y productores | [Estimación] |

## 7. Riesgos operativos y respuesta

| Situación | Respuesta en el producto | Estado |
|---|---|---|
| El agricultor pierde conexión | Borrador local; publica al recuperar señal; consulta sin conexión marcada | Implementado |
| Comprador reserva y no llega | Vencimiento automático + liberación; cancelación “no se presentó” | Implementado |
| Dos usuarios reservan lo mismo | Transacción + 409 | Implementado y probado |
| El lote vence durante la operación | El servidor rechaza; el botón se desactiva al llegar a cero | Implementado y probado |
| El producto cambia antes de la entrega | Cancelación “no corresponde” → reporte + pausa | Implementado |
| Precio habitual incorrecto | Etiquetado “declarado”; reporte “precio engañoso” | Implementado (validación SNIIM: futuro) |
| El productor cancela | Cancelación con motivo; aviso al comprador | Implementado |
| La distancia sube los costos | Advertencia > 40 km y calculadora de ahorro neto | Implementado |
| El comprador quiere menos | Apartado parcial con mínimo configurable | Implementado |
| Sólo usa WhatsApp | Dictado/pegado de mensaje → formulario; compartir por WhatsApp | Implementado (bot: futuro) |
| No tiene fotos | Foto opcional; ícono del producto | Implementado |
| Se vendió por el canal tradicional | “Vendí parte por otro lado” reduce inventario; pausar/retirar | Implementado |
| Poca oferta las primeras semanas | Arranque con comercios en Morelia, publicación asistida por el equipo | Plan |
| Publicaciones falsas | Registro con teléfono, reportes, moderación y suspensión por admin | Implementado (verificación de identidad: futuro) |

## 8. Auditoría final

### Como agricultor
- ¿Lo uso sin conocimientos técnicos? Tres botones grandes; 5 datos; puedo dictarlo. **Sí, con la salvedad** de que crear la cuenta pide contraseña (mejora futura: acceso por código SMS).
- ¿Cambia mi rutina? No: sigo vendiendo a mis compradores y uso WhatsApp para coordinar.
- ¿Compensa el esfuerzo? Publicar tomó ~30–60 s en la prueba; el panel muestra lo recuperado.

### Como comprador comercial
- Veo precio, descuento, kilos, estado declarado, municipio, distancia y temporizador; puedo filtrar y ordenar.
- Sé si me conviene con el ahorro neto tras el traslado.
- Coordino con un toque de WhatsApp y tengo folio + código.

### Como jurado (autoevaluación con evidencia; no es una calificación oficial)

| Criterio | Máx | Estimado | Evidencia | Qué podría restar |
|---|---|---|---|---|
| Ejecución y estabilidad | 10 | 9 | 12/12 pruebas; flujo E2E en navegador sin errores de consola (salvo 400 intencionales y mapa sin red) | Wi-Fi del evento |
| Flujo principal del MVP | 15 | 14 | Escenario completo 100 kg → 20 kg → $500/$240/$260/52% → 80 kg → entregado → dashboard | Demo apresurada |
| Funcionalidades esenciales | 10 | 9 | 4 requerimientos + parcial, cancelación, vencimiento, código, mapa, admin | Mapa depende de internet |
| Lógica y manejo de datos | 7 | 7 | Enteros, CHECK/FK, transacciones, máquina de estados | — |
| Integración y respuesta | 3 | 2 | WhatsApp por enlaces, voz del navegador, PWA | Sin API oficial de WhatsApp |
| Comprensión del problema | 6 | 5 | Fuentes citadas, distinción tiempo vs. calidad | Sin entrevistas reales |
| Pertinencia en México | 8 | 7 | WhatsApp, efectivo, municipios, privacidad | Validación de campo pendiente |
| Beneficio al usuario | 6 | 5 | Ingreso recuperado y ahorro medidos | Sin piloto |
| Viabilidad | 5 | 3 | Costos bajos, modelo gradual | Costos por cotizar; arranque con poca oferta |
| UX/UI (15) | 15 | 12–13 | Mobile-first, botones grandes, lenguaje cotidiano, estados claros | Registro con contraseña; probar con usuarios reales |
| Pitch (15) | 15 | depende del ensayo | Guion y demo cronometrada | Exceder tiempos resta puntos |

**Correcciones de mayor impacto si queda tiempo:** (1) ensayar la demo dos veces con cronómetro; (2) conseguir 2–3 conversaciones reales con una fonda y un productor y citarlas con honestidad; (3) cotizar dominio y VPS para reemplazar estimaciones; (4) poner tu número real en el perfil del productor demo para que el WhatsApp abra en vivo.
