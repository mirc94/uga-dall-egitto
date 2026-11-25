import * as THREE from 'three';
import { loadGltfJson } from './gltfjson.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './env.js';

/* Animali menzionati nel racconto: greggi e mandrie (Esodo 12:38), cavalli, asini, cammelli, bovini, pecore (Esodo 9:3).
   h = altezza reale (m) al garrese/testa. I modelli guardano verso +z. */
export const SPECIES = {
  pecora: { name: 'Pecora', h: 1.0, sound: 'belato', ref: 'Esodo 12:5, 38' },
  agnello: { file: 'pecora', name: 'Agnello di un anno', h: .78, sound: 'belato', ref: 'Esodo 12:3-6' },
  capra: { name: 'Capra', h: 1.05, sound: 'belato', ref: 'Esodo 12:5, 38' },
  bue: { name: 'Bue', h: 1.65, sound: 'muggito', ref: 'Esodo 9:3; 12:38' },
  mucca: { name: 'Mucca', h: 1.5, sound: 'muggito', ref: 'Esodo 12:38' },
  vitellino: { name: 'Vitello', h: 1.0, sound: 'muggito', ref: 'Esodo 12:38' },
  asino: { name: 'Asino', h: 1.4, sound: 'raglio', ref: 'Esodo 9:3' },
  cammello: { name: 'Cammello', h: 2.2, sound: 'grugnito', ref: 'Esodo 9:3' },
  cavallo: { name: 'Cavallo', h: 1.75, sound: 'nitrito', ref: 'Esodo 9:3; 14:9' },
};

export async function loadAnimals(manager) {
  const loader = new GLTFLoader(manager); const geo = {};
  const files = [...new Set(Object.entries(SPECIES).map(([k, s]) => s.file || k))];
  await Promise.all(files.map(f => loadGltfJson(loader, `models/${f}.json`).then(g => {
    let mesh = null; g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    mesh.geometry.computeBoundingBox(); geo[f] = mesh;
  })));
  const out = {};
  for (const [k, s] of Object.entries(SPECIES)) {
    const m = geo[s.file || k]; const size = m.geometry.boundingBox.getSize(new THREE.Vector3());
    m.material.envMapIntensity = .9;
    out[k] = { geometry: m.geometry, material: m.material, scale: s.h / size.y };
  }
  return out;
}

/* recs: [{k, x, z, yaw}] — una InstancedMesh per specie */
export function placeAnimals(assets, recs, scene) {
  const by = {}; recs.forEach(r => (by[r.k] = by[r.k] || []).push(r));
  const meshes = [], mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  function setInst(r, t = 0) {
    let y = heightAt(r.x, r.z), tilt = 0;
    if (r.walk) y += Math.abs(Math.sin(t * 5 + r.phase)) * .04;
    if (r.jump > 0) y += Math.sin((1 - r.jump) * Math.PI) * .25;
    if (r.graze) tilt = .08 + Math.sin(t * .5 + r.phase) * .06;
    q.setFromEuler(new THREE.Euler(tilt, r.yaw, 0, 'YXZ'));
    mtx.compose(p.set(r.x, y, r.z), q, s.setScalar(r.scale));
    r.mesh.setMatrixAt(r.i, mtx); r.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const [k, list] of Object.entries(by)) {
    const a = assets[k]; const im = new THREE.InstancedMesh(a.geometry, a.material, list.length);
    im.castShadow = im.receiveShadow = true; im.userData.list = list; im.frustumCulled = false;
    list.forEach((r, i) => { Object.assign(r, { mesh: im, i, scale: a.scale, name: SPECIES[k].name, sound: SPECIES[k].sound, ref: SPECIES[k].ref, phase: Math.random() * 6, jump: 0, x0: r.x, z0: r.z }); setInst(r); });
    scene.add(im); meshes.push(im);
  }
  return { meshes, setInst, recs };
}
