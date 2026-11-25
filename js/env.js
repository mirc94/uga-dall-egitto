import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const shared = { uTime: { value: 0 } };

/* ---------- rumore (per terreno e montagne) ---------- */
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= .5; } return s; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- caricamento texture ---------- */
export function texLoader(manager, renderer) {
  const tl = new THREE.TextureLoader(manager); const cache = {};
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return (url, { srgb = false, repeat = 1 } = {}) => {
    const key = url + '|' + repeat;
    if (cache[key]) return cache[key];
    const t = tl.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return (cache[key] = t);
  };
}

/* ---------- vento sulla vegetazione (istanze) ---------- */
export function addWind(mat, amp, weightExpr = 'max(position.y, 0.0)') {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wph = (instanceMatrix[3].x * .37 + instanceMatrix[3].z * .29);
      #else
        float wph = 0.0;
      #endif
      float wk = ${weightExpr};
      transformed.x += sin(uTime * 1.5 + wph) * ${amp.toFixed(3)} * wk;
      transformed.z += cos(uTime * 1.2 + wph * 1.3) * ${(amp * .6).toFixed(3)} * wk;`);
  };
  return mat;
}

/* =====================================================================
   CIELO FISICO, MAPPA D'AMBIENTE, STELLE, LUNA
   ===================================================================== */
export function makeSky(renderer, scene) {
  const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
  const U = sky.material.uniforms;
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(50); envScene.add(sky2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sunDir = new THREE.Vector3();
  let rt = null;
  function set(p) {
    for (const u of [U, sky2.material.uniforms]) {
      u.turbidity.value = p.turb; u.rayleigh.value = p.ray; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.mieG;
    }
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - p.elev), THREE.MathUtils.degToRad(p.azim));
    U.sunPosition.value.copy(sunDir); sky2.material.uniforms.sunPosition.value.copy(sunDir);
  }
  function bake() { const old = rt; rt = pmrem.fromScene(envScene, 0, .1, 200); scene.environment = rt.texture; if (old) old.dispose(); }
  // stelle
  const r = rng(7), p = [], c = [];
  for (let i = 0; i < 2600; i++) { const th = r() * Math.PI * 2, y = .03 + Math.pow(r(), .7) * .97, rr = Math.sqrt(1 - y * y); p.push(Math.cos(th) * rr * 3000, y * 3000, Math.sin(th) * rr * 3000); const b = .5 + r() * .5; c.push(b, b, b * (.9 + r() * .2)); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);
  // luna piena: la Pasqua cadeva il 14° giorno del mese lunare (Esodo 12:6)
  const mc = document.createElement('canvas'); mc.width = mc.height = 256; const g = mc.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(220,230,255,.55)'); gr.addColorStop(1, 'rgba(220,230,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#eef0f2'; g.beginPath(); g.arc(128, 128, 34, 0, Math.PI * 2); g.fill();
  const mr = rng(9); for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(150,160,170,${.15 + mr() * .2})`; g.beginPath(); g.arc(110 + mr() * 36, 108 + mr() * 40, 4 + mr() * 9, 0, Math.PI * 2); g.fill(); }
  const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  moon.scale.set(260, 260, 1); scene.add(moon);
  return { sky, U, sunDir, set, bake, stars, moon };
}

/* =====================================================================
   TERRENO
   ===================================================================== */
export const NILE = { x0: -400, x1: 36, z0: -34, z1: -26 };
export const SEA_X = 134;
export function heightAt(x, z) {
  if (x > SEA_X) return 0;
  let h = 0;
  const out = Math.max(0, Math.abs(z) - 50, -x - 125);
  if (out > 0) h += sstep(0, 40, out) * (fbm(x * .012, z * .012) * 14 - 2 + Math.sin(x * .03 + z * .01) * 2);
  // alveo del Nilo, con le rive in pendenza
  if (x < NILE.x1 + 6) { const d = Math.abs(z - (NILE.z0 + NILE.z1) / 2); const fade = sstep(NILE.x1 + 6, NILE.x1 - 2, x); h -= fade * (1 - sstep(3.2, 6.5, d)) * .9; }
  // dolci ondulazioni del suolo
  h += (fbm(x * .05 + 9, z * .05) - .5) * .25 * (out > 0 ? 0 : 1);
  return h;
}
function splatAt(x, z) {
  let dirt = 0, green = 0, wet = 0;
  // sentiero battuto da ovest a est
  dirt = Math.max(dirt, 1 - sstep(1.5, 3.5, Math.abs(z + Math.sin(x * .05) * 1.2)) * 1) * (x < SEA_X ? .75 : 0);
  // cantiere dei mattoni
  if (x > -100 && x < -64 && z > 6 && z < 30) dirt = Math.max(dirt, .9);
  // Gosen: terra coltivata, verde
  const gos = sstep(-34, -26, x) * (1 - sstep(34, 42, x)) * (1 - sstep(44, 50, Math.abs(z)));
  green = Math.max(green, gos * (.55 + fbm(x * .08, z * .08) * .45));
  // rive del Nilo
  const dn = Math.abs(z + 30); if (x < NILE.x1 + 4) { green = Math.max(green, (1 - sstep(4.5, 13, dn)) * .9); wet = Math.max(wet, 1 - sstep(3.6, 5.5, dn)); }
  // spiaggia del mare
  wet = Math.max(wet, sstep(SEA_X - 5, SEA_X, x));
  if (x > SEA_X) { wet = 1; green = 0; dirt = 0; }
  return [Math.min(1, dirt), Math.min(1, green) * (1 - dirt * .7), wet];
}
export function makeGround(scene, T) {
  const S = 1800, seg = 300;
  const g = new THREE.PlaneGeometry(S, S, seg, seg); g.rotateX(-Math.PI / 2); g.translate(60, 0, 0);
  const p = g.attributes.position, spl = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, heightAt(x, z)); spl.set(splatAt(x, z), i * 3); }
  g.setAttribute('splat', new THREE.BufferAttribute(spl, 3)); g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * S / 7, uv.getY(i) * S / 7);
  const mat = new THREE.MeshStandardMaterial({ map: T('tex/sand_albedo.jpg', { srgb: true }), normalMap: T('tex/sand_normal.jpg'), normalScale: new THREE.Vector2(.8, .8), roughness: .97 });
  const dirt = T('tex/dirt_albedo.jpg', { srgb: true });
  mat.onBeforeCompile = sh => {
    sh.uniforms.dirtMap = { value: dirt };
    sh.vertexShader = 'attribute vec3 splat;\nvarying vec3 vSplat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat;');
    sh.fragmentShader = 'uniform sampler2D dirtMap;\nvarying vec3 vSplat;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 sandC = texture2D(map, vMapUv).rgb;
      vec3 dirtC = texture2D(dirtMap, vMapUv * .63).rgb;
      vec3 farC = texture2D(map, vMapUv * .07).rgb;
      sandC = mix(sandC, sandC * farC * 1.9, .35);
      vec3 grassC = mix(sandC, dirtC, .25) * vec3(.62, .8, .42);
      vec3 c = mix(sandC, mix(sandC, dirtC, .6) * 1.02, vSplat.r);
      c = mix(c, grassC, vSplat.g);
      c = mix(c, c * vec3(.62, .58, .54), vSplat.b);
      diffuseColor.rgb *= c;`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .55, vSplat.b * .8);');
  };
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  return m;
}

/* ---------- montagne a sud di Piairòt ---------- */
export function makeMountains(scene, T) {
  const W = 420, D = 170, g = new THREE.PlaneGeometry(W, D, 210, 85); g.rotateX(-Math.PI / 2); g.translate(110, 0, -48 - D / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = sstep(-50, -95, z) * (1 - sstep(260, 320, x)) * sstep(70, 120, x);
    const ridge = 1 - Math.abs(fbm(x * .009, z * .009, 4) * 2 - 1);
    const h = k * (ridge * 70 + fbm(x * .03, z * .03, 5) * 30) + fbm(x * .2, z * .2, 3) * 1.5 * k - 1.5;
    p.setY(i, h);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 18, uv.getY(i) * D / 18);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T('tex/rock_albedo.jpg', { srgb: true }), normalMap: T('tex/rock_normal.jpg'), normalScale: new THREE.Vector2(1.6, 1.6), roughness: .95 }));
  m.receiveShadow = true; m.castShadow = false; scene.add(m);
}

/* =====================================================================
   ACQUA
   ===================================================================== */
export function makeNile(scene, T) {
  const n = T('tex/water_normal.jpg', { repeat: 1 }).clone(); n.repeat.set(60, 1.2); n.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color: '#3a5547', roughness: .06, metalness: .0, normalMap: n, normalScale: new THREE.Vector2(.35, .35), envMapIntensity: 1.1, transparent: true, opacity: .93 });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(NILE.x1 - NILE.x0 + 8, NILE.z1 - NILE.z0 + 2.5), mat); w.rotation.x = -Math.PI / 2;
  w.position.set((NILE.x0 + NILE.x1) / 2 + 4, -.18, (NILE.z0 + NILE.z1) / 2); w.receiveShadow = true; scene.add(w);
  return t => { n.offset.x = t * .006; };
}
export function makeSea(scene, T, sunDir) {
  const wn = T('tex/water_normal.jpg');
  const water = new Water(new THREE.PlaneGeometry(1600, 2000), { textureWidth: 512, textureHeight: 512, waterNormals: wn, sunDirection: sunDir.clone(), sunColor: 0xfff2dd, waterColor: 0x0d3a46, distortionScale: 2.6, fog: true });
  water.rotation.x = -Math.PI / 2; water.position.set(SEA_X + 800, .22, 0); scene.add(water);
  // pareti d'acqua per il finale (Esodo 14:22)
  const n2 = wn.clone(); n2.repeat.set(30, 3); n2.needsUpdate = true;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .04, metalness: .0, normalMap: n2, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 1.9, transparent: true, opacity: .93 });
  const uTop = { value: 1 }, uWGap = { value: 1 };
  const NOISE = `
    float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }
    float wf(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * wn(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
`;
  wallMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uTop = uTop; sh.uniforms.uGap = uWGap;
    sh.vertexShader = 'uniform float uTime; uniform float uTop; uniform float uGap;\nvarying vec3 vWP; varying float vSide; varying float vUp; varying float vEnd;\n' + NOISE + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wq = modelMatrix * vec4(transformed, 1.0);
      // l'acqua si ammucchia verso il passaggio e scende al livello del mare allontanandosi
      float far = smoothstep(6.0, 170.0, abs(wq.z) - uGap);
      transformed.y = -.5 + (transformed.y + .5) * mix(1.0, .72 / (uTop + .5), far);
      wq = modelMatrix * vec4(transformed, 1.0);
      float side = step(.5, abs(normal.z) + abs(normal.x));
      float hk = clamp(wq.y / max(uTop, .5), 0.0, 1.0);
      // grandi rigonfiamenti lenti e increspature che scendono lungo la parete
      float bulge = (wf(vec2(wq.x * .025, uTime * .05)) - .5) * 2.2 * smoothstep(.0, .5, hk);
      float rip = sin(wq.x * .32 + uTime * 1.6) * .22 + sin(wq.x * .9 + wq.y * 1.3 + uTime * 3.2) * .1 + (wn(vec2(wq.x * .6, wq.y * .8 + uTime * 1.5)) - .5) * .35;
      transformed.z += (bulge + rip) * step(.5, abs(normal.z)) * smoothstep(0.0, 1.5, wq.y) * sign(normal.z);
      // cresta irregolare in cima, con un leggero labbro verso il passaggio
      float topk = smoothstep(.35, .5, position.y);
      float crest = (wf(vec2(wq.x * .18, uTime * .6)) - .45) * 1.6 + sin(wq.x * .7 + uTime * 2.4) * .25;
      transformed.y += crest * topk / max(1.0, uTop) ;
      vSide = side; vUp = step(.5, normal.y); vEnd = step(.5, abs(normal.x));`).replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTop; uniform float uTime; uniform float uGap;\nvarying vec3 vWP; varying float vSide; varying float vUp; varying float vEnd;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float hk = clamp(vWP.y / max(uTop, .5), 0.0, 1.0);
      // profondità: scuro in basso, verde-azzurro traslucido in alto
      vec3 deep = vec3(.006, .04, .06), mid = vec3(.03, .19, .25), lit = vec3(.13, .46, .50);
      vec3 wc = mix(deep, mid, smoothstep(0.0, .55, hk)); wc = mix(wc, lit, smoothstep(.55, 1.0, hk));
      // luce che filtra: venature mobili (caustiche)
      vec2 cp = vec2(vWP.x * .22, vWP.y * .35 + uTime * .5);
      float ca = abs(sin(cp.x * 3.1 + sin(cp.y * 2.3 + uTime) * 1.5) * sin(cp.y * 2.7 + sin(cp.x * 1.9 - uTime * .7)));
      wc += vec3(.05, .16, .16) * pow(1.0 - ca, 6.0) * hk * vSide;
      // schiuma che scende: strisce verticali che scorrono verso il basso
      vec2 sp2 = vec2(vWP.x * .55 + (wf(vec2(vWP.y * .3, vWP.x * .1)) - .5) * 2.5, vWP.y * .28 + uTime * .75);
      float st = wf(sp2), st2 = wf(sp2 * vec2(2.2, 1.6) + 5.3 + vec2(0., uTime * .4));
      float streak = smoothstep(.5, .72, st * .65 + st2 * .45) * vSide;
      streak *= (.25 + .75 * smoothstep(.1, .95, hk)) * (.55 + .45 * wn(vec2(vWP.x * .08, vWP.y * .4 + uTime * .3)));
      // ribollio alla base e cresta bianca in cima
      float baseF = (1.0 - smoothstep(.0, 1.2, vWP.y)) * smoothstep(.45, .7, wf(vec2(vWP.x * 1.3 + uTime * .5, vWP.y * 2.0 - uTime * 1.9))) * vSide;
      float crestF = smoothstep(uTop - .9, uTop - .1, vWP.y) * (.65 + .35 * wf(vec2(vWP.x * .7, uTime * 2.0))) * smoothstep(1.5, 4.0, uTop);
      float foam = clamp(max(max(streak * .75, baseF), crestF), 0.0, 1.0);
      // faccia superiore: superficie del mare, con schiuma solo lungo il bordo del muro
      float edgeD = abs(vWP.z) - uGap;
      vec3 seaTop = vec3(.02, .10, .13) + vec3(.03, .06, .06) * wn(vWP.xz * .3 + uTime * .2);
      float lip = (1.0 - smoothstep(.0, 2.5, edgeD)) * (.6 + .4 * wf(vec2(vWP.x * .6, uTime * 1.5)));
      foam = mix(foam, lip, vUp); wc = mix(wc, seaTop, vUp);
      // testata verso la riva: acqua scura con un filo di schiuma dove tocca la sabbia
      foam = mix(foam, baseF * .8, vEnd); wc = mix(wc, vec3(.01, .05, .07), vEnd);
      diffuseColor.rgb = mix(wc, vec3(.86, .93, .94), foam);
      diffuseColor.a = mix(.9, 1.0, foam);`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .75, clamp(foam, 0., 1.));`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(.008, .045, .05) * smoothstep(.3, 1.0, hk) + vec3(.03, .035, .035) * foam;`);
  };
  const foamMat = new THREE.MeshStandardMaterial({ color: '#eef6f6', roughness: .7, transparent: true, opacity: .9, normalMap: n2 });
  const L = 1400, Wd = 900;
  const halves = [1, -1].map(s => { const m = new THREE.Mesh(new THREE.BoxGeometry(L, 1, Wd, 560, 24, 60), wallMat); m.visible = false; scene.add(m); const f = new THREE.Mesh(new THREE.BoxGeometry(L, .35, 1.2), foamMat); f.visible = false; scene.add(f); return { m, f, s }; });
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(3, 2000), foamMat); shore.rotation.x = -Math.PI / 2; shore.position.set(SEA_X + .8, .24, 0); scene.add(shore);
  // spruzzi strappati alla cresta dal vento orientale e nebbia alla base dei muri
  const dc = document.createElement('canvas'); dc.width = dc.height = 64; { const g = dc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const dotTex = new THREE.CanvasTexture(dc);
  const NS = 2600, sp = new Float32Array(NS * 3), spr = rng(91), spd = [];
  for (let i = 0; i < NS; i++) spd.push({ x: SEA_X + spr() * 300, s: spr() < .5 ? 1 : -1, o: spr() * 4, v: .45 + spr() * .6, h: .6 + spr() * 1.8, w: 3 + spr() * 9 });
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const spray = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#eaf5f6', size: .55, map: dotTex, transparent: true, opacity: .7, depthWrite: false }));
  spray.visible = false; spray.frustumCulled = false; scene.add(spray);
  const NM = 420, mp = new Float32Array(NM * 3), md = [];
  for (let i = 0; i < NM; i++) md.push({ x: SEA_X + spr() * 300, s: spr() < .5 ? 1 : -1, o: spr() * 10, y: spr() * 1.5 });
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const mist = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#cfe2e6', size: 6, map: dotTex, transparent: true, opacity: .06, depthWrite: false }));
  mist.visible = false; mist.frustumCulled = false; scene.add(mist);
  // fondo del mare che si asciuga al vento (Esodo 14:21: «suolo asciutto»)
  const bedTex = (u, srgb) => { const t = T(u, { srgb }).clone(); t.repeat.set(84, 8); t.needsUpdate = true; return t; };
  const bedMat = new THREE.MeshStandardMaterial({ map: bedTex('tex/sand_albedo.jpg', true), normalMap: bedTex('tex/sand_normal.jpg', false), roughness: 1, color: '#d9c7a4' });
  const uDry = { value: 0 }, uGap = { value: 14 };
  bedMat.onBeforeCompile = sh => {
    sh.uniforms.uDry = uDry; sh.uniforms.uGap = uGap;
    sh.vertexShader = 'varying vec3 vBW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform float uDry; uniform float uGap; varying vec3 vBW;
      float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(bh(i), bh(i+vec2(1,0)), f.x), mix(bh(i+vec2(0,1)), bh(i+vec2(1,1)), f.x), f.y); }
      float bf(vec2 p){ return bn(p) * .55 + bn(p * 2.3 + 7.) * .3 + bn(p * 5.1 + 3.) * .15; }
    ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float edge = smoothstep(uGap - 3.0, uGap - .2, abs(vBW.z));
      float wet = max(1.0 - uDry, edge * .85);
      float n = bf(vBW.xz * .35);
      float puddle = smoothstep(.62 + .3 * uDry, .66 + .3 * uDry, n) * (1.0 - uDry * .9);
      float weed = smoothstep(.72, .8, bf(vBW.xz * .9 + 11.)) * (1.0 - uDry * .5);
      vec3 dryC = diffuseColor.rgb;
      vec3 wetC = diffuseColor.rgb * vec3(.48, .46, .42);
      diffuseColor.rgb = mix(dryC, wetC, wet);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .17, .09), weed * .7);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.05, .09, .10), puddle * .8);`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .28, wet);
      roughnessFactor = mix(roughnessFactor, .03, puddle);`);
  };
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(420, 40, 1, 1), bedMat);
  bed.rotation.x = -Math.PI / 2; bed.position.set(SEA_X + 210 - .5, .03, 0); bed.receiveShadow = true; bed.visible = false; scene.add(bed);
  // sassi e conchiglie sul fondo
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8f8571', roughness: .5 });
  const sr = rng(17), NSt = 420, stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12, 0), stoneMat, NSt), tm = new THREE.Matrix4();
  for (let i = 0; i < NSt; i++) { const s = .4 + sr() * 1.6; tm.compose(new THREE.Vector3(SEA_X + 2 + sr() * 400, .03, (sr() - .5) * 26), new THREE.Quaternion().setFromEuler(new THREE.Euler(sr() * 3, sr() * 3, 0)), new THREE.Vector3(s, s * .5, s)); stones.setMatrixAt(i, tm); }
  stones.visible = false; stones.receiveShadow = true; scene.add(stones);
  function part(gap, top, t) {
    const parted = gap > .2; uTop.value = top; uWGap.value = gap;
    water.visible = !parted; shore.visible = !parted; bed.visible = stones.visible = parted; uGap.value = gap;
    for (const h of halves) {
      h.m.visible = parted; h.f.visible = false;
      const bottom = -.5, hh = top - bottom;
      h.m.scale.y = hh; h.m.position.set(SEA_X + L / 2, bottom + hh / 2, h.s * (Wd / 2 + gap));
      h.f.position.set(SEA_X + L / 2, top, h.s * (gap + .5));
    }
    spray.visible = mist.visible = parted && top > 2;
    if (spray.visible) {
      spd.forEach((d, i) => {
        // ogni goccia parte dalla cresta, sale, viene spinta verso ovest e dentro il passaggio, poi ricade
        const ph = (t * d.v + d.o) % 4;
        sp[i * 3] = d.x - ph * d.w + (ph > 0 ? 0 : 0);
        sp[i * 3 + 1] = top + ph * d.h * 1.1 - ph * ph * .55;
        sp[i * 3 + 2] = d.s * (gap - ph * (.6 + d.h * .3));
      });
      sg.attributes.position.needsUpdate = true;
      md.forEach((d, i) => { const ph = (t * .12 + d.o) % 10; mp[i * 3] = d.x - ph * 3; mp[i * 3 + 1] = .4 + d.y + ph * .05; mp[i * 3 + 2] = d.s * (gap - .8 - ph * .25); });
      mg.attributes.position.needsUpdate = true;
    }
  }
  part(0, .22, 0);
  return { water, part, wallMat, n2, setDry: k => { uDry.value = k; }, tick: (t, dt) => { water.material.uniforms.time.value += dt * .5; n2.offset.y = t * .22; n2.offset.x = t * .01; } };
}

/* =====================================================================
   VEGETAZIONE
   ===================================================================== */
// palma da dattero: tronco curvo con cicatrici delle foglie, chioma di fronde arcuate
function palmVariant(seed, T) {
  const r = rng(seed), H = 7 + r() * 5, lean = (r() - .5) * 1.6, leanZ = (r() - .5) * 1.2;
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(lean * t * t, H * t, leanZ * t * t)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  // tronco: anelli lungo la curva con raggio decrescente
  const RS = 10, LS = 24, pos = [], uv = [], idx = [];
  for (let i = 0; i <= LS; i++) {
    const t = i / LS, c = curve.getPoint(t), rad = .33 - t * .1 + (t < .06 ? (0.06 - t) * 3 : 0);
    for (let j = 0; j <= RS; j++) { const a = j / RS * Math.PI * 2; pos.push(c.x + Math.cos(a) * rad, c.y, c.z + Math.sin(a) * rad); uv.push(j / RS * 2, t * H / 1.6); }
  }
  for (let i = 0; i < LS; i++) for (let j = 0; j < RS; j++) { const a = i * (RS + 1) + j, b = a + RS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const trunk = new THREE.BufferGeometry(); trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); trunk.setIndex(idx); trunk.computeVertexNormals();
  // fronde
  const top = curve.getPoint(1), fronds = [];
  const NF = 16 + Math.floor(r() * 6);
  for (let f = 0; f < NF; f++) {
    const az = f / NF * Math.PI * 2 + r() * .3, ring = f % 3, elev = .95 - ring * .38 + (r() - .5) * .2;
    const Lf = 3.4 + r() * 1.3, Wf = .95, S = 12, fp = [], fu = [], fi = [];
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let s = 0; s <= S; s++) {
      const t = s / S, along = Lf * t * Math.cos(elev * (1 - t * .5)), up = Lf * (Math.sin(elev) * t - .55 * t * t), w = Wf * .5 * Math.sin(Math.PI * Math.min(1, t * 1.05 + .02));
      const c = new THREE.Vector3().addScaledVector(dir, along); c.y += up;
      for (const k of [-1, 0, 1]) { const q = c.clone().addScaledVector(side, k * w); q.y += k === 0 ? .06 : -.04 * w; fp.push(top.x + q.x, top.y + q.y - .1, top.z + q.z); fu.push((k + 1) / 2, 1 - t); }
    }
    for (let s = 0; s < S; s++) for (let k = 0; k < 2; k++) { const a = s * 3 + k, b = a + 3; fi.push(a, b, a + 1, b, b + 1, a + 1); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setIndex(fi); fg.computeVertexNormals();
    fronds.push(fg);
  }
  // giovani fronde centrali, dritte
  const crown = mergeGeometries(fronds);
  crown.translate(-top.x, -top.y, -top.z);
  return { trunk, crown, top };
}
export function makePalms(scene, T, spots) {
  const trunkMat = new THREE.MeshStandardMaterial({ map: T('tex/palmtrunk_albedo.jpg', { srgb: true }), normalMap: T('tex/palmtrunk_normal.jpg'), normalScale: new THREE.Vector2(1.4, 1.4), roughness: .95 });
  const frondMat = addWind(new THREE.MeshStandardMaterial({ map: T('tex/palmfrond.png', { srgb: true }), alphaTest: .45, side: THREE.DoubleSide, roughness: .8 }), .04, 'length(position.xz) * .5');
  const variants = [11, 23, 37, 51, 67].map(s => palmVariant(s, T));
  const r = rng(77), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const buckets = variants.map(() => []), out = [];
  spots.forEach(([x, z]) => buckets[Math.floor(r() * variants.length)].push([x, z, .85 + r() * .35, r() * Math.PI * 2]));
  variants.forEach((v, i) => {
    const L = buckets[i]; if (!L.length) return;
    const tm = new THREE.InstancedMesh(v.trunk, trunkMat, L.length), cm = new THREE.InstancedMesh(v.crown, frondMat, L.length);
    L.forEach(([x, z, s, a], j) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); m.compose(ps.set(x, heightAt(x, z) - .05, z), q, sc.set(s, s, s)); tm.setMatrixAt(j, m);
      const topW = v.top.clone().multiplyScalar(s).applyQuaternion(q).add(ps);
      m.compose(topW, q, sc.set(s, s, s)); cm.setMatrixAt(j, m);
    });
    tm.castShadow = cm.castShadow = true; tm.receiveShadow = cm.receiveShadow = true;
    scene.add(tm, cm); out.push(tm, cm);
  });
  return out;
}
// papiro: steli a sezione triangolare con ombrella di filamenti
export function makePapyrus(scene, T, pts) {
  const N = pts.length;
  const stem = new THREE.CylinderGeometry(.018, .03, 1, 3); stem.translate(0, .5, 0);
  const um = mergeGeometries([0, 1, 2].map(i => { const p = new THREE.PlaneGeometry(.75, .75); p.translate(0, .32, 0); p.rotateY(i * Math.PI / 3); return p; }));
  const stemMat = addWind(new THREE.MeshStandardMaterial({ color: '#5f7f34', roughness: .8 }), .06);
  const umMat = addWind(new THREE.MeshStandardMaterial({ map: T('tex/papyrus.png', { srgb: true }), alphaTest: .4, side: THREE.DoubleSide, roughness: .85 }), .06, '1.0');
  const sm = new THREE.InstancedMesh(stem, stemMat, N), hm = new THREE.InstancedMesh(um, umMat, N);
  const d = new THREE.Object3D(), r = rng(13);
  pts.forEach(([x, z], i) => {
    const h = 1.8 + r() * 2.2, tx = (r() - .5) * .22, tz = (r() - .5) * .22;
    d.position.set(x, heightAt(x, z) - .1, z); d.rotation.set(tx, r() * 6, tz); d.scale.set(1, h, 1); d.updateMatrix(); sm.setMatrixAt(i, d.matrix);
    const top = new THREE.Vector3(0, h, 0).applyEuler(new THREE.Euler(tx, 0, tz)).add(d.position);
    d.position.copy(top); d.scale.setScalar(.8 + r() * .5); d.updateMatrix(); hm.setMatrixAt(i, d.matrix);
  });
  sm.castShadow = hm.castShadow = true; scene.add(sm, hm);
}
// ciuffi d'erba e spighe d'orzo (carte incrociate)
export function makeTufts(scene, T, pts, { color = '#ffffff', size = [.5, 1], seed = 3, shadow = false } = {}) {
  const g = mergeGeometries([0, 1].map(i => { const p = new THREE.PlaneGeometry(1, 1); p.translate(0, .5, 0); p.rotateY(i * Math.PI / 2 + .3); return p; }));
  const mat = addWind(new THREE.MeshStandardMaterial({ map: T('tex/grass_tuft.png', { srgb: true }), color, alphaTest: .5, side: THREE.DoubleSide, roughness: .9 }), .08);
  const im = new THREE.InstancedMesh(g, mat, pts.length), d = new THREE.Object3D(), r = rng(seed);
  pts.forEach(([x, z], i) => { const s = size[0] + r() * (size[1] - size[0]); d.position.set(x, heightAt(x, z) - .02, z); d.rotation.set(0, r() * 6, 0); d.scale.set(s * (1.1 + r() * .4), s, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
}
// sassi sparsi
export function makeStones(scene, T, pts) {
  const g = new THREE.IcosahedronGeometry(.3, 2); const p = g.attributes.position, r = rng(5);
  for (let i = 0; i < p.count; i++) { const k = .75 + r() * .4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .7, p.getZ(i) * k); }
  g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: T('tex/limestone_albedo.jpg', { srgb: true }), color: '#9c8466', roughness: .95 }), pts.length), d = new THREE.Object3D();
  pts.forEach(([x, z], i) => { const s = .2 + r() * .7; d.position.set(x, heightAt(x, z), z); d.rotation.set(r(), r() * 6, r()); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
