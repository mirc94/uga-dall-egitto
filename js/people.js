import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './env.js';

export function fabricTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(0,0,0,${.03 + r() * .05})`; g.fillRect(0, y, 256, 1); }
  for (let x = 0; x < 256; x += 2) { g.fillStyle = `rgba(255,255,255,${.02 + r() * .04})`; g.fillRect(x, 0, 1, 256); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * .06})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1); }
  // strisce tessute sul bordo
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 236, 256, 6); g.fillRect(0, 246, 256, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function lathe(points, segs = 28, phiStart = 0, phiLen = Math.PI * 2, folds = 0) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLen);
  if (folds) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 + folds * Math.sin(a * 9) * Math.max(0, 1 - y / 1.2);
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

export function makePerson(spec, fabric, skinMat) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const s = spec.h / 1.74; body.scale.setScalar(s);
  const robeMat = new THREE.MeshStandardMaterial({ map: fabric, color: spec.robe, roughness: .95, side: THREE.DoubleSide });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const w = spec.man ? 1 : .9;
  if (spec.egyptian) {
    // gonnellino di lino bianco, torso e gambe scoperti; gli egiziani di solito si radevano (vedi Genesi 41:14)
    add(lathe([[.2, .5], [.27, .52], [.23, .78], [.2, .97], [.19, 1.0], [0, 1.0]], 26, 0, Math.PI * 2, .03), robeMat);
    add(lathe([[0, .98], [.19, .98], [.2, 1.16], [.23, 1.32], [.2, 1.4], [.08, 1.44], [0, 1.44]], 22), skinMat);
    for (const sx of [-.09, .09]) add(new THREE.CylinderGeometry(.055, .045, .52, 10), skinMat, sx, .27, 0);
    add(new THREE.TorusGeometry(.2, .03, 6, 24), new THREE.MeshStandardMaterial({ color: '#c9a046', roughness: .5, metalness: .4 }), 0, .98, 0).rotation.x = Math.PI / 2;
  } else
  // veste lunga con pieghe
  add(lathe([[0, .02], [.29 * w, .02], [.29 * w, .06], [.26 * w, .42], [.22 * w, .82], [.19 * w, .96], [.21 * w, 1.14], [.22 * w, 1.3], [.18 * w, 1.39], [.075, 1.44], [0, 1.44]], 30, 0, Math.PI * 2, .05), robeMat);
  // cintura
  add(new THREE.TorusGeometry(.19 * w, .025, 6, 24), new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: .9 }), 0, .96, 0).rotation.x = Math.PI / 2;
  // mantello aperto davanti (uomini)
  if (spec.mantle) add(lathe([[.2, 1.4], [.25, 1.3], [.28, 1.0], [.31, .6], [.33, .32]], 26, .75, Math.PI * 2 - 1.5, .04), new THREE.MeshStandardMaterial({ map: fabric, color: spec.mantle, roughness: .95, side: THREE.DoubleSide }));
  // piedi con sandali
  for (const sx of [-.08, .08]) { const f = add(new THREE.SphereGeometry(.055, 10, 8), new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: .9 }), sx, .03, .2); f.scale.set(1, .5, 1.7); }
  // collo e testa
  add(new THREE.CylinderGeometry(.045, .05, .1, 10), skinMat, 0, 1.47, 0);
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); body.add(head);
  const skull = add(new THREE.SphereGeometry(.1, 20, 16), skinMat, 0, 0, 0, head); skull.scale.set(.92, 1.1, 1.0);
  const nose = add(new THREE.ConeGeometry(.018, .05, 8), skinMat, 0, -.01, .1, head); nose.rotation.x = Math.PI / 2;
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1e1610', roughness: .4 });
  for (const sx of [-.033, .033]) add(new THREE.SphereGeometry(.011, 8, 6), eyeMat, sx, .025, .088, head);
  for (const sx of [-.093, .093]) { const e = add(new THREE.SphereGeometry(.022, 8, 6), skinMat, sx, 0, 0, head); e.scale.set(.5, 1, .8); }
  if (spec.egyptian) {
    add(new THREE.SphereGeometry(.106, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: .9 }), 0, .01, -.01, head).scale.set(.98, 1.08, 1.06);
  } else if (spec.man && spec.child) {
    add(new THREE.SphereGeometry(.104, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: spec.hair || '#241a12', roughness: 1 }), 0, .015, -.005, head).scale.set(.95, 1.1, 1.03);
  } else if (spec.man) {
    // barba e capelli
    const beard = add(new THREE.SphereGeometry(.085, 14, 10), new THREE.MeshStandardMaterial({ color: spec.beard, roughness: 1 }), 0, -.08, .045, head);
    beard.scale.set(1, spec.longBeard ? 1.7 : 1.1, .8);
    if (spec.longBeard) { const lb = add(new THREE.ConeGeometry(.07, .22, 12), beard.material, 0, -.2, .06, head); lb.rotation.x = Math.PI; }
    add(new THREE.SphereGeometry(.104, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: spec.hair, roughness: 1 }), 0, .015, -.005, head).scale.set(.95, 1.1, 1.03);
    // copricapo di stoffa con fascia
    const cloth = new THREE.MeshStandardMaterial({ map: fabric, color: spec.head, roughness: .95, side: THREE.DoubleSide });
    add(new THREE.SphereGeometry(.118, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), cloth, 0, .02, -.005, head).scale.set(.95, 1.05, 1.05);
    add(lathe([[.12, .05], [.13, -.06], [.17, -.2], [.21, -.3]], 18, 1.3, Math.PI * 2 - 2.6), cloth, 0, 0, -.01, head);
    add(new THREE.TorusGeometry(.112, .012, 6, 20), new THREE.MeshStandardMaterial({ color: '#2b2219', roughness: .8 }), 0, .06, 0, head).rotation.x = Math.PI / 2;
  } else {
    // velo sul capo e sulle spalle, aperto sul viso
    const scarf = new THREE.MeshStandardMaterial({ map: fabric, color: spec.scarf, roughness: .95, side: THREE.DoubleSide });
    add(new THREE.SphereGeometry(.122, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), scarf, 0, .01, -.01, head).scale.set(.95, 1.08, 1.06);
    add(lathe([[.125, .02], [.13, -.08], [.18, -.2], [.25, -.3], [.27, -.42]], 22, .75, Math.PI * 2 - 1.5), scarf, 0, 0, -.01, head);
  }
  // braccia: spalla -> gomito -> mano, con manica larga
  const sleeveMat = spec.egyptian ? skinMat : robeMat;
  const arm = (side, swing, out, bend, holdAt) => {
    const sh = new THREE.Group(); sh.position.set(side * .2 * w, 1.34, 0); sh.rotation.set(-swing, 0, side * out); body.add(sh);
    add(new THREE.CylinderGeometry(.07, .05, .3, 10), sleeveMat, 0, -.15, 0, sh);
    const el = new THREE.Group(); el.position.set(0, -.29, 0); el.rotation.x = -bend; sh.add(el);
    add(new THREE.CylinderGeometry(.075, .065, .26, 10), sleeveMat, 0, -.13, 0, el);
    add(new THREE.SphereGeometry(.042, 10, 8), skinMat, 0, -.29, 0, el);
    return el;
  };
  const r = spec.pose;
  const wood = new THREE.MeshStandardMaterial({ color: '#6e4f33', roughness: .85 });
  if (r === 'staff') {
    arm(1, .45, .3, .55); arm(-1, -.05, .1, .15);
    add(new THREE.CylinderGeometry(.022, .026, 1.95, 8), wood, .36, .98, .24);
  } else if (r === 'plank') {
    const la = arm(-1, 1.2, -.15, 1.6); arm(1, .05, .12, .2);
    const pl = add(new THREE.BoxGeometry(.25, .06, 3.2), new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: .9 }), -.2, 1.55, 0); void la; pl.rotation.y = .1;
  } else if (r === 'guide') {
    arm(1, 1.25, .35, .25); arm(-1, .1, .12, .3);
  } else if (r === 'jar') {
    arm(1, .55, -.05, 1.15); arm(-1, .55, -.05, 1.15);
    const j = add(new THREE.LatheGeometry([[0, 0], [.09, .01], [.13, .12], [.12, .24], [.06, .32], [.07, .36]].map(([a, b]) => new THREE.Vector2(a, b)), 16), new THREE.MeshStandardMaterial({ color: '#a2603d', roughness: .9 }), 0, .95, .25);
    j.castShadow = true;
  } else if (r === 'basket' || r === 'sheaf') {
    arm(1, .2, .35, 1.4); arm(-1, .05, .12, .2);
    if (r === 'basket') { const b = add(new THREE.CylinderGeometry(.18, .13, .2, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#b8925a', roughness: 1, side: THREE.DoubleSide }), .32, 1.0, .12); b.rotation.z = .2;
      add(new THREE.SphereGeometry(.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c9a84f', roughness: 1 }), .32, 1.05, .12); }
    else { const sh = add(new THREE.CylinderGeometry(.08, .12, .7, 10), new THREE.MeshStandardMaterial({ color: '#cfae62', roughness: 1 }), .3, 1.1, .1); sh.rotation.z = -.5; }
  } else if (r === 'carry') {
    arm(1, 2.6, .25, .2); arm(-1, .1, .12, .3);
    const b = add(new THREE.CylinderGeometry(.24, .17, .22, 14, 1, true), new THREE.MeshStandardMaterial({ map: fabric, color: '#9a7a4e', roughness: 1, side: THREE.DoubleSide }), .22, 1.62, 0); b.rotation.z = -.15;
    add(new THREE.SphereGeometry(.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5e4630', roughness: .7 }), .22, 1.64, 0).scale.y = .5;
  } else if (r === 'raise') {
    const el = arm(1, 2.4, .35, .1); arm(-1, .1, .12, .3);
    const st = add(new THREE.CylinderGeometry(.022, .026, 1.95, 8), wood, 0, -.3, 0, el); st.rotation.x = .3;
    root.userData.raiseArm = el.parent;
  } else { arm(1, .05, .12, .2); arm(-1, .05, .12, .2); }
  root.userData = { spec, head, body, phase: Math.random() * 10 };
  root.traverse(o => { if (o.isMesh) o.userData.person = spec; });
  return root;
}


export function animatePeople(people, t) {
  for (const p of people) {
    const u = p.userData; if (!u.head) continue;
    u.head.rotation.y = Math.sin(t * .4 + u.phase) * .35;
    u.head.rotation.x = Math.sin(t * .3 + u.phase * 2) * .06;
    u.body.rotation.z = Math.sin(t * 1.1 + u.phase) * .012;
  }
}

/* folla del finale: veste con pieghe + testa con copricapo, in istanze */
export function crowdGeometries() {
  const robe = lathe([[0, .02], [.29, .02], [.29, .06], [.26, .42], [.22, .82], [.19, .96], [.21, 1.14], [.22, 1.3], [.18, 1.39], [.075, 1.44], [0, 1.44]], 14, 0, Math.PI * 2, .05);
  const skinC = new THREE.Color('#9a6b47'), clothC = new THREE.Color('#ffffff');
  const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  const face = new THREE.SphereGeometry(.1, 10, 8); face.scale(.92, 1.1, 1); face.translate(0, 1.6, 0);
  const cap = new THREE.SphereGeometry(.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, 1.62, -.005);
  const veil = lathe([[.12, .05], [.13, -.06], [.17, -.2], [.21, -.3]], 10, 1.3, Math.PI * 2 - 2.6); veil.translate(0, 1.6, -.01);
  const head = mergeGeometries([paint(face, skinC), paint(cap.toNonIndexed ? cap : cap, clothC), paint(veil, clothC)].map(g => g.index ? g.toNonIndexed() : g));
  robe.deleteAttribute('uv');
  return { robe, head };
}
