// Los aparatos de las animaciones 3D del quiosco, hechos con primitivas (sin modelos de terceros ni licencias): un móvil,
// un lector RAIN de mano (como el Merlin), un lector fijo (como el Zebra FX9600) con su antena de panel (como las Laird
// del stand) y un portátil; sin marcas. Los que tienen pantalla la dibujan en un canvas.
// Unidades: metros. Ejes locales de los dos: el largo en +Y (la cabeza, arriba), la pantalla mirando a +Z.

import * as THREE from 'three';

const V3 = THREE.Vector3;
const AZUL = '#0080FF', NARANJA = '#FF8000', OK = '#2EBD6B', GRIS = '#8A949C';
const imagen = (src) => { const im = new Image(); im.src = src; return im; };
const LOGO = imagen('img/logo/kliskatek-white.svg');
const LOGOS = { rain: imagen('img/tecnologias/rain.svg'), nfc: imagen('img/tecnologias/nfc.svg'), ble: imagen('img/tecnologias/ble.svg') };

// Rectángulo redondeado (ancho w en X, alto h en Y) extruido d en Z y con los cantos biselados; centrado en el origen.
export function losa(w, h, d, r, b = Math.min(r * 0.5, d * 0.3)) {
  const s = new THREE.Shape();
  const x = w / 2 - b, y = h / 2 - b, R = Math.max(1e-4, Math.min(r - b, x, y));
  s.moveTo(-x + R, -y);
  s.lineTo(x - R, -y); s.absarc(x - R, -y + R, R, -Math.PI / 2, 0);
  s.lineTo(x, y - R); s.absarc(x - R, y - R, R, 0, Math.PI / 2);
  s.lineTo(-x + R, y); s.absarc(-x + R, y - R, R, Math.PI / 2, Math.PI);
  s.lineTo(-x, -y + R); s.absarc(-x + R, -y + R, R, Math.PI, 1.5 * Math.PI);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, d - 2 * b), bevelEnabled: true, bevelThickness: b,
    bevelSize: b, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(d - 2 * b) / 2);
  return g;
}

// Plano con las esquinas redondeadas y las UV de 0 a 1 (para la textura de la pantalla)
function placa(w, h, r) {
  const s = new THREE.Shape();
  const x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.absarc(x - r, -y + r, r, -Math.PI / 2, 0);
  s.lineTo(x, y - r); s.absarc(x - r, y - r, r, 0, Math.PI / 2);
  s.lineTo(-x + r, y); s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI);
  s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, Math.PI, 1.5 * Math.PI);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

const mat = (color, metal = 0.2, rug = 0.55) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rug });

// La pantalla: un canvas que se redibuja al cambiar de estado ('espera' | 'leyendo' | 'dato'). Sin luces (brilla sola).
// Con 'dato', un chip debajo: el de la opción `ok` en verde, o el que se le pase ({ texto, color }: el estado de la torre).
// Con 'torre', además, la torre dibujada con su inclinación (`angulo`, en grados), como en la app de la torre.
class Pantalla {
  constructor(w, h, px, opc) {
    this.c = document.createElement('canvas');
    this.c.width = px; this.c.height = Math.round(px * h / w);
    this.ctx = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.malla = new THREE.Mesh(placa(w, h, Math.min(w, h) * 0.06),
      new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.opc = opc;
    this.estado = null; this.valor = ''; this.chip = null; this.angulo = 0;
    this.poner('espera');
    for (const im of [LOGO, ...Object.values(LOGOS)]) if (!im.complete) im.addEventListener('load', () => this.dibujar());
    if (document.fonts) document.fonts.ready.then(() => this.dibujar());
  }
  poner(estado, valor = this.valor, chip = null, angulo = 0) {
    if (estado === this.estado && valor === this.valor && (chip && chip.texto) === (this.chip && this.chip.texto)
      && Math.abs(angulo - this.angulo) < 0.05) return;
    this.estado = estado; this.valor = valor; this.chip = chip; this.angulo = angulo;
    this.dibujar();
  }
  dibujar() {
    const { ctx, c, opc } = this, W = c.width, H = c.height, u = (W > H ? H * 0.62 : W) / 100;   // apaisada: por el alto
    const letra = (peso, tam) => `${peso} ${tam * u}px Oxanium, "Segoe UI", "Microsoft JhengHei", sans-serif`;
    ctx.fillStyle = '#0d0f11'; ctx.fillRect(0, 0, W, H);
    const m = 8 * u;
    if (LOGO.complete && LOGO.naturalWidth) ctx.drawImage(LOGO, m, m, 34 * u, 34 * u * LOGO.naturalHeight / LOGO.naturalWidth);
    const tec = LOGOS[opc.tec];
    if (tec && tec.complete && tec.naturalWidth) {
      const hT = 9 * u, wT = hT * tec.naturalWidth / tec.naturalHeight;
      ctx.drawImage(tec, W - m - wT, m - 1.5 * u, wT, hT);
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = NARANJA; ctx.font = letra(700, 5.4);
    ctx.fillText(opc.kicker.toUpperCase(), m, m + 19 * u);
    ctx.fillStyle = AZUL; ctx.font = letra(700, 9.5);
    ctx.fillText(opc.titulo, m, m + 30 * u);
    ctx.strokeStyle = '#2A2F34'; ctx.lineWidth = 0.6 * u;
    ctx.beginPath(); ctx.moveTo(m, m + 36 * u); ctx.lineTo(W - m, m + 36 * u); ctx.stroke();
    const cy = m + 36 * u + (H - m - 36 * u) * 0.46;
    ctx.textAlign = 'center';
    if (this.estado === 'torre') {
      const chip = this.chip || { texto: opc.ok, color: OK };
      const arriba = m + 36 * u, alto = H - arriba;
      // apaisada (el portátil): la torre a la izquierda y el valor a la derecha; vertical (el móvil): uno encima del otro
      const [tx, ty, th, vx, vy] = W > H ? [W * 0.3, H - 7 * u, alto * 0.8, W * 0.67, arriba + alto * 0.48]
        : [W / 2, arriba + alto * 0.62, alto * 0.48, W / 2, arriba + alto * 0.62 + 20 * u];
      dibujarTorre(ctx, tx, ty, th, this.angulo, chip.color);
      const tam = W > H ? 30 : 22;
      ctx.fillStyle = '#fff'; ctx.font = letra(700, tam);
      const ancho = ctx.measureText(this.valor).width, cabe = (W > H ? W * 0.5 : W) * 0.86;
      if (ancho > cabe) ctx.font = letra(700, tam * cabe / ancho);
      ctx.fillText(this.valor, vx, vy);
      ctx.fillStyle = GRIS; ctx.font = letra(600, 6.5);
      ctx.fillText(opc.magnitud, vx, vy + 9 * u);
      ctx.font = letra(700, 6.2);
      const an = ctx.measureText(chip.texto).width + 10 * u;
      ctx.fillStyle = chip.color; ctx.globalAlpha = 0.18;
      redondeado(ctx, vx - an / 2, vy + 13 * u, an, 10 * u, 3 * u); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = chip.color; ctx.fillText(chip.texto, vx, vy + 20.4 * u);
    } else if (this.estado === 'dato') {
      ctx.fillStyle = '#fff'; ctx.font = letra(700, 30);
      const ancho = ctx.measureText(this.valor).width;
      if (ancho > W * 0.86) ctx.font = letra(700, 30 * W * 0.86 / ancho);                  // que quepa (+22,0°)
      ctx.fillText(this.valor, W / 2, cy + 8 * u);
      ctx.fillStyle = GRIS; ctx.font = letra(600, 7);
      ctx.fillText(opc.magnitud, W / 2, cy + 19 * u);
      ctx.font = letra(700, 6.2);
      const chip = this.chip || { texto: opc.ok, color: OK };
      const an = ctx.measureText(chip.texto).width + 10 * u;
      ctx.fillStyle = chip.color; ctx.globalAlpha = 0.18;
      redondeado(ctx, W / 2 - an / 2, cy + 25 * u, an, 10 * u, 3 * u); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = chip.color; ctx.fillText(chip.texto, W / 2, cy + 32.4 * u);
    } else {
      const leyendo = this.estado === 'leyendo';
      ctx.strokeStyle = leyendo ? AZUL : '#3A4046'; ctx.lineWidth = 2.2 * u;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = leyendo ? 1 - i * 0.28 : 0.8;
        ctx.beginPath(); ctx.arc(W / 2, cy + 4 * u, (8 + i * 7) * u, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = leyendo ? AZUL : '#3A4046';
      ctx.beginPath(); ctx.arc(W / 2, cy + 4 * u, 2.6 * u, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = leyendo ? '#fff' : GRIS; ctx.font = letra(600, 7.5);
      ctx.fillText(leyendo ? opc.leyendo : opc.espera, W / 2, cy + 20 * u);
    }
    this.tex.needsUpdate = true;
  }
}

// La torre de Macao en silueta (pie, fuste, mirador con su cristal, cono y mástil), girada `grados` sobre la base; con la
// vertical de referencia y el arco del ángulo en el color del estado
function dibujarTorre(ctx, cx, by, h, grados, color) {
  const a = grados * Math.PI / 180;
  ctx.save();
  ctx.strokeStyle = '#3A4046'; ctx.lineWidth = h * 0.008; ctx.setLineDash([h * 0.03, h * 0.03]);
  ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, by - h); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#2A2F34'; ctx.lineWidth = h * 0.012;
  ctx.beginPath(); ctx.moveTo(cx - h * 0.22, by); ctx.lineTo(cx + h * 0.22, by); ctx.stroke();
  if (Math.abs(a) > 0.002) {
    ctx.strokeStyle = color; ctx.lineWidth = h * 0.018;
    ctx.beginPath(); ctx.arc(cx, by, h * 0.5, -Math.PI / 2, -Math.PI / 2 + a, a < 0); ctx.stroke();
  }
  ctx.translate(cx, by); ctx.rotate(a);
  const poli = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * h, y * h) : ctx.moveTo(x * h, y * h))); ctx.closePath(); ctx.fill(); };
  poli([[-0.1, 0], [0.1, 0], [0.055, -0.07], [-0.055, -0.07]], '#7F8A94');                // pie
  poli([[-0.036, -0.07], [0.036, -0.07], [0.017, -0.62], [-0.017, -0.62]], '#C9D2DA');     // fuste
  ctx.fillStyle = '#E8EDF2'; ctx.beginPath(); ctx.ellipse(0, -0.665 * h, 0.085 * h, 0.05 * h, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#2E9C93'; ctx.fillRect(-0.086 * h, -0.678 * h, 0.172 * h, 0.022 * h);  // el cristal del mirador
  poli([[-0.032, -0.705], [0.032, -0.705], [0, -0.79]], '#E8EDF2');                       // cono
  ctx.strokeStyle = '#E8EDF2'; ctx.lineWidth = h * 0.012;
  ctx.beginPath(); ctx.moveTo(0, -0.79 * h); ctx.lineTo(0, -h); ctx.stroke();             // mástil
  ctx.restore();
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Móvil: 72 × 150 × 8,5 mm. El NFC, detrás, hacia arriba del centro.
export function crearMovil(opc) {
  const g = new THREE.Group();
  const W = 0.072, H = 0.150, D = 0.0085;
  const cuerpo = new THREE.Mesh(losa(W, H, D, 0.010), mat(0x23282e, 0.55, 0.32));
  g.add(cuerpo);
  const cristal = new THREE.Mesh(placa(W - 0.003, H - 0.003, 0.0085), mat(0x050607, 0.1, 0.12));
  cristal.position.z = D / 2 + 0.0001;
  g.add(cristal);
  const pantalla = new Pantalla(W - 0.0075, H - 0.012, 512, { tec: 'nfc', ...opc });
  pantalla.malla.position.set(0, -0.0005, D / 2 + 0.0002);
  g.add(pantalla.malla);
  const isla = new THREE.Mesh(losa(0.026, 0.026, 0.0016, 0.006), mat(0x1a1e22, 0.5, 0.3));   // las cámaras, detrás
  isla.position.set(-W / 2 + 0.018, H / 2 - 0.018, -D / 2 - 0.0006);
  g.add(isla);
  for (const [x, y] of [[-0.005, 0.005], [0.005, -0.005]]) {
    const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0012, 24), mat(0x0a0b0c, 0.3, 0.15));
    lente.rotation.x = Math.PI / 2;
    lente.position.set(isla.position.x + x, isla.position.y + y, -D / 2 - 0.0016);
    g.add(lente);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  pantalla.malla.castShadow = false;
  return { grupo: g, pantalla, nfc: new THREE.Vector3(0, 0.015, -D / 2) };
}

// Lector RAIN de mano, como el Nordic ID Merlin Cross Dipole del stand (sin marca): un terminal con la pantalla en la parte
// ancha y el teclado en el cuello; bajo el frontal cuelga la antena (un bloque con la X del dipolo cruzado en la cara)
// hasta la barra de abajo, que la une con la empuñadura de pistola: el conjunto, de perfil, es una D.
// Largo en +Y (la antena, delante), pantalla en +Z (arriba, al sostenerlo), empuñadura y antena hacia -Z. Medidas en mm.
const MM = 0.001;
function perfilTerminal() {                       // la planta del terminal: ancho en la pantalla, estrecho en el teclado
  const s = new THREE.Shape(), P = (x, y) => [x * MM, y * MM];
  s.moveTo(...P(0, -112));
  s.bezierCurveTo(...P(16, -112), ...P(26, -106), ...P(26, -93));
  s.lineTo(...P(27, -24));
  s.bezierCurveTo(...P(27, -6), ...P(39, 0), ...P(39, 20));
  s.lineTo(...P(39, 100));
  s.bezierCurveTo(...P(39, 112), ...P(32, 117), ...P(19, 117));
  s.lineTo(...P(-19, 117));
  s.bezierCurveTo(...P(-32, 117), ...P(-39, 112), ...P(-39, 100));
  s.lineTo(...P(-39, 20));
  s.bezierCurveTo(...P(-39, 0), ...P(-27, -6), ...P(-27, -24));
  s.lineTo(...P(-26, -93));
  s.bezierCurveTo(...P(-26, -106), ...P(-16, -112), ...P(0, -112));
  return s;
}

export function crearHandheld(opc) {
  const g = new THREE.Group();
  const cuerpo = mat(0x34383d, 0.15, 0.5), goma = mat(0x5a5f66, 0, 0.85), negro = mat(0x222529, 0.1, 0.6);
  const gris = mat(0x41464c, 0.15, 0.55), tecla = mat(0xb4bac0, 0.25, 0.4), cristal = mat(0x0b0c0d, 0.1, 0.15);
  const pieza = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x * MM, y * MM, z * MM); g.add(o); return o; };
  // terminal: la planta extruida (30 mm) y, encima de la parte ancha, la joroba de la pantalla
  const geo = new THREE.ExtrudeGeometry(perfilTerminal(), { depth: 20 * MM, bevelEnabled: true, bevelThickness: 5 * MM,
    bevelSize: 5 * MM, bevelSegments: 3, curveSegments: 12 });
  geo.translate(0, 0, -10 * MM);
  pieza(geo, cuerpo, 0, 0, 0);
  pieza(losa(80 * MM, 94 * MM, 22 * MM, 18 * MM, 7 * MM), cuerpo, 0, 64, 22);   // la pantalla abulta más que el teclado
  pieza(placa(64 * MM, 80 * MM, 7 * MM), cristal, 0, 66, 33.1);
  const pantalla = new Pantalla(52 * MM, 66 * MM, 400, { tec: 'rain', ...opc });
  pantalla.malla.position.set(0, 67 * MM, 33.3 * MM);
  g.add(pantalla.malla);
  // teclado: 6 filas de 3 teclas grises, la cruz de cursores y las tres de color
  for (let f = 0; f < 6; f++) for (let k = 0; k < 3; k++) pieza(losa(14 * MM, 7.5 * MM, 3 * MM, 2.5 * MM), tecla, (k - 1) * 16, -40 - f * 11, 15.5);
  const cruz = pieza(new THREE.CylinderGeometry(11 * MM, 11 * MM, 3 * MM, 32), tecla, 0, -16, 15.5);
  cruz.rotation.x = Math.PI / 2;
  const centro = pieza(new THREE.CylinderGeometry(4.5 * MM, 4.5 * MM, 3.4 * MM, 24), gris, 0, -16, 15.8);
  centro.rotation.x = Math.PI / 2;
  for (const [x, y, c] of [[-21, -9, 0x2EBD6B], [0, 2, 0xF2B01E], [21, -9, 0xD0458F]]) {
    pieza(losa(10 * MM, 7 * MM, 3 * MM, 2.5 * MM), mat(c, 0.1, 0.45), x, y, 15.5);
  }
  // la antena: un bloque que cuelga del frontal hasta la barra; con el cuello que la une al terminal y la X en la cara
  pieza(losa(56 * MM, 36 * MM, 26 * MM, 6 * MM), gris, 0, 92, -24);
  pieza(losa(110 * MM, 98 * MM, 44 * MM, 9 * MM).rotateX(Math.PI / 2), gris, 0, 104, -84);   // la cara, en el plano XZ
  for (const a of [1, -1]) {
    const brazo = pieza(new THREE.BoxGeometry(122 * MM, 1.6 * MM, 5 * MM), mat(0x4a4f55, 0.15, 0.5), 0, 126.4, -84);
    brazo.rotation.y = a * Math.atan2(88, 100);
  }
  // empuñadura de pistola (inclinada hacia atrás, con la cara de goma gris), gatillo y la barra de abajo hasta la antena
  const empu = new THREE.Group();
  empu.position.set(0, 10 * MM, -14 * MM);
  empu.rotation.x = -0.4;
  const mango = new THREE.Mesh(losa(32 * MM, 40 * MM, 112 * MM, 13 * MM), goma);
  mango.position.z = -54 * MM;
  const gatillo = new THREE.Mesh(losa(13 * MM, 10 * MM, 24 * MM, 4 * MM), negro);
  gatillo.position.set(0, 23 * MM, -16 * MM);
  empu.add(mango, gatillo);
  g.add(empu);
  const barra = pieza(losa(26 * MM, 150 * MM, 13 * MM, 6 * MM), negro, 0, 36, -126);
  barra.rotation.x = -0.05;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  pantalla.malla.castShadow = false;
  return { grupo: g, pantalla, antena: new V3(0, 127 * MM, -84 * MM), pantallaPos: new V3(0, 67 * MM, 34 * MM) };
}
// Antena RAIN de panel, como las Laird S9028/S8658: un cuadrado de 26 cm con las esquinas achaflanadas, en blanco roto,
// con su soporte (placa y rótula) detrás. La cara mira a +Z; `detras` es donde se coge al pie y sale el cable.
export function crearAntenaPanel() {
  const g = new THREE.Group();
  const L = 124 * MM, c = 28 * MM;                               // semilado (más el bisel: 259 mm) y chaflán
  const s = new THREE.Shape();
  s.moveTo(-L + c, -L); s.lineTo(L - c, -L); s.lineTo(L, -L + c); s.lineTo(L, L - c);
  s.lineTo(L - c, L); s.lineTo(-L + c, L); s.lineTo(-L, L - c); s.lineTo(-L, -L + c); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 22 * MM, bevelEnabled: true, bevelThickness: 6 * MM, bevelSize: 5.5 * MM,
    bevelSegments: 4, curveSegments: 2 });
  geo.translate(0, 0, -11 * MM);
  g.add(new THREE.Mesh(geo, mat(0xE6E3DC, 0.02, 0.75)));
  const metal = mat(0x9AA0A6, 0.6, 0.35);
  const soporte = new THREE.Mesh(losa(70 * MM, 70 * MM, 5 * MM, 6 * MM), metal);
  soporte.position.z = -19.5 * MM;
  const rotula = new THREE.Mesh(new THREE.CylinderGeometry(9 * MM, 9 * MM, 34 * MM, 20), metal);
  rotula.rotation.x = Math.PI / 2;
  rotula.position.z = -38 * MM;
  g.add(soporte, rotula);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { grupo: g, cara: new V3(0, 0, 17 * MM), detras: new V3(0, 0, -55 * MM) };
}

// Pie de suelo: base redonda y un tubo hasta `alto`
export function crearPie(alto) {
  const g = new THREE.Group(), metal = mat(0x3A4046, 0.6, 0.35);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(60 * MM, 66 * MM, 8 * MM, 40), metal);
  base.position.y = 4 * MM;
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(8 * MM, 8 * MM, alto, 20), metal);
  tubo.position.y = alto / 2;
  g.add(base, tubo);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Lector RAIN fijo, como el Zebra FX9600 (sin marca): caja gris de 246 × 178 × 43 mm con la tapa negra de aletas (a lo
// corto), la placa del logo, 4 LED, orejetas en la base y los 8 conectores de antena en el lado largo de delante (+Z).
// Tumbado sobre el suelo (y = 0). `puerto`: el conector 1 (el cable de la antena); `red`: el Ethernet, en el lado +X.
export function crearLectorFijo() {
  const g = new THREE.Group();
  const W = 246 * MM, D = 178 * MM;
  const gris = mat(0x3C4146, 0.35, 0.5), negro = mat(0x15171a, 0.3, 0.55), aleta = mat(0x1d2024, 0.45, 0.4);
  const tumbada = (geo) => geo.rotateX(-Math.PI / 2);            // losa(ancho, fondo, alto): el alto en Y
  const pieza = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  pieza(tumbada(losa(W - 8 * MM, D - 8 * MM, 8 * MM, 14 * MM)), negro, 0, 4 * MM, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pieza(tumbada(losa(26 * MM, 20 * MM, 4 * MM, 6 * MM)), negro, sx * (W / 2 + 4 * MM), 2 * MM, sz * (D / 2 - 34 * MM));
  }
  pieza(tumbada(losa(W, D, 30 * MM, 18 * MM, 4 * MM)), gris, 0, 23 * MM, 0);
  pieza(tumbada(losa(W - 18 * MM, D - 18 * MM, 3 * MM, 12 * MM)), negro, 0, 39 * MM, 0);
  const n = 22;
  for (let i = 0; i < n; i++) {
    pieza(new THREE.BoxGeometry(4.5 * MM, 4.5 * MM, D - 34 * MM), aleta, -W / 2 + 20 * MM + i * (W - 40 * MM) / (n - 1), 42.5 * MM, 0);
  }
  pieza(tumbada(losa(72 * MM, 26 * MM, 3 * MM, 4 * MM)), mat(0x0b0c0d, 0.3, 0.2), 0, 45 * MM, D / 2 - 42 * MM);
  [0x2EBD6B, 0x2EBD6B, 0xF2B01E, 0x2E9BFF].forEach((c, i) => {
    pieza(new THREE.BoxGeometry(7 * MM, 2 * MM, 3 * MM), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }),
      (i - 1.5) * 12 * MM, 45.5 * MM, -D / 2 + 30 * MM);
  });
  const plata = mat(0xC9CDD1, 0.85, 0.3);
  for (let i = 0; i < 8; i++) {                                   // conectores RP-TNC, con su tuerca
    const x = -W / 2 + 32 * MM + i * 19 * MM;
    const cuerpo = pieza(new THREE.CylinderGeometry(5.5 * MM, 5.5 * MM, 12 * MM, 16), plata, x, 20 * MM, D / 2 + 6 * MM);
    cuerpo.rotation.x = Math.PI / 2;
    const tuerca = pieza(new THREE.CylinderGeometry(7 * MM, 7 * MM, 4 * MM, 6), plata, x, 20 * MM, D / 2 + 2 * MM);
    tuerca.rotation.x = Math.PI / 2;
  }
  pieza(new THREE.BoxGeometry(34 * MM, 9 * MM, 8 * MM), mat(0x2EAA55, 0.1, 0.5), W / 2 - 40 * MM, 21 * MM, D / 2 + 4 * MM);   // GPIO
  pieza(new THREE.BoxGeometry(14 * MM, 12 * MM, 16 * MM), negro, W / 2 + 2 * MM, 20 * MM, 20 * MM);                            // Ethernet
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { grupo: g, puerto: new V3(-W / 2 + 32 * MM, 20 * MM, D / 2 + 12 * MM), red: new V3(W / 2 + 9 * MM, 20 * MM, 20 * MM) };
}

// Portátil abierto: base de 310 × 215 mm, teclado y la tapa a ~105° con la pantalla (apaisada). `red`: su puerto, a la izquierda.
export function crearPortatil(opc) {
  const g = new THREE.Group();
  const W = 310 * MM, D = 215 * MM;
  const alu = mat(0xA3A9AF, 0.7, 0.35), oscuro = mat(0x24282c, 0.3, 0.55);
  const base = new THREE.Mesh(losa(W, D, 15 * MM, 10 * MM, 3 * MM).rotateX(-Math.PI / 2), alu);
  base.position.y = 7.5 * MM;
  const teclado = new THREE.Mesh(losa(W - 34 * MM, 100 * MM, 1.2 * MM, 3 * MM).rotateX(-Math.PI / 2), oscuro);
  teclado.position.set(0, 15.2 * MM, -18 * MM);
  const panel = new THREE.Mesh(losa(100 * MM, 60 * MM, 1.2 * MM, 4 * MM).rotateX(-Math.PI / 2), mat(0x8E949A, 0.6, 0.35));
  panel.position.set(0, 15.2 * MM, 62 * MM);
  g.add(base, teclado, panel);
  const tapa = new THREE.Group();                                  // de pie (pantalla a +Z), girada hacia atrás
  tapa.position.set(0, 15 * MM, -D / 2 + 4 * MM);
  tapa.rotation.x = -0.26;
  const lid = new THREE.Mesh(losa(W, 205 * MM, 6 * MM, 10 * MM, 2 * MM), alu);
  lid.position.set(0, 102.5 * MM, -3 * MM);
  const marco = new THREE.Mesh(placa(W - 8 * MM, 197 * MM, 7 * MM), mat(0x0b0c0d, 0.1, 0.2));
  marco.position.set(0, 102.5 * MM, 0.15 * MM);
  const pantalla = new Pantalla(W - 24 * MM, 172 * MM, 640, { tec: 'rain', ...opc });
  pantalla.malla.position.set(0, 104 * MM, 0.3 * MM);
  tapa.add(lid, marco, pantalla.malla);
  g.add(tapa);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  pantalla.malla.castShadow = false;
  return { grupo: g, pantalla, red: new V3(-W / 2, 8 * MM, -40 * MM) };
}

// Un cable que pasa por `puntos` (CatmullRom)
export function cable(padre, puntos, { color = 0x1a1c1f, r = 2.5 * MM } = {}) {
  const curva = new THREE.CatmullRomCurve3(puntos);
  const malla = new THREE.Mesh(new THREE.TubeGeometry(curva, 80, r, 8), mat(color, 0.1, 0.6));
  malla.castShadow = true;
  padre.add(malla);
  return { malla, curva };
}

// Orienta un aparato (largo en +Y local, pantalla en +Z) desde `pos` hacia `objetivo`, con la pantalla hacia arriba.
export function apuntar(obj, pos, objetivo, inclina = 0) {
  const y = objetivo.clone().sub(pos).normalize();
  const arriba = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(y, arriba).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  obj.position.copy(pos);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (inclina) obj.rotateY(inclina);                                                // girar sobre el largo: la pantalla, hacia la cámara
}

// Ondas de radio: anillos que viajan de un punto a otro abriéndose (RAIN) o crecen en el sitio (NFC).
export class Ondas {
  // aditivo: brillan sobre el fondo oscuro; sobre una superficie de color (la tapa del ladrillo), mejor normal
  constructor(padre, { color = 0x2E9BFF, n = 4, periodo = 1.2, r0 = 0.02, r1 = 0.09, grosor = 0.16, aditivo = true } = {}) {
    Object.assign(this, { n, periodo, r0, r1, intensidad: 0, desde: new THREE.Vector3(), hasta: new THREE.Vector3() });
    this.anillos = [];
    const geo = new THREE.RingGeometry(1 - grosor, 1, 64);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false }));
      m.renderOrder = 5;
      m.visible = false; m.scale.setScalar(1e-3);                 // hasta el primer actualizar(): que no cuenten en los encuadres
      padre.add(m);
      this.anillos.push(m);
    }
  }
  tramo(desde, hasta) { this.desde.copy(desde); this.hasta.copy(hasta); return this; }
  actualizar(t) {
    const dir = this.hasta.clone().sub(this.desde);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    this.anillos.forEach((m, i) => {
      const s = ((t / this.periodo + i / this.n) % 1 + 1) % 1;
      m.position.copy(this.desde).addScaledVector(dir, s);
      m.quaternion.copy(q);
      m.scale.setScalar(this.r0 + (this.r1 - this.r0) * s);
      m.material.opacity = this.intensidad * Math.sin(Math.PI * s) * 0.85;
      m.visible = m.material.opacity > 0.003;
    });
  }
}
