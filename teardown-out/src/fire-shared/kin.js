// Fiat 1.1 FIRE (1108 cm³) kinematics: an inline four with a flat 180° crank, firing order 1-3-4-2, the piston of
// every cylinder from the exact slider-crank, valve lift over the 720° cycle (SOHC, 2 valves per cylinder), and a
// chamber pressure model good enough to draw the indicator diagram. Engine space is millimetres: crank axis on z
// (front = +z, timing belt side), y up.
//
// Sources for each value (engine 176B2.000, 1108 cm³, SPI):
//   bore 70 × stroke 72 mm, compression 9.6:1, 5 main bearings, firing order 1-3-4-2, cylinder 1 at the belt end,
//   parallel valves with bucket tappets: Enginedesk 176B2.000 data, motor-car.net FIRE sheet, es.wikipedia Motor FIRE.
//   bore spacing 77 mm: NamuWiki "Fiat FIRE" (secondary source, not confirmed by a factory drawing).
//   valve heads 33.1-33.3 mm (intake) and 27.8-28.1 mm (exhaust): Fiat aftersales data for the 1.2/1.4 8V FIRE,
//   same head family; intake/exhaust assignment inferred from size.
// STILL ESTIMATED (no source found): rod length 129, piston compression height, deck height, valve timing angles,
// valve lift, timing belt tooth counts.
export const E = {bore: 70, r: 36, rod: 129, comp: 28, deck: 194, pinZ: [115.5, 38.5, -38.5, -115.5], rodOff: 0, cr: 9.6, camH: 104};
export const VALVE_D = {in: 33.2, ex: 27.95};
export const STROKE = 2 * E.r;
export const DISPLACEMENT = 4 * Math.PI * (E.bore / 2) ** 2 * STROKE / 1000; // cm³
// one bank, vertical: b along the cylinder axis, p across the engine (+x exhaust side)
export const BANK = {
  C: {b: [0, 1], p: [1, 0], sign: 1},
};
// cylinders 1..4 in a row, 1 at the front (timing belt side)
export const CYL = [1, 2, 3, 4].map((c) => ({c, bank: 'C', pin: c - 1, z: E.pinZ[c - 1]}));
export const FIRE = {1: 0, 3: 180, 4: 360, 2: 540};
export const ORDER = [1, 3, 4, 2];
// flat-plane crank: throws 1 and 4 up together, 2 and 3 opposite
export const PIN_PHASE = [0, 180, 180, 0];
const mod = (a, m) => ((a % m) + m) % m;

export const bankXY = (bank, w, d) => {
  const B = BANK[bank];
  return [d * B.b[0] + w * B.p[0], d * B.b[1] + w * B.p[1]];
};
export const pinXY = (p, th) => {
  const a = ((th + PIN_PHASE[p]) * Math.PI) / 180;
  return [E.r * Math.sin(a), E.r * Math.cos(a)];
};
/** cylinder index i (0-based): the piston pin's distance along the bank axis, the crank pin, the pin point */
export const piston = (i, th) => {
  const cy = CYL[i];
  const B = BANK[cy.bank];
  const P = pinXY(cy.pin, th);
  const pb = P[0] * B.b[0] + P[1] * B.b[1];
  const pp = P[0] * B.p[0] + P[1] * B.p[1];
  const s = pb + Math.sqrt(E.rod * E.rod - pp * pp);
  return {s, P, pin: [s * B.b[0], s * B.b[1]]};
};
// the pin distance at TDC and BDC (the same for every cylinder)
export const S_TDC = E.r + E.rod;
export const S_BDC = E.rod - E.r;
/** four-stroke phase of cylinder c in degrees after its firing TDC: 0-180 power, 180-360 exhaust, 360-540 intake, 540-720 compression */
export const psi = (c, th) => mod(th - FIRE[c], 720);
export const STROKES = ['POWER', 'EXHAUST', 'INTAKE', 'COMPRESSION'];
export const strokeOf = (ps) => STROKES[Math.floor(mod(ps, 720) / 180)];

// valves: lift 0..1 as a smooth bump between opening and closing (degrees after firing TDC)
export const VALVE = {ex: [136, 376], in: [344, 584], lift: 8.5};
const bump = (ps, [a, b]) => {
  const x = (mod(ps - a, 720)) / (b - a);
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) ** 2 : 0;
};
export const liftEx = (ps) => bump(ps, VALVE.ex);
export const liftIn = (ps) => bump(ps, VALVE.in);
/** piston position as a fraction of the stroke from TDC (0 at TDC, 1 at BDC), at phase ps */
export const pistonFrac = (ps) => {
  const a = (ps * Math.PI) / 180;
  const sp = E.r * Math.cos(a) + Math.sqrt(E.rod * E.rod - (E.r * Math.sin(a)) ** 2);
  return (S_TDC - sp) / STROKE;
};
/** cylinder volume in units of the clearance volume (1 at TDC, cr at BDC) */
export const volume = (ps) => 1 + (E.cr - 1) * pistonFrac(ps);
/** chamber pressure in bar: a polytropic compression, a fast burn just after TDC, a polytropic expansion */
export const pressure = (ps) => {
  ps = mod(ps, 720);
  const V = volume(ps);
  if (ps >= 360 && ps < 540) return 0.9;
  if (ps >= 180 && ps < 360) return 1.1 + 0.4 * Math.max(0, 1 - (ps - 180) / 40);
  if (ps >= 540) return Math.max(0.9, 0.95 * Math.pow(E.cr / V, 1.32));
  // power: the burn rises over the first 10 degrees, then the gas expands
  const comp = 0.95 * Math.pow(E.cr / V, 1.32);
  const burn = 50 * Math.pow(1 / V, 1.28);
  const k = Math.min(1, ps / 10);
  return Math.max(1.1, comp + (burn - comp) * (k * k * (3 - 2 * k)));
};
/** the charge colour key: 0 air & fuel, 1 compressed, 2 combustion, 3 exhaust */
export const chargeOf = (ps) => {
  ps = mod(ps, 720);
  if (ps < 60) return 2;
  if (ps < 360) return 3;
  if (ps < 540) return 0;
  return 1;
};
