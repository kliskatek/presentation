// Carga un .glb con GLTFLoader. En la copia exportada de la presentación (pc/kiosko/tools/exporta_presentacion.py)
// cada .glb va empaquetado en los píxeles de un PNG: un artefacto de Claude no sirve .glb, su CSP no deja a GLTFLoader
// leer un data: URI, y con los modelos en base64 la versión no se pudo revisar para compartirla en público.
// El PNG lleva 3 bytes por píxel (RGB, alfa 255) y delante la longitud del .glb (4 bytes LE).
// Lo usan la app de la torre (app.js) y el visor 3D del quiosco (pc/kiosko/web/modelo3d.js).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function glbDePng(url) {
  const img = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2]; }
  const n = new DataView(rgb.buffer).getUint32(0, true);
  return rgb.buffer.slice(4, 4 + n);
}

export function cargarGLB(url, alCargar, alFallar) {
  const loader = new GLTFLoader();
  if (!url.endsWith('.png')) return loader.load(url, alCargar, undefined, alFallar);
  glbDePng(url).then((glb) => loader.parse(glb, '', alCargar, alFallar)).catch(alFallar);
}
