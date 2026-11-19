#!/usr/bin/env python3
"""
scraper_sniim_real.py — Precios REALES de Frutas y Hortalizas del SNIIM (Secretaría de Economía).

Qué hace
  1. Abre el formulario oficial ConsultaFrutasYHortalizas.aspx y lee las opciones de #ddlDestino
     (ignora #ddlDestinoInfEsp y #ddlDestinoMensual).
  2. Para cada mercado destino consulta la página de resultados con Producto = Todos (-1),
     Origen = Todos (-1) y Precios por = Kilogramo calculado (2).
  3. Si hoy aún no hay corte publicado, retrocede día por día (hasta --dias-atras) al último día con registros.
  4. Sólo acepta filas cuyo producto es texto real (descarta los números del calendario 1–31 y celdas vacías)
     y cuyos precios son números positivos con mín ≤ frecuente ≤ máx.
  5. Guarda sniim_real_verificado.json con fecha_corte_sniim y url_consulta de CADA mercado para auditoría.
     Un mercado sin cotización queda con productos: [] y sin_cotizacion_hoy: true. NUNCA rellena precios.

Uso (en tu computadora, con internet):
  pip install requests beautifulsoup4
  python scraper_sniim_real.py                       # todos los mercados
  python scraper_sniim_real.py --solo Michoacán      # sólo destinos cuyo nombre contenga ese texto
  python scraper_sniim_real.py --playwright          # usa un navegador real si el servidor rechaza requests
                                                     #   (pip install playwright && playwright install chromium)
Luego copia el JSON a  src/data/sniim_real_verificado.json  para que Raíz Directa lo use.

Nota honesta: este script se escribió sin acceso de red al SNIIM. Los parámetros de la página de resultados
son los mismos que ya usa el conector del proyecto (src/services/market.js). Revisa la salida de consola:
si algún mercado devuelve 0 filas en todos los días, abre su url_consulta en el navegador para confirmar.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import unicodedata
from urllib.parse import urlencode

BASE = "https://www.economia-sniim.gob.mx/nuevo/Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/"
FORM_URL = BASE + "ConsultaFrutasYHortalizas.aspx"
RESULTS_URL = BASE + "ResultadosConsultaFechaFrutasYHortalizas.aspx"
UA = "RaizDirecta/1.0 (prototipo HackPony 2026; https://github.com/Medina281/HACKAPONY) python-requests"
PAUSA_S = 1.2  # ser amables con el servidor público


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def num(s: str) -> float | None:
    s = (s or "").replace("$", "").replace(",", "").strip()
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


ES_PRODUCTO = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}")
SOLO_NUMERO = re.compile(r"^\s*\d{1,2}\s*$")


def producto_valido(nombre: str) -> bool:
    """Texto alfabético real del catálogo (ej. 'Aguacate Hass - Primera'); descarta días del calendario."""
    if not nombre or SOLO_NUMERO.match(nombre):
        return False
    if re.search(r"\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b", norm(nombre)):
        return False
    return bool(ES_PRODUCTO.search(nombre))


# ---------------------------------------------------------------- red (requests)
def sesion():
    import requests

    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9"})
    return s


def destinos_requests(s) -> list[dict]:
    from bs4 import BeautifulSoup

    r = s.get(FORM_URL, timeout=40)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    sel = soup.select_one("select#ddlDestino")
    if not sel:
        raise RuntimeError("No se encontró #ddlDestino en el formulario (¿cambió la página?)")
    out = []
    for op in sel.select("option"):
        v, t = (op.get("value") or "").strip(), op.get_text(" ", strip=True)
        if not v or v in ("-1", "0") or not t or norm(t) in ("todos", "seleccione", "-- seleccione --"):
            continue
        out.append({"id": v, "texto": t})
    return out


def url_resultados(destino: dict, fecha: dt.date) -> str:
    d = fecha.strftime("%d/%m/%Y")
    q = {
        "fechaInicio": d, "fechaFinal": d, "ProductoId": "-1", "OrigenId": "-1", "Origen": "Todos",
        "DestinoId": destino["id"], "Destino": destino["texto"], "PreciosPorId": "2", "RegistrosPorPagina": "1000",
    }
    return RESULTS_URL + "?" + urlencode(q)


# ---------------------------------------------------------------- lectura de la tabla
def leer_tabla(html: str) -> list[dict]:
    """Localiza las columnas por su encabezado. Soporta tablas con columna 'Producto' o con filas-título de producto."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    filas = []
    for tabla in soup.find_all("table"):
        rows = [[c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])] for tr in tabla.find_all("tr")]
        hi = next((i for i, r in enumerate(rows) if any("frec" in norm(c) for c in r) and any(re.search(r"\bmin", norm(c)) for c in r)), None)
        if hi is None:
            continue
        h = [norm(c) for c in rows[hi]]

        def col(pat):
            return next((i for i, c in enumerate(h) if re.search(pat, c)), -1)

        ix = {"fecha": col(r"fecha"), "producto": col(r"producto"), "pres": col(r"presentac"), "origen": col(r"origen"),
              "min": col(r"\bmin"), "max": col(r"\bmax"), "frec": col(r"frec")}
        actual = None
        for r in rows[hi + 1:]:
            celdas = [c for c in r if c]
            # fila-título de producto (una sola celda con texto)
            if len(celdas) == 1 and producto_valido(celdas[0]) and num(celdas[0]) is None:
                actual = celdas[0]
                continue
            if len(r) < max(ix["min"], ix["max"], ix["frec"]) + 1:
                continue
            nombre = r[ix["producto"]] if ix["producto"] >= 0 else actual
            mn, mx, fr = num(r[ix["min"]]), num(r[ix["max"]]), num(r[ix["frec"]])
            if not nombre or not producto_valido(nombre) or fr is None:
                continue
            if mn is not None and mx is not None and not (mn <= fr <= mx):
                continue  # fila incoherente: no se usa
            filas.append({
                "producto": nombre.strip(),
                "presentacion": r[ix["pres"]].strip() if ix["pres"] >= 0 else "",
                "origen": r[ix["origen"]].strip() if ix["origen"] >= 0 else "",
                "precio_min_kg": mn, "precio_max_kg": mx, "precio_frecuente_kg": fr,
            })
    return filas


# ---------------------------------------------------------------- navegador real (opcional)
def con_playwright(destinos_filtro: str | None, dias: int) -> list[dict]:
    from playwright.sync_api import sync_playwright

    out = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(user_agent=UA)
        pg.goto(FORM_URL, wait_until="networkidle")
        opciones = pg.eval_on_selector_all("select#ddlDestino option", "els => els.map(o => ({id: o.value, texto: o.textContent.trim()}))")
        opciones = [o for o in opciones if o["id"] not in ("", "-1", "0")]
        if destinos_filtro:
            opciones = [o for o in opciones if norm(destinos_filtro) in norm(o["texto"])]
        for o in opciones:
            out.append(consultar_destino(lambda url: (pg.goto(url, wait_until="networkidle"), pg.content())[1], o, dias))
            time.sleep(PAUSA_S)
        br.close()
    return out


# ---------------------------------------------------------------- consulta por destino con retroceso de fecha
def consultar_destino(get_html, destino: dict, dias: int) -> dict:
    estado, _, mercado = destino["texto"].partition(":")
    hoy = dt.date.today()
    ultimo_url = None
    for k in range(dias + 1):
        f = hoy - dt.timedelta(days=k)
        if f.weekday() == 6:  # domingo: normalmente no hay corte
            continue
        url = url_resultados(destino, f)
        ultimo_url = url
        try:
            filas = leer_tabla(get_html(url))
        except Exception as e:  # noqa: BLE001
            print(f"   ! {destino['texto']} {f}: {e}", file=sys.stderr)
            filas = []
        if filas:
            return {"estado": estado.strip() if mercado else "", "mercado": (mercado or estado).strip(), "destino_id": destino["id"],
                    "fecha_corte_sniim": f.isoformat(), "url_consulta": url, "sin_cotizacion_hoy": k > 0,
                    "dias_atras": k, "productos": filas}
        time.sleep(PAUSA_S)
    return {"estado": estado.strip() if mercado else "", "mercado": (mercado or estado).strip(), "destino_id": destino["id"],
            "fecha_corte_sniim": None, "url_consulta": ultimo_url, "sin_cotizacion_hoy": True, "dias_atras": None, "productos": []}


def main():
    ap = argparse.ArgumentParser(description="Extrae precios reales del SNIIM (Frutas y Hortalizas)")
    ap.add_argument("--solo", help="sólo destinos cuyo nombre contenga este texto (ej. Michoacán)")
    ap.add_argument("--dias-atras", type=int, default=7, help="cuántos días retroceder si hoy no hay corte")
    ap.add_argument("--playwright", action="store_true", help="usar navegador real (Playwright)")
    ap.add_argument("--salida", default="sniim_real_verificado.json")
    a = ap.parse_args()

    if a.playwright:
        mercados = con_playwright(a.solo, a.dias_atras)
    else:
        s = sesion()
        destinos = destinos_requests(s)
        if a.solo:
            destinos = [d for d in destinos if norm(a.solo) in norm(d["texto"])]
        print(f"{len(destinos)} mercados destino en #ddlDestino")
        mercados = []
        for i, d in enumerate(destinos, 1):
            print(f"[{i}/{len(destinos)}] {d['texto']}")
            mercados.append(consultar_destino(lambda url: s.get(url, timeout=60).text, d, a.dias_atras))
            time.sleep(PAUSA_S)

    resumen = {}
    for m in mercados:
        e = m["estado"] or "(sin estado)"
        resumen.setdefault(e, {"mercados": 0, "registros": 0, "sin_cotizacion": 0})
        resumen[e]["mercados"] += 1
        resumen[e]["registros"] += len(m["productos"])
        resumen[e]["sin_cotizacion"] += 1 if not m["productos"] else 0

    salida = {
        "fuente": "SNIIM — Secretaría de Economía. Consulta de Frutas y Hortalizas, precios por kilogramo calculado.",
        "url_formulario": FORM_URL,
        "generado_en": dt.datetime.now().isoformat(timespec="seconds"),
        "verificacion": "extraido_del_servidor_sniim",
        "total_registros": sum(len(m["productos"]) for m in mercados),
        "resumen_por_estado": resumen,
        "mercados": mercados,
    }
    with open(a.salida, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)

    print("\nRegistros reales por estado:")
    for e, r in sorted(resumen.items()):
        print(f"  {e:<24} {r['registros']:>5} registros · {r['mercados']} mercados · {r['sin_cotizacion']} sin cotización")
    print(f"\nTotal: {salida['total_registros']} registros → {a.salida}")
    if salida["total_registros"] == 0:
        print("No se obtuvo ningún registro. Abre una url_consulta en el navegador para revisar el formato.", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
