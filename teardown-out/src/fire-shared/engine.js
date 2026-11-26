// The Fiat 1.1 FIRE, built from code in millimetres in the look of a clean study model: a gloss-black open block of
// bulkheads round five main bearings, glass cylinder liners with the charge inside them, polished pistons, black rods,
// a flat 180° crank with counterweights, two in-line valves per cylinder with coil springs under bucket tappets, one
// overhead camshaft in its carrier, white spark plugs on the intake side, intake runners and black exhaust bends,
// a toothed timing belt (crank sprocket 20 teeth, cam pulley 40) and the accessory pulley at the front, the flywheel
// at the back, and red overlay arrows. update(th, ops) poses everything for crank angle th (degrees).
import * as THREE from 'three';
import {chargeOf, CYL, E, FIRE, liftEx, liftIn, piston, pinXY, psi, PIN_PHASE, pressure, VALVE} from './kin.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const DECK = E.deck;
const CAM_Y = DECK + E.camH;
const FRONT = 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};

// ------------------------------------------------------------ geometry helpers
function gearGeo(teeth, rOut, rRoot, width, helix = 0, holeR = 0) {
  const sh = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const da = (Math.PI * 2) / teeth;
    const pts = [
      [rRoot, a0],
      [rRoot, a0 + da * 0.2],
      [rOut, a0 + da * 0.33],
      [rOut, a0 + da * 0.62],
      [rRoot, a0 + da * 0.75],
    ];
    pts.forEach(([r, a], k) => (i === 0 && k === 0 ? sh.moveTo(r * Math.cos(a), r * Math.sin(a)) : sh.lineTo(r * Math.cos(a), r * Math.sin(a))));
  }
  sh.closePath();
  if (holeR) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 1, curveSegments: 4});
  g.translate(0, 0, -width / 2);
  if (helix) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = (p.getZ(i) / width) * helix;
      const x = p.getX(i);
      const y = p.getY(i);
      p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    }
  }
  g.computeVertexNormals();
  return g;
}
// a gear's blank: a plain disc at the pitch radius, the same width, bevel and bore, no teeth
function discGeo(r, width, holeR = 0, seg = 48) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r, 0, Math.PI * 2, false);
  if (holeR) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 1, curveSegments: seg});
  g.translate(0, 0, -width / 2);
  return g;
}
function helixGeo(r, wire, turns, len, seg = 220) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = u * turns * Math.PI * 2;
    pts.push(new V3(Math.cos(a) * r, u * len, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, wire, 8, false);
}
// a crank web: the main boss, the pin boss and a counterweight sector opposite the pin, in the XY plane
function webGeo(thick, cs = 28) {
  const sh = new THREE.Shape();
  const R = 56;
  // the counterweight: a fat sector below the axis, flanks running up to the pin boss
  sh.moveTo(-R * Math.sin(1.05), -R * Math.cos(1.05));
  sh.absarc(0, 0, R, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05, false);
  sh.lineTo(23, 8);
  sh.absarc(0, E.r, 24, 0, Math.PI, false);
  sh.lineTo(-23, 8);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth: thick, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2, curveSegments: cs});
  g.translate(0, 0, -thick / 2);
  return g;
}
// an inline bulkhead: the crank bore, the walls tapering up to the deck either side of the bore
function bulkheadGeo(thick, cs = 24) {
  const sh = new THREE.Shape();
  const ordered = [[-78, -52], [78, -52], [84, 20], [56, DECK - 12], [-56, DECK - 12], [-84, 20]];
  ordered.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 32, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  // a window through the wall so the bores stay readable
  const win = new THREE.Path();
  win.moveTo(-40, 60);
  win.lineTo(-40, DECK - 40);
  win.lineTo(40, DECK - 40);
  win.lineTo(40, 60);
  win.closePath();
  sh.holes.push(win);
  const g = new THREE.ExtrudeGeometry(sh, {depth: thick, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2, curveSegments: cs});
  g.translate(0, 0, -thick / 2);
  return g;
}
// the timing belt: a flat toothed loop round the crank sprocket (r1 at the origin) and the cam pulley (r2 at h)
function beltGeo(r1, r2, h, thick, width) {
  const hull = (pts) => {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    for (const p of pts) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    const up = [];
    for (const p of [...pts].reverse()) {
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const ring = (d) => {
    const pts = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([(r1 + d) * Math.cos(a), (r1 + d) * Math.sin(a)], [(r2 + d) * Math.cos(a), h + (r2 + d) * Math.sin(a)]);
    }
    return hull(pts);
  };
  const sh = new THREE.Shape();
  ring(thick).forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const hole = new THREE.Path();
  ring(0.3).reverse().forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
  hole.closePath();
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: false});
  g.translate(0, 0, -width / 2);
  return g;
}

/** opts.plain: the same engine a notch simpler (the A/B film's version B): gears as toothless discs, each valve's
 *  two coil springs as one plain sleeve, no piston rings, no pulley bolts. Absent, the engine is built as before.
 *  opts.lo: the teardown A/B's version B, clearly cheaper: everything plain drops, plus flat-shaded Lambert for every
 *  material, opaque liners, a sixth of the segments on every round part, polygon discs for gears, boxes for lobes.
 *  opts.caps: a colour; with a section on, the cut gets a flat face of it wherever it passes through a solid. */
export function buildEngine(opts = {}) {
  const lo = !!opts.lo;
  const plain = !!opts.plain || lo;
  // segment counts: the film's, or a sixth of them in the low build
  const N = (n, min = 6) => (lo ? Math.max(min, Math.round(n / 6)) : n);
  const gear = (teeth, rOut, rRoot, width, helix = 0, holeR = 0) =>
    plain ? discGeo((rOut + rRoot) / 2, width, holeR, lo ? Math.max(8, Math.round((rOut + rRoot) / 24)) : 48) : gearGeo(teeth, rOut, rRoot, width, helix, holeR);
  const root = new THREE.Group();
  const M = {
    black: new THREE.MeshPhysicalMaterial({color: '#141518', roughness: 0.3, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.18}),
    blackMatte: new THREE.MeshPhysicalMaterial({color: '#1b1c1f', roughness: 0.55, metalness: 0.15, clearcoat: 0.25}),
    steel: new THREE.MeshStandardMaterial({color: '#cfd2d6', roughness: 0.22, metalness: 1}),
    alu: new THREE.MeshStandardMaterial({color: '#d9dbdf', roughness: 0.3, metalness: 0.85}),
    bronze: new THREE.MeshStandardMaterial({color: '#b98a55', roughness: 0.3, metalness: 0.9}),
    ceramic: new THREE.MeshPhysicalMaterial({color: '#f3f0ea', roughness: 0.35, metalness: 0, clearcoat: 0.6}),
    glass: new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6}),
    runner: new THREE.MeshStandardMaterial({color: '#8d939a', roughness: 0.5, metalness: 0.7, envMapIntensity: 0.5}),
    red: new THREE.MeshBasicMaterial({color: '#e3172c', transparent: true, opacity: 0.9, depthWrite: false}),
  };
  if (lo) {
    // flat Lambert: no gloss, nothing to reflect; the blacks lift to graphite so the facets still read without the
    // studio's highlights, and the liners turn opaque
    const flat = (color) => new THREE.MeshLambertMaterial({color, flatShading: true});
    Object.assign(M, {runner: flat('#8d939a'), black: flat('#66696f'), blackMatte: flat('#717479'), steel: flat('#b9bdc3'), alu: flat('#cfd2d6'), bronze: flat('#a37b4d'), ceramic: flat('#ece8e0'), glass: flat('#86898f')});
  }
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ block: bulkheads, rails, pan
  const block = new THREE.Group();
  root.add(block);
  const bh = bulkheadGeo(14, N(24));
  const MAINS = [152, 76, 0, -76, -152];
  for (const z of MAINS) add(block, bh, M.black).position.z = z;
  // deck rails along the block, both sides of the bores
  for (const w of [-47, 47]) {
    const r = add(block, new THREE.BoxGeometry(12, 14, 330), M.black);
    r.position.set(w, DECK - 17, 0);
  }
  const pan = add(block, new THREE.BoxGeometry(168, 36, 320), M.blackMatte);
  pan.position.set(0, -88, 0);
  const rail = add(block, new THREE.BoxGeometry(182, 10, 334), M.black);
  rail.position.set(0, -70, 0);

  // ------------------------------------------------------------ cylinders: liner, flange, head pieces, valvetrain, plug, exhaust
  const cyl = CYL.map((cy) => {
    const g = new THREE.Group();
    g.position.z = cy.z;
    root.add(g);
    // local x points across the engine: exhaust on +x, intake on -x
    const out = 1;
    const liner = add(g, new THREE.CylinderGeometry(E.bore / 2 + 3, E.bore / 2 + 3, 100, N(48), 1, true), M.glass, false);
    liner.position.y = DECK - 50;
    liner.renderOrder = 3;
    for (const y of [DECK - 100, DECK]) {
      const ring = add(g, new THREE.TorusGeometry(E.bore / 2 + 4, 2.6, N(10, 4), N(48)), M.black);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
    }
    // the head: one slice of the cast head over this bore, with its valves, plug, ports and runners
    const head = new THREE.Group();
    g.add(head);
    const cap = add(head, new THREE.BoxGeometry(128, 12, 72), M.black);
    cap.position.y = DECK + 8;
    const vblock = add(head, new THREE.BoxGeometry(56, 14, 66), M.black);
    vblock.position.y = DECK + 21;
    // the charge: a column of gas between the crown and the head
    const charge = new THREE.Mesh(new THREE.CylinderGeometry(E.bore / 2 - 1, E.bore / 2 - 1, 1, N(40)), new THREE.MeshBasicMaterial({color: '#4a90e2', transparent: true, opacity: 0.35, depthWrite: false}));
    charge.renderOrder = 2;
    g.add(charge);
    // valves: in a row under the single cam, intake toward the back, exhaust toward the front
    const valves = [
      {z: -16, kind: 'in', r: 15},
      {z: 16, kind: 'ex', r: 12.5},
    ].map((v) => {
      const vg = new THREE.Group();
      head.add(vg);
      vg.position.z = v.z;
      const stem = add(vg, new THREE.CylinderGeometry(3, 3, 92, N(12)), M.steel);
      stem.position.y = DECK + 42;
      const disc = add(vg, new THREE.CylinderGeometry(v.r, 6, 5, N(28)), M.steel);
      disc.position.y = DECK - 2.5;
      const spring = new THREE.Group();
      head.add(spring);
      spring.position.set(0, DECK + 30, v.z);
      if (plain) {
        const sleeve = new THREE.CylinderGeometry(11, 11, 40, N(24));
        sleeve.translate(0, 20, 0);
        add(spring, sleeve, M.steel);
      } else {
        add(spring, helixGeo(11, 2, 7, 40), M.steel);
      }
      // the bucket tappet: the cam lobe presses it straight down on the stem
      const bucket = add(vg, new THREE.CylinderGeometry(13.5, 13.5, 16, N(24)), M.alu);
      bucket.position.y = DECK + 79;
      return {...v, vg, spring};
    });
    // the cam carrier: two black rails along the cam, bearing caps over it
    const cage = new THREE.Group();
    g.add(cage);
    // the cam carrier: four posts and a bearing cap per cylinder, open so the springs and buckets stay in view
    for (const xx of [-30, 30]) {
      for (const zz of [-31, 31]) {
        const post = add(cage, new THREE.BoxGeometry(8, 64, 8), M.black);
        post.position.set(xx, DECK + 60, zz);
      }
    }
    const bcap = add(cage, new THREE.BoxGeometry(68, 12, 10), M.black);
    bcap.position.set(0, CAM_Y + 14, 0);
    // spark plug: out of the head on the intake side, leaning inboard toward the chamber
    const plug = new THREE.Group();
    head.add(plug);
    plug.position.set(-out * 34, DECK + 14, 0);
    plug.rotation.z = out * 0.55;
    add(plug, new THREE.CylinderGeometry(5.5, 5.5, 34, N(16)), M.ceramic).position.y = 26;
    add(plug, new THREE.CylinderGeometry(7.5, 7.5, 9, 6), M.steel).position.y = 5;
    add(plug, new THREE.CylinderGeometry(2, 2, 9, N(8, 4)), M.steel).position.y = 47;
    // exhaust: a black bend out of the port on the +x side, down along the block
    const pts = [new V3(out * 44, DECK + 10, 14), new V3(out * 76, DECK + 4, 14), new V3(out * 98, DECK - 26, 10), new V3(out * 102, DECK - 80, 6)];
    add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N(32), 12, N(18), false), M.black);
    // intake: an aluminium runner up and out on the -x side
    const ipts = [new V3(-out * 44, DECK + 12, -14), new V3(-out * 78, DECK + 20, -14), new V3(-out * 104, DECK + 52, -10), new V3(-out * 110, DECK + 92, -6)];
    add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ipts), N(32), 13, N(18), false), M.runner);
    return {cy, g, out, charge, valves, liner, head, cage};
  });

  // the single overhead camshaft: lobes over every valve, pressing the buckets straight down
  const cams = ['C'].map((bank) => {
    const g = new THREE.Group();
    g.position.set(0, CAM_Y, 0);
    root.add(g);
    add(g, new THREE.CylinderGeometry(12, 12, 2 * FRONT + 10, N(20)), M.black).rotation.x = Math.PI / 2;
    const lobes = [];
    for (const c of cyl) {
      for (const v of c.valves) {
        const lg = new THREE.Group();
        lg.position.set(0, 0, c.cy.z + v.z);
        // each lobe points straight down (toward its bucket) when its valve is fully open
        const peak = FIRE[c.cy.c] + (v.kind === 'in' ? (VALVE.in[0] + VALVE.in[1]) / 2 : (VALVE.ex[0] + VALVE.ex[1]) / 2);
        lg.rotation.z = (peak / 2) * D2R + Math.PI;
        g.add(lg);
        const sh = new THREE.Shape();
        sh.absellipse(0, 4.5, 15, 19.5, 0, Math.PI * 2, false, 0);
        const lobeGeo = lo ? new THREE.BoxGeometry(30, 39, 14).translate(0, 4.5, 7) : new THREE.ExtrudeGeometry(sh, {depth: 14, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 1, curveSegments: 24});
        const lobe = add(lg, lobeGeo, M.black);
        lobe.position.z = -7;
        lobes.push({lg, c, v});
      }
    }
    return {bank, g, lobes};
  });

  // ------------------------------------------------------------ crankshaft
  const crank = new THREE.Group();
  root.add(crank);
  const webG = webGeo(14, N(28));
  const webs = [];
  E.pinZ.forEach((z, p) => {
    for (const dz of [-19, 19]) {
      const w = add(crank, webG, M.black);
      w.position.z = z + dz;
      webs.push({w, p});
    }
  });
  const journals = MAINS.map((z) => {
    const j = add(crank, new THREE.CylinderGeometry(22, 22, 26, N(32)), M.steel);
    j.rotation.x = Math.PI / 2;
    j.position.z = z;
    return j;
  });
  const pins = E.pinZ.map((z) => {
    const m = add(root, new THREE.CylinderGeometry(18, 18, 26, N(28)), M.steel);
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    return m;
  });

  // ------------------------------------------------------------ pistons and rods
  const pistonGeo = new THREE.CylinderGeometry(E.bore / 2 - 1.2, E.bore / 2 - 1.2, 46, N(48));
  const ringGeo = new THREE.TorusGeometry(E.bore / 2 - 1.2, 1.6, 8, 48);
  const pist = CYL.map((cy, i) => {
    const g = new THREE.Group();
    cyl[i].g.add(g);
    const body = add(g, pistonGeo, M.alu);
    body.position.y = E.comp - 23;
    for (let k = 0; k < (plain ? 0 : 3); k++) {
      const r = add(g, ringGeo, M.blackMatte);
      r.rotation.x = Math.PI / 2;
      r.position.y = E.comp - 6 - k * 5.5;
    }
    const pinM = add(g, new THREE.CylinderGeometry(9, 9, E.bore - 8, N(16)), M.steel);
    pinM.rotation.z = Math.PI / 2;
    pinM.rotation.y = Math.PI / 2;
    const rod = new THREE.Group();
    root.add(rod);
    const beam = add(rod, new THREE.BoxGeometry(14, 1, 10), M.black);
    const big = add(rod, new THREE.CylinderGeometry(25, 25, 18, N(32)), M.black);
    big.rotation.x = Math.PI / 2;
    const small = add(rod, new THREE.CylinderGeometry(13, 13, 18, N(24)), M.black);
    small.rotation.x = Math.PI / 2;
    // the red arrow riding beside the liner, pointing the way the piston moves
    const arrow = new THREE.Group();
    cyl[i].g.add(arrow);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 46, 12), M.red);
    shaft.position.y = -10;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 18), M.red);
    tip.position.y = 23;
    arrow.add(shaft, tip);
    arrow.position.set(cyl[i].out * 62, 0, 0);
    arrow.renderOrder = 5;
    return {g, rod, beam, big, small, arrow};
  });

  // ------------------------------------------------------------ front: timing gears and the pulley; rear: the flywheel
  const front = FRONT;
  // the toothed belt drive: crank sprocket 20 teeth, cam pulley 40 teeth, the cam at half crank speed
  const crankGear = add(root, gear(20, 29, 26, 20, 0, 9), M.black);
  crankGear.position.z = front;
  const camPulley = add(root, gear(40, 57, 54, 20, 0, 12), M.black);
  camPulley.position.set(0, CAM_Y, front);
  const camGears = [camPulley];
  const belt = add(root, beltGeo(29, 57, CAM_Y, 4, 18), M.blackMatte);
  belt.position.z = front;
  const idlers = [{gg: belt}];
  const pulley = new THREE.Group();
  pulley.position.z = front + 34;
  root.add(pulley);
  add(pulley, new THREE.CylinderGeometry(62, 62, 24, N(64)), M.black).rotation.x = Math.PI / 2;
  const groove = add(pulley, new THREE.TorusGeometry(62, 3, N(8, 4), N(64)), M.blackMatte);
  groove.position.z = 0;
  for (let k = 0; k < (plain ? 0 : 6); k++) {
    const b = add(pulley, new THREE.CylinderGeometry(5, 5, 5, 12), M.steel);
    const a = (k / 6) * Math.PI * 2;
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 38, Math.sin(a) * 38, 13);
  }
  const hub = add(pulley, gear(18, 20, 17, 36, 0, 6), M.steel);
  hub.position.z = 22;
  const flywheel = new THREE.Group();
  flywheel.position.z = -190;
  root.add(flywheel);
  add(flywheel, new THREE.CylinderGeometry(124, 124, 18, N(72)), M.black).rotation.x = Math.PI / 2;
  add(flywheel, gear(110, 138, 132, 16, 0, 116), M.black);
  // red arcs around the pulley, turning with the crank
  const arcs = new THREE.Group();
  arcs.position.z = front + 52;
  root.add(arcs);
  for (const a0 of [0, Math.PI]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(82, 4, 8, 48, Math.PI * 0.62), M.red);
    arc.rotation.z = a0;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(10, 24, 16), M.red);
    const ta = a0 + Math.PI * 0.62;
    tip.position.set(Math.cos(ta) * 82, Math.sin(ta) * 82, 0);
    tip.rotation.z = ta;
    arcs.add(arc, tip);
  }
  arcs.renderOrder = 5;

  const CHARGE_COL = [new THREE.Color('#3f8de0'), new THREE.Color('#5d6670'), new THREE.Color('#ff6a1f'), new THREE.Color('#8b8f95')];
  const tmp = new V3();
  // cutaway: 'glass' (clear liners), 'solid' (opaque liners), 'section' (everything on the far side of the plane cut
  // away: ahead of z by default, or past any plane given by its normal); refract: the glass catches the studio or goes
  // nearly clear
  const CLIP = new THREE.Plane(new V3(0, 0, -1), 0);
  const Z_CUT = new V3(0, 0, -1);

  // the isolate fade: a see-through twin of every material, worn by the parts solo puts away while they go
  const GHOST = new Map(
    Object.values(M).map((m) => {
      const g = m.clone();
      g.transparent = true;
      g.depthWrite = false;
      return [m, g];
    }),
  );
  root.traverse((m) => m.isMesh && (m.userData.mat0 = m.material));
  const ghosted = new Set();

  // section caps (opts.caps): every solid part gets two stencil twins that count its faces beyond the cut, and a
  // plane lying on the cut paints the cap colour wherever that count says the cut runs through metal
  let cap = null;
  const helpers = [];
  if (opts.caps) {
    const inc = THREE.IncrementWrapStencilOp;
    const dec = THREE.DecrementWrapStencilOp;
    const count = (side, op) =>
      new THREE.MeshBasicMaterial({side, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op, clippingPlanes: [CLIP]});
    helpers.push(count(THREE.BackSide, inc), count(THREE.FrontSide, dec));
    const solid = new Set([M.black, M.blackMatte, M.steel, M.alu, M.bronze, M.ceramic, M.runner]);
    const parts = [];
    root.traverse((m) => m.isMesh && solid.has(m.material) && parts.push(m));
    for (const m of parts) {
      for (const mat of helpers) {
        const h = new THREE.Mesh(m.geometry, mat);
        h.renderOrder = 1;
        m.add(h);
      }
    }
    const rep = THREE.ReplaceStencilOp;
    cap = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshStandardMaterial({color: opts.caps, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: rep, stencilZFail: rep, stencilZPass: rep}),
    );
    cap.renderOrder = 1.1;
    cap.onAfterRender = (r) => r.clearStencil();
    for (const mat of [...helpers, cap.material]) mat.visible = false;
  }
  // the cap lies on the cut, centred on the engine, facing the side that was cut away
  const C0 = new V3(0, 0.1, 0);
  const placeCap = () => {
    if (!cap) return;
    cap.position.copy(C0).addScaledVector(CLIP.normal, -CLIP.distanceToPoint(C0));
    cap.quaternion.setFromUnitVectors(new V3(0, 0, 1), tmp.copy(CLIP.normal).negate());
  };

  const clipMats = () => [...Object.values(M), ...GHOST.values(), ...cyl.map((c) => c.charge.material)];
  let cutNow = 'glass';
  const setCut = (mode, zWorld = 0, normal = Z_CUT) => {
    CLIP.normal.copy(normal);
    CLIP.constant = zWorld;
    placeCap();
    if (mode === cutNow) return;
    cutNow = mode;
    for (const m of clipMats()) {
      m.clippingPlanes = mode === 'section' ? [CLIP] : null;
      m.needsUpdate = true;
    }
    if (cap) for (const mat of [...helpers, cap.material]) mat.visible = mode === 'section';
    if (lo) {
      // the low build has no caps: cut parts show their insides, so both faces draw while the section is on
      for (const m of [...Object.values(M), ...GHOST.values()]) m.side = mode === 'section' ? THREE.DoubleSide : THREE.FrontSide;
      return;
    }
    const solid = mode === 'solid';
    M.glass.color.set(solid ? '#2b2d31' : '#ffffff');
    M.glass.opacity = solid ? 0.94 : glassOpacity;
    M.glass.depthWrite = solid;
  };
  let glassOpacity = 0.16;
  const setRefract = (on) => {
    glassOpacity = on ? 0.16 : 0.05;
    M.glass.envMapIntensity = on ? 1.6 : 0.3;
    if (cutNow !== 'solid') M.glass.opacity = glassOpacity;
  };
  /** ops: charge (0..1 visibility), arrows (0..1), solo (cylinder index or -1), glass (liner opacity), fire (0..1: with
   *  the charge off, the burn alone still lights the bore for the first 60° of every power stroke), fade (0..1, with
   *  solo: how far the rest has gone; 1, the default, hides it as before, below 1 it stays see-through), explode
   *  (0..1: the engine apart along its axes) */
  const update = (th, ops = {}) => {
    for (const m of ghosted) m.material = m.userData.mat0;
    ghosted.clear();
    const solo = ops.solo ?? -1;
    const all = solo < 0;
    const aRest = all ? 1 : 1 - Math.min(1, Math.max(0, ops.fade ?? 1));
    // explode: each layer leaves on its own stretch of the move, the outermost first, so nothing passes through
    // anything on the way out or back in: the rocker cage, the camshaft, the head with its valves, the pistons with
    // their rods out along each bank; the sump, then the crank with its gear, pulley and flywheel down. The engine
    // rises with the sump so the dropped parts stay clear of the floor.
    const ex = ops.explode ?? 0;
    const lay = (a) => smoother((ex - a) / 0.45);
    const eSump = lay(0);
    const eCrank = lay(0.12);
    const DG = 300 * lay(0.25);
    const DC = 230 * lay(0.33);
    const DH = 150 * lay(0.42);
    const DP = 85 * lay(0.55);
    const DK = 85 * eCrank;
    const DS = 140 * eSump;
    root.position.y = 0.13 * eSump;
    pan.position.y = -88 - DS;
    rail.position.y = -70 - DS;

    const cAng = -th * D2R; // the crank turns clockwise seen from the front
    crank.rotation.z = 0;
    crank.position.y = -DK;
    for (const {w, p} of webs) w.rotation.z = -(th + PIN_PHASE[p]) * D2R;
    E.pinZ.forEach((z, p) => {
      const [x, y] = pinXY(p, th);
      pins[p].position.set(x, y - DK, z);
    });
    const chargeOn = ops.charge ?? 1;
    const arrowsOn = ops.arrows ?? 1;
    const fireOn = ops.fire ?? 0;
    CYL.forEach((cy, i) => {
      const B = {b: [0, 1]};
      const {s, P, pin} = piston(i, th);
      const pp = pist[i];
      pp.g.position.y = s + DP;
      // the rod: crank pin to piston pin
      const a = new V3(P[0], P[1], cy.z);
      const b = new V3(pin[0], pin[1], cy.z);
      tmp.subVectors(b, a);
      const len = tmp.length();
      pp.rod.position.copy(a).add(b).multiplyScalar(0.5);
      pp.rod.position.x += DP * B.b[0];
      pp.rod.position.y += DP * B.b[1];
      pp.rod.rotation.set(0, 0, Math.atan2(tmp.y, tmp.x) - Math.PI / 2);
      pp.beam.scale.y = len - 30;
      pp.big.position.y = -len / 2;
      pp.small.position.y = len / 2;
      // the charge column and its colour by stroke
      const ps = psi(cy.c, th);
      const crown = s + E.comp;
      const col = cyl[i];
      col.head.position.y = DH;
      col.cage.position.y = DG;
      col.charge.position.y = (crown + DECK) / 2;
      col.charge.scale.y = Math.max(1, DECK - crown);
      const key = chargeOf(ps);
      col.charge.material.color.copy(CHARGE_COL[key]);
      const glow = key === 2 ? Math.min(1, pressure(ps) / 40) : 0;
      col.charge.material.opacity = chargeOn * (key === 2 ? 0.35 + 0.45 * glow : key === 0 ? 0.32 : 0.22);
      col.charge.visible = chargeOn > 0.01;
      if (fireOn > 0 && chargeOn <= 0.01 && key === 2) {
        col.charge.material.opacity = fireOn * (0.35 + 0.45 * glow);
        col.charge.visible = true;
      }
      if (!all && i !== solo) col.charge.material.opacity *= aRest;
      if (ex > 0) col.charge.visible = false;
      // valves open by their lift, springs squeeze with them
      for (const v of col.valves) {
        const L = (v.kind === 'in' ? liftIn(ps) : liftEx(ps)) * VALVE.lift;
        v.vg.position.y = -L;
        v.spring.scale.y = (40 - L) / 40;
      }
      // the arrow: along the bore, the way the piston is heading, strongest mid-stroke
      const {s: s2} = piston(i, th + 2);
      const vel = s2 - s;
      pp.arrow.position.y = DECK - 58;
      pp.arrow.rotation.z = vel > 0 ? 0 : Math.PI;
      pp.arrow.scale.setScalar(arrowsOn * Math.min(1, Math.abs(vel) / 1.2));
      pp.arrow.visible = arrowsOn * Math.abs(vel) > 0.05;
    });
    // cams at half speed, gears in ratio, pulley and flywheel with the crank
    for (const c of cams) {
      c.g.position.set(0, CAM_Y + DC, 0);
      c.g.rotation.z = cAng / 2;
    }
    crankGear.rotation.z = cAng;
    crankGear.position.y = -DK;
    camGears.forEach((g) => {
      g.rotation.z = cAng / 2;
      g.position.set(0, CAM_Y + DC, front + 70 * eCrank);
    });
    belt.position.set(0, 0, front + 70 * eCrank);
    belt.visible = ex < 0.02;
    pulley.rotation.z = cAng;
    pulley.position.set(0, -DK, front + 34 + 70 * eCrank);
    flywheel.rotation.z = cAng;
    flywheel.position.set(0, -DK, -190 - 70 * eCrank);
    arcs.rotation.z = cAng * 0.25;
    arcs.position.set(0, -DK, front + 52 + 70 * eCrank);

    // solo: one cylinder with its crank and cam, everything else away
    block.visible = all;
    for (const g of [crankGear, pulley, flywheel, arcs, camPulley, ...idlers.map((x) => x.gg)]) g.visible = all;
    cyl.forEach((c, i) => {
      const on = all || i === solo;
      c.g.visible = on;
      pist[i].rod.visible = on;
    });
    for (const c of cams) c.g.visible = all || CYL[solo].bank === c.bank;
    const soloPin = all ? -1 : CYL[solo].pin;
    for (const {w, p} of webs) w.visible = all || p === soloPin;
    pins.forEach((m, p) => (m.visible = all || p === soloPin));
    for (const j of journals) j.visible = all;
    arcs.visible = all && (ops.arrows ?? 1) > 0.01;
    // while solo fades the rest (fade below 1), it stays in place in the see-through twins
    if (!all && aRest > 0.001) {
      const rest = [block, crankGear, pulley, flywheel, camPulley, ...idlers.map((x) => x.gg), ...journals];
      cyl.forEach((c, i) => i !== solo && rest.push(c.g, pist[i].rod));
      for (const c of cams) if (CYL[solo].bank !== c.bank) rest.push(c.g);
      for (const {w, p} of webs) if (p !== soloPin) rest.push(w);
      pins.forEach((m, p) => p !== soloPin && rest.push(m));
      for (const [m, g] of GHOST) g.opacity = (m.transparent ? m.opacity : 1) * aRest;
      for (const o of rest) {
        o.visible = true;
        o.traverse((m) => {
          if (m.isMesh && GHOST.has(m.userData.mat0)) {
            m.material = GHOST.get(m.userData.mat0);
            ghosted.add(m);
          }
        });
      }
    }
  };
  // the engine is modelled in mm; one world unit is a metre (the cap lives in world units, outside the root)
  root.scale.setScalar(0.001);
  return {root, update, M, cyl, pist, cams, crank, pulley, flywheel, crankGear, camGears, setCut, setRefract, CLIP, cap};
}
