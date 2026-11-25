// Luce e atmosfera: post-processing (ombre d'ambiente, bagliore), colonna di fuoco e di nuvola, polvere nell'aria.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const mobile = matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 700;

/* ---------- post-processing ---------- */
export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // il disco del sole può superare i limiti dei numeri a mezza precisione: senza questo il bagliore annerisce lo schermo
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb = clamp(c.rgb, 0.0, 200.0); if (c.r != c.r || c.g != c.g || c.b != c.b) c.rgb = vec3(0.0); gl_FragColor = c; }' }));
  let ao = null;
  if (!mobile && !window.__noAO) {
    // ombre morbide dove gli oggetti si toccano: angoli, piedi, pieghe delle case
    ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    ao.blendIntensity = .85;
    ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(ao);
  }
  // bagliore solo sulle sorgenti molto luminose: fuoco, colonna, lampade, luna
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .5, .55, 1.15);
  if (!window.__noBloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render() { composer.render(); },
    setSize(w, h) { composer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); if (ao) ao.setSize(w, h); bloom.setSize(w / 2, h / 2); },
    // la soglia tiene conto dell'esposizione, applicata solo alla fine: di giorno brillano solo sole e riflessi forti
    phase(night, inside) { const e = Math.max(.3, renderer.toneMappingExposure); bloom.strength = .06 + .32 * night + (inside ? .12 : 0); bloom.threshold = (night > .5 ? 2.4 : 4.5) / e; },
  };
}

/* ---------- colonna di nuvola e di fuoco (Esodo 13:21, 22; 14:19, 20) ---------- */
const NOISE = `
  float ch(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float cn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
    return mix(mix(mix(ch(i), ch(i+vec3(1,0,0)), f.x), mix(ch(i+vec3(0,1,0)), ch(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(ch(i+vec3(0,0,1)), ch(i+vec3(1,0,1)), f.x), mix(ch(i+vec3(0,1,1)), ch(i+vec3(1,1,1)), f.x), f.y), f.z); }
  float cf(vec3 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * cn(p); p = p * 2.02 + 3.1; a *= .5; } return v; }
`;
function columnMat(kind, H) {
  const fire = kind === 'fire';
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uH: { value: H }, uSun: { value: new THREE.Vector3(.4, .8, .3) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: NOISE + `
      uniform float uTime; uniform float uH;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){
        vec3 p = position;
        float a = atan(p.z, p.x), h = p.y / uH;
        // la colonna ondeggia e si gonfia come una massa viva
        float w = ${fire ? `cf(vec3(cos(a) * 1.5, p.y * .045 - uTime * .9, sin(a) * 1.5))` : `cf(p * .07 + vec3(0., -uTime * .1, 0.))`} - .5;
        p.xz *= 1.0 + w * ${fire ? '.55' : '.7'};
        p.x += sin(p.y * .05 + uTime * .3) * 1.2; p.z += cos(p.y * .04 + uTime * .25) * 1.0;
        vP = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWN = normalize(mat3(modelMatrix) * normal);
        vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * wp).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: NOISE + `
      uniform float uTime; uniform float uK; uniform float uH; uniform vec3 uSun;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){
        float h = clamp(vP.y / uH, 0., 1.);
        float a = atan(vP.z, vP.x);
        ${fire ? `vec3 q = vec3(cos(a) * 2.2, vP.y * .09, sin(a) * 2.2);` : `vec3 q = vP * .11;`}
        float n = cf(q + vec3(0., -uTime * ${fire ? '1.6' : '.12'}, uTime * .05));
        float n2 = cf(q * 2.3 + vec3(5., -uTime * ${fire ? '2.8' : '.2'}, 1.));
        float body = n * .7 + n2 * .45;
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), ${fire ? '1.3' : '.9'});
        float ends = smoothstep(0., .06, h) * (1. - smoothstep(.82, 1., h));
        ${fire ? `
        float f = smoothstep(.35, .85, body * (.55 + .7 * edge));
        vec3 c = mix(vec3(.55, .06, .01), vec3(1., .42, .06), smoothstep(.2, .6, f));
        c = mix(c, vec3(1., .86, .55), smoothstep(.65, .95, f * edge));
        float al = f * ends * uK;
        gl_FragColor = vec4(c * al * 1.15, al);` : `
        float d = smoothstep(.32, .62, body * (.55 + .7 * edge));
        float lit = .55 + .45 * max(dot(normalize(vWN), normalize(uSun)), 0.);
        vec3 c = mix(vec3(.50, .49, .47), vec3(.97, .96, .93), lit * (.6 + .4 * n2));
        c *= .85 + .15 * h;
        float al = d * ends * uK * .92;
        gl_FragColor = vec4(c, al);`}
      }`,
  });
}

export function createPillar(scene, glowTexture) {
  const H = 82, g = new THREE.Group(); scene.add(g);
  const layers = [];
  const add = (kind, r0, r1, ord) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H, 64, 90, true), columnMat(kind, H));
    m.position.y = H / 2; m.geometry.translate(0, H / 2, 0); m.position.y = 0; m.renderOrder = ord; m.frustumCulled = false; g.add(m); layers.push({ kind, m });
  };
  add('cloud', 6.5, 10, 2); add('cloud', 4.5, 7.5, 3); add('cloud', 8.5, 12.5, 1);
  add('fire', 3.8, 6.5, 4); add('fire', 2.2, 4.2, 5); add('fire', 5.5, 8.5, 3);
  // scintille che salgono dal fuoco
  const NE = 500, ep = new Float32Array(NE * 3), ed = [], r = Math.random;
  for (let i = 0; i < NE; i++) ed.push({ a: r() * 6.28, rad: 1 + r() * 5, sp: 4 + r() * 9, o: r() * 80, sw: r() * 6 });
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: '#ffb35a', size: .35, map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  embers.frustumCulled = false; g.add(embers);
  const light = new THREE.PointLight('#ff9a48', 0, 300, 1.1); light.position.set(0, 22, 0); g.add(light);
  return {
    group: g, light,
    update(t, night, sun) {
      for (const l of layers) {
        const u = l.m.material.uniforms; u.uTime.value = t;
        u.uK.value = l.kind === 'fire' ? night : 1 - night;
        if (sun) u.uSun.value.copy(sun);
        l.m.visible = u.uK.value > .01;
      }
      embers.visible = night > .05; embers.material.opacity = night;
      if (embers.visible) {
        ed.forEach((d, i) => { const y = (d.o + t * d.sp) % 80; const a = d.a + t * .3; ep[i * 3] = Math.cos(a) * d.rad * (1 + y * .02) + Math.sin(t * 2 + d.sw) * .5; ep[i * 3 + 1] = y; ep[i * 3 + 2] = Math.sin(a) * d.rad * (1 + y * .02); });
        eg.attributes.position.needsUpdate = true;
      }
      return .82 + Math.sin(t * 11) * .08 + Math.sin(t * 23.7) * .06 + Math.sin(t * 5.3) * .04;   // tremolio per la luce
    },
  };
}

/* ---------- polvere sospesa nell'aria, visibile controluce di giorno ---------- */
export function createDust(scene, glowTexture) {
  const N = mobile ? 500 : 1400, R = 22, pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) seed.push([Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1, Math.random() * 6.28, .3 + Math.random() * .7]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#f3dcab', size: .05, map: glowTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return {
    update(t, cam, day, wind) {
      pts.visible = day > .05; mat.opacity = .55 * day; if (!pts.visible) return;
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        // ogni granello vaga piano; la nuvola segue la telecamera senza scatti (coordinate a ciclo)
        let x = s[0] * R + t * (.25 + wind) * s[4] + Math.sin(t * .3 + s[3]) * .6, z = s[2] * R + Math.cos(t * .23 + s[3]) * .6;
        x = ((x - cam.x) % (2 * R) + 3 * R) % (2 * R) - R + cam.x; z = ((z - cam.z) % (2 * R) + 3 * R) % (2 * R) - R + cam.z;
        pos[i * 3] = x; pos[i * 3 + 1] = cam.y - 1.2 + s[1] * 5 + Math.sin(t * .5 + s[3]) * .3; pos[i * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
