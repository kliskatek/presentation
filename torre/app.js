// Visor 3D de la torre inclinable (stand IWSA 2026).
//
// El ángulo lo pone la página que la contiene (el quiosco, con el SenseBLE-ACC alimentado por la Zebra) con
// torre.setAngle(grados). Aquí solo se dibuja: la torre sigue al valor recibido con un
// filtro de primer orden (tau adaptado al ritmo de las muestras), así se mueve suave aunque lleguen
// a saltos.
// Convenio: grados positivos = la torre se inclina a la derecha vista desde el pasillo.
//
// Abierta sola en un navegador, arranca su propia simulación (desarrollo; H: mandos de simulación y manual).
// Con ?incrustada=1 (dentro del quiosco, pc/kiosko) no simula ni enseña cabecera, pie ni mandos: el
// ángulo y el idioma (?idioma=en|zh|es|eu, torre.setIdioma) los pone la página que la contiene. Con
// &sim=1, incrustada pero con su simulación (la diapositiva del caso de uso). &transparente=1: sin fondo, para dibujar
// cosas alrededor (la escena del caso de la torre en el quiosco); &sinlectura=1: sin el dial ni la cifra.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cargarGLB } from './cargar_glb.js';

const CFG = {
  tope: 33,          // grados: tope mecánico de la base
  vigilar: 5,        // |ángulo| a partir del cual se avisa
  alarma: 15,        // |ángulo| de alarma
  escala: 35,        // fondo de escala del dial
  tauMin: 0.12,      // s: suavizado con muestras rápidas (simulación)
  tauMax: 0.7,       // s: suavizado con muestras lentas (unos pocos beacons por segundo)
  volverVista: 15,   // s sin tocar el ratón: la cámara vuelve a la vista de frente
};

const st = { objetivo: 0, mostrado: 0, fuente: '—', muestras: [], movil: null, ultimoToque: 0, tau: CFG.tauMin };

const PARAMS = new URLSearchParams(location.search);
const INCRUSTADA = PARAMS.has('incrustada');
if (INCRUSTADA) document.body.classList.add('incrustada');
const TRANSPARENTE = PARAMS.has('transparente');
if (TRANSPARENTE) document.body.classList.add('transparente');
if (PARAMS.has('sinlectura')) document.body.classList.add('sin-lectura');
if (PARAMS.has('movil')) document.body.classList.add('movil');        // en el móvil de la diapositiva: la lectura escala con él

const TEXTOS = {
  es: { ok: 'OK', vigilar: 'Vigilar', alarma: 'Alarma', tasa: 'muestras/s', sin: 'sin datos', locale: 'es-ES' },
  en: { ok: 'OK', vigilar: 'Watch', alarma: 'Alarm', tasa: 'samples/s', sin: 'no data', locale: 'en-GB' },
  zh: { ok: '正常', vigilar: '注意', alarma: '警報', tasa: '次/秒', sin: '沒有數據', locale: 'zh-HK' },
  eu: { ok: 'Ondo', vigilar: 'Kontuz', alarma: 'Alarma', tasa: 'lagin/s', sin: 'daturik ez', locale: 'eu-ES' },
};
let T = TEXTOS[PARAMS.get('idioma')] || TEXTOS.es;

// ---------------------------------------------------------------- escena
const canvas = document.getElementById('vista');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: TRANSPARENTE });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = TRANSPARENTE ? null : new THREE.Color(0x0f1113);
scene.fog = new THREE.Fog(0x0f1113, 4, 9);

scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x15181b, 1.15));
const luz = new THREE.DirectionalLight(0xffffff, 2.6);
luz.position.set(0.9, 1.7, 1.3);
luz.castShadow = true;
luz.shadow.mapSize.set(2048, 2048);
Object.assign(luz.shadow.camera, { left: -0.7, right: 0.7, top: 1.0, bottom: -0.3, near: 0.5, far: 4 });
luz.shadow.bias = -0.0004;
scene.add(luz);
const contra = new THREE.DirectionalLight(0x6fb6ff, 1.3);
contra.position.set(-1.3, 1.1, -1.0);
scene.add(contra);

// suelo: un charco de luz que se funde con el fondo, y la sombra encima
function charco() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  r.addColorStop(0, 'rgba(70, 82, 94, 0.55)');
  r.addColorStop(0.55, 'rgba(40, 47, 54, 0.35)');
  r.addColorStop(1, 'rgba(15, 17, 19, 0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const luzSuelo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8),
  new THREE.MeshBasicMaterial({ map: charco(), transparent: true, depthWrite: false }));
luzSuelo.rotation.x = -Math.PI / 2;
luzSuelo.position.y = -0.021;
scene.add(luzSuelo);
const sombra = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity: 0.45 }));
sombra.rotation.x = -Math.PI / 2;
sombra.position.y = -0.0205;
sombra.receiveShadow = true;
scene.add(sombra);

// ---------------------------------------------------------------- cámara
const camara = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
const controles = new OrbitControls(camara, canvas);
controles.enableDamping = true;
controles.minPolarAngle = THREE.MathUtils.degToRad(45);
controles.maxPolarAngle = THREE.MathUtils.degToRad(95);
controles.enablePan = false;
controles.addEventListener('start', () => { st.ultimoToque = performance.now(); st.volviendo = false; });
controles.addEventListener('end', () => { st.ultimoToque = performance.now(); });

const vistaFrente = { pos: new THREE.Vector3(), obj: new THREE.Vector3() };

function encuadre() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  // La torre (con su inclinación máxima) ocupa la franja entre la cabecera (13 %) y la lectura (~31 %)
  const franja = 0.56, alto = 0.84, ancho = 1.0;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const visibleAlto = Math.max(alto / franja, ancho / camara.aspect);
  const d = visibleAlto / (2 * tanH);
  const yCentro = 0.37;                                   // centro de la torre, en metros
  const subir = (0.5 - (0.13 + franja / 2)) * visibleAlto; // la franja está por encima del centro
  vistaFrente.obj.set(0, yCentro - subir, 0);
  vistaFrente.pos.set(0, yCentro - subir + 0.12, d);
  controles.minDistance = d * 0.45;
  controles.maxDistance = d * 1.6;
  camara.updateProjectionMatrix();
}

function irAVistaFrente(inmediato = false) {
  if (inmediato) {
    camara.position.copy(vistaFrente.pos);
    controles.target.copy(vistaFrente.obj);
  }
  st.volviendo = !inmediato;
}

window.addEventListener('resize', () => { encuadre(); irAVistaFrente(true); });
encuadre();
irAVistaFrente(true);

// ---------------------------------------------------------------- modelo
cargarGLB('assets/torre.glb.png', (gltf) => {
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(gltf.scene);
  st.movil = gltf.scene.getObjectByName('movil');
}, (err) => console.error('No se pudo cargar el modelo de la torre', err));

// ---------------------------------------------------------------- dial y lectura
const $ = (id) => document.getElementById(id);
const formato = () => new Intl.NumberFormat(T.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let fmt = formato();

function punto(grados, r = 100) {
  const f = THREE.MathUtils.degToRad((grados / CFG.escala) * 90);
  return [120 + r * Math.sin(f), 120 - r * Math.cos(f)];
}
function arco(a0, a1) {
  const [x0, y0] = punto(a0), [x1, y1] = punto(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 100 100 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
$('zona-ok').setAttribute('d', arco(-CFG.vigilar, CFG.vigilar));
$('zona-vig-izq').setAttribute('d', arco(-CFG.alarma, -CFG.vigilar));
$('zona-vig-der').setAttribute('d', arco(CFG.vigilar, CFG.alarma));
$('zona-al-izq').setAttribute('d', arco(-CFG.escala, -CFG.alarma));
$('zona-al-der').setAttribute('d', arco(CFG.alarma, CFG.escala));

let textoPrevio = '';
function pintarLectura(a) {
  const v = Math.round(a * 10) / 10;
  const texto = v === 0 ? fmt.format(0) : (v > 0 ? '+' : '−') + fmt.format(Math.abs(v));
  if (texto !== textoPrevio) {
    $('angulo').textContent = texto;
    textoPrevio = texto;
  }
  const g = THREE.MathUtils.clamp(a, -CFG.escala, CFG.escala) / CFG.escala * 90;
  $('aguja').setAttribute('transform', `rotate(${g.toFixed(2)} 120 120)`);
  const m = Math.abs(a);
  const nivel = m >= CFG.alarma ? 'alarma' : m >= CFG.vigilar ? 'vigilar' : 'ok';
  const e = $('estado');
  if (!e.classList.contains(nivel)) {
    e.className = 'estado ' + nivel;
    e.textContent = T[nivel];
  }
}

function pintarPie() {
  const ahora = performance.now();
  st.muestras = st.muestras.filter((t) => ahora - t < 2000);
  const tasa = st.muestras.length / 2;
  $('tasa').textContent = tasa > 0 ? `${fmt.format(tasa)} ${T.tasa}` : T.sin;
  $('tasa').className = tasa > 0 ? 'vivo' : '';
}
setInterval(pintarPie, 500);

// ---------------------------------------------------------------- API que usa Python
const NOMBRES = { sim: 'simulación', manual: 'manual' };
window.torre = {
  setAngle(grados) {
    const ahora = performance.now();
    st.objetivo = THREE.MathUtils.clamp(Number(grados) || 0, -CFG.tope, CFG.tope);
    st.muestras.push(ahora);
    // suavizado adaptado al ritmo de las muestras: con pocos beacons/s, más largo para no ir a saltos
    const n = st.muestras.length;
    if (n >= 3) {
      const intervalo = (st.muestras[n - 1] - st.muestras[Math.max(0, n - 6)]) / 1000 / Math.min(5, n - 1);
      st.tau = THREE.MathUtils.clamp(0.9 * intervalo, CFG.tauMin, CFG.tauMax);
    }
  },
  setDiagnostico(texto) { $('diagnostico').textContent = texto; },
  // Para quien la incrusta (el quiosco dibuja la app del móvil con el mismo ángulo): lo que se está enseñando
  estado: () => ({ angulo: st.mostrado, vigilar: CFG.vigilar, alarma: CFG.alarma }),
  setIdioma(idioma) {
    if (!TEXTOS[idioma]) return;
    T = TEXTOS[idioma];
    fmt = formato();
    textoPrevio = '';
    $('estado').className = 'estado';          // fuerza a repintar el estado en el idioma nuevo
    document.documentElement.lang = idioma;
  },
  setFuente(nombre, detalle = '') {
    st.fuente = nombre;
    $('fuente').textContent = `Fuente: ${NOMBRES[nombre] || nombre}${detalle ? ' · ' + detalle : ''}`;
    document.querySelectorAll('[data-fuente]').forEach((b) => b.classList.toggle('activo', b.dataset.fuente === nombre));
  },
};

if (PARAMS.get('idioma')) window.torre.setIdioma(PARAMS.get('idioma'));

// ---------------------------------------------------------------- mandos
function elegirFuente(nombre) { local.fuente(nombre); }
document.querySelectorAll('[data-fuente]').forEach((b) => b.addEventListener('click', () => elegirFuente(b.dataset.fuente)));
$('deslizador').addEventListener('input', (e) => manual(Number(e.target.value)));
$('vista-frente').addEventListener('click', () => irAVistaFrente());

function manual(v) {
  $('deslizador').value = v;
  local.fuente('manual');
  window.torre.setAngle(v);
}

window.addEventListener('keydown', (e) => {
  if (INCRUSTADA) return;                      // los atajos son de la página sola, no del quiosco
  const k = e.key.toLowerCase();
  if (k === 'h') $('mandos').classList.toggle('oculto');
  else if (k === 'arrowleft' || k === 'arrowright') {
    const base = st.fuente === 'manual' ? Number($('deslizador').value) : Math.round(st.mostrado);
    manual(THREE.MathUtils.clamp(base + (k === 'arrowright' ? 1 : -1), -CFG.tope, CFG.tope));
  } else if (k === 's') elegirFuente('sim');
  else if (k === 'v') irAVistaFrente();
  else if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

// ---------------------------------------------------------------- simulación (la página sola, o ?sim=1)
const local = (() => {
  let modo = 'sim', id = null, t0 = performance.now();
  const pasos = [[2.5, 0], [2.2, 22], [1.8, 22], [2.0, -14], [1.5, -14], [2.4, 31], [1.6, 31], [2.2, 6], [1.2, 6], [2.0, 0]];
  const total = pasos.reduce((s, p) => s + p[0], 0);
  function angulo(t) {
    let x = t % total, previo = pasos[pasos.length - 1][1];
    for (const [dur, a] of pasos) {
      if (x < dur) { const u = x / dur, s = u * u * (3 - 2 * u); return previo + (a - previo) * s; }
      x -= dur; previo = a;
    }
    return 0;
  }
  function arrancar() {
    clearInterval(id);
    id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      window.torre.setAngle(angulo(t) + (Math.random() - 0.5) * 0.4);
    }, 40);
  }
  return {
    fuente(n) {
      modo = n;
      if (n === 'sim') arrancar(); else clearInterval(id);
      window.torre.setFuente(n, 'navegador');
    },
    iniciar() { this.fuente('sim'); },
  };
})();

if (!INCRUSTADA || PARAMS.has('sim')) local.iniciar();      // ?sim=1: simula también incrustada

// ---------------------------------------------------------------- bucle
const reloj = new THREE.Clock();
function bucle() {
  const dt = Math.min(reloj.getDelta(), 0.1);
  st.mostrado += (st.objetivo - st.mostrado) * (1 - Math.exp(-dt / st.tau));
  if (st.movil) st.movil.rotation.z = -THREE.MathUtils.degToRad(st.mostrado);
  pintarLectura(st.mostrado);

  if (!st.volviendo && performance.now() - st.ultimoToque > CFG.volverVista * 1000
      && camara.position.distanceTo(vistaFrente.pos) > 0.01) st.volviendo = true;
  if (st.volviendo) {
    const k = 1 - Math.exp(-dt / 0.6);
    camara.position.lerp(vistaFrente.pos, k);
    controles.target.lerp(vistaFrente.obj, k);
    if (camara.position.distanceTo(vistaFrente.pos) < 0.003) st.volviendo = false;
  }
  controles.update();
  renderer.render(scene, camara);
  requestAnimationFrame(bucle);
}
bucle();
