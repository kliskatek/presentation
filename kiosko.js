// Quiosco del stand IWSA 2026 (ver ../kiosko.py). Dos modos:
//   espera: presentación en bucle; cada vuelta, el siguiente idioma. Tocar la pantalla -> ¿activar las demos?
//   demos:  disco (rotor) y torre (vista de pc/torre/web incrustada). Vuelve sola tras opciones.esperaS sin tocar.
// kiosko.py sirve la página y su API por HTTP (?api=http: config, activar, volver, demo, rotor, estado, cero, registrar,
// salir). Sin ?api=http, una API simulada, para trabajar el diseño en un navegador.

import { IDIOMAS, UI, DIAPOS } from './textos.js';

if (new URLSearchParams(location.search).has('app')) document.documentElement.classList.add('app');   // sin cursor
// SOLO LA PRESENTACIÓN (?presentacion, o <html data-solo="presentacion"> en la copia de tools/exporta_presentacion.py):
// para enseñarla fuera del stand (LinkedIn, un enlace). Sin la diapositiva "pruébalo en vivo", sin el aviso de tocar,
// sin demos ni menú del equipo; se pasa con las flechas, deslizando o con el teclado.
const SOLO = new URLSearchParams(location.search).has('presentacion') || document.documentElement.dataset.solo === 'presentacion'
  || window.KIOSKO_SOLO === 'presentacion';
if (SOLO) document.documentElement.classList.add('solo-presentacion');
if (!document.body.dataset.modo) document.body.dataset.modo = 'espera';   // una copia sin <body data-modo> (artefacto)

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const S = {
  idioma: 'en', modo: 'espera', i: -1, diapos: [], timer: null, ultimoToque: Date.now(),
  seqTorre: -1, sondeo: null, cierreConfirmar: null, rotorModo: 'parado', envioRpm: 0, op: {}, api: null,
  modelos: {},                     // web/modelos/*.glb disponibles
  lecturas: {},                    // lecturas de cada tag del rotor en el último sondeo: las nuevas hacen destellar
};
const T = () => UI[S.idioma];
const LOCALE = { en: 'en-GB', es: 'es-ES', eu: 'eu-ES', zh: 'zh-HK' };
const num = (v, dec = 1) => Number(v).toLocaleString(LOCALE[S.idioma], { maximumFractionDigits: dec });
const texto = (ruta) => ruta.split('.').reduce((o, k) => (o ? o[k] : undefined), T());

// ------------------------------------------------------------------------------------------- idioma
function aplicarIdioma(idioma) {
  S.idioma = IDIOMAS.includes(idioma) ? idioma : 'en';
  document.documentElement.lang = S.idioma;
  $$('[data-t]').forEach((el) => { const t = texto(el.dataset.t); if (t !== undefined) el.textContent = t; });
  $$('.idiomas button').forEach((b) => b.classList.toggle('activo', b.dataset.idioma === S.idioma));
  const torre = torreWin();
  if (torre && torre.torre) torre.torre.setIdioma(S.idioma);
}

// ------------------------------------------------------------------------------------------- diapositivas
// Caso de la torre: la torre (pc/torre/web, simulando) con, cerca, la antena y el lector RAIN (y el PC con la app, por el
// cable del lector) y, lejos, el móvil con la app BLE. Las ondas RAIN salen de la antena hacia el tag; los beacons BLE viajan del tag al móvil. La pantalla del móvil la
// rellena animarEscenaTorre() con el ángulo que enseña la torre.
const LECTOR_SVG = `<svg class="lector-svg" viewBox="0 0 120 170" aria-hidden="true">
  <rect class="poste" x="55" y="78" width="8" height="46" rx="2"/>
  <rect class="panel" x="18" y="8" width="82" height="76" rx="8"/><rect class="panel-in" x="30" y="19" width="58" height="54" rx="4"/>
  <path class="cable" d="M59 124 C 59 136, 84 132, 84 142"/>
  <rect class="caja" x="12" y="140" width="96" height="26" rx="5"/>
  <circle class="led ok" cx="26" cy="153" r="3.4"/><circle class="led rf" cx="38" cy="153" r="3.4"/>
  <rect class="ranura" x="56" y="150" width="42" height="6" rx="3"/></svg>`;
const escenaTorre = (e) => `
  <iframe class="torre3d" src="./torre/index.html?incrustada=1&sim=1&transparente=1&sinlectura=1&idioma=${S.idioma}" tabindex="-1"></iframe>
  <div class="ondas-rain" aria-hidden="true"><i></i><i></i><i></i></div>
  <svg class="ruta-ble" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="42.5" y1="59.5" x2="80" y2="34"/>
    <path class="cable-pc" d="M15 65.5 C 19 65.5, 17 79, 21.5 79"/></svg>
  <div class="beacons" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  <div class="pieza lector">${LECTOR_SVG}<div class="rotulo rain"><img src="img/tecnologias/rain.svg" alt="RAIN">
    <b>${esc(e.lector)}</b><span>${esc(e.energia)}</span></div></div>
  <div class="pieza pc-app">
    <div class="pantalla"><img class="logo" src="img/logo/kliskatek-white.svg" alt="">
      <div class="tit">${esc(e.app.titulo)}</div><div class="ang">+0.0°</div><div class="chip ok">${esc(e.estados[0])}</div></div>
    <div class="peana"></div>
    <div class="rotulo rain"><b>${esc(e.pc)}</b><span>${esc(e.pcDatos)}</span></div></div>
  <div class="pieza movil-app">
    <div class="tel"><img class="logo" src="img/logo/kliskatek-white.svg" alt="">
      <div class="kick">${esc(e.app.kicker)}</div><div class="tit">${esc(e.app.titulo)}</div>
      <div class="ang">+0.0°</div><div class="chip ok">${esc(e.estados[0])}</div>
      <div class="ble"><img src="img/tecnologias/ble.svg" alt="Bluetooth"></div></div>
    <div class="rotulo ble"><b>${esc(e.movil)}</b><span>${esc(e.datos)}</span></div></div>`;

function animarEscenaTorre(el, e) {
  const f = el.querySelector('iframe.torre3d');
  const w = f && f.contentWindow;
  if (!w || !w.torre || !w.torre.estado) return;
  const { angulo, vigilar, alarma } = w.torre.estado();
  const a = Math.abs(angulo), n = a >= alarma ? 2 : a >= vigilar ? 1 : 0;
  el.querySelectorAll('.ang').forEach((x) => { x.textContent = `${angulo < 0 ? '−' : '+'}${a.toFixed(1)}°`; });   // PC y móvil
  el.querySelectorAll('.chip').forEach((chip) => {
    chip.className = `chip ${['ok', 'vigilar', 'alarma'][n]}`;
    chip.textContent = e.estados[n];
  });
}

// Un circuito integrado genérico (encapsulado QFN visto desde arriba): los chips de terceros de la diapositiva "solución"
const CHIP_SVG = `<svg class="ic" viewBox="0 0 100 100" aria-hidden="true">
  ${[22, 36, 50, 64, 78].map((p) => `<rect x="${p - 3}" y="6" width="6" height="12" rx="1"/><rect x="${p - 3}" y="82" width="6" height="12" rx="1"/>
  <rect x="6" y="${p - 3}" width="12" height="6" rx="1"/><rect x="82" y="${p - 3}" width="12" height="6" rx="1"/>`).join('')}
  <rect class="cuerpo" x="16" y="16" width="68" height="68" rx="7"/><circle class="marca" cx="29" cy="29" r="4"/></svg>`;
const con3d = (d) => !!(d.modelo3d && S.modelos[d.modelo3d]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DIBUJAR = {
  portada: (d, t) => `
    <div class="diapo portada">
      <img class="logo-grande entra" src="img/logo/kliskatek-white.svg" alt="Kliskatek">
      <div class="kicker entra d2">${esc(t.kicker)}</div>
      <h1 class="grande entra d2">${esc(t.titulo)}</h1>
      <div class="sub entra d3">${esc(t.sub)}</div>
    </div>`,
  equipo: (d, t) => `
    <div class="diapo">
      <div class="kicker entra">${esc(t.kicker)}</div>
      <h1 class="entra">${esc(t.titulo)}</h1>
      <div class="texto entra d2">${esc(t.texto)}</div>
      <div class="personas">${d.personas.map((p, n) => `
        <div class="persona entra d${Math.min(4, 2 + (n >> 1))}"><img src="${p.foto}" alt=""><span>${esc(p.nombre)}</span></div>`).join('')}
      </div>
    </div>`,
  // con `modelo3d` (y su modelo), la escena 3D de modelo3d.html; si no, la escena plana, la foto, la torre o los iconos.
  // Con `panoramica` (y el 3D): el texto arriba y la escena a todo lo ancho (la torre, con el lector a metros de ella)
  caso: (d, t) => d.panoramica && con3d(d) ? `
    <div class="diapo panoramica">
      <div class="cabeza">
        ${d.icono ? `<img class="icono-caso entra" src="${d.icono}" alt="">` : ''}
        <div><div class="kicker entra d2">${esc(t.kicker)}</div><h1 class="entra d2">${esc(t.titulo)}</h1></div>
      </div>
      <div class="texto entra d3">${esc(t.texto)}</div>
      <div class="lado-img ancho entra d3"><iframe class="torre3d" src="modelo3d.html?modelo=${d.modelo3d}&panoramica=1&idioma=${S.idioma}" tabindex="-1"></iframe></div>
    </div>` : `
    <div class="diapo dos">
      <div class="lado-img entra${d.escena && !con3d(d) ? ` escena-${d.escena}` : ''}">${
        con3d(d) ? `<iframe class="torre3d" src="modelo3d.html?modelo=${d.modelo3d}${d.modeloParams ? `&${d.modeloParams}` : ''}&idioma=${S.idioma}" tabindex="-1"></iframe>`
        : d.escena === 'torre' ? escenaTorre(t.escena)
        : d.foto ? `<img src="${d.foto}" alt="">`
        : d.torre3d ? `<iframe class="torre3d" src="./torre/index.html?incrustada=1&sim=1&idioma=${S.idioma}" tabindex="-1"></iframe>`
        : `<div class="iconos-caso">${(d.iconos || []).map((s, n) => `<img class="${n ? 'secundario' : 'principal'}" src="${s}" alt="">`).join('')}</div>`
      }</div>
      <div class="lado-txt">
        ${d.icono ? `<img class="icono-caso entra" src="${d.icono}" alt="">` : ''}
        <div class="kicker entra d2">${esc(t.kicker)}</div>
        <h1 class="entra d2">${esc(t.titulo)}</h1>
        <div class="texto entra d3">${esc(t.texto)}</div>
        ${t.pie ? `<div class="pie-foto entra d4">${esc(t.pie)}</div>` : ''}
      </div>
    </div>`,
  // la cadena del chip a los datos: cada eslabón con su imagen real; por detrás, un flujo que va de uno a otro
  solucion: (d, t) => `
    <div class="diapo solucion">
      <div class="kicker entra">${esc(t.kicker)}</div>
      <h1 class="entra">${esc(t.titulo)}</h1>
      <div class="sub entra d2">${esc(t.sub)}</div>
      <div class="cadena">
        <div class="flujo entra d3" aria-hidden="true"><i></i><i></i><i></i></div>
        ${d.cadena.map((e, n) => `
          <div class="eslabon ${e.forma} entra d${2 + n}">
            ${e.forma === 'chips' ? `
            <div class="par">
              <div class="mini"><img src="${e.imgs[0]}" alt=""><span>${esc(t.chips.propio)}<b>${esc(t.chips.propioDet)}</b></span></div>
              <div class="mini">${CHIP_SVG}<span>${esc(t.chips.terceros)}<b>${esc(t.chips.tercerosDet)}</b></span></div>
              <svg class="confluye" viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 25 C 22 25, 18 50, 40 50 M0 75 C 22 75, 18 50, 40 50"/></svg>
            </div>` : `
            <div class="visual">${e.torre
              ? `<div class="telefono" style="background-image:url(${e.imgs[0]})">
                  <div class="tel-cabecera"><img src="img/logo/kliskatek-white.svg" alt="">
                    <div class="tel-kicker">${esc(t.movil.kicker)}</div><div class="tel-titulo">${esc(t.movil.titulo)}</div>
                    <div class="tel-sub">${esc(t.movil.sub)}</div></div>
                  <iframe scrolling="no" tabindex="-1"
                  src="./torre/index.html?incrustada=1&sim=1&movil=1&idioma=${S.idioma}"></iframe></div>`
              : e.imgs.map((s) => `<img src="${s}" alt="">`).join('')}</div>`}
            <b>${esc(t.pasos[n].t)}</b><span>${esc(t.pasos[n].d)}</span>
          </div>`).join('')}
      </div>
    </div>`,
  tecnologias: (d, t) => `
    <div class="diapo">
      <div class="kicker entra">${esc(t.kicker)}</div>
      <h1 class="entra">${esc(t.titulo)}</h1>
      <div class="logos">${d.logos.map((s, n) => `
        <div class="tec entra d${2 + n}"><img src="${s}" alt=""><span>${esc(t.items[n])}</span></div>`).join('')}
      </div>
    </div>`,
  // más aplicaciones: rejilla de tarjetas (icono, nombre y qué hace); la radio, una línea para todas (el mismo sensor va
  // por RAIN, BLE o NFC según el sitio: ponerla en cada tarjeta daría a entender que cada aplicación va con una)
  aplicaciones: (d, t) => `
    <div class="diapo aplicaciones">
      <div class="kicker entra">${esc(t.kicker)}</div>
      <h1 class="entra">${esc(t.titulo)}</h1>
      ${t.sub ? `<div class="sub entra d2">${esc(t.sub)}</div>` : ''}
      <div class="rejilla">${d.items.map((it, n) => `
        <div class="apl entra d${2 + (n % 3)}"><img src="${it.icono}" alt="">
          <div><b>${esc(t.items[n].t)}</b><span>${esc(t.items[n].d)}</span></div>
        </div>`).join('')}
      </div>
    </div>`,
  // sin pilas: en 3D (el lector y un tag de verdad, de su KiCad) con los tres pasos al lado, que se iluminan con la
  // animación; sin el modelo, la animación plana de antes
  sinpilas: (d, t) => S.modelos['tag-sid'] ? `
    <div class="diapo dos sinpilas">
      <div class="lado-img entra"><iframe class="torre3d" src="modelo3d.html?modelo=sinpilas&idioma=${S.idioma}" tabindex="-1"></iframe></div>
      <div class="lado-txt">
        <div class="kicker entra d2">${esc(t.kicker)}</div>
        <h1 class="entra d2">${esc(t.titulo)}</h1>
        <div class="texto entra d3">${esc(t.texto)}</div>
        <ol class="pasos-sp entra d4">${t.pasos.map((p, n) => `
          <li><b>${n + 1}</b><div><strong>${esc(p.t)}</strong><span>${esc(p.d)}</span></div></li>`).join('')}
        </ol>
      </div>
    </div>` : `
    <div class="diapo">
      <div class="kicker entra">${esc(t.kicker)}</div>
      <h1 class="entra">${esc(t.titulo)}</h1>
      <div class="texto entra d2">${esc(t.texto)}</div>
      <svg class="anim entra d3" viewBox="0 0 1400 440" aria-hidden="true">
        <rect class="caja" x="60" y="90" width="270" height="250" rx="28"/>
        <image href="img/iconos/radio.svg" x="120" y="125" width="150" height="150"/>
        <text class="etiqueta" x="195" y="380">${esc(t.lector)}</text>
        <path class="onda o1" d="M 360 140 Q 430 215 360 290"/>
        <path class="onda o2" d="M 360 140 Q 430 215 360 290"/>
        <path class="onda o3" d="M 360 140 Q 430 215 360 290"/>
        <text class="leyenda e" x="650" y="105" text-anchor="middle">${esc(t.energia)} →</text>
        <circle class="dato" cx="960" cy="320" r="10"/>
        <circle class="dato d2" cx="960" cy="320" r="10"/>
        <circle class="dato d3" cx="960" cy="320" r="10"/>
        <text class="leyenda d" x="650" y="370" text-anchor="middle">← ${esc(t.datos)}</text>
        <rect class="caja" x="1000" y="90" width="340" height="250" rx="28"/>
        <image href="img/iconos/humidity.svg" x="1030" y="130" width="120" height="120"/>
        <text class="valor" x="1240" y="210"><tspan id="anim-valor">42</tspan> %</text>
        <image href="img/iconos/battery.svg" x="1255" y="245" width="60" height="60"/>
        <line class="tachado" x1="1252" y1="302" x2="1318" y2="248"/>
        <circle class="led" cx="1310" cy="122" r="12"/>
        <text class="etiqueta" x="1170" y="380">${esc(t.sensor)}</text>
      </svg>
    </div>`,
  cta: (d, t) => `
    <div class="diapo cta">
      <h1 class="entra">${esc(t.titulo)}</h1>
      <div class="texto entra d2">${esc(t.texto)}</div>
    </div>`,
};

function cargaImagen(src) {
  return new Promise((ok) => { const im = new Image(); im.onload = () => ok(true); im.onerror = () => ok(false); im.src = src; });
}

async function existe(url) {
  if (SOLO) return true;                     // la copia exportada lleva todos los modelos (y su servidor puede no aceptar HEAD)
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch (e) { return false; }
}

async function prepararDiapos() {
  for (const m of ['ladrillo', 'rotor', 'tag-sid']) S.modelos[m] = await existe(`modelos/${m}.glb.png`);
  S.modelos.torre = await existe('./torre/assets/torre.glb.png');     // el de la app de la torre
  S.modelos.energia = true;                                             // sin GLB: todo con primitivas
  const vale = await Promise.all(DIAPOS.map((d) => (d.requiere ? cargaImagen(d.requiere) : true)));
  S.diapos = DIAPOS.filter((d, n) => vale[n] && !(SOLO && d.tipo === 'cta'));
  $('#puntos').innerHTML = S.diapos.map(() => '<i></i>').join('');
}

function mostrarDiapo() {
  const d = S.diapos[S.i];
  const caja = $('#diapos');
  const tmp = document.createElement('div');
  tmp.innerHTML = DIBUJAR[d.tipo](d, d[S.idioma]).trim();
  const nueva = tmp.firstElementChild;
  caja.appendChild(nueva);
  requestAnimationFrame(() => requestAnimationFrame(() => nueva.classList.add('visible')));
  [...caja.children].filter((el) => el !== nueva).forEach((el) => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 1000);
  });
  $$('#puntos i').forEach((p, n) => p.classList.toggle('activo', n === S.i));
  if (d.tipo === 'sinpilas') animarValor();
  clearInterval(S.escena);
  if (d.escena === 'torre' && !con3d(d)) S.escena = setInterval(() => animarEscenaTorre(nueva, d[S.idioma].escena), 120);
  if (d.tipo === 'sinpilas') S.escena = setInterval(() => animarPasos(nueva), 120);
  programar(d.dur);
}

function programar(segundos) {
  clearTimeout(S.timer);
  S.timer = setTimeout(siguiente, segundos * 1000);
}

function siguiente() {
  if (S.modo !== 'espera' || !$('#confirmar').classList.contains('oculto')) { programar(2); return; }
  S.i = (S.i + 1) % S.diapos.length;
  if (S.i === 0 && S.yaDioVuelta) aplicarIdioma(IDIOMAS[(IDIOMAS.indexOf(S.idioma) + 1) % IDIOMAS.length]);   // cada vuelta, el siguiente idioma
  S.yaDioVuelta = true;
  mostrarDiapo();
}

function irA(paso) {                        // a mano (flechas o deslizar): sin cambiar de idioma
  if (S.modo !== 'espera' || !S.diapos.length) return;
  S.i = (S.i + paso + S.diapos.length) % S.diapos.length;
  mostrarDiapo();
  programar(S.diapos[S.i].dur + 10);         // se queda un rato más antes de seguir sola
}

// Sin pilas en 3D: ilumina el paso que está enseñando la animación (modelo3d.html dice la fase)
function animarPasos(el) {
  const f = el.querySelector('iframe.torre3d');
  const w = f && f.contentWindow;
  if (!w || !w.modelo || !w.modelo.estado) return;
  const { fase } = w.modelo.estado();
  el.querySelectorAll('.pasos-sp li').forEach((li, n) => li.classList.toggle('activo', n === fase));
}

function animarValor() {
  let v = 42;
  const id = setInterval(() => {
    const el = document.getElementById('anim-valor');
    if (!el) { clearInterval(id); return; }
    v = Math.max(38, Math.min(48, v + (Math.random() < 0.5 ? -1 : 1)));
    el.textContent = v;
  }, 2400);
}

// ------------------------------------------------------------------------------------------- confirmar
function abrirConfirmar() {
  $('#confirmar').classList.remove('oculto');
  clearTimeout(S.cierreConfirmar);
  S.cierreConfirmar = setTimeout(cerrarConfirmar, 15000);
}
function cerrarConfirmar() {
  clearTimeout(S.cierreConfirmar);
  $('#confirmar').classList.add('oculto');
}

// ------------------------------------------------------------------------------------------- demos
const torreWin = () => { const f = $('#hueco-torre iframe'); return f ? f.contentWindow : null; };

async function entrarDemos() {
  cerrarConfirmar();
  S.modo = 'demos';
  document.body.dataset.modo = 'demos';
  S.ultimoToque = Date.now();
  S.seqTorre = -1;
  const f = document.createElement('iframe');
  f.src = `./torre/index.html?incrustada=1&idioma=${S.idioma}`;
  f.addEventListener('load', () => {
    try { f.contentWindow.addEventListener('pointerdown', () => { S.ultimoToque = Date.now(); }); } catch (e) { /* otro origen */ }
  });
  $('#hueco-torre').appendChild(f);
  if (S.modelos.rotor) {                      // el rotor en 3D, girando a las rpm reales
    const g = document.createElement('iframe');
    g.src = `modelo3d.html?modelo=rotor&rpm=0&idioma=${S.idioma}`;
    $('#hueco-disco').appendChild(g);
  }
  elegirModoRotor('parado', false);
  S.lecturas = {};
  pintarInterruptores({ torre: true, rotor: true });
  await S.api.activar();
  clearInterval(S.sondeo);
  S.sondeo = setInterval(sondear, 100);
}

async function salirDemos() {
  if (S.modo !== 'demos') return;
  S.modo = 'espera';
  document.body.dataset.modo = 'espera';
  clearInterval(S.sondeo);
  S.sondeo = null;
  await S.api.volver();
  setTimeout(() => { $('#hueco-torre').innerHTML = ''; $('#hueco-disco').innerHTML = ''; }, 700);    // tras el fundido
  programar(1);
}

async function sondear() {
  let e;
  try { e = await S.api.estado(); } catch (err) { return; }
  if (!e || S.modo !== 'demos') return;
  if (e.habilitadas) pintarInterruptores(e.habilitadas);
  const t = e.torre, w = torreWin();
  if (t.seq !== S.seqTorre && w && w.torre) { S.seqTorre = t.seq; w.torre.setAngle(t.angulo); }
  const fase = $('#torre-fase');
  fase.className = 'fase ' + t.fase;
  fase.textContent = T().torre.fases[t.fase] || t.fase;
  $('#torre-tasa').textContent = t.tasa > 0 ? `${t.tasa.toLocaleString(LOCALE[S.idioma])} ${T().torre.tasa}` : '';
  const r = e.rotor;
  const gd = $('#hueco-disco iframe');
  if (gd && gd.contentWindow && gd.contentWindow.modelo) gd.contentWindow.modelo.setRpm(r.rpm);
  $('#rpm').textContent = Math.round(r.rpm);
  $('#rpm-objetivo').textContent = Math.round(r.objetivo);
  $('#panel-disco').classList.toggle('desconectado', !r.conectado);
  $('#rotor-aviso').textContent = r.conectado ? '' : T().disco.noConectado;
  if (e.sread) pintarLecturas(e.sread, e.ble, gd && gd.contentWindow && gd.contentWindow.modelo);
  S.ultimoEstado = e;
}

// Contadores del rotor: el SenseRead (lecturas con datos de la Zebra por la antena del rotor) y el SenseBLE (beacons
// por el dongle BLE). Las lecturas nuevas encienden el led y destellan en el rotor 3D.
function pintarLecturas(sread, ble, modelo) {
  const caja = $('#contadores');
  caja.querySelector('.contador.sread').classList.toggle('desconectado', !sread.conectado);
  caja.querySelector('.contador.sble').classList.toggle('desconectado', !(ble && ble.conectado));
  $('#rotor-lecturas-aviso').textContent = sread.activo && !(sread.conectado && ble && ble.conectado) ? T().disco.rainNo : '';
  const tags = { sread: sread.tag, sble: ble && ble.tag };
  for (const clase of ['sble', 'sread']) {
    const t = tags[clase], fila = caja.querySelector(`.contador.${clase}`);
    if (!t || !fila) continue;
    const antes = S.lecturas[clase];
    if (antes !== undefined && t.lecturas > antes) {
      const led = fila.querySelector('.led');
      led.classList.add('on');
      clearTimeout(led.apagar);
      led.apagar = setTimeout(() => led.classList.remove('on'), 250);
      if (modelo && modelo.lectura) modelo.lectura(clase, t.lecturas);
    }
    S.lecturas[clase] = t.lecturas;
    fila.classList.toggle('callado', t.hace === null || t.hace > 3);
    fila.querySelector('.lect b').textContent = num(t.lecturas, 0);
    fila.querySelector('.tasa').textContent = t.tasa > 0 ? `${num(t.tasa)}/s` : T().disco.sinRespuesta;
    fila.querySelector('.valores').textContent = t.datos
      ? t.datos.map((d) => `${d.m} ${d.v === null ? '—' : num(d.v)}${d.u === '%' ? '' : ' '}${d.u}`).join(' · ') : '';
  }
}

// Interruptor de cada demo: su antena de la Zebra (torre: puerto 1; rotor: puerto 2, y para el motor). Apagada, su
// panel queda atenuado.
function pintarInterruptores(h) {
  for (const b of $$('.interruptor')) {
    const on = !!h[b.dataset.demo];
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on ? T().demo.on : T().demo.off;
    b.closest('.panel').classList.toggle('apagada', !on);
  }
}

async function alternarDemo(b) {
  const nombre = b.dataset.demo, on = b.getAttribute('aria-pressed') !== 'true';
  const h = Object.fromEntries($$('.interruptor').map((x) => [x.dataset.demo, x.getAttribute('aria-pressed') === 'true']));
  h[nombre] = on;
  pintarInterruptores(h);
  if (nombre === 'rotor' && !on) elegirModoRotor('parado', false);
  await S.api.demo(nombre, on);
}

function elegirModoRotor(modo, enviar = true) {
  S.rotorModo = modo;
  $$('#modos button').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
  $('#velocidad').disabled = modo !== 'manual';
  if (enviar) S.api.rotor(modo, Number($('#velocidad').value));
}

function enviarVelocidad() {
  if (S.rotorModo !== 'manual') return;
  const ahora = Date.now();
  if (ahora - S.envioRpm < 150) { clearTimeout(S.envioPend); S.envioPend = setTimeout(enviarVelocidad, 160); return; }
  S.envioRpm = ahora;
  S.api.rotor('manual', Number($('#velocidad').value));
}

// ------------------------------------------------------------------------------------------- personal
let pulsacion = null;
function abrirPersonal() {
  const e = S.ultimoEstado;
  $('#personal-estado').textContent = e
    ? `torre: ${e.torre.fase} · ${e.torre.ip || '—'} · ${e.torre.detalle || ''}\nrotor: ${e.rotor.puerto || '—'} · ${e.rotor.conectado ? 'conectado' : (e.rotor.error || 'sin conectar')}`
      + (e.sread ? `\nrotor RAIN (antena 2): ${e.sread.conectado ? 'emitiendo' : (e.sread.activo ? 'arrancando' : 'apagada')}` : '')
      + (e.ble ? `\nrotor BLE (bridge de la Zebra): ${e.ble.conectado ? 'conectado' : 'sin conectar'}` : '')
      + (e.rain_por_antena ? `\ntags RAIN/s por antena: ${Object.entries(e.rain_por_antena).map(([p, n]) => `${p}: ${n}`).join(' · ') || '—'}` : '')
    : (S.op.simular ? 'simulación' : '');
  $('#personal').classList.remove('oculto');
}

// ------------------------------------------------------------------------------------------- arranque
function apiSimulada() {
  let modo = 'espera', seq = 0, ang = 0, rpm = 0, obj = 0, rmodo = 'parado';
  const lect = { sble: [], sread: [] }, hab = { torre: false, rotor: false };
  const t0 = performance.now();
  setInterval(() => {
    if (modo === 'demos') { seq += 1; ang = 18 * Math.sin((performance.now() - t0) / 2200); }
    if (rmodo === 'auto') { const s = ((performance.now() - t0) / 1000) % 50; obj = s < 10 ? 6 : s < 40 ? 6 + 94 * (s - 10) / 30 : 100; }
    rpm += Math.sign(obj - rpm) * Math.min(Math.abs(obj - rpm), 1.5);
    if (modo === 'demos' && hab.rotor) {
      if (Math.random() < 0.06) lect.sble.push(performance.now());
      if (rpm < 15 && Math.random() < (rpm < 6 ? 0.2 : 0.08)) lect.sread.push(performance.now());
    }
  }, 200);
  const tag = (l, rh) => {
    const ahora = performance.now(), ult = l[l.length - 1];
    return { lecturas: l.length, tasa: l.filter((t) => ahora - t < 5000).length / 5, hace: ult ? (ahora - ult) / 1000 : null,
      datos: ult ? [{ m: 'T', v: 26.8, u: '°C' }, { m: 'RH', v: rh, u: '%' }] : null };
  };
  return {
    config: async () => ({ torreIzquierda: false, maxRpm: 100, esperaS: 180, simular: true }),
    activar: async () => { modo = 'demos'; hab.torre = hab.rotor = true; lect.sble = []; lect.sread = []; return true; },
    volver: async () => { modo = 'espera'; hab.torre = hab.rotor = false; rmodo = 'parado'; obj = 0; return true; },
    demo: async (n, on) => { hab[n] = on; if (n === 'rotor' && !on) { rmodo = 'parado'; obj = 0; } return true; },
    rotor: async (m, v) => { rmodo = m; obj = m === 'manual' ? v : 0; return true; },
    estado: async () => ({ modo, habilitadas: { ...hab },
      torre: { fase: hab.torre ? 'emitiendo' : 'apagada', angulo: ang, seq, tasa: hab.torre ? 5 : 0, ip: 'navegador' },
      rotor: { conectado: true, puerto: 'navegador', rpm, objetivo: obj, modo: rmodo },
      sread: { conectado: hab.rotor, activo: hab.rotor, tag: tag(lect.sread, 41.9) },
      ble: { conectado: hab.rotor, activo: hab.rotor, tag: tag(lect.sble, 42.4) } }),
    cero: async () => ({ ok: modo === 'demos', cero: 0, motivo: 'simulación: entra en las demos' }),
    registrar: async (t) => console.log('[kiosko]', t),
    salir: async () => console.log('[kiosko] salir'),
  };
}

// La API de kiosko.py por HTTP: Chromium en la Pi o un navegador de otro equipo
function apiHttp() {
  return new Proxy({}, {
    get: (_, orden) => async (...args) => {
      const r = await fetch(`/api/${orden}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args) });
      if (!r.ok) throw new Error(`api ${orden}: ${r.status}`);
      return r.json();
    },
  });
}
const CON_API_HTTP = new URLSearchParams(location.search).get('api') === 'http';

async function iniciar() {
  S.api = CON_API_HTTP ? apiHttp() : apiSimulada();
  S.op = await S.api.config();
  document.body.classList.toggle('torre-izquierda', !!S.op.torreIzquierda);
  $('#velocidad').max = S.op.maxRpm || 100;
  $$('.interruptor').forEach((b) => b.addEventListener('click', () => alternarDemo(b)));
  $('#max-rpm').textContent = S.op.maxRpm || 100;
  aplicarIdioma('en');
  await prepararDiapos();
  const p = new URLSearchParams(location.search);
  if (p.has('diapo')) {                // revisión: ?diapo=solucion&idioma=zh (o el número) deja esa diapositiva quieta
    if (p.get('idioma')) aplicarIdioma(p.get('idioma'));
    const fija = p.get('diapo');
    S.i = Math.max(0, /^\d+$/.test(fija) ? Number(fija) : S.diapos.findIndex((d) => d.tipo === fija));
    mostrarDiapo();
    clearTimeout(S.timer);
  } else {
    siguiente();
  }
  S.api.registrar(`página lista · ${S.diapos.length} diapositivas · ${innerWidth}×${innerHeight}`);
  if (!CON_API_HTTP) {              // solo en un navegador (diseño): kioskoDev.ir(n, 'zh') salta a una diapositiva
    window.kioskoDev = { ir: (n, idioma) => { if (idioma) aplicarIdioma(idioma); S.i = n; mostrarDiapo(); clearTimeout(S.timer); }, S };
  }

  // toques: un toque abre la pregunta; deslizar de lado pasa de diapositiva
  let inicio = null;
  document.addEventListener('pointerdown', (ev) => {
    S.ultimoToque = Date.now();
    inicio = (S.modo === 'espera' && !ev.target.closest('.barra, .capa, .flecha-nav')) ? { x: ev.clientX, y: ev.clientY } : null;
  });
  document.addEventListener('pointerup', (ev) => {
    if (!inicio) return;
    const dx = ev.clientX - inicio.x, dy = ev.clientY - inicio.y;
    inicio = null;
    if (Math.abs(dx) > 80 && Math.abs(dx) > 1.5 * Math.abs(dy)) irA(dx < 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < 30 && !SOLO) abrirConfirmar();
  });
  $('#anterior').addEventListener('click', () => irA(-1));
  $('#siguiente').addEventListener('click', () => irA(1));
  document.addEventListener('contextmenu', (ev) => ev.preventDefault());
  $$('.idiomas button').forEach((b) => b.addEventListener('click', () => {
    aplicarIdioma(b.dataset.idioma);
    if (S.modo === 'espera' && S.diapos.length) mostrarDiapo();
  }));
  $('#confirmar-si').addEventListener('click', entrarDemos);
  $('#confirmar-no').addEventListener('click', () => { cerrarConfirmar(); programar(4); });
  $('#volver').addEventListener('click', salirDemos);
  $$('#modos button').forEach((b) => b.addEventListener('click', () => elegirModoRotor(b.dataset.modo)));
  $('#velocidad').addEventListener('input', enviarVelocidad);
  $('#velocidad').addEventListener('change', enviarVelocidad);

  // vuelta sola a la presentación
  setInterval(() => {
    if (S.modo === 'demos' && Date.now() - S.ultimoToque > (S.op.esperaS || 180) * 1000) {
      S.api.registrar('sin tocar: vuelta a la presentación');
      salirDemos();
    }
  }, 2000);

  // equipo: logo pulsado 3 s, o Ctrl+Mayús+Q
  if (SOLO) window.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') irA(1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') irA(-1);
  });
  else $('#logo').addEventListener('pointerdown', () => { pulsacion = setTimeout(abrirPersonal, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('#logo').addEventListener(ev, () => clearTimeout(pulsacion)));
  $('#personal-cerrar').addEventListener('click', () => $('#personal').classList.add('oculto'));
  $('#personal-recargar').addEventListener('click', () => location.reload());
  $('#personal-cero').addEventListener('click', async () => {      // la torre, vertical, a cero (en modo demos)
    const r = await S.api.cero();
    $('#personal-estado').textContent = r.ok ? `torre: cero fijado (${r.cero}° en bruto)` : `torre: ${r.motivo}`;
  });
  $('#personal-salir').addEventListener('click', async () => { await salirDemos(); S.api.salir(); });
  window.addEventListener('keydown', async (ev) => {
    if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'q') { await salirDemos(); S.api.salir(); }
  });
}

iniciar();
