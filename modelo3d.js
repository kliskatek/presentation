// Visor de los modelos 3D del quiosco (web/modelos/*.glb, de tools/export_modelos.py).
//   ?modelo=rotor     el rotor (nodo "rotor") gira sobre el eje Y; ?rpm=N (por defecto 20) o modelo.setRpm(N); en las demos,
//                     modelo.lectura("sble"|"sread") hace destellar el tag que acaba de llegar. Con las etiquetas
//                     SenseRead (RAIN) y SenseBLE en los tags, que destellan al pasar bajo el Stix y llegar.
//                     &show=1 (presentación): acelera y frena solo, con la app de lecturas; &idioma=en|es|eu|zh
//   ?modelo=ladrillo  el ladrillo se vuelve transparente para enseñar los sensores de dentro; un lector RAIN de mano lee
//                     de lejos el de dentro y un móvil, al acercarlo, la tapa NFC
//   ?modelo=sinpilas  cómo funciona un tag sin pilas: el lector le da energía, mide y contesta (modelos/tag-sid.glb,
//                     de tools/export_tag_kicad.py)
//   ?modelo=energia   alta tensión, sin GLB (todo con primitivas): una celda de media tensión con un punto caliente en
//                     una unión del embarrado y un compartimento GIS al que se le escapa el gas
//   ?modelo=torre     la torre de Macao (pc/torre/web/assets/torre.glb) inclinándose: la antena y el lector RAIN dan
//                     energía al tag de la cuna, el PC lee por el lector y un móvil, lejos, recibe sus beacons BLE
// La escena se mece despacio. Fondo transparente: se funde con la diapositiva.

import * as THREE from 'three';
import { cargarGLB } from './torre/cargar_glb.js';
import { crearMovil, crearHandheld, apuntar, Ondas, crearAntenaPanel, crearPie, crearLectorFijo, crearPortatil, cable }
  from './dispositivos3d.js';

const P = new URLSearchParams(location.search);
const MODELO = P.get('modelo') || 'rotor';
const ARCHIVO = { sinpilas: 'tag-sid' }[MODELO] || MODELO;
const URL_MODELO = MODELO === 'torre' ? './torre/assets/torre.glb.png' : `modelos/${ARCHIVO}.glb.png`;
const IDIOMA = ['en', 'es', 'eu', 'zh'].includes(P.get('idioma')) ? P.get('idioma') : 'en';
if (P.has('panoramica')) document.documentElement.classList.add('panoramica');   // iframe ancho y bajo: rótulos mayores
const V3 = THREE.Vector3;
const st = { rpm: Number(P.get('rpm') || 20), rotor: null, ladrillo: [], centro: new THREE.Vector3(), radio: 0.2,
  etiquetas: [], visto: 0, vistas: null, vaiven: 0.55 };
// Ladrillo: qué es cada tag. Nodo del modelo -> clase y logo (el verde es el SREAD, RAIN; el blanco, la tapa NFC)
const ETIQUETAS = [['pcb', 'rain', 'img/tecnologias/rain.svg'], ['tapa', 'nfc', 'img/tecnologias/nfc.svg']];

// Disco: los dos tags de las puntas del palo (rotor_4 en +X, bajo el Stix al empezar; rotor_5 en -X) y el Stix (fijo_3).
// Cada vez que un tag pasa bajo el lector, llega o no: SenseBLE siempre (la antena le da energía y él emite por BLE,
// sin esperar respuesta); SenseRead (lectura de USER tras el inventario, necesita más tiempo en el campo) solo en lento.
// Ilustrativo: medido el 20 oct, el SenseRead cae hacia las 150 rpm.
const TAGS_DISCO = [['rotor_5', 'sread', 'SenseRead', 'rain'], ['rotor_4', 'sble', 'SenseBLE', 'ble']];
const SHOW = P.has('show');                     // en la presentación: el rotor acelera y frena solo, con la app de lecturas
const RPM_LENTO = 10, RPM_RAPIDO = 90, RPM_CORTE_SREAD = 45, VENTANA_STIX = THREE.MathUtils.degToRad(14);
const TEXTO_APP = {
  en: { tit: 'Live reads', vel: 'Speed', lento: 'slow', rapido: 'fast', si: 'answering', no: 'no answer', lect: 'reads' },
  zh: { tit: '即時讀取', vel: '轉速', lento: '慢', rapido: '快', si: '回應中', no: '沒有回應', lect: '次讀取' },
  es: { tit: 'Lecturas en directo', vel: 'Velocidad', lento: 'lento', rapido: 'rápido', si: 'responde', no: 'sin respuesta', lect: 'lecturas' },
  eu: { tit: 'Zuzeneko irakurketak', vel: 'Abiadura', lento: 'motel', rapido: 'azkar', si: 'erantzuten', no: 'erantzunik ez', lect: 'irakurketa' },
};
const TA = TEXTO_APP[IDIOMA];
const disco = { tags: [], lector: 0, raiz: null };          // tags: {o, clase, local, dentro, cuenta, ok, el, fila}

function rpmShow(s) {                            // 18 s: 4 lento, 5 acelerando, 4 rápido, 4 frenando, 1 lento
  const c = s % 18, suave = (x) => x * x * (3 - 2 * x);
  if (c < 4) return RPM_LENTO;
  if (c < 9) return RPM_LENTO + (RPM_RAPIDO - RPM_LENTO) * suave((c - 4) / 5);
  if (c < 13) return RPM_RAPIDO;
  if (c < 17) return RPM_RAPIDO - (RPM_RAPIDO - RPM_LENTO) * suave((c - 13) / 4);
  return RPM_LENTO;
}

function prepararRotor(raiz) {
  disco.raiz = raiz;
  raiz.updateMatrixWorld(true);
  const stix = raiz.getObjectByName('fijo_3');
  if (stix) {
    const caja = new THREE.Box3().setFromObject(stix);
    const c = raiz.worldToLocal(caja.getCenter(new THREE.Vector3()));
    disco.lector = Math.atan2(c.z, c.x);
    // qué es: "RAIN reader", a la derecha del Stix, fuera del círculo que barren los tags (y sus etiquetas)
    const el = document.createElement('div');
    el.className = 'etq disp derecha';
    el.innerHTML = `<img src="img/tecnologias/rain.svg" alt="RAIN"><b>${TX.torre.lector}</b>`;
    document.getElementById('etiquetas').appendChild(el);
    st.etiquetas.push({ o: stix, local: stix.worldToLocal(caja.getCenter(new THREE.Vector3()).setX(caja.max.x)), el, siempre: true });
  }
  if (SHOW) {
    const app = document.getElementById('app');
    app.className = 'visible';
    app.innerHTML = `<div class="tit"><img src="img/logo/kliskatek-white.svg" alt="">${TA.tit}</div>
      <div class="vel">${TA.vel} <span>${TA.lento}</span><div class="barra"><i></i></div><span>${TA.rapido}</span></div>
      ${TAGS_DISCO.map(([, clase, nombre]) => `<div class="fila ${clase}"><i class="led"></i>
        <div class="nom"><b>${nombre}</b><small>${TA.si}</small></div>
        <div class="cuenta">0<span>${TA.lect}</span></div></div>`).join('')}`;
  }
  for (const [nodo, clase, nombre, tec] of TAGS_DISCO) {
    const o = raiz.getObjectByName(nodo);
    if (!o) continue;
    const c = new THREE.Box3().setFromObject(o);
    const el = document.createElement('div');
    el.className = `etq tag ${clase}`;
    el.innerHTML = `<img src="img/tecnologias/${tec}.svg" alt="${tec.toUpperCase()}"><b>${nombre}</b>`;
    document.getElementById('etiquetas').appendChild(el);
    const tag = { o, clase, el, local: o.worldToLocal(c.getCenter(new THREE.Vector3()).setY(c.max.y)),
      centro: o.worldToLocal(c.getCenter(new THREE.Vector3())), dentro: false, cuenta: 0, ok: true,
      fila: document.querySelector(`#app .fila.${clase}`) };
    disco.tags.push(tag);
    st.etiquetas.push({ o, local: tag.local, el, siempre: true });
  }
}

const RAIZ = new THREE.Vector3();
function pasadas() {                             // cada tag, al entrar bajo el Stix: contesta o no
  for (const tag of disco.tags) {
    const p = tag.o.localToWorld(RAIZ.copy(tag.centro));
    disco.raiz.worldToLocal(p);                   // en el sistema de la escena del modelo, como el Stix
    let d = Math.atan2(p.z, p.x) - disco.lector;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const dentro = Math.abs(d) < VENTANA_STIX;
    if (dentro && !tag.dentro) {
      tag.ok = tag.clase === 'sble' || st.rpm < RPM_CORTE_SREAD;
      if (tag.ok) tag.cuenta += 1;
      destello(tag);
    }
    tag.dentro = dentro;
  }
}

function destello(tag) {
  const clase = tag.ok ? 'leido' : 'fallo';
  tag.el.classList.remove('leido', 'fallo');
  void tag.el.offsetWidth;                       // reinicia la transición
  tag.el.classList.add(clase);
  clearTimeout(tag.timer);
  tag.timer = setTimeout(() => tag.el.classList.remove(clase), tag.ok ? 350 : 700);
  if (!tag.fila) return;
  tag.fila.classList.toggle('no', !tag.ok);
  tag.fila.querySelector('small').textContent = tag.ok ? TA.si : TA.no;
  tag.fila.querySelector('.cuenta').firstChild.textContent = String(tag.cuenta);
  const led = tag.fila.querySelector('.led');
  if (tag.ok) { led.classList.add('on'); setTimeout(() => led.classList.remove('on'), 250); }
}

// ------------------------------------------------------------------------------------------- ladrillo y sin pilas
const TEXTOS = {
  en: {
    mano: { kicker: 'RAIN reader', espera: 'Ready', leyendo: 'Reading…', ok: 'READ OK' },
    movil: { kicker: 'NFC · phone', titulo: 'SenseNFC', espera: 'Tap to read', leyendo: 'Reading…', ok: 'READ OK', magnitud: 'Moisture' },
    humedadPared: 'Moisture', humedad: 'Humidity',
    lector: 'Reader', smartphone: 'Smartphone', sensor: 'Sensor tag', energia: 'Energy', medir: 'Measure', datos: 'Data',
    sinBateria: 'No battery', sinCables: 'No wires',
    alta: { embarrado: 'Busbar joints', vivo: 'Live temperature', caliente: 'Hot spot', normal: 'normal',
      gas: 'Gas compartment', densidad: 'Gas density', humedad: 'Humidity', fuga: 'Leak: density falling', ok: 'normal',
      subiendo: 'rising', sensor: 'Battery-free sensor', sensorDet: 'pressure · humidity, inside the gas', ventana: 'RF window',
      antena: 'RAIN antenna', antenaDet: 'inside the cabinet', manometro: 'Today: a gauge read on rounds' },
    torre: { lector: 'RAIN reader', energia: 'Powers the tag from metres away', pc: 'PC app', pcDatos: 'Reads it through the reader',
      movil: 'Any phone', datos: 'Reads it from far away over BLE', estados: ['OK', 'Watch', 'Alarm'],
      kicker: 'Structural health', titulo: 'Macau Tower', magnitud: 'Tilt' },
  },
  zh: {
    mano: { kicker: 'RAIN 讀寫器', espera: '就緒', leyendo: '讀取中…', ok: '讀取成功' },
    movil: { kicker: 'NFC · 手機', titulo: 'SenseNFC', espera: '輕觸讀取', leyendo: '讀取中…', ok: '讀取成功', magnitud: '濕度' },
    humedadPared: '濕度', humedad: '濕度',
    lector: '讀寫器', smartphone: '智能手機', sensor: '傳感標籤', energia: '能量', medir: '測量', datos: '數據',
    sinBateria: '無電池', sinCables: '無線纜',
    alta: { embarrado: '母排連接點', vivo: '即時溫度', caliente: '熱點', normal: '正常',
      gas: '氣室', densidad: '氣體密度', humedad: '濕度', fuga: '洩漏：密度下降', ok: '正常',
      subiendo: '上升中', sensor: '無電池傳感器', sensorDet: '壓力 · 濕度，置於氣體之中', ventana: '射頻窗口',
      antena: 'RAIN 天線', antenaDet: '置於開關櫃內', manometro: '現時：巡檢時讀取的壓力錶' },
    torre: { lector: 'RAIN 讀寫器', energia: '從數米外為標籤供電', pc: '電腦應用程式', pcDatos: '透過讀寫器讀取',
      movil: '任何手機', datos: '透過 BLE 遠距離讀取', estados: ['正常', '注意', '警報'],
      kicker: '結構健康監測', titulo: '澳門旅遊塔', magnitud: '傾角' },
  },
  es: {
    mano: { kicker: 'Lector RAIN', espera: 'Listo', leyendo: 'Leyendo…', ok: 'LECTURA OK' },
    movil: { kicker: 'NFC · móvil', titulo: 'SenseNFC', espera: 'Acerca para leer', leyendo: 'Leyendo…', ok: 'LECTURA OK', magnitud: 'Humedad' },
    humedadPared: 'Humedad', humedad: 'Humedad',
    lector: 'Lector', smartphone: 'Smartphone', sensor: 'Tag sensor', energia: 'Energía', medir: 'Medida', datos: 'Datos',
    sinBateria: 'Sin batería', sinCables: 'Sin cables',
    alta: { embarrado: 'Uniones del embarrado', vivo: 'Temperatura en directo', caliente: 'Punto caliente', normal: 'normal',
      gas: 'Compartimento de gas', densidad: 'Densidad del gas', humedad: 'Humedad', fuga: 'Fuga: baja la densidad', ok: 'normal',
      subiendo: 'subiendo', sensor: 'Sensor sin batería', sensorDet: 'presión · humedad, dentro del gas', ventana: 'Ventana de RF',
      antena: 'Antena RAIN', antenaDet: 'dentro de la celda', manometro: 'Hoy: manómetro leído a mano' },
    torre: { lector: 'Lector RAIN', energia: 'Alimenta el tag desde varios metros', pc: 'App de PC', pcDatos: 'Lee a través del lector',
      movil: 'Cualquier móvil', datos: 'Lo lee de lejos por BLE', estados: ['OK', 'Vigilar', 'Alarma'],
      kicker: 'Salud estructural', titulo: 'Torre de Macao', magnitud: 'Inclinación' },
  },
  eu: {
    mano: { kicker: 'RAIN irakurgailua', espera: 'Prest', leyendo: 'Irakurtzen…', ok: 'IRAKURRITA' },
    movil: { kicker: 'NFC · mugikorra', titulo: 'SenseNFC', espera: 'Hurbildu irakurtzeko', leyendo: 'Irakurtzen…', ok: 'IRAKURRITA', magnitud: 'Hezetasuna' },
    humedadPared: 'Hezetasuna', humedad: 'Hezetasuna',
    lector: 'Irakurgailua', smartphone: 'Smartphonea', sensor: 'Etiketa sentsorea', energia: 'Energia', medir: 'Neurketa', datos: 'Datuak',
    sinBateria: 'Bateriarik gabe', sinCables: 'Kablerik gabe',
    alta: { embarrado: 'Barren loturak', vivo: 'Zuzeneko tenperatura', caliente: 'Puntu beroa', normal: 'normala',
      gas: 'Gas‑konpartimentua', densidad: 'Gasaren dentsitatea', humedad: 'Hezetasuna', fuga: 'Ihesa: dentsitatea jaisten', ok: 'normala',
      subiendo: 'igotzen', sensor: 'Bateriarik gabeko sentsorea', sensorDet: 'presioa · hezetasuna, gasaren barruan', ventana: 'RF leihoa',
      antena: 'RAIN antena', antenaDet: 'gelaxkaren barruan', manometro: 'Gaur: eskuzko manometroa' },
    torre: { lector: 'RAIN irakurgailua', energia: 'Etiketa elikatzen du hainbat metrotik', pc: 'PCko aplikazioa', pcDatos: 'Irakurgailuaren bidez irakurtzen du',
      movil: 'Edozein mugikor', datos: 'Urrutitik irakurtzen du BLE bidez', estados: ['Ondo', 'Kontuz', 'Alarma'],
      kicker: 'Egituren osasuna', titulo: 'Macaoko Dorrea', magnitud: 'Inklinazioa' },
  },
};
const TX = TEXTOS[IDIOMA];
const suave = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (6 * x - 15) + 10); };   // smootherstep
const rampa = (c, a, b) => suave((c - a) / (b - a));                     // 0 antes de a, 1 después de b
const ventana = (c, a, b, d, e) => rampa(c, a, b) * (1 - rampa(c, d, e));   // sube de a a b, baja de d a e

// Ladrillo, 22 s, en dos fases.
//   1 (0-9,5), como siempre: el ladrillo solo, meciéndose; se vuelve transparente (1,5-3,5), se ven los tags con sus
//     etiquetas y vuelve a sólido (7,5-9,5).
//   2 (9,5-22), las lecturas, con el ladrillo sólido (se lee a través de la pared): la cámara se abre, el ladrillo se
//     aleja y gira para dar el frontal al lector de mano, que entra visto de lado (9,5-11,5); lo lee de lejos, con las
//     ondas entrando por el frontal (11,5-15); el lector sale, el ladrillo vuelve, la cámara se acerca y el móvil lee
//     la tapa NFC (15-20,5); la cámara vuelve a la vista del principio (20,5-22).
const CICLO_LAD = 22;
const lad = { tapado: 0, rotulos: {}, verMano: 0, verMovil: 0, mano: null, movil: null, rain: null, nfc: null, mats: {}, etq: {}, vis: { rain: 0, nfc: 0 },
  toque: null, fuera: null, qToque: null, qFuera: null, sitioMano: null, fueraMano: null, raiz: null, cPcb: null,
  qLejos: null, posLejos: null, antena: null };
const VALOR_RAIN = '71 %', VALOR_NFC = '68 %';
// Para leer, el ladrillo se va al fondo a la derecha (lejos: [x, z, giro]) dando el frontal al lector, que está delante a
// la izquierda apuntando en diagonal hacia dentro: se ve de lado y las ondas entran por el frontal (en pruebas, ?dispo={...})
const DISPO_LAD = { mano: [-0.30, 0.17, 0.20], inclina: 0.45, lejos: [0.20, -0.30, -0.75], elev: 24, az: 0,
  ...JSON.parse(P.get('dispo') || '{}') };

function prepararLadrillo(raiz) {
  raiz.updateMatrixWorld(true);
  const caja = (o) => new THREE.Box3().setFromObject(o);
  const cPcb = caja(raiz.getObjectByName('pcb')).getCenter(new V3());
  const bTapa = caja(raiz.getObjectByName('tapa'));
  const pTapa = bTapa.getCenter(new V3()).setY(bTapa.max.y);
  for (const n of ['pcb', 'tapa']) {                            // para que brillen al contestar
    const o = raiz.getObjectByName(n);
    o.material = o.material.clone();
    o.material.emissive = new THREE.Color(n === 'pcb' ? 0x2EBD6B : 0xBFE3FF);
    o.material.emissiveIntensity = 0;
    lad.mats[n] = o.material;
  }
  // el ladrillo, al leer con el lector de mano: más lejos y girado
  lad.raiz = raiz; lad.cPcb = cPcb;
  lad.posLejos = new V3(DISPO_LAD.lejos[0], 0, DISPO_LAD.lejos[1]);
  lad.qLejos = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), DISPO_LAD.lejos[2]);
  const mLejos = new THREE.Matrix4().compose(lad.posLejos, lad.qLejos, new V3(1, 1, 1));
  const pcbLejos = cPcb.clone().applyMatrix4(mLejos);
  lad.mano = crearHandheld({ ...TX.mano, titulo: 'SenseRead', magnitud: TX.humedadPared });
  apuntar(lad.mano.grupo, new V3(...DISPO_LAD.mano), pcbLejos, DISPO_LAD.inclina);
  giro.add(lad.mano.grupo);
  lad.mano.grupo.updateMatrix();
  lad.sitioMano = lad.mano.grupo.position.clone();
  lad.fueraMano = lad.sitioMano.clone().add(new V3(-0.28, 0.02, 0.16));   // entra y sale por la izquierda
  lad.antena = lad.mano.antena.clone().applyMatrix4(lad.mano.grupo.matrix);
  lad.rain = new Ondas(giro, { n: 5, periodo: 1.1, r0: 0.03, r1: 0.085 }).tramo(lad.antena, pcbLejos);

  lad.movil = crearMovil({ ...TX.movil });
  giro.add(lad.movil.grupo);
  // casi plano sobre la tapa (un poco levantado por arriba, para que se vea la pantalla), sin meterse en el ladrillo
  lad.qToque = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.08, 0.35, 0, 'YXZ'));
  lad.qFuera = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.75, 0.6, 0, 'YXZ'));
  const nfcEnMundo = lad.movil.nfc.clone().applyQuaternion(lad.qToque);
  lad.toque = pTapa.clone().add(new V3(0, 0.014, 0)).sub(nfcEnMundo);
  lad.fuera = lad.toque.clone().add(new V3(0.16, 0.30, 0.10));
  // NFC: anillos pegados a la tapa, abriéndose por debajo del móvil (asoman por sus lados; no lo atraviesan)
  lad.nfc = new Ondas(giro, { color: 0x4FB0FF, n: 3, periodo: 0.9, r0: 0.014, r1: 0.05, grosor: 0.2, aditivo: false })
    .tramo(pTapa.clone().add(new V3(0, 0.0012, 0)), pTapa.clone().add(new V3(0, 0.0013, 0)));

  const bLad = caja(raiz);
  raiz.position.copy(lad.posLejos); raiz.quaternion.copy(lad.qLejos); raiz.updateMatrixWorld(true);
  const bLejos = caja(raiz);                                     // el ladrillo, ya lejos
  raiz.position.set(0, 0, 0); raiz.quaternion.identity(); raiz.updateMatrixWorld(true);
  lad.movil.grupo.position.copy(lad.toque); lad.movil.grupo.quaternion.copy(lad.qToque); lad.movil.grupo.updateMatrixWorld(true);
  const grados = THREE.MathUtils.degToRad;
  st.vistas = {                                                  // [caja, elevación, acimut, margen]
    inicio: [bLad, grados(26), 0, 1.3],                          // la de siempre: el ladrillo solo (con sitio para mecerse)
    lejos: [bLejos.union(caja(lad.mano.grupo)), grados(DISPO_LAD.elev), grados(DISPO_LAD.az), 0.9],
    cerca: [bLad.clone().union(caja(lad.movil.grupo)), grados(24), grados(28), 1.1],
    mezcla: [],
  };
  lad.movil.grupo.visible = false;
  // qué es cada aparato: "Reader" (con el logo de RAIN) colgando del lector y "Smartphone" (con el de NFC, lo que hace
  // aquí) encima del móvil
  const capa = document.getElementById('etiquetas');
  for (const [k, clase, html] of [['mano', 'etq disp abajo', `<img src="img/tecnologias/rain.svg" alt="RAIN"><b>${TX.lector}</b>`],
    ['movil', 'etq disp', `<img src="img/tecnologias/nfc.svg" alt="NFC"><b>${TX.smartphone}</b>`]]) {
    const el = document.createElement('div');
    el.className = clase; el.innerHTML = html; el.style.opacity = '0';
    capa.appendChild(el);
    lad.rotulos[k] = el;
  }
  for (const a of [lad.mano, lad.movil]) a.grupo.traverse((o) => { o.castShadow = false; });   // en el aire, en la mano
}

const V0 = new V3(), Q0 = new THREE.Quaternion(), PCB = new V3();
function pintarLadrillo(c) {
  // fase 1: transparente y vuelta a sólido
  const f = rampa(c, 1.5, 3.5) * (1 - rampa(c, 7.5, 9.5));
  st.ladrillo.forEach((m) => { m.opacity = 1 - 0.62 * f; });      // hasta 0,38: sigue leyéndose como ladrillo
  st.visto = f;
  // fase 2: la cámara se abre (entra el lector), se acerca para el móvil y vuelve al ladrillo
  const abre = rampa(c, 9.5, 11.5), acerca = rampa(c, 15, 16.5), vuelve = rampa(c, 20.5, 22);
  st.vistas.mezcla = [['lejos', abre], ['cerca', acerca], ['inicio', vuelve]];
  st.vaiven = 0.55 - 0.43 * abre + 0.43 * vuelve;                  // en la fase 2 casi quieto: el lector está lejos
  const dentro = abre * (1 - acerca);                              // el lector sale en cuanto ha leído
  lad.mano.grupo.visible = dentro > 0.001;
  lad.mano.grupo.position.lerpVectors(lad.fueraMano, lad.sitioMano, dentro);
  lad.verMano = rampa(dentro, 0.75, 1);
  const lejos = abre * (1 - acerca);                              // el ladrillo se aleja y gira para leerlo; vuelve para el móvil
  lad.raiz.position.lerpVectors(V0, lad.posLejos, lejos);
  lad.raiz.quaternion.slerpQuaternions(Q0, lad.qLejos, lejos);
  lad.raiz.updateMatrix();
  lad.rain.tramo(lad.antena, PCB.copy(lad.cPcb).applyMatrix4(lad.raiz.matrix));
  // RAIN: el lector de mano lee el sensor de dentro
  lad.rain.intensidad = ventana(c, 11.5, 12, 14.6, 15);
  lad.rain.actualizar(t);
  const rainOk = c >= 13.2 && c < 21.5;
  lad.mano.pantalla.poner(c >= 11.5 && c < 13.2 ? 'leyendo' : rainOk ? 'dato' : 'espera', VALOR_RAIN);
  lad.mats.pcb.emissiveIntensity = 0.35 * lad.rain.intensidad + 0.9 * ventana(c, 13.1, 13.2, 13.5, 14.3);
  // NFC: el móvil baja, lee la tapa y sube
  const p = rampa(c, 15.3, 16.7) * (1 - rampa(c, 19.3, 20.5));
  const g = lad.movil.grupo;
  lad.tapado = rampa(p, 0.55, 0.9);                              // la etiqueta NFC no tapa la pantalla del móvil
  lad.verMovil = rampa(p, 0.6, 0.95);
  g.visible = p > 0.001;
  g.position.lerpVectors(lad.fuera, lad.toque, p);
  g.quaternion.slerpQuaternions(lad.qFuera, lad.qToque, p);
  lad.nfc.intensidad = ventana(c, 16.7, 17, 18.1, 18.7);
  lad.nfc.actualizar(t);
  const nfcOk = c >= 17.7 && c < 21.5;
  lad.movil.pantalla.poner(c >= 16.7 && c < 17.7 ? 'leyendo' : nfcOk ? 'dato' : 'espera', VALOR_NFC);
  lad.mats.tapa.emissiveIntensity = 0.25 * lad.nfc.intensidad + 0.5 * ventana(c, 17.6, 17.7, 18, 18.7);
  // las etiquetas: en la fase 1, con el ladrillo transparente; en la 2, al leer, con lo leído (a través de la pared)
  lad.vis.rain = ventana(c, 13.1, 13.5, 21, 21.8);
  lad.vis.nfc = ventana(c, 17.6, 18, 21, 21.8);
  for (const [clase, ok, valor, a] of [['rain', rainOk, VALOR_RAIN, 13.2], ['nfc', nfcOk, VALOR_NFC, 17.7]]) {
    const el = lad.etq[clase];
    if (!el) continue;
    el.classList.toggle('con-valor', ok);
    el.classList.toggle('leido', c >= a && c < a + 0.9);
    el.querySelector('.v').textContent = valor;
  }
}

// Sin pilas, 8 s: 0-3 energía (el lector da energía al tag, que se va cargando) | 3-4,2 mide | 4,2-6 contesta (el dato
// vuelve al lector) | 6-7,6 el lector enseña la lectura | 7,6-8 vuelta a empezar
const CICLO_SP = 8;
// Colocación (en pruebas se puede cambiar con ?dispo={...} en JSON)
// Como al leer el ladrillo: el lector delante a la izquierda, visto de lado y apuntando en diagonal hacia dentro; el tag
// en su pie al fondo a la derecha (sitio: [x, z]), girado para dar la cara al lector.
// La cámara encuadra lo mismo que allí (el lector y el ladrillo lejos, en `ladrillo: [x, z, giro]`): el mismo punto de
// vista. El tag, algo más cerca que el ladrillo y menos girado, para que se le vea la cara.
const DISPO = { mano: [-0.30, 0.17, 0.20], inclina: 0.45, tag: -0.5, sitio: [0.13, -0.17], elev: 24, margen: 1.0,
  foco: 'ladrillo', ladrillo: [0.20, -0.30, -0.75], ...JSON.parse(P.get('dispo') || '{}') };
const sp = { fase: -1, mano: null, ondas: null, ping: null, paquetes: [], sensor: null, antena: null, mats: [], el: {} };
let valorSp = 42;

function prepararSinpilas(raiz) {
  raiz.rotation.set(Math.PI / 2, DISPO.tag, 0, 'YXZ');               // el tag de pie, mirando a la cámara y un poco al lector
  const [sx, sz] = DISPO.sitio;
  raiz.position.set(sx, 0.075, sz);
  raiz.updateMatrixWorld(true);
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if ((o.material.color.g > o.material.color.r * 1.5) && o.material.color.g < 0.3) {   // la máscara verde: brilla al cargarse
      o.material.emissive = new THREE.Color(0x2EBD6B);
      o.material.emissiveIntensity = 0;
      sp.mats.push(o.material);
    }
  });
  const pie = new THREE.Group();                                  // un soporte discreto
  const metal = new THREE.MeshStandardMaterial({ color: 0x3A4046, metalness: 0.6, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.005, 40), metal);
  base.position.y = 0.0025;
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.066, 16), metal);
  poste.position.y = 0.035;
  pie.add(base, poste);
  pie.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  pie.position.set(sx, 0, sz);
  giro.add(pie);
  sp.sensor = raiz.localToWorld(new V3(0.004, 0.0034, 0.0));     // el chip, en la cara del tag
  const normal = new V3(0, 1, 0).transformDirection(raiz.matrixWorld);
  sp.mano = crearHandheld({ ...TX.mano, titulo: 'SenseID', magnitud: TX.humedad });
  apuntar(sp.mano.grupo, new V3(...DISPO.mano), sp.sensor, DISPO.inclina);
  giro.add(sp.mano.grupo);
  sp.mano.grupo.updateMatrix();
  sp.antena = sp.mano.antena.clone().applyMatrix4(sp.mano.grupo.matrix);
  sp.ondas = new Ondas(giro, { n: 5, periodo: 1.0, r0: 0.028, r1: 0.06 }).tramo(sp.antena, sp.sensor);
  sp.ping = new Ondas(giro, { color: 0x2EBD6B, n: 2, periodo: 0.6, r0: 0.004, r1: 0.03, grosor: 0.25 })
    .tramo(sp.sensor, sp.sensor.clone().addScaledVector(normal, 0.004));
  const geo = new THREE.SphereGeometry(1, 20, 14);
  for (let i = 0; i < 3; i++) {                                   // el dato que vuelve: tres puntos naranjas
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xFF8000, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false }));
    m.scale.setScalar(0.0075 - i * 0.0018);
    m.renderOrder = 6;
    giro.add(m);
    sp.paquetes.push(m);
  }
  // los rótulos (HTML, siguen a los puntos 3D)
  const capa = document.getElementById('etiquetas');
  const nuevo = (clase, html) => { const el = document.createElement('div'); el.className = clase; el.innerHTML = html; capa.appendChild(el); return el; };
  sp.el.lector = nuevo('etq disp abajo', `<img src="img/tecnologias/rain.svg" alt="RAIN"><b>${TX.lector}</b>`);
  sp.el.medida = nuevo('burbuja', `<img src="img/iconos/humidity.svg" alt=""><span class="v">42</span> %RH`);
  sp.el.lectura = nuevo('burbuja ok', `<span class="v">42</span> %RH <i>✓</i>`);
  sp.el.bajo = nuevo('bajo-tag', `<b class="nombre">${TX.sensor}</b><div class="carga"><span>${TX.energia}</span><div class="barra-c"><i></i></div></div>
    <div class="sin"><span>${ICONO_PILA}${TX.sinBateria}</span><span>${ICONO_CABLE}${TX.sinCables}</span></div>`);
  const bTag = new THREE.Box3().setFromObject(raiz);
  sp.puntos = {
    lector: new V3(0, 0.03, -0.15).applyMatrix4(sp.mano.grupo.matrix),   // debajo, en la barra: no tapa la pantalla
    medida: sp.sensor.clone().add(new V3(0, 0.016, 0)),
    lectura: sp.mano.pantallaPos.clone().applyMatrix4(sp.mano.grupo.matrix).add(new V3(0, 0.035, 0)),   // encima de su pantalla
    bajo: new V3(sx, -0.03, sz + 0.07),                          // delante del pie, por debajo del suelo
  };
  // encuadre: el tag con su pie y la cabeza del lector; el resto del lector se sale por la izquierda (el tag manda).
  // Por debajo, sitio para los rótulos del tag.
  const cabeza = sp.mano.antena.clone().add(new V3(0, -0.035, 0)).applyMatrix4(sp.mano.grupo.matrix);
  const foco = bTag.clone().union(new THREE.Box3().setFromObject(pie)).expandByPoint(new V3(sx, -0.045, sz + 0.03));
  if (DISPO.foco === 'cabeza') foco.expandByPoint(sp.antena).expandByPoint(cabeza);
  else foco.union(new THREE.Box3().setFromObject(sp.mano.grupo));
  if (DISPO.foco === 'ladrillo') {                               // el ladrillo (240 × 70 × 115 mm) donde está el tag
    const [lx, lz, lg] = DISPO.ladrillo;
    const m = new THREE.Matrix4().makeRotationY(lg).setPosition(lx, 0.035, lz);
    for (const x of [-0.12, 0.12]) for (const y of [-0.035, 0.035]) for (const z of [-0.0575, 0.0575]) {
      foco.expandByPoint(new V3(x, y, z).applyMatrix4(m));
    }
  }
  st.vistas = { inicio: [foco, THREE.MathUtils.degToRad(DISPO.elev), 0, DISPO.margen] };
}

const ICONO_PILA = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7" width="16" height="10" rx="2"/><rect x="19" y="10" width="2.5" height="4" rx="1"/><line class="raya" x1="3" y1="21" x2="21" y2="3"/></svg>`;
const ICONO_CABLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2.5v5M15 2.5v5M6.5 7.5h11v3.5a5.5 5.5 0 0 1-11 0zM12 16.5v5"/><line class="raya" x1="3" y1="21" x2="21" y2="3"/></svg>`;

function pintarSinpilas(c, cuenta) {
  const carga = c < 3 ? suave(c / 3) : c < 4.2 ? 1 : c < 7.6 ? 1 - 0.85 * rampa(c, 4.2, 7.4) : 0.15 * (1 - rampa(c, 7.6, 8));
  sp.ondas.intensidad = ventana(c, 0, 0.4, 7.4, 7.9) * (c > 3 ? 0.7 : 1);
  sp.ondas.actualizar(t);
  sp.ping.intensidad = ventana(c, 3, 3.15, 3.9, 4.2);
  sp.ping.actualizar(t);
  sp.mats.forEach((m) => { m.emissiveIntensity = 0.06 + 0.5 * carga * (c < 4.2 ? 1 : 0.6); });
  const viaje = rampa(c, 4.2, 6.0);                               // el dato, del tag al lector
  sp.paquetes.forEach((m, i) => {
    const s = Math.max(0, viaje - i * 0.07);
    m.position.lerpVectors(sp.sensor, sp.antena, s).add(new V3(0, 0.05 * Math.sin(Math.PI * s), 0));
    m.material.opacity = ventana(c, 4.2, 4.4, 5.8, 6.05) * (1 - i * 0.25);
    m.visible = m.material.opacity > 0.003;
  });
  if (cuenta !== sp.cuenta) {                                     // cada vuelta, una medida nueva
    sp.cuenta = cuenta;
    valorSp = Math.max(38, Math.min(48, valorSp + (Math.random() < 0.5 ? -1 : 1)));
    document.querySelectorAll('#etiquetas .v').forEach((el) => { el.textContent = String(valorSp); });
  }
  sp.mano.pantalla.poner(c < 6 ? 'leyendo' : c < 7.6 ? 'dato' : 'espera', `${valorSp} %`);
  sp.el.medida.style.opacity = ventana(c, 3.1, 3.4, 4.3, 4.7).toFixed(3);
  sp.el.lectura.style.opacity = ventana(c, 5.9, 6.2, 7.4, 7.8).toFixed(3);
  sp.el.bajo.querySelector('.barra-c i').style.width = `${(100 * carga).toFixed(1)}%`;
  sp.fase = c < 3 ? 0 : c < 4.2 ? 1 : c < 7.6 ? 2 : -1;            // la diapositiva ilumina el paso (estado().fase)
  for (const [k, el] of Object.entries(sp.el)) if (sp.puntos[k]) colocar(el, sp.puntos[k]);
}

// ------------------------------------------------------------------------------------------- torre de Macao
// La torre se inclina con la misma simulación que su app (pc/torre/web/app.js). Dos fases, 24 s:
//   1 (22-8 s): la parte UHF y la torre, de cerca: la antena da energía al tag y el PC lee por el lector; sin móvil.
//   2: la cámara se aleja y aparece el móvil, con los beacons BLE (8-12); se acerca a la torre y al móvil (12-20); vuelve
//      a la fase 1 y el móvil se va (20-22). El tag (SenseBLE-ACC) va en el túnel
// derecho de la cuna, con el dipolo paralelo al eje de giro: la antena tiene que estar a un lado (delante o detrás no
// lee). Aquí, a la izquierda y un poco por detrás, mirando a la cuna; la cámara, desde delante y algo a la derecha, le ve la cara.
const TORRE = { pasos: [[2.5, 0], [2.2, 22], [1.8, 22], [2.0, -14], [1.5, -14], [2.4, 31], [1.6, 31], [2.2, 6], [1.2, 6], [2.0, 0]],
  vigilar: 5, alarma: 15, colores: ['#2EBD6B', '#F2B01E', '#E5484D'] };
const TORRE_TOTAL = TORRE.pasos.reduce((a, p) => a + p[0], 0);   // 19,4 s
// en pruebas, ?dispo={...}: antena [x, y, z]; fx y pc [x, z, giro]; tel [x, y, z]; cámara elev y az (grados)
// La antena, a 1,1 m de la torre (se lee a varios metros), algo por detrás para que se le vea la cara; el móvil, más lejos
// al otro lado. El lector, con los conectores de antena atrás (hacia el pie) y los LED delante (giro π + 0,25). Es una escena ancha: va en la diapositiva panorámica (?panoramica=1).
// El móvil, a ~2,5 m (BLE llega más lejos); en la fase 2 la cámara se pone junto a él mirando hacia la torre (telCam).
const DISPO_TORRE = { antena: [-1.10, 0.34, -0.25], fx: [-1.20, 0.15, 3.39], pc: [-1.50, 0.25, 0.4], tel: [2.4, 0.22, -0.5],
  elev: 18, az: 15, margen: 1.04, telCam: [0.7, 0.12, 0.06, 1.0], ...JSON.parse(P.get('dispo') || '{}') };   // telCam: atrás, a un lado, arriba; a dónde mira
const TAG_CUNA = new V3(0.026, 0, -0.003);                     // el túnel derecho, en coordenadas del eje de la bisagra
const CICLO_TORRE = 24;
const tor = { alLector: [], lectorRx: null, yawTel: 0, verTel: 0, verUhf: 1, movil: null, ant: null, fx: null, pc: null, tel: null, rain: null, beacons: [], red: null, flujo: [],
  rotulos: {}, puntos: {}, ultimo: -1, tag: new V3() };

function anguloTorre(t) {
  let x = t % TORRE_TOTAL, previo = TORRE.pasos[TORRE.pasos.length - 1][1];
  for (const [dur, a] of TORRE.pasos) {
    if (x < dur) { const u = x / dur; return previo + (a - previo) * u * u * (3 - 2 * u); }
    x -= dur; previo = a;
  }
  return 0;
}

function prepararTorre(raiz) {
  giro.rotation.set(0, 0, 0); giro.updateMatrixWorld(true);       // todo en coordenadas de `giro`
  tor.movil = raiz.getObjectByName('movil');
  raiz.updateMatrixWorld(true);
  const suelo = new THREE.Box3().setFromObject(raiz).min.y;       // la mesa, bajo la tabla de bambú
  const T = TX.torre, D = DISPO_TORRE;
  tor.tag.copy(TAG_CUNA).applyMatrix4(tor.movil.matrixWorld);
  // antena en su pie, mirando a la cuna
  tor.ant = crearAntenaPanel();
  tor.ant.grupo.position.set(...D.antena);
  tor.ant.grupo.lookAt(tor.tag);
  giro.add(tor.ant.grupo);
  tor.ant.grupo.updateMatrixWorld(true);
  const detras = tor.ant.detras.clone().applyMatrix4(tor.ant.grupo.matrix);
  const pie = crearPie(detras.y - suelo);
  pie.position.set(detras.x, suelo, detras.z);
  giro.add(pie);
  const cara = tor.ant.cara.clone().applyMatrix4(tor.ant.grupo.matrix);
  tor.rain = new Ondas(giro, { n: 7, periodo: 1.8, r0: 0.05, r1: 0.16 }).tramo(cara, tor.tag);   // de lejos: más anillos
  // el lector fijo, en la mesa, con el cable de antena hasta el pie
  tor.fx = crearLectorFijo();
  tor.fx.grupo.position.set(D.fx[0], suelo, D.fx[1]);
  tor.fx.grupo.rotation.y = D.fx[2];
  giro.add(tor.fx.grupo);
  tor.fx.grupo.updateMatrix();
  const puerto = tor.fx.puerto.clone().applyMatrix4(tor.fx.grupo.matrix);
  const fuera = new V3(0, 0, 0.05).applyMatrix4(tor.fx.grupo.matrix).sub(tor.fx.grupo.position);
  cable(giro, [puerto, puerto.clone().add(fuera).setY(suelo + 0.006), new V3(detras.x + 0.02, suelo + 0.006, detras.z + 0.03),
    new V3(detras.x + 0.012, suelo + 0.05, detras.z + 0.012), new V3(detras.x + 0.012, detras.y - 0.03, detras.z + 0.01), detras]);
  // el portátil, con su cable de red hasta el lector
  tor.pc = crearPortatil({ kicker: T.kicker, titulo: T.titulo, espera: '', leyendo: '', ok: T.estados[0], magnitud: T.magnitud });
  tor.pc.grupo.position.set(D.pc[0], suelo, D.pc[1]);
  tor.pc.grupo.rotation.y = D.pc[2];
  giro.add(tor.pc.grupo);
  tor.pc.grupo.updateMatrix();
  const redFx = tor.fx.red.clone().applyMatrix4(tor.fx.grupo.matrix), redPc = tor.pc.red.clone().applyMatrix4(tor.pc.grupo.matrix);
  const medio = redFx.clone().lerp(redPc, 0.5).setY(suelo + 0.004);
  tor.red = cable(giro, [redFx, redFx.clone().lerp(medio, 0.4).setY(suelo + 0.005), medio, redPc.clone().lerp(medio, 0.4).setY(suelo + 0.005), redPc],
    { color: 0x2E6FB0, r: 0.0022 });
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const brillo = (color, r) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false }));
    m.scale.setScalar(r); m.renderOrder = 6; giro.add(m); return m;
  };
  for (let i = 0; i < 3; i++) tor.flujo.push(brillo(0x2E9BFF, 0.0045));   // el dato, del lector al PC
  // los beacons del tag también llegan al lector (el puente BLE), que los pasa al PC: siempre, en las dos fases
  for (let i = 0; i < 5; i++) tor.alLector.push(brillo(0xFF8000, 0.0075));
  tor.lectorRx = new V3(0, 0.05, 0).applyMatrix4(tor.fx.grupo.matrix);
  // el móvil, lejos, de pie mirando a la cámara; los beacons van del tag a él
  tor.tel = crearMovil({ kicker: T.kicker, titulo: T.titulo, espera: '', leyendo: '', ok: T.estados[0], magnitud: T.magnitud, tec: 'ble' });
  tor.tel.grupo.position.set(...D.tel);
  tor.tel.grupo.rotation.set(-0.08, THREE.MathUtils.degToRad(D.az) - 0.15, 0, 'YXZ');
  tor.tel.grupo.traverse((o) => { o.castShadow = false; });
  giro.add(tor.tel.grupo);
  for (let i = 0; i < 6; i++) tor.beacons.push(brillo(0xFF8000, 0.0085));
  // los rótulos
  const capa = document.getElementById('etiquetas');
  const rotulo = (k, clase, html) => { const el = document.createElement('div'); el.className = clase; el.innerHTML = html; capa.appendChild(el); tor.rotulos[k] = el; };
  rotulo('lector', 'etq disp dos', `<img src="img/tecnologias/rain.svg" alt="RAIN"><div><b>${T.lector}</b><span>${T.energia}</span></div>`);
  rotulo('pc', 'etq disp dos abajo', `<div><b>${T.pc}</b><span>${T.pcDatos}</span></div>`);
  rotulo('tel', 'etq disp dos naranja arriba-izq', `<img src="img/tecnologias/ble.svg" alt="Bluetooth"><div><b>${T.movil}</b><span>${T.datos}</span></div>`);
  tor.ant.grupo.updateMatrix(); tor.tel.grupo.updateMatrix();
  tor.puntos = {
    lector: new V3(0, 0.15, 0).applyMatrix4(tor.ant.grupo.matrix),
    pc: new V3(0, 0, 0.115).applyMatrix4(tor.pc.grupo.matrix),
    tel: new V3(0, 0.082, 0).applyMatrix4(tor.tel.grupo.matrix),    // encima del móvil
  };
  const grados = THREE.MathUtils.degToRad;
  // encuadre: las esquinas de cada aparato y de la mesa, la torre en sus inclinaciones máximas (su punta, el mirador y la
  // cuna) y sitio para los rótulos (encima de la antena, debajo del PC y del móvil)
  const esquinas = (...objs) => objs.flatMap((o) => {
    const b = new THREE.Box3().setFromObject(o), r = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) r.push(new V3(x, y, z));
    return r;
  });
  const y0 = tor.movil.position.y, torreLocal = [[0, 0.745 - y0, 0], [0.045, 0.53 - y0, 0], [-0.045, 0.53 - y0, 0], [0.045, 0.178 - y0, 0.073],
    [-0.045, 0.178 - y0, -0.073]].map((q) => new V3(...q));
  const torre = esquinas(raiz.getObjectByName('tabla'), raiz.getObjectByName('base'));
  for (const a of [-31, 0, 31]) {
    tor.movil.rotation.z = -grados(a);
    tor.movil.updateMatrixWorld(true);
    torreLocal.forEach((q) => torre.push(q.clone().applyMatrix4(tor.movil.matrixWorld)));
  }
  tor.movil.rotation.z = 0;
  tor.movil.updateMatrixWorld(true);
  const uhf = [...esquinas(tor.ant.grupo, pie, tor.fx.grupo, tor.pc.grupo),
    tor.puntos.lector.clone().add(new V3(0, 0.13, 0)), tor.puntos.pc.clone().add(new V3(0, -0.2, 0))];
  const tel = [...esquinas(tor.tel.grupo), tor.puntos.tel.clone().add(new V3(0, 0.16, 0))];
  // fase 2, de cerca: desde el lado del móvil, mirando hacia la torre; el móvil grande delante y la torre, lejos, al fondo
  const vista = (puntos) => [puntos, grados(D.elev), grados(D.az), D.margen];
  // fase 2, de cerca: la cámara junto al móvil (detrás y a un lado), mirando hacia la torre: el móvil grande delante,
  // con la pantalla hacia la cámara, y la torre lejos al fondo, de donde llegan los beacons
  const telP = tor.tel.grupo.position, haciaTorre = new V3(-telP.x, 0, -telP.z).normalize();
  const lado = new V3(haciaTorre.z, 0, -haciaTorre.x);           // hacia delante (el lado del público)
  const pos = telP.clone().addScaledVector(haciaTorre, -D.telCam[0]).addScaledVector(lado, D.telCam[1]).add(new V3(0, D.telCam[2], 0));
  const mira = telP.clone().addScaledVector(haciaTorre, D.telCam[3]).add(new V3(0, 0.08, 0));
  tor.yawTel = Math.atan2(pos.x - telP.x, pos.z - telP.z);
  st.vistas = { inicio: vista([...uhf, ...torre]), todo: vista([...uhf, ...torre, ...tel]),
    tel: { pos, mira, d: pos.distanceTo(mira) }, mezcla: [] };
}

const FLUJO = new V3();
function pintarTorre(c) {
  // la cámara: la parte UHF y la torre -> todo (aparece el móvil) -> la torre y el móvil -> vuelta
  st.vistas.mezcla = [['todo', rampa(c, 8, 10)], ['tel', rampa(c, 12, 14)], ['inicio', rampa(c, 20, 22)]];
  const p = rampa(c, 8, 9.2) * (1 - rampa(c, 20.6, 21.6));           // el móvil, que aparece creciendo y se va
  tor.tel.grupo.visible = p > 0.001;
  tor.tel.grupo.scale.setScalar(Math.max(p, 1e-3));
  const y0 = THREE.MathUtils.degToRad(DISPO_TORRE.az) - 0.15;    // mira a la cámara: la de lejos y, de cerca, la de al lado
  tor.tel.grupo.rotation.y = y0 + (tor.yawTel - y0) * rampa(c, 12, 14);
  tor.verTel = rampa(c, 9, 10) * (1 - rampa(c, 20, 20.8));
  tor.verUhf = 1 - rampa(c, 12, 12.8) + rampa(c, 20.5, 21.5);       // sus rótulos, fuera mientras se ve el móvil de cerca
  const a = anguloTorre(t);
  tor.movil.rotation.z = -THREE.MathUtils.degToRad(a);            // a la derecha, rotation.z negativo
  tor.movil.updateMatrixWorld(true);
  tor.tag.copy(TAG_CUNA).applyMatrix4(tor.movil.matrixWorld);
  giro.worldToLocal(tor.tag);
  tor.rain.tramo(tor.rain.desde, tor.tag);
  tor.rain.intensidad = 1;                                       // la antena da energía todo el rato
  tor.rain.actualizar(t);
  tor.beacons.forEach((m, i) => {                                // un beacon cada 0,45 s, del tag al móvil
    const s = ((t / 2.6 + i / tor.beacons.length) % 1 + 1) % 1;   // 2,5 m: tardan más
    m.position.lerpVectors(tor.tag, tor.tel.grupo.position, s);
    m.material.opacity = Math.min(1, s * 10, (1 - s) * 8) * p;          // solo con el móvil
    m.visible = p > 0.001;
  });
  tor.alLector.forEach((m, i) => {                                // del tag al lector, en arco
    const s = ((t / 2.2 + i / tor.alLector.length) % 1 + 1) % 1;
    m.position.lerpVectors(tor.tag, tor.lectorRx, s).add(FLUJO.set(0, 0.16 * Math.sin(Math.PI * s), 0));
    m.material.opacity = Math.min(1, s * 10, (1 - s) * 8);
  });
  tor.flujo.forEach((m, i) => {
    const s = ((t / 1.4 + i / tor.flujo.length) % 1 + 1) % 1;
    m.position.copy(tor.red.curva.getPointAt(s, FLUJO));
    m.material.opacity = Math.min(1, s * 10, (1 - s) * 10);
  });
  if (t - tor.ultimo > 0.12 || t < tor.ultimo) {                // las pantallas, a ~8 Hz (redibujar el canvas cuesta)
    tor.ultimo = t;
    const m = Math.abs(a), n = m >= TORRE.alarma ? 2 : m >= TORRE.vigilar ? 1 : 0;
    const valor = `${a < -0.05 ? '−' : '+'}${m.toFixed(1)}°`, chip = { texto: TX.torre.estados[n], color: TORRE.colores[n] };
    tor.tel.pantalla.poner('torre', valor, chip, a);                // con la torre dibujada, como su app
    tor.pc.pantalla.poner('torre', valor, chip, a);
  }
}

function rotulosTorre() {
  for (const [k, el] of Object.entries(tor.rotulos)) {
    const ver = Math.min(1, k === 'tel' ? tor.verTel : tor.verUhf);
    el.style.opacity = ver.toFixed(3);
    if (ver > 0) colocar(el, tor.puntos[k]);
  }
}

// ------------------------------------------------------------------------------------------- alta tensión
// Dos escenas, 26 s (de los posts del blog de Mikel, jun-2026, y de fotos y cortes reales):
//   A: una fila de celdas de media tensión; la de la derecha, con el lateral quitado (compartimentos de control,
//      interruptor extraíble, embarrado y cables). Plano general (0-2 s) y la cámara entra al embarrado (2-4 s). Cada
//      unión atornillada lleva un tag de temperatura y la antena va dentro de la celda: la unión L2 se calienta (un
//      tornillo flojo) y se pone al rojo; el panel dice cuál es y enseña su tendencia (4-11 s).
//   B: un compartimento GIS en corte (cuba crema con bridas atornilladas, conductor sobre aisladores cónicos estancos, gas,
//      mando, manómetro). El sensor va dentro, en el fondo, sobre una ventana dieléctrica con la antena debajo. Hay una
//      fuga por una brida: la densidad baja (también en el manómetro) y salta la alerta (13-23 s).
//   La cámara vuelve al plano general (23-26 s).
const CICLO_ENE = 26;
const ene = { tags: [], calor: null, rain: null, rainGis: null, gas: null, puntosGas: null, fuga: null, panel: null,
  rotulos: {}, puntos: {}, ultimo: -1, matCaliente: null, pantallaRele: null };
const tempL2 = (c) => 61.2 + 20 * rampa(c, 4, 10);                    // la unión que se calienta
const densidadGas = (c) => 0.60 - 0.056 * rampa(c, 14, 21);            // MPa (a 20 °C)

// un halo (sprite con degradado radial): el punto caliente
function halo(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false }));
  sp.renderOrder = 7;
  return sp;
}

function prepararEnergia(raiz) {
  const M = (color, metal = 0.3, rug = 0.55, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rug, ...extra });
  const caja = (g, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cil = (g, r, h, m, x, y, z, eje = 'y', seg = 24, r2 = r) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m); o.position.set(x, y, z);
    if (eje === 'x') o.rotation.z = Math.PI / 2; else if (eje === 'z') o.rotation.x = Math.PI / 2;
    g.add(o); return o;
  };
  const T = TX.alta;
  const chapa = M(0xBFC5CB, 0.4, 0.5, { side: THREE.DoubleSide }), chapaOsc = M(0x7E868E, 0.45, 0.5);
  const cobre = M(0xD9905A, 0.55, 0.38), epoxi = M(0xA8302A, 0.05, 0.5), negro = M(0x1E2226, 0.2, 0.6);
  const acero = M(0xC9CDD1, 0.85, 0.3), pintura = M(0x2C3E50, 0.2, 0.5);
  const tuerca = (g, x, y, z, eje, r = 0.011) => {                     // tornillo con tuerca hexagonal y arandela
    cil(g, r * 1.6, 0.003, acero, x, y, z, eje, 20);
    const t = cil(g, r * 1.25, r * 1.1, acero, x, y, z, eje, 6);
    t.position.addScaledVector(new V3(eje === 'x' ? 1 : 0, eje === 'y' ? 1 : 0, eje === 'z' ? 1 : 0), r * 0.6);
  };
  const aislador = (g, x, y, z, eje, largo) => {                       // aislador de resina con aletas
    cil(g, 0.022, largo, epoxi, x, y, z, eje, 20);
    const n = Math.max(3, Math.round(largo / 0.025));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5;
      cil(g, 0.034, 0.008, epoxi, x + (eje === 'x' ? f * largo : 0), y + (eje === 'y' ? f * largo : 0), z + (eje === 'z' ? f * largo : 0), eje, 20);
    }
  };
  const W = 0.65, H = 2.2, D = 1.4, e = 0.02;
  // una celda cerrada (las vecinas) o abierta por la derecha (la nuestra)
  function celdaMT(x0, abierta) {
    const g = new THREE.Group(); g.position.set(x0, 0, 0); raiz.add(g);
    caja(g, W, H, e, chapa, 0, H / 2, -D / 2);
    caja(g, e, H, D, chapa, -W / 2, H / 2, 0);
    if (!abierta) caja(g, e, H, D, chapa, W / 2, H / 2, 0);
    caja(g, W, e, D, chapa, 0, H, 0);
    caja(g, W, e, D, chapaOsc, 0, 0.01, 0);
    for (const x of [-0.18, 0, 0.18]) caja(g, 0.16, 0.012, 0.34, chapaOsc, x, H + 0.012, -0.4);   // flaps de sobrepresión
    // puertas: control (relé con pantalla y LED), interruptor (esquema unifilar y mirilla) y cables (rejilla)
    const puerta = (y, h) => {
      caja(g, W - 0.01, h - 0.012, e, chapa, 0, y, D / 2);
      caja(g, 0.016, 0.07, 0.03, negro, W / 2 - 0.06, y, D / 2 + 0.02);                          // maneta
      for (const dy of [-h / 2 + 0.08, h / 2 - 0.08]) cil(g, 0.01, 0.05, chapaOsc, -W / 2 + 0.012, y + dy, D / 2 + 0.01, 'y', 12);   // bisagras
    };
    puerta(1.9, 0.6); puerta(1.17, 0.82); puerta(0.38, 0.72);
    const rele = caja(g, 0.2, 0.15, 0.014, negro, -0.1, 1.94, D / 2 + 0.014);
    caja(g, 0.14, 0.07, 0.002, M(0x0E3A2A, 0, 0.3, { emissive: 0x1E8A5A, emissiveIntensity: 0.6 }), -0.1, 1.95, D / 2 + 0.022);
    void rele;
    for (const [x, c] of [[0.1, 0x2EBD6B], [0.14, 0xF2B01E], [0.18, 0xE5484D]]) {
      cil(g, 0.009, 0.01, M(c, 0, 0.4, { emissive: c, emissiveIntensity: 0.5 }), x, 1.98, D / 2 + 0.018, 'z', 12);
    }
    // esquema unifilar (barras y el interruptor) en la puerta del medio, y una mirilla
    const linea = M(0x2C3E50, 0, 0.6);
    caja(g, 0.4, 0.01, 0.003, linea, 0, 1.43, D / 2 + 0.012);
    caja(g, 0.01, 0.4, 0.003, linea, 0, 1.24, D / 2 + 0.012);
    caja(g, 0.06, 0.06, 0.004, M(0x1E6FD9, 0, 0.5), 0, 1.2, D / 2 + 0.013);
    caja(g, 0.2, 0.12, 0.004, M(0x0B0D10, 0.2, 0.15), 0.17, 1.05, D / 2 + 0.013);
    for (let i = 0; i < 6; i++) caja(g, 0.3, 0.01, 0.003, chapaOsc, 0, 0.18 + i * 0.03, D / 2 + 0.012);   // rejilla
    return g;
  }
  // ---------- A: la fila de celdas; la nuestra (a la derecha) con el lateral quitado
  celdaMT(-1.25 - 2 * W, false);
  celdaMT(-1.25 - W, false);
  const celda = celdaMT(-1.25, true);
  // tabiques: compartimento de embarrado (arriba, detrás) y de control (arriba, delante)
  caja(celda, W, e, 0.75, chapaOsc, 0, 1.58, -0.32);
  caja(celda, W, 0.62, e, chapaOsc, 0, 1.89, 0.06);
  caja(celda, W, e, 0.64, chapaOsc, 0, 1.58, 0.38);
  // el interruptor extraíble, con sus tres polos de resina, los brazos de contacto y las cuchillas de tierra
  caja(celda, 0.52, 0.55, 0.5, M(0x9AA2AA, 0.4, 0.45), 0, 1.12, 0.34);
  caja(celda, 0.5, 0.06, 0.52, chapaOsc, 0, 0.82, 0.34);                // el carro
  for (const x of [-0.17, 0, 0.17]) {
    cil(celda, 0.05, 0.38, epoxi, x, 1.12, 0.02, 'y', 24);
    for (const y of [0.99, 1.25]) cil(celda, 0.018, 0.22, cobre, x, y, -0.1, 'z', 16);     // brazos con contactos de tulipa
    for (const y of [0.99, 1.25]) cil(celda, 0.03, 0.05, acero, x, y, -0.22, 'z', 16);
  }
  // compartimento de cables: tres terminaciones con sus faldillas, cables y la trenza de tierra
  for (const x of [-0.17, 0, 0.17]) {
    cil(celda, 0.03, 0.42, epoxi, x, 0.52, -0.32);
    for (let i = 0; i < 4; i++) cil(celda, 0.05, 0.012, epoxi, x, 0.4 + i * 0.07, -0.32);
    cil(celda, 0.024, 0.32, negro, x, 0.16, -0.32);
    caja(celda, 0.05, 0.03, 0.03, acero, x, 0.75, -0.32);
  }
  caja(celda, 0.5, 0.01, 0.03, cobre, 0, 0.05, -0.55);                  // barra de tierra
  // embarrado: tres pletinas de cobre (100 × 10 mm) a lo ancho (siguen por las vecinas), en aisladores con aletas, y
  // las derivaciones atornilladas que bajan a los contactos del interruptor
  ene.matCaliente = M(0xD9905A, 0.55, 0.38, { emissive: 0xFF5A1A, emissiveIntensity: 0 });
  const fases = [['L1', 2.02], ['L2', 1.86], ['L3', 1.70]], zb = -0.5;
  fases.forEach(([nombre, y], i) => {
    const mCu = i === 1 ? ene.matCaliente : cobre;
    caja(celda, W + 0.04, 0.1, 0.012, cobre, 0, y, zb);
    for (const x of [-0.24, 0.24]) aislador(celda, x, y, zb - 0.09, 'z', 0.15);
    const xd = -0.12 + i * 0.12;
    caja(celda, 0.06, 0.1, 0.012, mCu, xd, y, zb + 0.013);              // la unión: dos pletinas solapadas
    caja(celda, 0.06, (y - 1.32), 0.012, cobre, xd, (y + 1.32) / 2 - 0.05, zb + 0.013);
    caja(celda, 0.06, 0.012, 0.36, cobre, xd, 1.25, zb + 0.18);         // y hasta el contacto del interruptor
    for (const dy of [-0.025, 0.025]) tuerca(celda, xd, y + dy, zb + 0.02, 'z');
    // el tag: carcasa azul con su etiqueta y la pletina bajo el tornillo de abajo
    const tag = new THREE.Group();
    caja(tag, 0.055, 0.032, 0.02, M(0x1E6FD9, 0.1, 0.45), 0, 0, 0);
    caja(tag, 0.036, 0.012, 0.002, M(0xF2F4F6, 0, 0.6), 0, 0.004, 0.0105);
    caja(tag, 0.02, 0.01, 0.004, M(0x2EBD6B, 0, 0.4, { emissive: 0x2EBD6B, emissiveIntensity: 0.4 }), -0.012, -0.009, 0.0105);
    caja(tag, 0.045, 0.012, 0.002, cobre, -0.04, -0.012, -0.008);       // pletina del tag, bajo el tornillo
    tag.position.set(xd + 0.06, y - 0.012, zb + 0.032);
    celda.add(tag);
    ene.tags.push({ nombre, tag, base: [58.4, 61.2, 59.1][i] });
  });
  ene.calor = halo('rgba(255,110,30,0.85)');
  ene.calor.position.set(0.0, 1.86, -0.46);
  celda.add(ene.calor);
  // la antena, encastrada en el tabique entre el embarrado y el compartimento de control (en vertical, con la cara a la
  // vista y su marco), y el cable al lector, que está al otro lado del tabique
  const ant = crearAntenaPanel();
  ant.grupo.scale.setScalar(0.55);
  ant.grupo.position.set(0.12, 1.88, 0.066);
  celda.add(ant.grupo);
  caja(celda, 0.165, 0.165, 0.006, chapaOsc, 0.12, 1.88, 0.071);       // el marco del encastre
  const lector = crearLectorFijo();
  lector.grupo.scale.setScalar(0.55);
  lector.grupo.position.set(-0.08, 1.6, 0.34);
  celda.add(lector.grupo);
  cable(celda, [new V3(0.12, 1.8, 0.08), new V3(0.08, 1.68, 0.16), new V3(-0.02, 1.64, 0.3)], { r: 0.004 });
  // ---------- B: compartimento GIS (cuba de 2 m, Ø 0,66 m) en corte, sobre su bastidor
  const gis = new THREE.Group();
  gis.position.set(1.35, 0, 0);
  raiz.add(gis);
  const crema = M(0xE4DCC6, 0.15, 0.55, { side: THREE.DoubleSide }), cremaS = M(0xE4DCC6, 0.15, 0.55), corte = M(0xD9532E, 0.1, 0.5);
  const yc = 1.25, R = 0.33, L = 2.0;
  // bastidor: patas con placas de anclaje, travesaños y diagonales
  for (const x of [-0.75, 0.75]) for (const z of [-0.22, 0.22]) {
    caja(gis, 0.08, yc - R, 0.08, pintura, x, (yc - R) / 2, z);
    caja(gis, 0.16, 0.012, 0.16, pintura, x, 0.006, z);
  }
  for (const z of [-0.22, 0.22]) {
    caja(gis, 1.6, 0.06, 0.06, pintura, 0, 0.45, z);
    const d = caja(gis, 0.04, 1.0, 0.04, pintura, 0, 0.62, z); d.rotation.z = 1.05;
  }
  // la cuba en corte (abierta de -80° a 35°: se ve por dentro) con los bordes del corte en rojo, como en los planos
  const t0 = THREE.MathUtils.degToRad(35), t1 = THREE.MathUtils.degToRad(280);
  const cuba = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 72, 1, true, t0, t1 - t0), crema);
  cuba.rotation.z = Math.PI / 2; cuba.position.set(0, yc, 0); gis.add(cuba);
  for (const a of [t0, t1]) caja(gis, L, 0.014, 0.022, corte, 0, yc + R * Math.sin(a), R * Math.cos(a)).rotation.x = -a;
  for (const x of [-L / 2, L / 2]) {                                     // bridas atornilladas y aisladores cónicos estancos
    const brida = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.035, 12, 56), cremaS);
    brida.rotation.y = Math.PI / 2; brida.position.set(x, yc, 0); gis.add(brida);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 2 * Math.PI;
      tuerca(gis, x + Math.sign(x) * 0.03, yc + (R + 0.04) * Math.sin(a), (R + 0.04) * Math.cos(a), 'x', 0.009);
    }
    const cono = new THREE.Mesh(new THREE.CylinderGeometry(0.07, R - 0.01, 0.16, 56), M(0x2A2D31, 0.1, 0.45));
    cono.rotation.z = (x < 0 ? -1 : 1) * Math.PI / 2; cono.position.set(x - Math.sign(x) * 0.08, yc, 0); gis.add(cono);
    cil(gis, R + 0.005, 0.02, M(0x8E969E, 0.7, 0.35), x, yc, 0, 'x', 56);  // aro metálico del aislador
  }
  // la tapa abombada a la izquierda y la salida vertical con su cúpula
  const tapa = new THREE.Mesh(new THREE.SphereGeometry(R + 0.02, 40, 16, 0, 2 * Math.PI, 0, Math.PI / 2), cremaS);
  tapa.rotation.z = Math.PI / 2; tapa.scale.set(1, 0.35, 1); tapa.position.set(-L / 2 - 0.02, yc, 0); gis.add(tapa);
  cil(gis, 0.2, 0.5, cremaS, 0.45, yc + R + 0.18, 0, 'y', 48);
  const brida2 = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.03, 12, 48), cremaS);
  brida2.rotation.x = Math.PI / 2; brida2.position.set(0.45, yc + R + 0.44, 0); gis.add(brida2);
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(0.21, 32, 12, 0, 2 * Math.PI, 0, Math.PI / 2), cremaS);
  cupula.scale.set(1, 0.45, 1); cupula.position.set(0.45, yc + R + 0.45, 0); gis.add(cupula);
  // el armario del mando, detrás, y la caja de bornas
  caja(gis, 0.5, 0.55, 0.3, M(0x9AA2AA, 0.4, 0.45), 0.2, yc + 0.05, -R - 0.17);
  caja(gis, 0.04, 0.12, 0.02, negro, 0.4, yc + 0.05, -R - 0.01);
  // el conductor (aluminio) con los contactos enchufables de tulipa en los aisladores y en el centro
  cil(gis, 0.055, L - 0.2, acero, 0, yc, 0, 'x', 32);
  cil(gis, 0.1, 0.3, M(0xB5BAC0, 0.85, 0.3), -0.25, yc, 0, 'x', 32);
  for (const x of [-L / 2 + 0.22, L / 2 - 0.22]) cil(gis, 0.075, 0.12, M(0xB5BAC0, 0.85, 0.3), x, yc, 0, 'x', 32);
  // el gas: un volumen tenue y partículas que se mueven (menos cuanto más baja la densidad)
  ene.gas = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, L - 0.1, 48, 1, false), new THREE.MeshBasicMaterial({
    color: 0x6FD3B8, transparent: true, opacity: 0.16, depthWrite: false }));
  ene.gas.rotation.z = Math.PI / 2; ene.gas.position.set(0, yc, 0); gis.add(ene.gas);
  const nP = 260, pos = new Float32Array(nP * 3);
  ene.semillas = [];
  for (let i = 0; i < nP; i++) {
    const a = Math.random() * 2 * Math.PI, r = Math.sqrt(Math.random()) * (R - 0.04), x = (Math.random() - 0.5) * (L - 0.25);
    ene.semillas.push([x, a, r, Math.random() * 6.28]);
    pos.set([x, yc + r * Math.cos(a), r * Math.sin(a)], i * 3);
  }
  const geoP = new THREE.BufferGeometry(); geoP.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const matGas = { color: 0xB8FFE8, size: 0.03, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
  ene.puntosGas = new THREE.Points(geoP, new THREE.PointsMaterial(matGas));
  gis.add(ene.puntosGas);
  // la fuga: gas que se escapa por la brida de la derecha, por arriba
  const nF = 40, posF = new Float32Array(nF * 3);
  ene.fugaSem = Array.from({ length: nF }, () => [Math.random(), (Math.random() - 0.5) * 0.6, Math.random() * 6.28]);
  const geoF = new THREE.BufferGeometry(); geoF.setAttribute('position', new THREE.BufferAttribute(posF, 3));
  ene.fuga = new THREE.Points(geoF, new THREE.PointsMaterial({ ...matGas, size: 0.035, opacity: 0 }));
  ene.fugaOrigen = new V3(L / 2, yc + R * 0.7, R * 0.7);
  gis.add(ene.fuga);
  // el sensor sin pilas, dentro, en el fondo (con su toma de presión), sobre la ventana dieléctrica; la antena debajo, en
  // el bastidor, con el cable al lector
  const xs = -0.55;
  cil(gis, 0.05, 0.03, M(0x1E6FD9, 0.1, 0.45), xs, yc - R + 0.035, 0.0, 'y', 32);
  cil(gis, 0.012, 0.02, acero, xs + 0.025, yc - R + 0.06, 0.0, 'y', 12);
  cil(gis, 0.085, 0.04, M(0xC9A24A, 0.1, 0.35), xs, yc - R - 0.012, 0.0, 'y', 32);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 2 * Math.PI;
    tuerca(gis, xs + 0.1 * Math.cos(a), yc - R - 0.03, 0.1 * Math.sin(a), 'y', 0.006);
  }
  const antG = crearAntenaPanel();
  antG.grupo.scale.setScalar(0.5);
  antG.grupo.position.set(xs, yc - R - 0.3, 0.06);
  gis.add(antG.grupo);
  gis.updateMatrixWorld(true);
  antG.grupo.lookAt(gis.localToWorld(new V3(xs, yc, 0)));
  const lectorG = crearLectorFijo();
  lectorG.grupo.scale.setScalar(0.5);
  lectorG.grupo.position.set(-0.05, 0.48, 0.0);
  gis.add(lectorG.grupo);
  cable(gis, [new V3(xs, yc - R - 0.36, 0.0), new V3(xs + 0.1, 0.62, 0.02), new V3(-0.15, 0.52, 0.04)], { r: 0.004 });
  // el manómetro de densidad de hoy, en el extremo derecho, con su tubito (se lee en las rondas)
  const dial = document.createElement('canvas'); dial.width = dial.height = 128;
  ene.dial = { c: dial, tex: new THREE.CanvasTexture(dial) };
  ene.dial.tex.colorSpace = THREE.SRGBColorSpace;
  // (por delante del bastidor: la diagonal de delante acaba justo detrás)
  const xg = L / 2 - 0.55, yg = yc - R - 0.05, zg = 0.36;
  cil(gis, 0.085, 0.045, M(0x8E969E, 0.7, 0.35), xg, yg, zg, 'z', 40);
  const caraDial = new THREE.Mesh(new THREE.CircleGeometry(0.075, 40), new THREE.MeshBasicMaterial({ map: ene.dial.tex, toneMapped: false }));
  caraDial.position.set(xg, yg, zg + 0.024); gis.add(caraDial);
  cable(gis, [new V3(xg, yg + 0.07, zg - 0.02), new V3(xg, yg + 0.1, zg - 0.12), new V3(xg, yc - R + 0.03, 0.2)], { r: 0.006, color: 0xC9CDD1 });
  // ondas: dentro de la celda, de la antena a las uniones; en el GIS, de la antena al sensor, por la ventana
  raiz.updateMatrixWorld(true);
  const aGiro = (o, local) => giro.worldToLocal(o.localToWorld(local.clone()));
  ene.rain = new Ondas(giro, { n: 4, periodo: 1.0, r0: 0.02, r1: 0.12 })
    .tramo(aGiro(ant.grupo, ant.cara), aGiro(ene.tags[1].tag, new V3()));
  ene.rainGis = new Ondas(giro, { n: 4, periodo: 1.0, r0: 0.03, r1: 0.12 })
    .tramo(aGiro(antG.grupo, antG.cara), aGiro(gis, new V3(xs, yc - R + 0.035, 0)));
  // rótulos
  const capa = document.getElementById('etiquetas');
  const rotulo = (k, clase, html, punto) => { const el = document.createElement('div'); el.className = clase; el.innerHTML = html; capa.appendChild(el); ene.rotulos[k] = el; ene.puntos[k] = punto; };
  ene.tags.forEach((tg, i) => rotulo(tg.nombre, `etq disp temp ${['arriba-izq', '', 'derecha'][i]}`,
    `<b>${tg.nombre}</b><span class="tv">--</span>`, aGiro(tg.tag, new V3(0, 0.02, 0))));
  rotulo('antena', 'etq disp dos abajo', `<img src="img/tecnologias/rain.svg" alt="RAIN"><div><b>${T.antena}</b><span>${T.antenaDet}</span></div>`,
    aGiro(ant.grupo, new V3(0, -0.13, 0)));
  rotulo('sensor', 'etq disp dos', `<div><b>${T.sensor}</b><span>${T.sensorDet}</span></div>`, aGiro(gis, new V3(xs, yc - R + 0.06, 0)));
  rotulo('ventana', 'etq disp dos abajo', `<img src="img/tecnologias/rain.svg" alt="RAIN"><div><b>${T.antena}</b><span>${T.ventana}</span></div>`,
    aGiro(antG.grupo, new V3(0, 0, 0)));
  rotulo('manometro', 'etq disp dos abajo naranja', `<div><b>${T.manometro}</b></div>`, aGiro(gis, new V3(xg, yg - 0.08, zg)));
  ene.panel = document.getElementById('app');
  ene.panel.className = 'visible';
  // encuadres: la fila de celdas (plano general), el compartimento de embarrado y el GIS
  const esquinas = (o) => {
    const b = new THREE.Box3().setFromObject(o), r = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) r.push(giro.worldToLocal(new V3(x, y, z)));
    return r;
  };
  const zona = [], fila = [];
  for (const x of [-0.34, 0.46]) for (const y of [1.48, 2.22]) for (const z of [-0.72, 0.05]) zona.push(giro.worldToLocal(celda.localToWorld(new V3(x, y, z))));
  for (const x of [-2 * W - 0.35, 0.4]) for (const y of [0, H + 0.05]) for (const z of [-D / 2, D / 2]) fila.push(giro.worldToLocal(celda.localToWorld(new V3(x, y, z))));
  const grados = THREE.MathUtils.degToRad;
  st.vistas = { inicio: [fila, grados(14), grados(40), 1.05], embarrado: [zona, grados(12), grados(52), 1.05],
    gis: [esquinas(gis), grados(14), grados(18), 1.0], mezcla: [] };
}

function pintarDial(densidad) {                                    // 0,5-0,7 MPa, con la zona roja por debajo de 0,56
  const { c, tex } = ene.dial, x = c.getContext('2d'), a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (v) => a0 + (a1 - a0) * (v - 0.5) / 0.2;
  x.fillStyle = '#F2F0E8'; x.beginPath(); x.arc(64, 64, 62, 0, 2 * Math.PI); x.fill();
  x.lineWidth = 12;
  x.strokeStyle = '#D94040'; x.beginPath(); x.arc(64, 64, 46, ang(0.5), ang(0.56)); x.stroke();
  x.strokeStyle = '#2EBD6B'; x.beginPath(); x.arc(64, 64, 46, ang(0.56), ang(0.7)); x.stroke();
  x.strokeStyle = '#1E2226'; x.lineWidth = 4; x.lineCap = 'round';
  const a = ang(densidad);
  x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + 44 * Math.cos(a), 64 + 44 * Math.sin(a)); x.stroke();
  x.fillStyle = '#1E2226'; x.beginPath(); x.arc(64, 64, 6, 0, 2 * Math.PI); x.fill();
  tex.needsUpdate = true;
}

// la tendencia, en el panel: la curva hasta ahora y el umbral de alarma
function traza(f, c0, c1, c, min, max, umbral) {
  const n = 48, pts = [];
  for (let i = 0; i <= n; i++) {
    const cc = c0 + (c1 - c0) * i / n;
    if (cc > c) break;
    pts.push(`${(100 * i / n).toFixed(1)},${(30 - 30 * (f(cc) - min) / (max - min)).toFixed(1)}`);
  }
  const yu = (30 - 30 * (umbral - min) / (max - min)).toFixed(1);
  return `<svg class="traza" viewBox="0 0 100 30" preserveAspectRatio="none"><line x1="0" y1="${yu}" x2="100" y2="${yu}"/>
    <polyline points="${pts.join(' ')}"/></svg>`;
}

function pintarEnergia(c) {
  const T = TX.alta;
  st.vistas.mezcla = [['embarrado', rampa(c, 2, 4)], ['gis', rampa(c, 11, 13)], ['inicio', rampa(c, 23, 26)]];
  // A: la unión L2 se calienta y se pone al rojo
  const subida = rampa(c, 4, 10);
  const temps = ene.tags.map((tg, i) => (i === 1 ? tempL2(c) : tg.base) + 0.25 * Math.sin(t * 1.3 + i));
  const caliente = temps[1] >= 70;
  ene.calor.material.opacity = 0.1 + 0.9 * subida;
  ene.calor.scale.setScalar(0.1 + 0.24 * subida * (1 + 0.08 * Math.sin(t * 6)));
  ene.matCaliente.emissiveIntensity = 1.4 * subida;
  ene.rain.intensidad = rampa(c, 3, 4) * (1 - rampa(c, 11, 12));
  ene.rain.actualizar(t);
  // B: fuga en el GIS
  const fuga = rampa(c, 14, 21), densidad = densidadGas(c), humedad = 150 + 90 * fuga;
  const alerta = densidad < 0.56;
  ene.rainGis.intensidad = rampa(c, 12, 13) * (1 - rampa(c, 23, 24));
  ene.rainGis.actualizar(t);
  const pos = ene.puntosGas.geometry.attributes.position;
  ene.semillas.forEach(([x, a, r, f], i) => {
    const aa = a + t * 0.25 + f;
    pos.setXYZ(i, x + 0.03 * Math.sin(t * 0.7 + f), 1.25 + r * Math.cos(aa), r * Math.sin(aa));
  });
  pos.needsUpdate = true;
  ene.puntosGas.material.opacity = 0.85 * (1 - 0.75 * fuga);
  ene.gas.material.opacity = 0.16 * (1 - 0.6 * fuga);
  const posF = ene.fuga.geometry.attributes.position, o = ene.fugaOrigen;
  ene.fugaSem.forEach(([f0, dz, ph], i) => {                         // salen de la brida, suben y se abren
    const s = (t * 0.6 + f0) % 1;
    posF.setXYZ(i, o.x + 0.05 + 0.25 * s, o.y + 0.35 * s + 0.03 * Math.sin(ph + t * 3), o.z + dz * s * 0.6);
  });
  posF.needsUpdate = true;
  ene.fuga.material.opacity = 0.9 * rampa(c, 14, 15.5) * (1 - rampa(c, 22.5, 23.5));
  // panel, dial y rótulos, a ~8 Hz
  if (t - ene.ultimo > 0.12 || t < ene.ultimo) {
    ene.ultimo = t;
    pintarDial(densidad);
    ene.tags.forEach((tg, i) => {
      const el = ene.rotulos[tg.nombre];
      el.querySelector('.tv').textContent = `${temps[i].toFixed(1)} °C`;
      el.classList.toggle('alarma', i === 1 && caliente);
    });
    const fila = (clase, nombre, estado, valor, unidad, mal) => `<div class="fila ${clase}${mal ? ' no' : ''}"><i class="led${mal ? ' mal' : ' on'}"></i>
      <div class="nom"><b>${nombre}</b><small>${estado}</small></div><div class="cuenta">${valor}<span>${unidad}</span></div></div>`;
    const enGis = c >= 12 && c < 24;
    ene.panel.classList.toggle('arriba', enGis);                     // en el GIS, arriba a la izquierda: deja ver el manómetro y la fuga
    ene.panel.innerHTML = `<div class="tit"><img src="img/logo/kliskatek-white.svg" alt="">${enGis ? T.gas : T.embarrado}</div>` + (enGis
      ? fila('gas', T.densidad, alerta ? T.fuga : T.ok, densidad.toFixed(3), 'MPa', alerta)
        + traza(densidadGas, 12, 23, c, 0.53, 0.61, 0.56)
        + fila('hum', T.humedad, fuga > 0.05 ? T.subiendo : T.ok, humedad.toFixed(0), 'ppmv', false)
      : ene.tags.map((tg, i) => fila(`f${i}`, tg.nombre, i === 1 && caliente ? T.caliente : T.normal, temps[i].toFixed(1), '°C',
        i === 1 && caliente)).join('') + traza(tempL2, 2, 11, Math.min(c, 11), 55, 85, 70));
  }
  ene.verA = rampa(c, 2.5, 3.5) * (1 - rampa(c, 11, 11.8));
  ene.verB = rampa(c, 12.6, 13.4) * (1 - rampa(c, 22.6, 23.2));
}

function rotulosEnergia() {
  for (const [k, el] of Object.entries(ene.rotulos)) {
    const ver = Math.min(1, ['sensor', 'ventana', 'manometro'].includes(k) ? ene.verB : ene.verA);
    el.style.opacity = ver.toFixed(3);
    if (ver > 0) colocar(el, ene.puntos[k]);
  }
}

// Los rótulos de los aparatos del ladrillo, con la cámara ya puesta (se mueve: si no, irían un fotograma por detrás)
const R_MANO = new V3(0, 0.03, -0.15), R_MOVIL = new V3(0, 0.082, 0), PR = new V3();
function rotulosLadrillo() {
  for (const [k, a, local, ver] of [['mano', lad.mano, R_MANO, lad.verMano], ['movil', lad.movil, R_MOVIL, lad.verMovil]]) {
    const el = lad.rotulos[k];
    el.style.opacity = ver.toFixed(3);
    if (ver <= 0) continue;
    a.grupo.updateMatrix();
    colocar(el, PR.copy(local).applyMatrix4(a.grupo.matrix));
  }
}

// Un rótulo HTML encima de un punto 3D (en coordenadas de `giro`: sigue el vaivén)
const PROY = new V3();
function colocar(el, punto) {
  PROY.copy(punto).applyMatrix4(giro.matrixWorld).project(camara);
  el.style.left = `${((PROY.x + 1) / 2) * window.innerWidth}px`;
  el.style.top = `${((1 - PROY.y) / 2) * window.innerHeight}px`;
}

// Cámara que encuadra una caja (el ancho en X; el alto, la altura y el fondo vistos con la elevación de la cámara)
function vistaDe(caja, elev, acimut = 0, margen = 1.1) {
  if (Array.isArray(caja)) return vistaPuntos(caja, elev, acimut, margen);
  const c = caja.getCenter(new V3()), t = caja.getSize(new V3());
  const tanV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)), tanH = tanV * camara.aspect;
  const ancho = t.x * Math.cos(acimut) + t.z * Math.abs(Math.sin(acimut)), fondo = t.z * Math.cos(acimut) + t.x * Math.abs(Math.sin(acimut));
  const alto = t.y * Math.cos(elev) + fondo * Math.sin(elev);
  const d = margen * Math.max(ancho / 2 / tanH, alto / 2 / tanV) + fondo / 2;
  const dir = new V3(Math.sin(acimut) * Math.cos(elev), Math.sin(elev), Math.cos(acimut) * Math.cos(elev));
  return { pos: c.clone().addScaledVector(dir, d), mira: c, d };
}
// Cámara que encuadra justo unos puntos (no su caja, que tiene las esquinas vacías): la distancia a la que caben todos y
// el centro desplazado para que queden centrados en la imagen (unas pocas iteraciones)
function vistaPuntos(puntos, elev, acimut = 0, margen = 1) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) / margen, tanH = tanV * camara.aspect;
  const dir = new V3(Math.sin(acimut) * Math.cos(elev), Math.sin(elev), Math.cos(acimut) * Math.cos(elev));   // hacia la cámara
  const der = new V3(Math.cos(acimut), 0, -Math.sin(acimut)), arr = new V3().crossVectors(dir, der);
  const c = puntos.reduce((a, q) => a.add(q), new V3()).multiplyScalar(1 / puntos.length);
  const loc = puntos.map((q) => { const r = q.clone().sub(c); return [r.dot(der), r.dot(arr), r.dot(dir)]; });
  let sx = 0, sy = 0, d = 0;
  for (let i = 0; i < 4; i++) {
    d = Math.max(...loc.map(([x, y, z]) => z + Math.max(Math.abs(x - sx) / tanH, Math.abs(y - sy) / tanV)));
    const u = loc.map(([x, , z]) => (x - sx) / (d - z)), v = loc.map(([, y, z]) => (y - sy) / (d - z));
    sx += (Math.min(...u) + Math.max(...u)) / 2 * d;
    sy += (Math.min(...v) + Math.max(...v)) / 2 * d;
  }
  const mira = c.clone().addScaledVector(der, sx).addScaledVector(arr, sy);
  return { pos: mira.clone().addScaledVector(dir, d), mira, d };
}

// st.vistas: { inicio: [caja, elev, acimut, margen], otra: [...], mezcla: [['otra', 0..1], ...] }: de la vista de
// inicio se va pasando, en orden, a las de `mezcla` según su peso
function camaraVistas() {
  const V = st.vistas;
  const ver = (x) => (Array.isArray(x) ? vistaDe(...x) : { pos: x.pos.clone(), mira: x.mira.clone(), d: x.d });   // o una vista fija
  let v = ver(V.inicio);
  for (const [clave, f] of V.mezcla || []) {
    if (f <= 0) continue;
    const w = ver(V[clave]);
    v = { pos: v.pos.lerp(w.pos, f), mira: v.mira.lerp(w.mira, f), d: v.d + (w.d - v.d) * f };
  }
  camara.position.copy(v.pos);
  camara.lookAt(v.mira);
  camara.near = v.d / 50; camara.far = v.d * 10;
  camara.updateProjectionMatrix();
}

const canvas = document.getElementById('vista');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x15181b, 1.15));
const luz = new THREE.DirectionalLight(0xffffff, 2.6);
luz.castShadow = true;
luz.shadow.mapSize.set(2048, 2048);
luz.shadow.bias = -0.0004;
scene.add(luz);
const contra = new THREE.DirectionalLight(0x6fb6ff, 1.3);
scene.add(contra);
// la sombra no escribe profundidad: si no, hace de suelo invisible y corta lo que baja de él (las ondas)
const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }));
sombra.rotation.x = -Math.PI / 2;
sombra.receiveShadow = true;
scene.add(sombra);

const camara = new THREE.PerspectiveCamera(28, 1, 0.01, 30);
const giro = new THREE.Group();          // la escena entera gira despacio
scene.add(giro);

function encuadre() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  if (st.vistas) { camaraVistas(); return; }
  // el rotor, un poco más lejos y corrido a la izquierda: a la derecha va la etiqueta del Stix
  const esRotor = MODELO === 'rotor';
  const r = st.radio * (esRotor ? 1.25 : 1.15);
  const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const d = r / tan / Math.min(1, camara.aspect);
  const elev = THREE.MathUtils.degToRad(esRotor ? 32 : 26);
  const mira = st.centro.clone().add(new THREE.Vector3(esRotor ? 0.22 * st.radio : 0, 0, 0));
  camara.position.set(mira.x, mira.y + d * Math.sin(elev), mira.z + d * Math.cos(elev));
  camara.lookAt(mira);
  camara.near = d / 50; camara.far = d * 10;
  camara.updateProjectionMatrix();
}
window.addEventListener('resize', encuadre);

function montar(gltf) {
  gltf.scene.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  giro.add(gltf.scene);
  st.rotor = gltf.scene.getObjectByName('rotor');
  if (st.rotor) prepararRotor(gltf.scene);
  const l = gltf.scene.getObjectByName('ladrillo');
  if (l) {
    // Fundido sin saltos: (1) los tags se pintan antes que nada; (2) una pasada solo de profundidad del ladrillo; (3) el
    // ladrillo transparente, que con esa profundidad solo pinta su superficie de fuera (sin caras internas que aparecen y
    // desaparecen ni orden de dibujo cambiando al girar). Con opacidad 1 sale igual que opaco.
    gltf.scene.traverse((o) => { if (o.isMesh) o.renderOrder = 0; });
    const mallas = [];
    l.traverse((o) => { if (o.isMesh) mallas.push(o); });
    for (const o of mallas) {
      const pre = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({
        colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      pre.renderOrder = 1;
      o.add(pre);
      o.material = o.material.clone();
      Object.assign(o.material, { transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
      o.renderOrder = 2;
      st.ladrillo.push(o.material);
    }
    gltf.scene.updateMatrixWorld(true);
    for (const [nodo, clase, logo] of ETIQUETAS) {
      const o = gltf.scene.getObjectByName(nodo);
      if (!o) continue;
      const c = new THREE.Box3().setFromObject(o);
      const punto = c.getCenter(new THREE.Vector3()).setY(c.max.y);     // encima del tag, en su centro
      if (nodo === 'pcb') punto.x = c.min.x + 0.3 * (c.max.x - c.min.x);    // el sensor es largo: más a la izquierda, lejos de la tapa
      const el = document.createElement('div');
      el.className = `etq ${clase}`;
      el.innerHTML = `<img src="${logo}" alt="${clase.toUpperCase()}"><span class="v"></span>`;   // .v: lo leído
      document.getElementById('etiquetas').appendChild(el);
      st.etiquetas.push({ o, local: o.worldToLocal(punto), el });        // en coordenadas del tag: sigue el giro
      lad.etq[clase] = el;
    }
    prepararLadrillo(gltf.scene);
  }
  if (MODELO === 'sinpilas') prepararSinpilas(gltf.scene);
  if (MODELO === 'torre') prepararTorre(gltf.scene);
  if (MODELO === 'energia') prepararEnergia(gltf.scene);
  const caja = new THREE.Box3().setFromObject(st.vistas ? giro : gltf.scene);   // con los aparatos, si los hay
  const suelo = MODELO === 'sinpilas' || MODELO === 'energia' ? 0 : new THREE.Box3().setFromObject(gltf.scene).min.y;
  const esfera = caja.getBoundingSphere(new THREE.Sphere());
  st.centro.copy(esfera.center);
  st.radio = esfera.radius;
  sombra.scale.setScalar(esfera.radius * 4);
  sombra.position.set(esfera.center.x, suelo - 0.0005, esfera.center.z);
  const s = esfera.radius;
  luz.position.set(esfera.center.x + 1.2 * s, esfera.center.y + 2.4 * s, esfera.center.z + 1.8 * s);
  Object.assign(luz.shadow.camera, { left: -2 * s, right: 2 * s, top: 2 * s, bottom: -2 * s, near: 0.1 * s, far: 8 * s });
  luz.shadow.camera.updateProjectionMatrix();
  contra.position.set(esfera.center.x - 2 * s, esfera.center.y + 1.5 * s, esfera.center.z - 1.5 * s);
  encuadre();
}
if (MODELO === 'energia') montar({ scene: new THREE.Group() });      // todo con primitivas: sin GLB
else cargarGLB(URL_MODELO, montar, (err) => console.error(`No se pudo cargar ${URL_MODELO}`, err));   // .glb, o .png en la copia exportada

// API para la página que lo contiene (el panel del rotor en modo demos)
window.modelo = {
  setRpm(v) { st.rpm = Math.max(0, Number(v) || 0); },
  lectura(clase, cuenta) {                        // demos en vivo: ha llegado ese tag ('sble' o 'sread')
    const tag = disco.tags.find((g) => g.clase === clase);
    if (!tag) return;
    tag.ok = true;
    tag.cuenta = Number(cuenta) || tag.cuenta + 1;
    destello(tag);
  },
  estado: () => ({ t, rpm: st.rpm, cargado: !!(st.rotor || st.ladrillo.length || sp.mano || tor.ant || ene.calor), rotor: !!st.rotor,
    opacidad: st.ladrillo.length ? st.ladrillo[0].opacity : null, giro: giro.rotation.y, fase: sp.mano ? sp.fase : null,
    angulo: tor.ant ? anguloTorre(t) : null }),
};

const reloj = new THREE.Clock();
let t = 0, anguloRotor = 0;
const CONGELAR = P.has('congelar');                              // para revisar: el tiempo solo avanza con pintarEn()
function bucle() {
  pintar(CONGELAR ? 0 : Math.min(reloj.getDelta(), 0.1));
  requestAnimationFrame(bucle);
}
// Para revisar el diseño sin depender del bucle: modelo.pintarEn(segundos) dibuja ese instante
window.modelo.pintarEn = (s) => { t = s - 0.001; pintar(0.001); };

function pintar(dt) {
  t += dt;
  // vaivén lento, sin dar la espalda; con los aparatos, menos (el lector está lejos y se saldría del encuadre)
  giro.rotation.y = Math.sin(t / 9) * (MODELO === 'rotor' ? 0.55 : MODELO === 'ladrillo' ? st.vaiven : MODELO === 'energia' ? 0 : 0.05);
  if (st.rotor) {
    if (SHOW) {
      st.rpm = rpmShow(t);
      const barra = document.querySelector('#app .barra i');
      if (barra) barra.style.width = `${(100 * (st.rpm - RPM_LENTO / 2) / (RPM_RAPIDO - RPM_LENTO / 2)).toFixed(1)}%`;
    }
    anguloRotor += (st.rpm / 60) * 2 * Math.PI * dt;
    st.rotor.rotation.y = -anguloRotor;
    st.rotor.updateMatrixWorld(true);
    if (SHOW) pasadas();           // en las demos en vivo, quien dice si contesta es el Stix, no esta simulación
  }
  if (lad.mano) pintarLadrillo(t % CICLO_LAD);
  if (tor.ant) pintarTorre(t % CICLO_TORRE);
  if (ene.calor) pintarEnergia(t % CICLO_ENE);
  if (sp.mano) { giro.updateMatrixWorld(); pintarSinpilas(t % CICLO_SP, Math.floor(t / CICLO_SP)); }
  if (st.vistas) camaraVistas();
  if (lad.mano) { giro.updateMatrixWorld(); rotulosLadrillo(); }
  if (tor.ant) { giro.updateMatrixWorld(); rotulosTorre(); }
  if (ene.calor) { giro.updateMatrixWorld(); rotulosEnergia(); }
  if (st.etiquetas.length) {                                      // las etiquetas, con el ladrillo transparente
    scene.updateMatrixWorld();
    const w = window.innerWidth, h = window.innerHeight, v = new THREE.Vector3();
    for (const { o, local, el, siempre } of st.etiquetas) {
      v.copy(local).applyMatrix4(o.matrixWorld).project(camara);
      el.style.left = `${((v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - v.y) / 2) * h}px`;
      const leido = el === lad.etq.rain ? lad.vis.rain : el === lad.etq.nfc ? lad.vis.nfc : 0;
      el.style.opacity = siempre ? '1' : (Math.max(st.visto, leido) * (el === lad.etq.nfc ? 1 - lad.tapado : 1)).toFixed(3);
    }
  }
  renderer.render(scene, camara);
}
encuadre();
bucle();
