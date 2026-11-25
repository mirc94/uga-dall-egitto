import * as THREE from 'three';
import { addWind, rng, shared, texLoader, makeSky, makeGround, makeNile, makeSea, makeMountains, makePalms, makePapyrus, makeTufts, makeStones, heightAt, NILE, SEA_X } from './env.js';
import { makePerson, fabricTexture, lathe, animatePeople } from './people.js';
import { loadAnimals, placeAnimals } from './animals.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/* =====================================================================
   UTILITÀ
   ===================================================================== */
const $ = id => document.getElementById(id);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const digits = s => String(s).replace(/\D/g, '');
const shuffle = (arr, seed) => { const r = rng(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const toastEl = $('toast'); let toastT = 0;
function toast(msg, ms = 3200) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms); }

/* ---------- componenti degli enigmi ---------- */
function codeInputs(n, label, numeric) {
  const ins = [];
  const wrap = h('div', { class: 'code', style: `grid-template-columns:repeat(${n},minmax(0,1fr))` });
  for (let i = 0; i < n; i++) {
    const inp = h('input', { type: 'text', maxlength: '2', autocomplete: 'off', 'aria-label': `${label}, casella ${i + 1}`, inputmode: numeric ? 'numeric' : 'text' });
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().slice(-1); if (inp.value && ins[i + 1]) ins[i + 1].focus(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); });
    ins.push(inp); wrap.append(inp);
  }
  return { el: h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, h('span', { class: 'lab' }, label), wrap), val: () => ins.map(x => x.value).join('') };
}
function numFields(fields, maxlen = 4) {
  const ins = {};
  const el = h('div', { class: 'num' }, fields.map(([key, lab]) => {
    const id = 'n_' + key + Math.random().toString(36).slice(2, 6);
    ins[key] = h('input', { id, type: 'text', inputmode: 'numeric', maxlength: String(maxlen), autocomplete: 'off' });
    return h('div', {}, h('label', { class: 'lab', for: id }, lab), ins[key]);
  }));
  return { el, val: k => digits(ins[k].value) };
}
function tapOrder(items, label, seed) {
  const seq = [];
  const list = h('ol', { class: 'seq', 'aria-label': label });
  const pool = h('div', { class: 'tiles' });
  const btns = shuffle(items, seed).map(t => {
    const b = h('button', { class: 'tile', type: 'button', onclick: () => { seq.push(t); b.disabled = true; list.append(h('li', {}, `${seq.length}. ${t}`)); } }, t);
    return b;
  });
  pool.append(...btns);
  const reset = h('button', { class: 'link', type: 'button', style: 'color:#7A5A22;align-self:flex-start', onclick: () => { seq.length = 0; list.innerHTML = ''; btns.forEach(b => b.disabled = false); } }, 'Ricomincia l’ordine');
  return { el: h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('span', { class: 'lab' }, label), list, pool, reset), val: () => seq.slice() };
}
function toggles(items, label, one) {
  const sel = new Set();
  const btns = [];
  const el = h('div', { class: 'tiles' + (one ? ' one' : ''), role: 'group', 'aria-label': label }, items.map(m => {
    const b = h('button', { class: 'tile', type: 'button', 'aria-pressed': 'false', onclick: () => {
      if (one) { sel.clear(); sel.add(m); btns.forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
      else { sel.has(m) ? sel.delete(m) : sel.add(m); b.setAttribute('aria-pressed', String(sel.has(m))); }
    } }, m);
    btns.push(b); return b;
  }));
  return { el: h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, label ? h('span', { class: 'lab' }, label) : null, el), sel };
}
function segRow(label, opts) {
  let v = null;
  const btns = opts.map(([k, lab]) => h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { v = k; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === k))); } }, lab));
  const el = h('div', { class: 'trow' }, h('strong', {}, label), h('div', { class: 'seg3', role: 'group', 'aria-label': label, style: `grid-template-columns:repeat(${opts.length},minmax(0,1fr))` }, btns));
  return { el, val: () => v };
}
function words(qs) {
  const ins = [];
  const el = h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, qs.map(([q], k) => {
    const id = 'w' + k + Math.random().toString(36).slice(2, 5);
    const inp = h('input', { id, class: 'wordin', type: 'text', autocomplete: 'off' }); ins.push(inp);
    return h('div', { class: 'wordrow' }, h('label', { class: 'lab', for: id }, q), inp);
  }));
  return { el, ok: () => qs.every(([, a], k) => norm(ins[k].value) === a) };
}

/* =====================================================================
   I 12 ENIGMI
   ===================================================================== */
const PLAGUES = ['L’acqua diventa sangue', 'Rane', 'Zanzare', 'Tafani', 'Morte del bestiame', 'Foruncoli', 'Grandine', 'Locuste', 'Tenebre', 'Morte dei primogeniti'];
const PUZZLES = [
  { n: 1, zone: 1, title: 'Le città-deposito', place: 'Cantiere di Ràmses · la stele dei lavori', ref: 'Esodo 1:11-14',
    at: { x: -96, z: 6 },
    story: 'Un soprintendente ai lavori forzati ha lasciato sulla stele l’elenco dei cantieri del faraone. I nomi delle due città sono stati cancellati.',
    prompt: 'Leggi Esodo 1:11. Scrivi i nomi delle due città-deposito che gli israeliti furono costretti a costruire per il faraone.',
    hints: ['La risposta è in Esodo 1:11.', 'Le città sono Pitòm e Ràmses (gli accenti non contano).'],
    letter: 'E', item: 'Tavoletta dei cantieri',
    reflect: 'Più gli israeliti venivano oppressi, più si moltiplicavano. Geova vedeva la sofferenza del suo popolo e conosceva il suo dolore: vede anche quello che stai passando tu.', reflectRef: 'Esodo 1:12; 3:7',
    build(body) {
      const w = words([['Prima città (5 lettere)', 'PITOM'], ['Seconda città (6 lettere)', 'RAMSES']]); body.append(w.el);
      return () => w.ok();
    } },
  { n: 2, zone: 1, title: 'Mattoni senza paglia', place: 'Cantiere di Ràmses · i mattoni ad asciugare', ref: 'Esodo 5:6-19',
    at: { x: -81, z: 9 },
    story: 'File di mattoni di fango asciugano al sole. Da quando Mosè ha parlato al faraone, gli ordini sono cambiati.',
    prompt: 'Per ogni frase indica se è vera o falsa secondo Esodo 5.',
    hints: ['Leggi Esodo 5:7, 8 e poi 5:12-14.', 'Vere: la paglia da procurarsi da soli, il popolo sparso a cercarla, i sorveglianti picchiati. Falsa: la quantità di mattoni non fu ridotta.'],
    letter: 'R', item: 'Stampo per mattoni',
    reflect: 'Dopo la prima richiesta al faraone, la situazione sembrò peggiorare. Ma Geova non aveva dimenticato la sua promessa di liberare il suo popolo. Quando una prova si fa più dura, possiamo affidargli ogni ansia.', reflectRef: 'Esodo 6:6; 1 Pietro 5:7',
    build(body) {
      const rows = [['Gli israeliti dovevano procurarsi da soli la paglia', 'V'], ['La quantità di mattoni richiesta fu ridotta', 'F'], ['Il popolo si sparse per l’Egitto a cercare qualcosa da usare come paglia', 'V'], ['I sorveglianti israeliti furono picchiati', 'V']];
      const segs = rows.map(([t]) => segRow(t, [['V', 'Vero'], ['F', 'Falso']]));
      body.append(h('div', {}, segs.map(s => s.el)));
      return () => rows.every(([, k], i) => segs[i].val() === k);
    } },
  { n: 3, zone: 1, title: 'Davanti al faraone', place: 'Cantiere di Ràmses · il portico del palazzo', ref: 'Esodo 7:1-7',
    at: { x: -60, z: -12 },
    story: 'Sotto il portico del palazzo uno scriba annota le udienze del giorno. Due fratelli anziani hanno appena parlato al faraone.',
    prompt: 'Quanti anni avevano Mosè e Aronne quando parlarono al faraone? Scrivi le due età e la loro somma.',
    hints: ['Le età sono in Esodo 7:7.', 'Mosè aveva 80 anni e Aronne 83: la somma è 163.'],
    letter: 'L', item: 'Bastone di Aronne',
    reflect: 'Mosè si sentiva inadeguato a parlare, ma Geova promise di aiutarlo e gli diede Aronne come compagno. Non siamo mai troppo giovani né troppo anziani per servire Geova: è lui a darci la forza.', reflectRef: 'Esodo 4:10-12; Filippesi 4:13',
    build(body) {
      const f = numFields([['m', 'Età di Mosè'], ['a', 'Età di Aronne'], ['s', 'Somma']]); body.append(f.el);
      return () => f.val('m') === '80' && f.val('a') === '83' && f.val('s') === '163';
    } },
  { n: 4, zone: 1, title: 'Le dieci piaghe', place: 'Cantiere di Ràmses · la riva del Nilo', ref: 'Esodo 7:14–12:30',
    at: { x: -44, z: -21 },
    story: 'Sulla riva del Nilo, dove tutto è cominciato, dieci tavolette ricordano i colpi che Geova inflisse all’Egitto. Si sono mescolate.',
    prompt: 'Tocca le dieci piaghe nell’ordine in cui Geova le mandò sull’Egitto.',
    hints: ['Le prime tre: l’acqua diventa sangue (7:20), le rane (8:6), le zanzare (8:17).', 'Poi: tafani, morte del bestiame, foruncoli, grandine, locuste, tenebre e morte dei primogeniti.'],
    letter: 'I', item: 'Brocca d’acqua del Nilo',
    reflect: 'Il faraone aveva chiesto con disprezzo: «Chi è Geova?». Con le piaghe Geova dimostrò che nessun dio d’Egitto poteva stargli alla pari. Possiamo fidarci completamente della sua potenza.', reflectRef: 'Esodo 5:2; 12:12',
    build(body) {
      const t = tapOrder(PLAGUES, 'Il tuo ordine', 4); body.append(t.el);
      return () => t.val().join('|') === PLAGUES.join('|');
    } },
  { n: 5, zone: 2, title: 'Il paese di Gosen', place: 'Gosen · il pozzo del villaggio', ref: 'Esodo 8:22, 23; 9:4, 26; 10:23',
    at: { x: -12, z: 6 },
    story: 'Nel paese di Gosen le famiglie raccontano attorno al pozzo che cosa è successo durante le piaghe.',
    prompt: 'Per quali di queste piaghe la Bibbia dice chiaramente che Gosen o gli israeliti furono risparmiati? Selezionale tutte.',
    hints: ['Leggi Esodo 8:22, 9:4, 9:26 e 10:23.', 'Sono quattro: tafani, morte del bestiame, grandine e tenebre.'],
    letter: 'Z', item: 'Secchio del pozzo',
    reflect: 'Geova fece distinzione tra il suo popolo e chi lo sfidava. Non ci promette di evitarci ogni difficoltà, ma vede la differenza tra chi lo serve e chi no, e si prende cura di chi lo ama.', reflectRef: 'Esodo 8:22, 23; Malachia 3:18',
    build(body) {
      const ok = ['Tafani', 'Morte del bestiame', 'Grandine', 'Tenebre'];
      const t = toggles(['Rane', 'Tafani', 'Zanzare', 'Morte del bestiame', 'Grandine', 'Tenebre'], 'Piaghe'); body.append(t.el);
      return () => t.sel.size === ok.length && ok.every(x => t.sel.has(x));
    } },
  { n: 6, zone: 2, title: 'Il primo dei mesi', place: 'Gosen · il recinto delle pecore', ref: 'Esodo 12:2-6',
    at: { x: 2, z: -4 },
    story: 'Nel recinto ogni famiglia sceglie l’animale per la Pasqua. Il capofamiglia vuole essere sicuro di seguire le istruzioni alla lettera.',
    prompt: 'In che giorno del mese si sceglieva l’animale e in che giorno si scannava? Poi seleziona le caratteristiche che doveva avere.',
    hints: ['I giorni sono in Esodo 12:3 e 12:6; le caratteristiche in 12:5.', 'Il 10° e il 14° giorno. Doveva essere un maschio, di un anno, sano: un agnello o un capretto.'],
    letter: 'B', item: 'Corda del recinto',
    reflect: 'L’agnello della Pasqua prefigurava Gesù, «l’Agnello di Dio». Come nessun osso dell’agnello doveva essere spezzato, così avvenne per Gesù. Il suo sacrificio ci apre la via verso la vera libertà.', reflectRef: 'Esodo 12:46; Giovanni 1:29; 19:36; 1 Corinti 5:7',
    build(body) {
      const f = numFields([['a', 'Giorno della scelta'], ['b', 'Giorno in cui si scannava']], 2); body.append(f.el);
      const ok = ['Maschio', 'Di un anno', 'Sano', 'Agnello o capretto'];
      const t = toggles(['Maschio', 'Femmina', 'Di un anno', 'Di tre anni', 'Sano', 'Agnello o capretto'], 'Caratteristiche'); body.append(t.el);
      return () => f.val('a') === '10' && f.val('b') === '14' && t.sel.size === ok.length && ok.every(x => t.sel.has(x));
    } },
  { n: 7, zone: 2, title: 'Il sangue sulla porta', place: 'Gosen · la porta di casa', ref: 'Esodo 12:7, 22, 23',
    at: { x: 18, z: 5.2 },
    story: 'È il crepuscolo del 14° giorno. La famiglia ha appena scannato l’agnello: il catino con il sangue è pronto accanto alla porta.',
    prompt: 'Tocca le parti della porta che dovevano essere segnate con il sangue, poi scegli che cosa si usava per farlo.',
    hints: ['Leggi Esodo 12:7 e 12:22.', 'L’architrave e i due stipiti, con un mazzo d’issopo. Né la soglia né il battente.'],
    letter: 'O', item: 'Mazzo d’issopo',
    reflect: 'Le famiglie che ubbidirono furono protette. Ubbidire a Geova anche nei dettagli dimostra fiducia, e lui non dimentica chi lo ascolta.', reflectRef: 'Esodo 12:28; Ebrei 11:28',
    build(body) {
      const parts = { arch: 'Architrave', sx: 'Stipite sinistro', dx: 'Stipite destro', door: 'Battente', sog: 'Soglia' };
      const sel = new Set();
      const d = h('div', { class: 'door', style: 'display:flex;justify-content:center' });
      d.innerHTML = `<svg width="220" height="190" viewBox="0 0 220 190" role="group" aria-label="La porta di casa">
        <rect x="10" y="10" width="200" height="175" fill="#C9A77A" stroke="#4A3520" stroke-width="2"/>
        <rect data-part="arch" tabindex="0" role="button" aria-label="Architrave" x="52" y="24" width="116" height="20" fill="#8B6A43" stroke="#4A3520" stroke-width="2"/>
        <rect data-part="sx" tabindex="0" role="button" aria-label="Stipite sinistro" x="52" y="44" width="18" height="124" fill="#8B6A43" stroke="#4A3520" stroke-width="2"/>
        <rect data-part="dx" tabindex="0" role="button" aria-label="Stipite destro" x="150" y="44" width="18" height="124" fill="#8B6A43" stroke="#4A3520" stroke-width="2"/>
        <rect data-part="door" tabindex="0" role="button" aria-label="Battente" x="72" y="46" width="76" height="120" fill="#6E4F2E" stroke="#4A3520" stroke-width="2"/>
        <rect data-part="sog" tabindex="0" role="button" aria-label="Soglia" x="46" y="168" width="128" height="12" fill="#A88B62" stroke="#4A3520" stroke-width="2"/>
      </svg>`;
      d.querySelectorAll('[data-part]').forEach(el => {
        const base = el.getAttribute('fill');
        const tog = () => { const k = el.dataset.part; sel.has(k) ? sel.delete(k) : sel.add(k); el.setAttribute('fill', sel.has(k) ? '#9E2A1F' : base); el.setAttribute('aria-pressed', String(sel.has(k))); lab.textContent = sel.size ? 'Segnate: ' + [...sel].map(k => parts[k]).join(', ') : 'Nessuna parte segnata'; };
        el.addEventListener('click', tog); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
      });
      const lab = h('span', { class: 'lab', style: 'text-align:center' }, 'Nessuna parte segnata');
      body.append(d, lab);
      const t = toggles(['Issopo', 'Ramo di palma', 'Foglia di papiro', 'Pennello di lino'], 'Che cosa si intingeva nel sangue?'); body.append(t.el);
      return () => sel.size === 3 && sel.has('arch') && sel.has('sx') && sel.has('dx') && t.sel.size === 1 && t.sel.has('Issopo');
    } },
  { n: 8, zone: 2, title: 'Pronti a partire', place: 'Gosen · dentro la casa', ref: 'Esodo 12:8-11',
    at: { x: 18, z: -0.1 },
    story: 'La famiglia è riunita attorno alla tavola. Nessuno deve uscire fino al mattino. Fuori è notte.',
    prompt: 'Seleziona tutto ciò che Esodo 12:8-11 menziona per la cena di Pasqua: cosa si mangiava e come si doveva essere vestiti.',
    hints: ['Il cibo è in 12:8, 9; l’abbigliamento in 12:11.', 'Carne arrostita, pane senza lievito, erbe amare; fianchi cinti, sandali ai piedi, bastone in mano. La carne non doveva essere bollita.'],
    letter: 'N', item: 'Pane senza lievito',
    reflect: 'Chi mangiava in fretta, pronto per il viaggio, dimostrava di credere che Geova avrebbe mantenuto la sua parola. Anche noi restiamo vigilanti e pronti, fiduciosi nelle sue promesse.', reflectRef: 'Esodo 12:11; Matteo 24:42',
    build(body) {
      const ok = ['Carne arrostita', 'Pane senza lievito', 'Erbe amare', 'Fianchi cinti', 'Sandali ai piedi', 'Bastone in mano'];
      const t = toggles(['Carne arrostita', 'Carne bollita', 'Pane senza lievito', 'Pane lievitato', 'Erbe amare', 'Fianchi cinti', 'Sandali ai piedi', 'Bastone in mano'], 'Seleziona'); body.append(t.el);
      return () => t.sel.size === ok.length && ok.every(x => t.sel.has(x));
    } },
  { n: 9, zone: 3, title: 'Da Ràmses a Succòt', place: 'Succòt · il primo accampamento', ref: 'Esodo 12:37-41',
    at: { x: 56, z: 0 },
    story: 'Al primo accampamento si contano le famiglie. Insieme agli israeliti c’è una grande folla mista, con greggi e mandrie.',
    prompt: 'Circa quanti uomini partirono, senza contare i bambini? E per quanti anni gli israeliti erano vissuti da forestieri?',
    hints: ['Il numero degli uomini è in Esodo 12:37; gli anni in 12:40.', 'Circa 600.000 uomini (scrivi 600000) e 430 anni. Quei 430 anni comprendono anche la permanenza in Canaan: partono dal patto con Abraamo (Galati 3:17).'],
    letter: 'E', item: 'Telo della tenda',
    reflect: 'Proprio alla fine dei 430 anni, nello stesso giorno, Geova fece uscire il suo popolo. Geova non arriva mai in ritardo: le sue promesse si avverano al momento giusto.', reflectRef: 'Esodo 12:41; Abacuc 2:3',
    build(body) {
      const f = numFields([['u', 'Uomini (circa)'], ['a', 'Anni']], 7); body.append(f.el);
      return () => f.val('u') === '600000' && f.val('a') === '430';
    } },
  { n: 10, zone: 3, title: 'La colonna davanti a loro', place: 'Ètham · ai margini del deserto', ref: 'Esodo 13:19-22; 14:2',
    at: { x: 84, z: -3 },
    story: 'Mosè porta con sé le ossa di Giuseppe, come lui aveva chiesto. Davanti al popolo si alza una colonna che non si allontana mai.',
    prompt: 'Ricomponi le tappe del viaggio, poi indica come Geova guidava il popolo di giorno e di notte.',
    hints: ['Leggi Esodo 12:37, 13:20 e 14:2 per le tappe; 13:21 per la colonna.', 'Ràmses → Succòt → Ètham → Piairòt. Di giorno una colonna di nuvola, di notte una colonna di fuoco.'],
    letter: 'A', item: 'Lanterna da viaggio',
    reflect: 'La colonna non lasciò mai il popolo, né di giorno né di notte. Geova guida anche noi con la sua Parola, un passo alla volta.', reflectRef: 'Esodo 13:22; Salmo 32:8',
    build(body) {
      const st = ['Ràmses', 'Succòt', 'Ètham', 'Piairòt'];
      const t = tapOrder(st, 'Le tappe', 10); body.append(t.el);
      const g = segRow('Di giorno', [['N', 'Nuvola'], ['F', 'Fuoco']]), n = segRow('Di notte', [['N', 'Nuvola'], ['F', 'Fuoco']]);
      body.append(h('div', {}, g.el, n.el));
      return () => t.val().join('|') === st.join('|') && g.val() === 'N' && n.val() === 'F';
    } },
  { n: 11, zone: 3, title: 'Tra Mìgdol e il mare', place: 'Piairòt · l’accampamento presso il mare', ref: 'Esodo 14:2-14',
    at: { x: 108, z: 3 },
    story: 'Il mare davanti, le montagne a sud, il deserto intorno. All’orizzonte si alza la polvere dei carri del faraone e il popolo ha paura.',
    prompt: 'Quanti carri scelti prese il faraone? Poi scegli le parole con cui Mosè incoraggiò il popolo.',
    hints: ['Il numero è in Esodo 14:7; le parole di Mosè in 14:13, 14.', '600 carri scelti. Mosè disse: «Non abbiate paura. Restate saldi e vedete la salvezza che oggi Geova opererà per voi».'],
    letter: 'I', item: 'Bastone di Mosè',
    reflect: 'Umanamente sembrava una trappola, ma Geova stesso combatté per il suo popolo. Quando ci sentiamo senza via d’uscita possiamo restare calmi e confidare in lui.', reflectRef: 'Esodo 14:13, 14; Isaia 41:10',
    build(body) {
      const f = numFields([['c', 'Carri scelti']]); body.append(f.el);
      const good = 'Non abbiate paura. Restate saldi e vedete la salvezza che oggi Geova opererà per voi';
      const t = toggles(['Torniamo a servire gli egiziani', good, 'Scappiamo verso le montagne', 'Prepariamoci a combattere da soli'], 'Le parole di Mosè', true); body.append(t.el);
      return () => f.val('c') === '600' && t.sel.has(good);
    } },
  { n: 12, zone: 3, title: 'Il mare si apre', place: 'La riva del Mar Rosso', ref: 'Esodo 14:15-22',
    at: { x: 127, z: 0 },
    story: 'È notte. La colonna si è spostata dietro il popolo. Mosè è sulla riva con il bastone in mano.',
    prompt: 'Ricomponi le 11 lettere raccolte nella parola finale. Poi indica quale vento soffiò e per quanto tempo (Esodo 14:21).',
    hints: ['La parola descrive ciò che Geova compì per il suo popolo quel giorno. Inizia con L.', 'La parola è LIBERAZIONE. Geova mandò «un forte vento orientale» per tutta la notte.'],
    letter: '', item: '',
    reflect: '', reflectRef: '',
    build(body) {
      const letters = PUZZLES.slice(0, 11).map(p => p.letter);
      const t = tapOrder(letters, 'La parola finale', 12); body.append(t.el);
      const w = segRow('Quale vento?', [['N', 'Settentrionale'], ['S', 'Meridionale'], ['E', 'Orientale'], ['O', 'Occidentale']]);
      const d = segRow('Per quanto tempo?', [['H', 'Un’ora'], ['T', 'Tutta la notte'], ['G', 'Tre giorni']]);
      body.append(h('div', {}, w.el, d.el));
      return () => t.val().join('') === 'LIBERAZIONE' && w.val() === 'E' && d.val() === 'T';
    } },
];

/* =====================================================================
   SCENA
   ===================================================================== */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#d8d3c4', 160, 900);
const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 6000);

const manager = new THREE.LoadingManager();
manager.onProgress = (u, a, b) => { const lb = $('loadbar'); if (lb) lb.style.width = Math.round(a / b * 100) + '%'; };
const T = texLoader(manager, renderer);
// modelli 3D realistici dei personaggi (models/people)
// i modelli 3D si caricano in background: la schermata iniziale attende solo le texture dell'ambiente
const bgManager = new THREE.LoadingManager();
const gltfL = new GLTFLoader(bgManager); gltfL.setMeshoptDecoder(MeshoptDecoder);
const modelCache = {};
const loadModel = name => (modelCache[name] ??= gltfL.loadAsync(`models/people/${name}.glb`).catch(e => { console.error(e); return null; }));

/* ---------- cielo e luci ---------- */
const SKY = makeSky(renderer, scene);
// cielo notturno fotografico (Via Lattea); la luna piena resta davanti (Esodo 12:6)
const NIGHT = (() => {
  const t = new THREE.TextureLoader(bgManager).load('tex/night_sky.jpg'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false, color: '#8a93a8' }));
  m.renderOrder = -1; scene.add(m); return m;
})();
const hemi = new THREE.HemisphereLight('#cfe0ee', '#8a7354', .4); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 3);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 500 });
sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

/* fasi della luce: sole (elev/azim), luce principale, nebbia, esposizione.
   Di notte la luce viene dalla luna piena: la Pasqua era il 14° giorno del mese lunare (Esodo 12:6). */
const PH = {
  day: { turb: 3.2, ray: 1.4, mie: .004, mieG: .8, elev: 50, azim: 200, lEl: 50, lAz: 200, sun: '#fff2df', sunI: 3.2, hemiI: .45, hs: '#cfe0ee', hg: '#8a7354', fog: '#d9cdb4', near: 180, far: 1000, stars: 0, moon: 0, exp: .52, env: .8 },
  dusk: { turb: 7, ray: 2.6, mie: .009, mieG: .86, elev: 3, azim: 268, lEl: 6, lAz: 268, sun: '#ffaa6a', sunI: 1.9, hemiI: .28, hs: '#9fb0d0', hg: '#6a4a34', fog: '#c4977a', near: 110, far: 700, stars: .15, moon: .5, exp: .62, env: .6 },
  night: { turb: 1.5, ray: .4, mie: .002, mieG: .8, elev: -14, azim: 268, lEl: 32, lAz: 100, sun: '#a9bde6', sunI: .55, hemiI: .14, hs: '#3a4d78', hg: '#1a1c22', fog: '#0f1624', near: 70, far: 480, stars: 1, moon: 1, exp: 1.0, env: .15 },
  dawn: { turb: 6, ray: 2.2, mie: .007, mieG: .85, elev: 4, azim: 95, lEl: 7, lAz: 95, sun: '#ffc896', sunI: 1.7, hemiI: .3, hs: '#a9bcd8', hg: '#7a5a42', fog: '#d4b49a', near: 120, far: 760, stars: .05, moon: .2, exp: .62, env: .7 },
};
const L = { sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), fog: new THREE.Color(), dir: new THREE.Vector3(0, 1, 0) };
for (const k of ['turb', 'ray', 'mie', 'mieG', 'elev', 'azim', 'lEl', 'lAz', 'sunI', 'hemiI', 'near', 'far', 'stars', 'moon', 'exp', 'env']) L[k] = PH.day[k];
renderer.toneMappingExposure = PH.day.exp;
let bakedAt = null;
function applyPhase(name, k) {
  const p = PH[name], tc = new THREE.Color();
  for (const key of ['sun', 'hs', 'hg', 'fog']) L[key].lerp(tc.set(p[key]), k);
  for (const key of ['turb', 'ray', 'mie', 'mieG', 'elev', 'azim', 'lEl', 'lAz', 'sunI', 'hemiI', 'near', 'far', 'stars', 'moon', 'exp', 'env']) L[key] += (p[key] - L[key]) * k;
  SKY.set(L);
  L.dir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.lEl), THREE.MathUtils.degToRad(L.lAz));
  sun.color.copy(L.sun); hemi.color.copy(L.hs); hemi.groundColor.copy(L.hg);
  scene.fog.color.copy(L.fog); scene.fog.near = L.near; scene.fog.far = L.far;
  SKY.stars.material.opacity = L.stars * .35; NIGHT.material.opacity = L.stars; NIGHT.visible = L.stars > .01; SKY.moon.material.opacity = L.moon;
  renderer.toneMappingExposure = L.exp; scene.environmentIntensity = L.env;
  if (!bakedAt || Math.abs(bakedAt.elev - L.elev) > 2.5 || Math.abs(bakedAt.azim - L.azim) > 8) { SKY.bake(); bakedAt = { elev: L.elev, azim: L.azim }; }
}
applyPhase('day', 1);

/* ---------- materiali ---------- */
function texMat(name, opts = {}) {
  const { ns, normal, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ map: T(`tex/${name}_albedo.jpg`, { srgb: true }), roughness: .92, ...rest });
  if (normal !== false) { m.normalMap = T(`tex/${name}_normal.jpg`); m.normalScale = new THREE.Vector2(ns || 1, ns || 1); }
  return m;
}
const MAT = {
  brick: texMat('mudbrick', { ns: 1.2 }),
  brickRaw: texMat('mudbrick', { ns: 1.0, color: '#b9a48a' }),
  plaster: texMat('plaster', { ns: .8, color: '#f0e4cc' }),
  stone: texMat('limestone', { ns: .9, roughness: .85, color: '#efe2c8' }),
  wood: texMat('beam', { ns: 1, roughness: .8 }),
  straw: texMat('straw', { ns: 1.2, roughness: 1 }),
  mud: new THREE.MeshStandardMaterial({ map: T('tex/mud_albedo.jpg', { srgb: true }), normalMap: T('tex/mud_normal.jpg'), color: '#c8b8a0', roughness: .35 }),
  floor: new THREE.MeshStandardMaterial({ map: T('tex/dirt_albedo.jpg', { srgb: true }), normalMap: T('tex/dirt_normal.jpg'), roughness: .95 }),
  dark: new THREE.MeshStandardMaterial({ color: '#1c140d', roughness: 1 }),
  clay: new THREE.MeshStandardMaterial({ map: T('tex/plaster_albedo.jpg', { srgb: true }), color: '#c27a4e', roughness: .85 }),
  blood: new THREE.MeshStandardMaterial({ color: '#5a0f0b', roughness: .35 }),
  bread: new THREE.MeshStandardMaterial({ map: T('tex/sand_albedo.jpg', { srgb: true }), color: '#e2b874', roughness: .9 }),
  roast: new THREE.MeshStandardMaterial({ map: T('tex/dirt_albedo.jpg', { srgb: true }), color: '#8a4a26', roughness: .55 }),
  herbs: new THREE.MeshStandardMaterial({ color: '#4f6b2c', roughness: .9 }),
  tent: new THREE.MeshStandardMaterial({ map: T('tex/tent_albedo.jpg', { srgb: true }), color: '#7a6450', roughness: 1, side: THREE.DoubleSide }),
  rope: new THREE.MeshStandardMaterial({ color: '#8c7350', roughness: 1 }),
};
const UVS = { brick: 1 / 1.6, plaster: 1 / 3, stone: 1 / 2.5, wood: 1 / 1.2, straw: 1 / 1.5 };
function bx(w, hh, d, mat, x, y, z, { uv, parent = scene, cast = true, ry = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, hh, d);
  const k = uv ?? (mat === MAT.brick || mat === MAT.brickRaw ? UVS.brick : mat === MAT.plaster ? UVS.plaster : mat === MAT.stone ? UVS.stone : mat === MAT.wood ? UVS.wood : mat === MAT.straw ? UVS.straw : 0);
  if (k) { const a = g.attributes.uv; const dims = [[d, hh], [d, hh], [w, d], [w, d], [w, hh], [w, hh]]; for (let f = 0; f < 6; f++) for (let j = 0; j < 4; j++) { const i = f * 4 + j; a.setXY(i, a.getX(i) * dims[f][0] * k, a.getY(i) * dims[f][1] * k); } }
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function cyl(rt, rb, hh, mat, x, y, z, seg = 14, parent = scene) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
function jar(x, z, s = 1, y = 0) { const g = lathe([[0, 0], [.1, .01], [.17, .1], [.19, .26], [.15, .42], [.08, .5], [.09, .56], [.1, .58]].map(([a, b]) => [a * s, b * s]), 18); const m = new THREE.Mesh(g, MAT.clay); m.position.set(x, y || heightAt(x, z), z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; }

/* ---------- collisioni ---------- */
const COL = [];
const col = (x0, x1, z0, z1, on) => COL.push({ x0, x1, z0, z1, on });
const BOUND = { x0: -112, x1: 131, z0: -43, z1: 43 };

/* ---------- terreno, acqua, montagne ---------- */
makeGround(scene, T);
const tickNile = makeNile(scene, T);
col(NILE.x0, NILE.x1, NILE.z0 + .3, NILE.z1 - .3);
const SEA = makeSea(scene, T, SKY.sunDir);
makeMountains(scene, T);

/* ---------- vegetazione ---------- */
let PALM_SPOTS = [], PALM_PROC = [];
const PUZ_NEAR = (x, z, d) => PUZZLES.some(p => Math.hypot(p.at.x - x, p.at.z - z) < d);
{
  const r = rng(5), palmsList = [];
  const free = (x, z) => !PUZ_NEAR(x, z, 5) && !(x > -70 && x < -50 && z > -26) && !(x > -95 && x < -64 && z > 8 && z < 30) && !(x > -30 && x < 40 && Math.abs(z) < 20) && Math.abs(z) > 3 && !(Math.abs(x + 30) < 3) && !(Math.abs(x - 38) < 3);
  for (let i = 0; i < 400 && palmsList.length < 70; i++) { const x = -118 + r() * 160; const side = r() < .5 ? -1 : 1; const z = -30 + side * (5 + r() * 9); if (free(x, z)) palmsList.push([x, z]); }
  for (let i = 0; i < 300 && palmsList.length < 110; i++) { const x = -40 + r() * 80, z = (r() < .5 ? -1 : 1) * (22 + r() * 22); if (free(x, z) && x > -28 && x < 36) palmsList.push([x, z]); }
  for (const [x, z] of [[-102, 22], [-112, -21], [-70, 34], [44, 30], [46, -36], [-24, -6], [34, 4.5], [-112, 28], [-86, 38]]) palmsList.push([x, z]);
  // poche palme anche verso il deserto (oasi)
  for (const [x, z] of [[66, 36], [70, -38], [90, 38]]) palmsList.push([x, z]);
  const HOUSE_FREE = (x, z) => !(x > -112 && x < -92 && z > 30) && !(x > -49 && x < -31 && z > 25) && !(x > -112 && x < -92 && z > -22 && z < -4);
  for (let i = palmsList.length - 1; i >= 0; i--) if (!HOUSE_FREE(...palmsList[i])) palmsList.splice(i, 1);
  PALM_PROC = makePalms(scene, T, palmsList); PALM_SPOTS = palmsList;
  palmsList.forEach(([x, z]) => col(x - .35, x + .35, z - .35, z + .35));
  // papiro lungo il Nilo (Esodo 2:3)
  const pap = []; for (let i = 0; i < 1500; i++) { const x = -150 + r() * 188; const side = r() < .5 ? -1 : 1; const z = -30 + side * (3.4 + Math.pow(r(), 1.6) * 2.2); if (!(Math.abs(x + 44) < 3 && side > 0)) pap.push([x, z]); }
  makePapyrus(scene, T, pap);
  // erba: rive del Nilo e Gosen
  const grass = [];
  for (let i = 0; i < 6000; i++) { const x = -120 + r() * 165, z = -46 + r() * 92; const dn = Math.abs(z + 30); const inGos = x > -30 && x < 37; const p = (x < 40 && dn < 13 && dn > 4.2 ? .7 : 0) + (inGos ? .35 : 0); if (r() < p && !PUZ_NEAR(x, z, 2) && Math.abs(z + Math.sin(x * .05) * 1.2) > 2.5) grass.push([x, z]); }
  makeTufts(scene, T, grass, { color: '#d8e0b8', size: [.35, .8], seed: 4 });
  // campi d'orzo maturo a Gosen: a Gosen non cadde la grandine (Esodo 9:26, 31)
  const barley = [];
  for (const [x0, x1, z0, z1] of [[-27, -9, 24, 41], [12, 30, 22, 40], [-27, -13, -24, -21]]) for (let x = x0; x < x1; x += .55) for (let z = z0; z < z1; z += .55) barley.push([x + (r() - .5) * .4, z + (r() - .5) * .4]);
  makeTufts(scene, T, barley, { color: '#f2d27e', size: [.8, 1.05], seed: 6 });
  // sassi nel deserto
  const st = []; for (let i = 0; i < 500; i++) { const x = 38 + r() * 95, z = -43 + r() * 86; if (!PUZ_NEAR(x, z, 3) && Math.abs(z) > 3) st.push([x, z]); }
  for (let i = 0; i < 160; i++) { const x = -112 + r() * 70, z = -20 + r() * 63; if (!PUZ_NEAR(x, z, 3) && Math.abs(z) > 3) st.push([x, z]); }
  makeStones(scene, T, st);
}

/* =====================================================================
   ZONA 1 · CANTIERE DI RÀMSES
   ===================================================================== */
// mura della città-deposito, con portale a piloni (fuori dall'area di gioco)
bx(96, 9, 4, MAT.brick, -72, 4.5, 49);
for (let x = -116; x <= -28; x += 8) bx(2.2, 10, 5, MAT.brick, x, 5, 49);
{
  const pylon = (x) => { const g = new THREE.CylinderGeometry(3 / Math.SQRT2, 4.6 / Math.SQRT2, 15, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, .7); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 9); const m = new THREE.Mesh(g, MAT.brick); m.position.set(x, 7.5, 48); m.castShadow = m.receiveShadow = true; scene.add(m); };
  pylon(-79); pylon(-67); bx(5.4, 2.2, 4.2, MAT.brick, -73, 11.4, 48); bx(5, 9, .3, MAT.wood, -73, 4.5, 46.2);
  for (let i = 0; i < 6; i++) bx(11, 7 + (i % 3), 9, MAT.plaster, -112 + i * 15, 4, 60);
}
// stele dei lavori (enigma 1)
bx(1.5, 2.7, .55, MAT.stone, -96, 1.35, 3.2); bx(1.8, .3, .75, MAT.stone, -96, 2.85, 3.2); bx(2.2, .3, 1.2, MAT.stone, -96, .15, 3.2); col(-97.1, -94.9, 2.6, 3.8);
// mattoni ad asciugare al sole, cataste, paglia, vasca di fango (Esodo 1:14; 5:7)
{
  const g = new THREE.BoxGeometry(.36, .1, .18); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .25 + Math.random(), uv.getY(i) * .12 + Math.random());
  const pos = []; for (let row = 0; row < 9; row++) for (let k = 0; k < 34; k++) pos.push([-92 + k * .5 + (Math.random() - .5) * .05, .05, 14 + row * 1.1, (Math.random() - .5) * .08]);
  for (const [sx, sz] of [[-73, 12], [-73, 16], [-90, 26.5], [-84, 27]]) for (let lv = 0; lv < 7; lv++) for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) { const alt = lv % 2; pos.push(alt ? [sx + b * .38 - .38, .05 + lv * .105, sz + a * .19 - .5, Math.PI / 2] : [sx + a * .19 - .5, .05 + lv * .105, sz + b * .38 - .38, 0]); }
  const m = new THREE.InstancedMesh(g, MAT.brickRaw, pos.length); const d = new THREE.Object3D();
  pos.forEach(([x, y, z, ry], i) => { d.position.set(x, heightAt(x, z) + y, z); d.rotation.set(0, ry, 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  m.castShadow = m.receiveShadow = true; scene.add(m);
  col(-92.4, -75.2, 13.6, 23.4); for (const [sx, sz] of [[-73, 12], [-73, 16], [-90, 26.5], [-84, 27]]) col(sx - .7, sx + .7, sz - .7, sz + .7);
  for (const [x, z, s] of [[-97, 18, 1.4], [-98, 22, 1.1], [-95.5, 25.5, 1.25]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.5 * s, 1.5 * s, 18, 3), MAT.straw); const p = c.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < .7 * s) { const k = 1 + (Math.random() - .5) * .12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } c.geometry.computeVertexNormals(); c.position.set(x, .7 * s, z); c.castShadow = c.receiveShadow = true; scene.add(c); col(x - 1.4 * s, x + 1.4 * s, z - 1.4 * s, z + 1.4 * s); }
  const pit = new THREE.Mesh(new THREE.CircleGeometry(3, 28), MAT.mud); pit.rotation.x = -Math.PI / 2; pit.position.set(-70, .03, 20); pit.receiveShadow = true; scene.add(pit);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.05, .25, 6, 30), MAT.floor); rim.rotation.x = Math.PI / 2; rim.position.set(-70, .02, 20); rim.scale.z = .4; scene.add(rim); col(-73, -67, 17, 23);
  // banco con gli stampi di legno
  bx(2.2, .75, 1, MAT.wood, -81, .375, 11.8); for (let k = 0; k < 3; k++) { bx(.46, .16, .28, MAT.wood, -81.7 + k * .7, .83, 11.8); bx(.36, .1, .18, MAT.brickRaw, -81.7 + k * .7, .87, 11.8); }
  for (let i = 0; i < 4; i++) jar(-68 + i * .7, 24.3, 1.1);
}
// portico del palazzo con colonne a capitello papiriforme (enigma 3)
{
  bx(17, .8, 8, MAT.stone, -60, .4, -19.5); bx(17, .4, .6, MAT.stone, -60, .2, -15.3);
  bx(17, 7, .7, MAT.plaster, -60, 4.3, -23.1);
  const prof = [[.55, 0], [.55, .25], [.42, .3], [.4, .6], [.36, 4.2], [.33, 4.5], [.42, 4.75], [.62, 5.15], [.7, 5.4], [.72, 5.5], [0, 5.5]];
  const colG = lathe(prof, 20, 0, Math.PI * 2, .03); const uv = colG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 2.5);
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(colG, MAT.stone); c.position.set(-66.5 + i * 2.6, .8, -16.6); c.castShadow = c.receiveShadow = true; scene.add(c); bx(1.5, .35, 1.5, MAT.stone, -66.5 + i * 2.6, 6.47, -16.6); }
  bx(17.6, .9, 8.2, MAT.stone, -60, 7.1, -19.5); bx(17.6, .25, 8.4, MAT.plaster, -60, 7.65, -19.5);
  bx(3.2, 3, .2, MAT.wood, -60, 2.3, -22.65); bx(4, .3, .8, MAT.stone, -60, 3.95, -22.6);
  col(-68.5, -51.5, -23.5, -16.0);
}
// riva del Nilo (enigma 4): brocche e un piccolo approdo
for (let i = 0; i < 3; i++) jar(-45.6 + i * .7, -24.4, 1.1);
bx(3, .15, 4, MAT.wood, -40, .05, -26.5);

/* ---------- case egiziane (modello 3D fornito) nel quartiere di Ràmses ---------- */
{
  const HOUSES = [[-102, 36.5, Math.PI], [-40, 33, Math.PI], [-102, -13, 0]];
  for (const [x, z] of HOUSES) col(x - 7.2, x + 7.2, z - 5.2, z + 5.2);
  gltfL.loadAsync('models/env/casa.glb').then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    for (const [x, z, ry] of HOUSES) { const h = g.scene.clone(); h.position.set(x + (ry ? -1 : 1) * .94, heightAt(x, z) - .02, z + (ry ? 1 : -1) * .38); h.rotation.y = ry; scene.add(h); }
  }).catch(e => console.error(e));
}

/* ---------- palme da dattero (modello 3D fornito), due livelli di dettaglio ---------- */
let updatePalmLOD = () => {};
Promise.all(['palma_hi', 'palma_lo'].map(n => gltfL.loadAsync(`models/env/${n}.glb`))).then(([hi, lo]) => {
  if (!PALM_SPOTS.length) return;
  const r = rng(91), base = PALM_SPOTS.map(([x, z]) => { const s = 8.5 + r() * 4.5; return new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - .05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2), new THREE.Vector3(s, s * (.9 + r() * .2), s)); });
  const build = g => { const parts = []; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (!o.isMesh) return;
    const mat = o.material; if (/leaf|frond/i.test(mat.name || o.name)) addWind(mat, .012, 'max(position.y - .55, 0.0)');
    const im = new THREE.InstancedMesh(o.geometry, mat, base.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); parts.push({ im, w: o.matrixWorld.clone() }); }); return parts; };
  const H = build(hi), Lo = build(lo), tmp = new THREE.Matrix4();
  PALM_PROC.forEach(m => m.visible = false);
  let last = -1;
  updatePalmLOD = () => {
    const now = performance.now(); if (now - last < 400) return; last = now;
    let nh = 0, nl = 0;
    base.forEach((m, i) => {
      const d = Math.hypot(m.elements[12] - camera.position.x, m.elements[14] - camera.position.z);
      const set = d < 45 ? H : Lo, k = d < 45 ? nh++ : nl++;
      for (const p of set) p.im.setMatrixAt(k, tmp.multiplyMatrices(m, p.w));
    });
    for (const p of H) { p.im.count = nh; p.im.instanceMatrix.needsUpdate = true; }
    for (const p of Lo) { p.im.count = nl; p.im.instanceMatrix.needsUpdate = true; }
  };
}).catch(e => console.error(e));

/* ---------- muri con portone (passaggi tra le zone) ---------- */
const gates = [];
function gateWall(x, cond) {
  bx(.9, 2.7, 43 - 2.4, MAT.brick, x, 1.35, (43 + 2.4) / 2); bx(.9, 2.7, -2.4 - NILE.z1, MAT.brick, x, 1.35, (-2.4 + NILE.z1) / 2);
  bx(1.1, .2, 43 - 2.4, MAT.plaster, x, 2.8, (43 + 2.4) / 2); bx(1.1, .2, -2.4 - NILE.z1, MAT.plaster, x, 2.8, (-2.4 + NILE.z1) / 2);
  col(x - .55, x + .55, 2.4, 43); col(x - .55, x + .55, NILE.z1, -2.4);
  for (const z of [-2.75, 2.75]) bx(1.5, 4, 1.4, MAT.brick, x, 2, z);
  bx(1.6, .5, 7, MAT.wood, x, 4.2, 0);
  const leaves = [-1, 1].map(s => { const piv = new THREE.Group(); piv.position.set(x, 0, s * 2.1); scene.add(piv); bx(.16, 3.0, 2.08, MAT.wood, 0, 1.55, -s * 1.04, { parent: piv }); for (const y of [.6, 2.4]) bx(.2, .16, 2.0, MAT.wood, .09, y, -s * 1.04, { parent: piv }); return { piv, s }; });
  col(x - .55, x + .55, -2.4, 2.4, () => !cond());
  const g = { x, cond, leaves, open: 0 }; gates.push(g); return g;
}

/* =====================================================================
   ZONA 2 · GOSEN
   ===================================================================== */
function oven(x, z) { const g = lathe([[.55, 0], [.55, .2], [.48, .55], [.28, .8], [.2, .82], [0, .82]], 18); const m = new THREE.Mesh(g, MAT.brickRaw); m.position.set(x, heightAt(x, z), z); m.castShadow = m.receiveShadow = true; scene.add(m); col(x - .6, x + .6, z - .6, z + .6); }
function house(cx, cz, w, d, hh = 3.2) {
  bx(w, hh, d, MAT.brick, cx, hh / 2, cz);
  bx(w + .25, .3, d + .25, MAT.plaster, cx, hh + .15, cz);
  bx(w + .25, .35, .2, MAT.brick, cx, hh + .47, cz + (d / 2 + .02)); bx(w + .25, .35, .2, MAT.brick, cx, hh + .47, cz - (d / 2 + .02));
  bx(.2, .35, d, MAT.brick, cx - (w / 2 + .02), hh + .47, cz); bx(.2, .35, d, MAT.brick, cx + (w / 2 + .02), hh + .47, cz);
  // travi di palma che sporgono dal tetto
  const side = cz > 0 ? -1 : 1;
  for (let i = 0; i < Math.floor(w / .7); i++) cyl(.07, .07, d + .7, MAT.wood, cx - w / 2 + .35 + i * .7, hh - .12, cz, 7).rotation.x = Math.PI / 2;
  // porta con stipiti e architrave
  bx(1.1, 2.05, .12, MAT.dark, cx, 1.03, cz + side * (d / 2 + .02));
  bx(.16, 2.25, .22, MAT.wood, cx - .63, 1.12, cz + side * (d / 2 + .05)); bx(.16, 2.25, .22, MAT.wood, cx + .63, 1.12, cz + side * (d / 2 + .05)); bx(1.5, .2, .24, MAT.wood, cx, 2.3, cz + side * (d / 2 + .05));
  bx(.5, .4, .06, MAT.dark, cx + w / 3, 2.3, cz + side * (d / 2 + .02));
  // sul tetto: fasci di steli e un graticcio
  bx(1.4, .45, .8, MAT.straw, cx + w / 4, hh + .55, cz); cyl(.4, .4, .2, MAT.straw, cx - w / 4, hh + .4, cz, 10);
  // scala a pioli appoggiata
  const lad = new THREE.Group(); lad.position.set(cx + w / 2 + .35, 0, cz + side * (d / 4)); lad.rotation.z = .2; scene.add(lad);
  for (const s of [-.22, .22]) bx(.07, 3.6, .07, MAT.wood, 0, 1.75, s, { parent: lad });
  for (let i = 0; i < 9; i++) bx(.05, .05, .44, MAT.wood, 0, .3 + i * .38, 0, { parent: lad });
  oven(cx - w / 2 - .9, cz + side * (d / 2 + 1.2));
  jar(cx + .9, cz + side * (d / 2 + .5), 1.2);
  col(cx - w / 2, cx + w / 2 + .6, cz - d / 2, cz + d / 2);
}
for (const [x, z, w, d] of [[-20, -14, 6, 5], [-4, 16, 6, 5], [10, -16, 7, 5], [29, -14, 6, 5], [31, 14, 6, 5], [-22, 18, 5, 5], [8, 16, 5, 4]]) house(x, z, w, d);
// pozzo (enigma 5)
{
  const wg = lathe([[1.0, 0], [1.15, 0], [1.15, .9], [1.0, .95], [.9, .9], [.9, 0]], 26); const uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * .8);
  const w = new THREE.Mesh(wg, MAT.stone); w.position.set(-12, 0, 3); w.castShadow = w.receiveShadow = true; scene.add(w);
  const wt = new THREE.Mesh(new THREE.CircleGeometry(.9, 24), new THREE.MeshStandardMaterial({ color: '#0f1a18', roughness: .05, envMapIntensity: .6 })); wt.rotation.x = -Math.PI / 2; wt.position.set(-12, .35, 3); scene.add(wt);
  bx(.14, 2.3, .14, MAT.wood, -13.1, 1.15, 3); bx(.14, 2.3, .14, MAT.wood, -10.9, 1.15, 3); cyl(.07, .07, 2.4, MAT.wood, -12, 2.2, 3, 8).rotation.z = Math.PI / 2;
  cyl(.004, .004, 1.5, MAT.rope, -12, 1.45, 3, 4); const b = cyl(.15, .12, .25, MAT.wood, -12, .78, 3, 12); b.castShadow = true;
  jar(-10.3, 4.6, 1.2); jar(-13.6, 4.8, 1.0);
  col(-13.3, -10.7, 1.8, 4.2);
}
// recinto delle pecore (enigma 6)
{
  const x0 = -2, x1 = 6, z0 = -11.5, z1 = -6.5;
  const post = (x, z) => cyl(.06, .07, 1.1, MAT.wood, x, .55, z, 7);
  for (let x = x0; x <= x1 + .01; x += 1) { post(x, z0); post(x, z1); }
  for (let z = z0; z <= z1 + .01; z += 1) { post(x0, z); post(x1, z); }
  for (const y of [.45, .85]) { bx(x1 - x0, .07, .06, MAT.wood, (x0 + x1) / 2, y, z0); bx(x1 - x0, .07, .06, MAT.wood, (x0 + x1) / 2, y, z1); bx(.06, .07, z1 - z0, MAT.wood, x0, y, (z0 + z1) / 2); bx(.06, .07, z1 - z0, MAT.wood, x1, y, (z0 + z1) / 2); }
  const hay = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), MAT.straw); hay.rotation.x = -Math.PI / 2; hay.position.set(2, .03, -9); scene.add(hay);
  bx(1.6, .35, .5, MAT.wood, 4.5, .18, -7.2);
  col(x0 - .2, x1 + .2, z0 - .2, z1 + .2);
}
// la casa della famiglia (enigmi 7 e 8)
const HOUSE = { x0: 14, x1: 22, z0: -3, z1: 3, dx0: 17.3, dx1: 18.7 };
const doorPivot = new THREE.Group();
const bloodMarks = [];
let houseLamp, lampFlame;
{
  const { x0, x1, z0, z1, dx0, dx1 } = HOUSE, hh = 3.2, t = .32, cx = (x0 + x1) / 2;
  bx(x1 - x0, hh, t, MAT.brick, cx, hh / 2, z0 + t / 2);
  bx(t, hh, z1 - z0, MAT.brick, x0 + t / 2, hh / 2, 0); bx(t, hh, z1 - z0, MAT.brick, x1 - t / 2, hh / 2, 0);
  bx(dx0 - x0, hh, t, MAT.brick, (x0 + dx0) / 2, hh / 2, z1 - t / 2); bx(x1 - dx1, hh, t, MAT.brick, (dx1 + x1) / 2, hh / 2, z1 - t / 2);
  bx(dx1 - dx0, hh - 2.45, t, MAT.brick, cx, 2.45 + (hh - 2.45) / 2, z1 - t / 2);
  bx(x1 - x0 + .25, .28, z1 - z0 + .25, MAT.plaster, cx, hh + .14, 0);
  for (let i = 0; i < 11; i++) cyl(.08, .08, z1 - z0 + .6, MAT.wood, x0 + .4 + i * .72, hh - .12, 0, 7).rotation.x = Math.PI / 2;
  for (const s of [1, -1]) bx(x1 - x0 + .25, .35, .2, MAT.brick, cx, hh + .45, s * (z1 + .02));
  // stipiti e architrave (Esodo 12:7, 22)
  bx(.2, 2.45, .4, MAT.wood, dx0 - .04, 1.22, z1 - t / 2); bx(.2, 2.45, .4, MAT.wood, dx1 + .04, 1.22, z1 - t / 2); bx(1.9, .24, .42, MAT.wood, cx, 2.48, z1 - t / 2);
  for (const [x, y, w, h2] of [[dx0 - .04, 1.55, .21, .55], [dx1 + .04, 1.35, .21, .5], [cx, 2.49, .75, .25], [dx0 - .04, .95, .21, .3], [dx1 + .04, 1.95, .21, .3], [cx + .55, 2.49, .3, .25], [cx - .5, 2.49, .2, .25]]) { const m = bx(w, h2, .44, MAT.blood, x, y, z1 - t / 2, { cast: false }); m.visible = false; bloodMarks.push(m); }
  doorPivot.position.set(dx0 + .02, 0, z1 - t / 2); scene.add(doorPivot);
  bx(dx1 - dx0 - .05, 2.3, .09, MAT.wood, (dx1 - dx0) / 2, 1.17, 0, { parent: doorPivot });
  for (const y of [.5, 1.9]) bx(dx1 - dx0 - .1, .14, .05, MAT.wood, (dx1 - dx0) / 2, y, -.07, { parent: doorPivot });
  // interno: pavimento di terra battuta, tavola bassa, stuoie
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - .6, z1 - z0 - .6), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, .03, 0); fl.receiveShadow = true; scene.add(fl);
  bx(1.9, .42, 1, MAT.wood, cx, .21, -1.6);
  for (const sx of [-1.6, 1.6]) bx(1.2, .04, .8, MAT.straw, cx + sx, .03, -1.6);
  // la cena: agnello arrostito intero, pane senza lievito, erbe amare (Esodo 12:8, 9)
  const plat = cyl(.42, .36, .05, MAT.clay, cx - .1, .45, -1.6, 22);
  const lamb = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 12), MAT.roast); lamb.scale.set(1.7, .65, .8); lamb.position.set(cx - .1, .56, -1.6); lamb.castShadow = true; scene.add(lamb);
  const lh = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 10), MAT.roast); lh.scale.set(1.4, .9, .9); lh.position.set(cx + .25, .58, -1.6); scene.add(lh);
  for (let i = 0; i < 4; i++) { const b = cyl(.15, .15, .025, MAT.bread, cx + .55, .44 + i * .028, -1.75 + (i % 2) * .05, 22); b.rotation.z = .02 * i; }
  cyl(.14, .1, .1, MAT.clay, cx - .65, .47, -1.85, 16); for (let i = 0; i < 8; i++) { const h2 = new THREE.Mesh(new THREE.ConeGeometry(.025, .2, 4), MAT.herbs); h2.position.set(cx - .65 + (Math.random() - .5) * .14, .58, -1.85 + (Math.random() - .5) * .14); h2.rotation.set((Math.random() - .5) * .8, 0, (Math.random() - .5) * .8); scene.add(h2); }
  // lucerna d'argilla
  const lampG = lathe([[0, 0], [.07, 0], [.08, .03], [.05, .05], [0, .05]], 14); const lm = new THREE.Mesh(lampG, MAT.clay); lm.position.set(cx + .1, .42, -1.25); lm.scale.set(1, 1, 1.4); scene.add(lm);
  lampFlame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffb35c', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); lampFlame.position.set(cx + .1, .52, -1.17); lampFlame.scale.set(.12, .2, 1); scene.add(lampFlame);
  houseLamp = new THREE.PointLight('#ffb062', 0, 14, 1.5); houseLamp.position.set(cx + .1, .8, -1.2); houseLamp.castShadow = true; houseLamp.shadow.mapSize.set(512, 512); houseLamp.shadow.bias = -.002; scene.add(houseLamp);
  for (let i = 0; i < 3; i++) jar(x0 + .6 + i * .55, z0 + .55, 1.1);
  bx(1.2, .6, .7, MAT.straw, x1 - .9, .3, z0 + .7);
  const basin = cyl(.36, .27, .22, MAT.clay, dx1 + .85, .11, z1 + .55, 18);
  const bl = new THREE.Mesh(new THREE.CircleGeometry(.3, 18), MAT.blood); bl.rotation.x = -Math.PI / 2; bl.position.set(dx1 + .85, .2, z1 + .55); scene.add(bl); void basin;
  // mazzo d'issopo accanto al catino
  for (let i = 0; i < 9; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(.006, .008, .4, 4), MAT.herbs); st.position.set(dx1 + 1.35 + (Math.random() - .5) * .05, .05, z1 + .5); st.rotation.set(Math.PI / 2 - .1, (Math.random() - .5) * .3, .3); scene.add(st); }
  col(x0, x1, z0, z0 + t + .05); col(x0, x0 + t + .05, z0, z1); col(x1 - t - .05, x1, z0, z1);
  col(x0, dx0, z1 - t - .05, z1); col(dx1, x1, z1 - t - .05, z1); col(dx0, dx1, z1 - t - .05, z1 + .05, () => !solvedHas(7));
  col(cx - 1, cx + 1, -2.15, -1.05); col(dx1 + .45, dx1 + 1.2, z1 + .15, z1 + .9);
}

/* =====================================================================
   ZONA 3 · IL CAMMINO VERSO IL MARE
   ===================================================================== */
function tent(x, z, s = 1, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = ry; scene.add(g);
  // tenda a due falde con teli tesi
  const W = 3.2 * s, D = 2.6 * s, H = 2 * s;
  const geo = new THREE.BufferGeometry();
  const v = [-W / 2, 0, -D / 2, -W / 2, H, 0, -W / 2, 0, D / 2, W / 2, 0, -D / 2, W / 2, H, 0, W / 2, 0, D / 2];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1.2, 0, 0, 2, 0, 2, 1.2, 2, 0], 2));
  geo.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, MAT.tent); m.castShadow = m.receiveShadow = true; g.add(m);
  const back = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(-W / 2, H, 0), new THREE.Vector3(-W / 2, 0, D / 2)]), MAT.tent); back.geometry.computeVertexNormals(); g.add(back);
  for (const sx of [-W / 2 - .05, W / 2 + .05]) bx(.07, H + .2, .07, MAT.wood, sx, (H + .2) / 2, 0, { parent: g });
  col(x - 1.8 * s, x + 1.8 * s, z - 1.8 * s, z + 1.8 * s);
}
function campfire(x, z) {
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.18, 0), MAT.stone); s.position.set(x + Math.cos(a) * .55, .1, z + Math.sin(a) * .55); s.castShadow = true; scene.add(s); }
  for (let i = 0; i < 4; i++) cyl(.05, .05, .8, MAT.wood, x, .12, z, 6).rotation.set(Math.PI / 2, i * .8, 0);
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ff8a3a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); f.position.set(x, .45, z); f.scale.set(.9, 1.1, 1); scene.add(f); fires.push(f);
  col(x - .8, x + .8, z - .8, z + .8);
}
const fires = [];
{
  const r = rng(31);
  for (const [xa, xb, za, zb, n] of [[48, 64, 9, 26, 8], [48, 64, -26, -9, 8], [96, 124, 31, 38, 6], [96, 124, -38, -31, 6]]) for (let i = 0; i < n; i++) tent(xa + r() * (xb - xa), za + r() * (zb - za), .8 + r() * .35, r() * 3);
  for (const [x, z] of [[60, 5], [112, 9], [103, -9], [52, -6]]) campfire(x, z);
}
// torre di Mìgdol (Esodo 14:2)
bx(6, 13, 6, MAT.brick, 112, 6.5, 52); for (let i = 0; i < 8; i++) bx(1.1, 1.2, 1.1, MAT.brick, 109.5 + (i % 4) * 1.66, 13.6, i < 4 ? 49.5 : 54.5);

/* ---------- la colonna di nuvola e di fuoco ---------- */
function glowTex() {
  if (glowTex.t) return glowTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex.t = new THREE.CanvasTexture(c); return glowTex.t;
}
function puffTex(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), .7) * 70, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, rad = 18 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); const v = 215 + Math.floor(r() * 40);
    gr.addColorStop(0, `rgba(${v},${v},${v},${.22 + r() * .2})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const pillar = new THREE.Group(); pillar.position.set(118, 0, -12); scene.add(pillar);
const cloudSpr = [], fireSpr = [];
{
  const r = rng(51), tx = [puffTex(1), puffTex(2), puffTex(3)];
  for (let i = 0; i < 46; i++) {
    const y = i * 1.7 + 2, s = 11 + r() * 7 + (i > 36 ? (i - 36) * 2.2 : 0);
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx[i % 3], color: new THREE.Color().setHSL(.1, .08, .82 + r() * .14), transparent: true, opacity: .8, depthWrite: false }));
    c.position.set((r() - .5) * 2.4, y, (r() - .5) * 2.4); c.scale.set(s, s, 1); c.userData = { y, ph: r() * 6, rot: (r() - .5) * .08 }; c.material.rotation = r() * 6; pillar.add(c); cloudSpr.push(c);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx[(i + 1) % 3], color: new THREE.Color().setHSL(.06 + r() * .05, 1, .55), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    f.position.copy(c.position); f.scale.set(s * .85, s * .85, 1); f.userData = c.userData; pillar.add(f); fireSpr.push(f);
  }
}
const fireLight = new THREE.PointLight('#ff9a48', 0, 300, 1.1); fireLight.position.set(0, 22, 0); pillar.add(fireLight);
let fireK = 0;

/* ---------- la folla (istanze) ---------- */
// folla: versioni leggere dei personaggi (models/people/c_*.json), circa 250 persone
const CROWD_VARIANTS = [['c_schiavo1', 1.72], ['c_schiavo2', 1.70], ['c_pastore', 1.74], ['c_capofamiglia', 1.75], ['c_donna', 1.60], ['c_figlio', 1.28], ['c_miriam', 1.56]];
const crowd = [], crowdMeshes = []; let CROWD_FAMS = [];
let crowdMesh = null;   // segnala che la folla è pronta
{
  // la folla esce per famiglie: un padre o un capofamiglia, una madre, figli; ogni famiglia cammina vicina
  const r = rng(61), FAMS = [], MEN = [0, 1, 2, 3], WOMEN = [4, 6], KID = 5;
  let n = 0;
  while (n < 252) {
    const side = FAMS.length % 2 ? 1 : -1, size = Math.min(252 - n, 3 + Math.floor(r() * 4));
    let cx = 96 + r() * 30, cz = side * (12 + r() * 17);
    if (Math.hypot(cx - 112, cz - 9) < 3.5 || Math.hypot(cx - 103, cz + 9) < 3.5) cz += side * 4;
    const fam = { lane: (r() - .5) * 18, delay: r() * 6 + (Math.abs(cz) - 10) * .12, sp: 3.2 + r() * .6, side, members: [] };
    for (let k = 0; k < size; k++) {
      const v = k === 0 ? MEN[Math.floor(r() * MEN.length)] : k === 1 ? WOMEN[Math.floor(r() * WOMEN.length)] : (r() < .7 ? KID : MEN[Math.floor(r() * MEN.length)]);
      // posizione nel gruppo: padre davanti, madre accanto, figli in mezzo o dietro
      const lat = k === 0 ? -.5 : k === 1 ? .6 : (r() - .5) * 1.6, back = k < 2 ? r() * .4 : .9 + r() * 1.6;
      const x = cx + (r() - .5) * 2.4, z = cz + (r() - .5) * 2.4;
      const kid = v === KID;
      crowd.push({ v, x0: x, z0: z, x, z, sc: kid ? .85 + r() * .25 : .94 + r() * .12, lane: fam.lane + lat, delay: fam.delay + back / fam.sp, sp: fam.sp, ph: r() * 6, kid, fam: FAMS.length,
        ry0: (side > 0 ? Math.PI : 0) + (r() - .5) * 1.4 });
      fam.members.push(crowd.length - 1);
    }
    FAMS.push(fam); n += size;
  }
  CROWD_FAMS = FAMS;
  Promise.all(CROWD_VARIANTS.map(([n]) => loadModel(n))).then(gs => {
    gs.forEach((g, vi) => {
      if (!g) return; let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      // i modelli compressi usano interi normalizzati: vanno convertiti in float prima di trasformarli,
      // altrimenti le coordinate oltre ±1 vengono tagliate (teste e piedi spariscono)
      const geo = new THREE.BufferGeometry(); geo.setIndex(mesh.geometry.index);
      for (const [nm, at] of Object.entries(mesh.geometry.attributes)) { const a = new Float32Array(at.count * at.itemSize); for (let q = 0; q < at.count; q++) for (let c = 0; c < at.itemSize; c++) a[q * at.itemSize + c] = at.getComponent(q, c); geo.setAttribute(nm, new THREE.BufferAttribute(a, at.itemSize)); }
      geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox();
      const bb = geo.boundingBox, k = CROWD_VARIANTS[vi][1] / (bb.max.y - bb.min.y);
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.scale(k, k, k);
      const list = crowd.filter(c => c.v === vi);
      const im = new THREE.InstancedMesh(geo, mesh.material, list.length); im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
      im.userData.list = list; list.forEach((c, j) => { c.mesh = im; c.j = j; });
      scene.add(im); crowdMeshes.push(im);
    });
    crowdMesh = crowdMeshes[0] || null; placeCrowd(0, false);
  });
}
const dummy = new THREE.Object3D();
function walkPos(a, t) {
  const s = Math.max(0, t - a.delay) * a.sp, sx = 129, sz = a.lane, d0 = Math.hypot(sx - a.x0, sz - a.z0);
  if (s <= 0) return [a.x0, a.z0, a.ry0, false];
  if (s < d0) { const k = s / d0; return [a.x0 + (sx - a.x0) * k, a.z0 + (sz - a.z0) * k, Math.atan2(sx - a.x0, sz - a.z0), true]; }
  const ds = s - d0, dz = Math.sin(ds * .045 + a.ph) * .5;
  return [sx + ds, sz + dz, Math.PI / 2 + Math.cos(ds * .045 + a.ph) * .02, true];
}
function placeCrowd(t, walking) {
  for (let i = 0; i < crowd.length; i++) {
    const a = crowd[i];
    let y = 0, ry = a.ry0;
    let lean = 0, roll = 0;
    if (walking) {
      const [x, z, r2, mv] = walkPos(a, t); a.x = x; a.z = z; ry = r2;
      if (mv) {
        // passo: su e giù a ogni appoggio, lieve dondolio laterale, busto un po' in avanti; i bambini fanno passi più rapidi
        const ph = t * a.sp / (a.kid ? .9 : 1.3) * Math.PI + a.ph;
        y = Math.abs(Math.sin(ph)) * (a.kid ? .06 : .045);
        roll = Math.sin(ph) * .035; lean = .05; ry += Math.sin(ph * .5) * .03;
      }
    }
    dummy.position.set(a.x, heightAt(a.x, a.z) + y, a.z); dummy.rotation.order = 'YXZ'; dummy.rotation.set(lean, ry, roll); dummy.scale.setScalar(a.sc); dummy.updateMatrix();
    if (a.mesh) a.mesh.setMatrixAt(a.j, dummy.matrix);
  }
  for (const m of crowdMeshes) m.instanceMatrix.needsUpdate = true;
}
placeCrowd(0, false);
col(92, 129, 8, 38); col(92, 129, -38, -8);

/* ---------- vento orientale (finale) ---------- */
const WIND = 320;
const windGeo = new THREE.BufferGeometry(); windGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(WIND * 6), 3));
const wind = new THREE.LineSegments(windGeo, new THREE.LineBasicMaterial({ color: '#cfe0ea', transparent: true, opacity: 0, fog: false }));
wind.frustumCulled = false; scene.add(wind);
const windP = []; { const r = rng(71); for (let i = 0; i < WIND; i++) windP.push({ x: 120 + r() * 220, y: .5 + r() * 18, z: (r() - .5) * 80, l: 2 + r() * 4, v: 30 + r() * 25 }); }

/* =====================================================================
   PERSONE
   ===================================================================== */
const people = [], personMeshes = [];
const fabric = fabricTexture(3);
const skins = ['#a87452', '#9c6b4b', '#b8835e', '#8e5f40'];
function person(spec) {
  const skin = new THREE.MeshStandardMaterial({ color: skins[people.length % skins.length], roughness: .7 });
  const p = makePerson({ man: true, h: 1.75, pose: 'none', ...spec }, fabric, skin);
  p.position.set(spec.x, heightAt(spec.x, spec.z), spec.z); p.rotation.y = spec.ry || 0; scene.add(p); people.push(p);
  p.traverse(o => { if (o.isMesh) personMeshes.push(o); });
  if (spec.model) loadModel(spec.model).then(g => {
    if (!g) return;
    const m = g.scene.clone(true); const bb = new THREE.Box3().setFromObject(m); const k = (spec.h || 1.75) / (bb.max.y - bb.min.y);
    m.scale.setScalar(k); m.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
    m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.person = spec; personMeshes.push(o); if (o.material) o.material.envMapIntensity = .9; } });
    for (const c of p.children) c.visible = false;
    p.add(m); p.userData.model = m;
  });
  col(spec.x - .35, spec.x + .35, spec.z - .35, spec.z + .35);
  return p;
}
person({ egyptian: true, robe: '#f2ede2', model: 'soprintendente', h: 1.74, name: 'Un soprintendente egiziano', info: 'I soprintendenti ai lavori forzati opprimevano gli israeliti (Esodo 1:11; 5:14).', x: -77, z: 25.5, ry: Math.PI, pose: 'staff' });
person({ robe: '#a08560', head: '#d8c39a', beard: '#2a1f16', hair: '#2a1f16', model: 'schiavo1', h: 1.72, pose: 'carry', name: 'Uno schiavo israelita', info: 'Gli israeliti lavoravano duramente con la malta e i mattoni (Esodo 1:14).', x: -88, z: 24.6, ry: 2.6 });
person({ robe: '#8c7356', head: '#cdb894', beard: '#1f1712', hair: '#1f1712', model: 'schiavo2', h: 1.70, pose: 'carry', name: 'Uno schiavo israelita', info: 'Il faraone non diede più paglia, ma pretese lo stesso numero di mattoni (Esodo 5:7, 8).', x: -84, z: 24.8, ry: 3.4 });
person({ robe: '#9a8466', head: '#d9cdb4', beard: '#3a2a1c', hair: '#3a2a1c', model: 'schiavo3', h: 1.74, pose: 'basket', name: 'Uno schiavo israelita', info: 'Il popolo si sparse per l’Egitto a cercare qualcosa da usare come paglia (Esodo 5:12).', x: -80, z: 25, ry: 3.0 });
person({ robe: '#8a6b4a', mantle: '#4a3a2a', head: '#d9cdb4', beard: '#ddd6ca', hair: '#d6cfc2', longBeard: true, pose: 'staff', model: 'mose', name: 'Mosè', info: 'Mosè aveva 80 anni quando parlò al faraone (Esodo 7:7).', x: -61.6, z: -14.6, ry: .15, h: 1.76 });
person({ robe: '#6e7b8a', mantle: '#3c3a44', head: '#e2d6bc', beard: '#cfc8bc', hair: '#c9c1b4', longBeard: true, pose: 'guide', model: 'aronne', name: 'Aronne', info: 'Aronne, fratello di Mosè, parlava al suo posto (Esodo 4:14-16; 7:1, 2). Indossa abiti comuni: le vesti sacerdotali furono date più tardi, al Sinai (Esodo 28).', x: -58.4, z: -14.6, ry: -.15, h: 1.78 });
// la famiglia, pronta a partire: fianchi cinti, sandali ai piedi, bastone in mano (Esodo 12:11)
person({ robe: '#7b5a3c', mantle: '#4a3a2a', head: '#d8c39a', beard: '#2a1f16', hair: '#2a1f16', pose: 'staff', model: 'padre', h: 1.74, name: 'Il padre di famiglia', info: 'Ogni capofamiglia doveva procurare un agnello per la sua casa (Esodo 12:3, 21).', x: 16.5, z: -1.6, ry: Math.PI / 2 });
person({ man: false, robe: '#8a4f3c', scarf: '#e0d2b8', pose: 'staff', h: 1.62, name: 'La madre', info: 'La famiglia mangiava la Pasqua in casa, pronta a partire (Esodo 12:11).', x: 19.5, z: -1.6, ry: -Math.PI / 2 });
person({ child: true, robe: '#c9b48c', pose: 'staff', h: 1.28, model: 'figlio', name: 'Un figlio', info: 'I padri dovevano spiegare ai figli il significato della Pasqua (Esodo 12:26, 27).', x: 18, z: -2.5, ry: 0 });
// abitanti di Gosen
person({ man: false, robe: '#5e6a72', scarf: '#d8ccb4', pose: 'jar', h: 1.6, model: 'donna', name: 'Una donna israelita', info: 'Gli israeliti abitavano nel paese di Gosen (Esodo 8:22; 9:26).', x: -9.5, z: 5.5, ry: -1.2 });
person({ robe: '#9c7f5f', head: '#efe6d2', beard: '#3a2a1c', hair: '#3a2a1c', pose: 'staff', model: 'pastore', h: 1.75, name: 'Un pastore', info: 'Ogni famiglia sceglieva un maschio sano di un anno, agnello o capretto (Esodo 12:5).', x: 7, z: -5, ry: -2.2 });
person({ robe: '#9c7f5f', mantle: '#5a4632', head: '#efe6d2', beard: '#2e2218', hair: '#2e2218', pose: 'staff', model: 'capofamiglia', h: 1.76, name: 'Un capofamiglia', info: 'Con gli israeliti partì anche una grande folla mista, con greggi e mandrie (Esodo 12:38).', x: 58.5, z: 3.2, ry: -2.2 });
person({ man: false, robe: '#6b6a4a', scarf: '#cbbf9f', pose: 'basket', h: 1.6, model: 'donna', name: 'Una donna israelita', info: 'Gli israeliti avevano chiesto agli egiziani oggetti d’argento, d’oro e vestiti (Esodo 12:35, 36).', x: 53, z: 6.5, ry: 2.6 });
const moses2 = person({ robe: '#8a6b4a', mantle: '#4a3a2a', head: '#d9cdb4', beard: '#ddd6ca', hair: '#d6cfc2', longBeard: true, pose: 'raise', model: 'mose', name: 'Mosè', info: 'Geova disse a Mosè di alzare il bastone e stendere la mano sul mare (Esodo 14:16).', x: 130, z: 2.8, ry: Math.PI / 2, h: 1.76 });
person({ man: false, robe: '#7a4f6a', scarf: '#e2d6bc', pose: 'none', h: 1.6, model: 'miriam', h: 1.58, name: 'Miriam', info: 'Miriam, sorella di Aronne, guidò le donne nel canto dopo l’attraversamento (Esodo 15:20, 21).', x: 124, z: 6.5, ry: 2.4 });
const raiseArm = moses2.userData.raiseArm;

/* ---------- animali (modelli realistici, caricati in modo asincrono) ---------- */
let animals = null;
const ANIM = [];
{
  const r = rng(81), add = (k, x, z, yaw = r() * 6, extra = {}) => ANIM.push({ k, x, z, yaw, graze: r() < .5, ...extra });
  // recinto: pecore e capre
  for (let i = 0; i < 7; i++) add('pecora', -1.2 + r() * 6.4, -10.9 + r() * 3.8);
  for (let i = 0; i < 3; i++) add('capra', -1.2 + r() * 6.4, -10.9 + r() * 3.8);
  // l'agnello custodito dal 10° al 14° giorno, legato accanto alla casa (Esodo 12:3-6)
  add('agnello', 23.2, 4.2, -1.2, { graze: true });
  // buoi e asini nel villaggio, cavalli presso il palazzo, un asino al cantiere
  add('bue', -16, 30, 1); add('bue', -13.5, 31, 1.2); add('asino', 26, 4, -.6); add('asino', -26, 10, 2); add('mucca', 20, 30, 2.5); add('vitellino', 21.6, 31, 2.1);
  add('cavallo', -53, -14, -1.6); add('cavallo', -52, -12.6, -1.4); add('asino', -66, 25, 1.4);
  // Succòt e Piairòt: greggi e mandrie (Esodo 12:38), cammelli e asini
  for (let i = 0; i < 16; i++) add('pecora', 64 + r() * 8, -24 + r() * 10);
  for (let i = 0; i < 8; i++) add('capra', 64 + r() * 8, 14 + r() * 10);
  for (const [x, z] of [[47, 28], [49, 31], [66, -30]]) add('cammello', x, z);
  for (const [x, z] of [[62, 28], [45, -28], [78, 22]]) add('asino', x, z);
  for (let i = 0; i < 3; i++) add('bue', 70 + r() * 6, 30 + r() * 6);
  // greggi che attraverseranno il mare con il popolo
  // le greggi e le mandrie partono con le famiglie (Esodo 12:38): qualche capo dietro a ogni famiglia
  CROWD_FAMS.forEach((fam, fi) => {
    if (fi % 2) return;
    const lead = crowd[fam.members[0]], nA = 1 + Math.floor(r() * 3);
    for (let q = 0; q < nA; q++) {
      const big = q === 0 && r() < .22, k = big ? (r() < .5 ? 'bue' : 'asino') : (r() < .6 ? 'pecora' : 'capra');
      const back = 2.6 + q * 1.1 + r() * .6;
      add(k, lead.x0 + (r() - .5) * 3, lead.z0 + fam.side * (2 + r() * 2), Math.PI / 2, { cross: true, lane: fam.lane + (r() - .5) * 2.2, delay: fam.delay + back / fam.sp, sp: fam.sp });
    }
  });
  for (const a of ANIM) if (!a.cross) { const s = a.k === 'cammello' || a.k === 'bue' || a.k === 'cavallo' ? .9 : .5; col(a.x - s, a.x + s, a.z - s, a.z + s); }
}

/* ---------- nomi dei luoghi ---------- */
const names = new THREE.Group(); names.visible = false; scene.add(names);
function label(text, size = 1) {
  const c = document.createElement('canvas'); const g = c.getContext('2d'); const fs = 44;
  g.font = `600 ${fs}px "Source Sans 3", sans-serif`; const w = g.measureText(text).width + 40;
  c.width = w; c.height = fs + 28; const g2 = c.getContext('2d');
  g2.fillStyle = 'rgba(23,17,11,.85)'; g2.strokeStyle = '#D8B25C'; g2.lineWidth = 3;
  g2.beginPath(); g2.roundRect(2, 2, w - 4, fs + 24, 14); g2.fill(); g2.stroke();
  g2.font = `600 ${fs}px "Source Sans 3", sans-serif`; g2.fillStyle = '#F3E9D2'; g2.textBaseline = 'middle'; g2.fillText(text, 20, (fs + 28) / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.scale.set(w / 18 * size, (fs + 28) / 18 * size, 1); s.renderOrder = 10; return s;
}
for (const [t, x, y, z, s] of [['Ràmses', -73, 19, 47, 1.4], ['Il Nilo', -80, 3, -30, 1], ['Il paese di Gosen', 2, 9, 0, 1.2], ['Succòt', 56, 8, 18, 1.1], ['Ètham', 84, 7, -14, 1.1], ['Piairòt', 108, 8, 22, 1.1], ['Mìgdol', 112, 17, 52, 1.1], ['Mar Rosso', 175, 8, 0, 1.6]]) { const l = label(t, s); l.position.set(x, y, z); names.add(l); }
/* =====================================================================
   POSTAZIONI DEGLI ENIGMI
   ===================================================================== */
const stations = [];
function numSprite(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(23,17,11,.9)'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.font = '700 54px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
for (const p of PUZZLES) {
  const g = new THREE.Group(); g.position.set(p.at.x, heightAt(p.at.x, p.at.z), p.at.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, .06, 8, 40), new THREE.MeshBasicMaterial({ color: '#D8B25C' })); ring.rotation.x = Math.PI / 2; ring.position.y = .05; g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.6, .8, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#F3DA9A', transparent: true, opacity: .25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.y = 1.6; g.add(beam);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: numSprite(String(p.n), '#D8B25C'), transparent: true })); spr.scale.set(.85, .85, 1); spr.position.y = 2.45; g.add(spr);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.5; g.add(hit);
  scene.add(g);
  const s = { p, g, ring, beam, spr, hit, state: '' }; hit.userData.station = s; stations.push(s);
}

/* =====================================================================
   STATO DEL GIOCO
   ===================================================================== */
const KEY = 'egitto-escape-v1';
const state = { name: '', solved: [], hints: 0, penalty: 0, elapsed: 0, untimed: false, hintIdx: {}, notes: '' };
const LIMIT = 3600;
let running = false, finale = null, nightSeq = 0;
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* facoltativo */ } }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.solved)) return s; } catch (e) { /* facoltativo */ } return null; }
function solvedHas(n) { return state.solved.includes(n); }
const nextN = () => { for (const p of PUZZLES) if (!solvedHas(p.n)) return p.n; return 13; };
const gate1 = gateWall(-30, () => [1, 2, 3, 4].every(solvedHas));
const gate2 = gateWall(38, () => [5, 6, 7, 8].every(solvedHas) && !nightSeq);
function refreshStations() {
  const nx = nextN();
  for (const s of stations) {
    const st = solvedHas(s.p.n) ? 'done' : s.p.n === nx ? 'open' : 'locked';
    if (st === s.state) continue; s.state = st;
    const colr = st === 'done' ? '#D8B25C' : st === 'open' ? '#E9C978' : '#8A7A5E';
    s.spr.material.map = numSprite(st === 'done' ? '✓' : String(s.p.n), colr); s.spr.material.needsUpdate = true;
    s.ring.material.color.set(st === 'locked' ? '#6B5843' : '#D8B25C');
    s.beam.visible = st === 'open';
    s.spr.material.opacity = st === 'locked' ? .55 : 1;
  }
  $('count').textContent = `${state.solved.length} / 12`;
  bloodMarks.forEach(m => m.visible = solvedHas(7));
}
function phaseNow() {
  if (finale) return finale.phase;
  if (nightSeq) return 'night';
  if (solvedHas(8)) return 'day';
  if (solvedHas(7)) return 'night';
  if (solvedHas(6)) return 'dusk';
  return 'day';
}

/* =====================================================================
   MOVIMENTO E COLLISIONI
   ===================================================================== */
const P = { x: -105, z: 0, yaw: -Math.PI / 2, pitch: -.04, keys: {} };
const R = .32;
function blocked(x, z) {
  if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return true;
  for (const c of COL) { if (c.on && !c.on()) continue; if (x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R) return true; }
  return false;
}
const inHouse = () => P.x > HOUSE.x0 && P.x < HOUSE.x1 && P.z > HOUSE.z0 && P.z < HOUSE.z1;
let lastBlockToast = 0;
function blockedToast(nx, nz) {
  const now = performance.now(); if (now - lastBlockToast < 2500) return; lastBlockToast = now;
  if (Math.abs(nx - gate1.x) < 1.2 && Math.abs(nz) < 2.6 && !gate1.cond()) toast('Il passaggio verso Gosen è chiuso: risolvi gli enigmi da 1 a 4.');
  else if (Math.abs(nx - gate2.x) < 1.2 && Math.abs(nz) < 2.6 && !gate2.cond()) toast('Il passaggio verso il deserto si apre dopo l’enigma 8.');
  else if (nx > HOUSE.dx0 - .4 && nx < HOUSE.dx1 + .4 && Math.abs(nz - HOUSE.z1) < .8 && !solvedHas(7)) toast('La porta è chiusa: prima risolvi l’enigma 7.');
  else if (nx > BOUND.x1) toast('Davanti a te c’è il Mar Rosso.');
  else if (nz < NILE.z1 + .6 && nz > NILE.z0 && nx < NILE.x1) toast('È il Nilo: non si può attraversare.');
}
const anyOverlay = () => document.querySelector('.ov.open') !== null;
function stepWalk(dt) {
  const k = anyOverlay() ? {} : P.keys, pd = anyOverlay() ? {} : padState;
  let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  let s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  P.yaw += ((k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)) * dt * 1.8;
  let run = k.ShiftLeft || k.ShiftRight;
  if (pd.active && (pd.x || pd.y)) {
    // joystick analogico: in avanti/indietro si cammina, ai lati si gira e ci si sposta un poco
    f = -pd.y; s = pd.x * .25; P.yaw -= pd.x * Math.abs(pd.x) * dt * 1.6; run = false;
  }
  const speed = (run ? 9 : (pd.active ? 3.2 : 3.8)) * dt;
  const before = zoneName();
  if (f || s) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const nx = P.x + fx * f * speed + rx * s * speed, nz = P.z + fz * f * speed + rz * s * speed;
    if (!blocked(nx, nz)) { P.x = nx; P.z = nz; }
    else if (!blocked(nx, P.z)) P.x = nx;
    else if (!blocked(P.x, nz)) P.z = nz;
    else blockedToast(nx, nz);
  }
  if (before !== zoneName()) updateWhere();
  const bob = (f || s) ? Math.sin(performance.now() / 160) * .025 : 0;
  camera.position.set(P.x, heightAt(P.x, P.z) + 1.68 + bob, P.z);
  camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
}
function zoneName() {
  if (inHouse()) return 'Gosen · in casa';
  if (P.x < -30) return 'Il cantiere di Ràmses';
  if (P.x < 38) return 'Il paese di Gosen';
  if (P.x < 72) return 'Succòt';
  if (P.x < 97) return 'Ètham, ai margini del deserto';
  return 'Piairòt, presso il mare';
}
function updateWhere() { $('where').innerHTML = `Ti trovi: <b>${zoneName()}</b>`; }

addEventListener('keydown', e => {
  const tg = e.target.tagName;
  if (e.key === 'Escape') { closeTopOverlay(); return; }
  if (tg === 'INPUT' || tg === 'TEXTAREA' || anyOverlay()) return;
  P.keys[e.code] = true;
  if (e.code === 'KeyE' && nearStation && nearStation.state === 'open') openPuzzle(nearStation.p);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { P.keys[e.code] = false; });
addEventListener('blur', () => { P.keys = {}; });
const padState = { active: false, x: 0, y: 0, mag: 0 };
{
  const pad = $('pad'), knob = $('knob'); let pid = null;
  const R = () => pad.clientWidth / 2 - 14;
  const upd = e => {
    const r = pad.getBoundingClientRect(), rad = R();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > rad) { dx *= rad / d; dy *= rad / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, d / rad), dead = .12, k = m < dead ? 0 : (m - dead) / (1 - dead) / (m || 1);
    padState.x = dx / rad * k * (m ? 1 : 0); padState.y = dy / rad * k; padState.mag = m;
    pad.classList.toggle('run', m > .92);
  };
  const end = () => { pid = null; padState.active = false; padState.x = padState.y = padState.mag = 0; knob.style.transform = ''; pad.classList.remove('on', 'run'); };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pid = e.pointerId; pad.setPointerCapture(pid); padState.active = true; pad.classList.add('on'); upd(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === pid) { e.preventDefault(); upd(e); } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, e => { if (e.pointerId === pid) end(); });
  addEventListener('blur', end);
}

/* ---------- puntatore ---------- */
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); const tip = $('tip');
let down = null, hoverT = 0;
function pick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera); ray.far = 60;
  const hit = ray.intersectObjects([...personMeshes, ...(animals ? animals.meshes : []), ...stations.map(s => s.hit)], false)[0];
  if (!hit) return null;
  const u = hit.object.userData;
  if (hit.object.isInstancedMesh && u.list) return { animal: u.list[hit.instanceId], d: hit.distance };
  if (u.station) return { s: u.station, d: hit.distance };
  if (u.person) return { person: u.person, d: hit.distance };
  if (u.animal) return { animal: u.animal, d: hit.distance };
  return null;
}
canvas.addEventListener('pointerdown', e => { if (!running || finale) return; down = { x: e.clientX, y: e.clientY, yaw: P.yaw, pitch: P.pitch, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) down.moved = true;
    if (down.moved) { P.yaw = down.yaw - dx * .005; P.pitch = Math.max(-1.3, Math.min(1.3, down.pitch - dy * .005)); }
  }
  const now = performance.now();
  if (e.pointerType === 'mouse' && running && !finale && !down && now - hoverT > 110) {
    hoverT = now; const p = pick(e.clientX, e.clientY);
    if (p) {
      tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 12 + 'px';
      tip.textContent = p.person ? p.person.name : p.animal ? p.animal.name : `Enigma ${p.s.p.n} · ${p.s.p.title}`;
      canvas.style.cursor = 'pointer';
    } else { tip.style.display = 'none'; canvas.style.cursor = 'grab'; }
  }
});
canvas.addEventListener('pointerup', e => {
  if (down && !down.moved) {
    const p = pick(e.clientX, e.clientY);
    if (p && p.person) toast(`${p.person.name} · ${p.person.info}`, 4200);
    else if (p && p.animal) { p.animal.jump = 1; toast(`${p.animal.name} · ${p.animal.sound} · ${p.animal.ref}`, 2400); if (p.animal.k === 'pecora' || p.animal.k === 'capra' || p.animal.k === 'agnello') bleat(); }
    else if (p && p.s) {
      if (p.d > 6) toast(`Avvicinati alla colonna di luce dell’enigma ${p.s.p.n}.`);
      else if (p.s.state === 'open') openPuzzle(p.s.p);
      else if (p.s.state === 'locked') toast(`Prima risolvi l’enigma ${nextN()}.`);
      else toast(`Hai già risolto l’enigma ${p.s.p.n}.`, 1800);
    }
  }
  down = null;
});

let nearStation = null;
function checkNear() {
  nearStation = null;
  if (anyOverlay() || finale) { $('prompt').style.display = 'none'; $('lockmsg').style.display = 'none'; return; }
  let best = null;
  for (const s of stations) { const dist = Math.hypot(s.p.at.x - P.x, s.p.at.z - P.z); if (dist < 2.6 && (!best || dist < best.d)) best = { s, d: dist }; }
  if (best) nearStation = best.s;
  const pr = $('prompt'), lm = $('lockmsg');
  if (nearStation && nearStation.state === 'open') { pr.style.display = 'flex'; $('bExamine').textContent = `Esamina l’enigma ${nearStation.p.n}`; lm.style.display = 'none'; }
  else if (nearStation && nearStation.state === 'locked') { pr.style.display = 'none'; lm.style.display = 'block'; lm.textContent = `Enigma ${nearStation.p.n} · prima risolvi l’enigma ${nextN()}`; }
  else { pr.style.display = 'none'; lm.style.display = 'none'; }
}
$('bExamine').addEventListener('click', () => { if (nearStation && nearStation.state === 'open') openPuzzle(nearStation.p); });

/* =====================================================================
   AUDIO (sintetizzato, leggero)
   ===================================================================== */
let audioOn = true, AC = null, master = null, windGain = null, windFilter = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = audioOn ? .6 : 0; master.connect(AC.destination);
    const buf = AC.createBuffer(1, AC.sampleRate * 3, AC.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    windFilter = AC.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 420;
    windGain = AC.createGain(); windGain.gain.value = .1;
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); src.start();
  } catch (e) { AC = null; }
}
function bleat() {
  if (!AC || !audioOn) return;
  const t = AC.currentTime, o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain();
  o.type = 'sawtooth'; o.frequency.value = 420; lfo.frequency.value = 22; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.25, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + .7);
  o.connect(f); f.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + .75); lfo.stop(t + .75);
}
function windTo(gain, freq, sec) { if (!AC) return; const t = AC.currentTime; windGain.gain.setValueAtTime(windGain.gain.value, t); windFilter.frequency.setValueAtTime(windFilter.frequency.value, t); windGain.gain.linearRampToValueAtTime(gain, t + sec); windFilter.frequency.linearRampToValueAtTime(freq, t + sec); }

/* ---------- voce narrante (file in audio/voce) ---------- */
const VOICE = { el: new Audio(), queue: [], cur: null };
VOICE.el.preload = 'none';
function voicePlay(name, { queue = false } = {}) {
  if (!audioOn) return;
  if (queue && !VOICE.el.paused && !VOICE.el.ended) { VOICE.queue.push(name); return; }
  VOICE.queue.length = 0; VOICE.cur = name; VOICE.el.src = `audio/voce/${name}.mp3`;
  VOICE.el.play().catch(() => {}); listenUI();
}
function voiceStop() { VOICE.queue.length = 0; VOICE.cur = null; VOICE.el.pause(); listenUI(); }
VOICE.el.addEventListener('ended', () => { const n = VOICE.queue.shift(); if (n) { VOICE.cur = n; VOICE.el.src = `audio/voce/${n}.mp3`; VOICE.el.play().catch(() => {}); } else VOICE.cur = null; listenUI(); });
function listenUI() { const b = $('pListen'); if (!b) return; const on = !!VOICE.cur && !VOICE.el.paused; b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '■ Ferma' : '▶ Ascolta'; }
VOICE.el.addEventListener('pause', listenUI); VOICE.el.addEventListener('play', listenUI);

/* =====================================================================
   SCHERMATE
   ===================================================================== */
function openOv(id) { $(id).classList.add('open'); tip.style.display = 'none'; P.keys = {}; }
function closeOv(id) { $(id).classList.remove('open'); if (id === 'ovPuzzle') voiceStop(); canvas.focus(); }
function closeTopOverlay() { for (const id of ['ovMap', 'ovScroll', 'ovHelp', 'ovPuzzle']) if ($(id).classList.contains('open')) { if (id === 'ovHelp' && !running) return; closeOv(id); return; } }

let curP = null, curCheck = null;
function openPuzzle(p) {
  curP = p; voiceStop();
  $('pKick').textContent = `Enigma ${p.n} di 12`;
  $('pTitle').textContent = p.title; $('pPlace').textContent = p.place; $('pStory').textContent = p.story;
  $('pTag').textContent = `ENIGMA ${p.n}`; $('pRef').textContent = p.ref; $('pPrompt').textContent = p.prompt;
  $('pFb').textContent = '';
  const body = $('pBody'); body.innerHTML = ''; curCheck = p.build(body);
  const hi = state.hintIdx[p.n] || 0; const hb = $('pHint');
  if (hi > 0) { hb.style.display = 'block'; hb.innerHTML = p.hints.slice(0, hi).map((t, i) => `<b>Indizio ${i + 1}.</b> ${t}`).join('<br>'); } else { hb.style.display = 'none'; hb.innerHTML = ''; }
  $('pHintBtn').disabled = hi >= p.hints.length;
  $('pCheck').textContent = p.n === 7 ? 'Segna la porta' : p.n === 12 ? 'Stendi la mano sul mare' : 'Apri il sigillo';
  openOv('ovPuzzle');
  setTimeout(() => { const f = body.querySelector('input,button'); if (f) f.focus(); }, 50);
}
$('pClose').addEventListener('click', () => closeOv('ovPuzzle'));
$('pHintBtn').addEventListener('click', () => {
  const p = curP; const hi = state.hintIdx[p.n] || 0; if (hi >= p.hints.length) return;
  state.hintIdx[p.n] = hi + 1; state.hints++; state.penalty += 120; save();
  const hb = $('pHint'); hb.style.display = 'block';
  hb.innerHTML = p.hints.slice(0, hi + 1).map((t, i) => `<b>Indizio ${i + 1}.</b> ${t}`).join('<br>');
  $('pHintBtn').disabled = hi + 1 >= p.hints.length;
  toast('Indizio: −2 minuti', 1500); updateTimer();
});
$('pCheck').addEventListener('click', () => {
  let ok = false; try { ok = curCheck(); } catch (e) { ok = false; }
  if (!ok) { $('pFb').textContent = 'Non ancora. Rileggi il versetto e riprova.'; const s = $('sheet'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); return; }
  solve(curP);
});
const SOLVED_TITLE = { 4: 'Si apre la via per Gosen', 6: 'Scende il crepuscolo', 7: 'La porta è segnata', 8: 'È ora di partire', 11: 'Restate saldi' };
function solve(p) {
  if (!solvedHas(p.n)) state.solved.push(p.n);
  save(); closeOv('ovPuzzle'); refreshStations();
  if (p.n === 12) { startFinale(); return; }
  $('sKick').textContent = `Enigma ${p.n} risolto`;
  $('sTitle').textContent = SOLVED_TITLE[p.n] || p.title;
  $('sLetter').textContent = p.letter; $('sFrag').textContent = `Lettera ${state.solved.length} di 11 aggiunta al rotolo`;
  $('sRefl').textContent = p.reflect; $('sRef').textContent = `Vedi ${p.reflectRef}`; $('sItem').textContent = p.item;
  $('sNext').textContent = p.n === 7 ? 'Entra in casa' : p.n === 8 ? 'Attendi la mezzanotte' : 'Continua';
  openOv('ovSolved');
}
$('sNext').addEventListener('click', () => {
  closeOv('ovSolved');
  const n = state.solved[state.solved.length - 1];
  if (n === 4) toast('Il passaggio nel muro a est è aperto: entra nel paese di Gosen. L’enigma 5 è al pozzo del villaggio.', 5500);
  else if (n === 6) toast('Il sole tramonta. Raggiungi la porta della casa con il catino davanti all’ingresso.', 5000);
  else if (n === 7) toast('La porta si è aperta: entra. La famiglia ti aspetta a tavola.', 4500);
  else if (n === 8) startNight();
  else if (n === 10) toast('La colonna di nuvola guida verso il mare: raggiungi l’accampamento di Piairòt.', 5000);
  else toast(`Ora cerca la colonna di luce dell’enigma ${nextN()}.`);
});
function cap(text, ref, ms = 5200) { const c = $('caption'); c.innerHTML = `${text}<small>${ref}</small>`; c.classList.add('show'); clearTimeout(cap.t); cap.t = setTimeout(() => c.classList.remove('show'), ms); }
function startNight() {
  nightSeq = 1;
  cap('A mezzanotte Geova colpì i primogeniti d’Egitto, ma passò oltre le case segnate dal sangue.', 'Esodo 12:23, 29');
  setTimeout(() => cap('Quella stessa notte il faraone chiamò Mosè e Aronne e disse loro di andarsene con tutto il popolo.', 'Esodo 12:31, 32'), 6000);
  setTimeout(() => { nightSeq = 0; cap('Gli israeliti partirono da Ràmses verso Succòt.', 'Esodo 12:37'); toast('Il passaggio verso est è aperto. Raggiungi l’accampamento di Succòt.', 5500); }, 12000);
}

function openScroll() {
  const order = state.solved.filter(n => n <= 11).map(n => PUZZLES[n - 1]);
  const lg = $('rLetters'); lg.innerHTML = '';
  for (let i = 0; i < 11; i++) lg.append(h('div', { class: order[i] ? 'on' : '' }, order[i] ? order[i].letter : ''));
  lg.append(h('div', { class: 'seal', 'aria-label': 'Sigillo finale' }, '12'));
  $('rCount').textContent = `${order.length} di 11`;
  const it = $('rItems'); it.innerHTML = '';
  if (!order.length) it.append(h('span', { style: 'font-size:14px;color:#6B5233' }, 'Nessun oggetto ancora.'));
  for (const p of order) it.append(h('div', { class: 'item' }, h('b', {}, String(p.n)), h('div', { style: 'display:flex;flex-direction:column' }, h('span', { style: 'font-weight:600;font-size:15px' }, p.title), h('span', { style: 'font-size:13px;color:#6B5233' }, p.item))));
  $('rNotes').value = state.notes || '';
  $('rHints').textContent = `Indizi usati: ${state.hints}`; $('rPen').textContent = `Penalità: −${state.penalty / 60} min`;
  openOv('ovScroll');
}
$('rNotes').addEventListener('input', e => { state.notes = e.target.value; save(); });
$('bScroll').addEventListener('click', openScroll);
$('rClose').addEventListener('click', () => closeOv('ovScroll'));

function openMap() {
  const W = 360, H = 300, solved = new Set(state.solved), nx = nextN();
  const X = x => 14 + (x - BOUND.x0) / (BOUND.x1 - BOUND.x0) * 290, Y = z => 40 + (BOUND.z1 - z) / (BOUND.z1 - BOUND.z0) * 180;
  const colr = n => solved.has(n) ? ['#D8B25C', '#8A6E3E'] : n === nx ? ['#17110B', '#D8B25C'] : ['#6B5843', '#4A3520'];
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Mappa del cammino con lo stato degli enigmi"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#EADCBD" stroke="#8A6E3E" stroke-width="2"/>`;
  s += `<rect x="${X(BOUND.x1) + 2}" y="30" width="${W - X(BOUND.x1) - 14}" height="200" fill="#9CC0CC"/>`;
  s += `<rect x="14" y="${Y(NILE.z1)}" width="${X(NILE.x1) - 14}" height="${Y(NILE.z0) - Y(NILE.z1)}" fill="#9CC0CC"/>`;
  s += `<path d="M${X(50)} 232 l14 -14 14 14 M${X(92)} 232 l18 -20 18 20 M${X(130)} 232 l12 -12 12 12" stroke="#8A6E3E" fill="#D9C29A"/>`;
  for (const g of [gate1, gate2]) s += `<path d="M${X(g.x)} 34 V${Y(NILE.z1)}" stroke="#7A5A22" stroke-width="3" stroke-dasharray="${g.cond() ? '4 6' : '0'}"/>`;
  s += `<rect x="${X(HOUSE.x0)}" y="${Y(HOUSE.z1)}" width="${X(HOUSE.x1) - X(HOUSE.x0)}" height="${Y(HOUSE.z0) - Y(HOUSE.z1)}" fill="#C9A77A" stroke="#4A3520"/>`;
  s += `<path d="M${PUZZLES.map(p => `${X(p.at.x).toFixed(1)} ${Y(p.at.z).toFixed(1)}`).join(' L')}" fill="none" stroke="#B49A6E" stroke-width="2" stroke-dasharray="3 3"/>`;
  s += `<g font-family="Source Sans 3, sans-serif" font-size="10" font-weight="700" fill="#4A3520" letter-spacing=".5">
    <text x="${X(-95)}" y="24">RÀMSES</text><text x="${X(-12)}" y="24">GOSEN</text><text x="${X(50)}" y="24">SUCCÒT</text><text x="${X(80)}" y="24">ÈTHAM</text><text x="${X(104)}" y="24">PIAIRÒT</text>
    <text x="${X(BOUND.x1) + 8}" y="${Y(0) + 4}" fill="#24546A">MAR</text><text x="${X(BOUND.x1) + 8}" y="${Y(0) + 16}" fill="#24546A">ROSSO</text>
    <text x="20" y="${Y(NILE.z0) - 2}" fill="#24546A">NILO</text><text x="${X(92)}" y="250">MONTAGNE</text>
    <text x="14" y="${H - 26}">Ràmses → Succòt → Ètham → Piairòt → Mar Rosso</text><text x="14" y="${H - 12}" font-weight="400">Esodo 12:37; 13:20; 14:2 · distanze molto ridotte</text></g>`;
  for (const p of PUZZLES) {
    const [f, st] = colr(p.n), cx = X(p.at.x), cy = Y(p.at.z);
    s += `<circle cx="${cx}" cy="${cy}" r="10" fill="${f}" stroke="${st}" stroke-width="${p.n === nx ? 3 : 2}"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="10" fill="${solved.has(p.n) ? '#1B130B' : p.n === nx ? '#E9C978' : '#EADCBD'}">${p.n}</text>`;
  }
  s += `<circle cx="${X(P.x)}" cy="${Y(P.z)}" r="6" fill="#3D8BD9" stroke="#fff" stroke-width="2"/></svg>`;
  $('mSvg').innerHTML = s; openOv('ovMap');
}
$('bMap').addEventListener('click', openMap);
$('mClose').addEventListener('click', () => closeOv('ovMap'));

$('pListen').addEventListener('click', () => { if (VOICE.cur && !VOICE.el.paused) voiceStop(); else if (curP) voicePlay(`enigma_${String(curP.n).padStart(2, '0')}`); });
$('bAudio').addEventListener('click', () => { audioOn = !audioOn; if (!audioOn) voiceStop(); $('bAudio').setAttribute('aria-pressed', String(audioOn)); $('bAudio').setAttribute('aria-label', audioOn ? 'Audio attivo' : 'Audio disattivato'); if (master) master.gain.value = audioOn ? .6 : 0; });
$('bHelp').addEventListener('click', () => openOv('ovHelp'));
$('bHow').addEventListener('click', () => openOv('ovHelp'));
$('bHelpOk').addEventListener('click', () => closeOv('ovHelp'));
$('cNames').addEventListener('change', e => { names.visible = e.target.checked; });

/* ---------- avvio, ripresa, cronometro ---------- */
function startGame(resume) {
  if (resume) Object.assign(state, resume);
  else { Object.assign(state, { name: $('nome').value.trim(), solved: [], hints: 0, penalty: 0, elapsed: 0, untimed: false, hintIdx: {}, notes: '' }); save(); }
  closeOv('ovStart'); running = true;
  $('hud').style.display = 'flex'; $('where').style.display = 'block'; $('pad').style.display = 'block'; $('cross').style.display = 'block';
  refreshStations();
  const nx = nextN();
  const startAt = nx <= 4 ? [-105, 0] : nx <= 7 ? [-26, 0] : nx === 8 ? [18, 1.6] : [41, 0];
  [P.x, P.z] = startAt; P.yaw = nx === 8 ? 0 : -Math.PI / 2; P.pitch = -.04;
  for (const g of gates) g.open = g.cond() ? 1 : 0;
  if (solvedHas(7)) doorPivot.rotation.y = 1.6;
  applyPhase(phaseNow(), 1);
  updateWhere(); updateTimer(); audioInit();
  toast(state.solved.length ? `Bentornato${state.name ? ', ' + state.name : ''}! Prossimo enigma: ${nextN()}.` : `Benvenuto${state.name ? ', ' + state.name : ''}! Cerca la colonna di luce dell’enigma 1, accanto alla stele davanti a te.`, 5000);
}
$('bStart').addEventListener('click', () => startGame(null));
const saved = load();
if (saved && saved.solved.length && saved.solved.length < 12) { $('bResume').style.display = 'block'; $('bResume').textContent = `Riprendi la partita (${saved.solved.length} / 12)`; $('bResume').addEventListener('click', () => startGame(saved)); }

function remaining() { return LIMIT - state.elapsed - state.penalty; }
let timeWarned = false;
function updateTimer() {
  const pill = $('timerPill');
  if (state.untimed) { $('timer').textContent = `+${fmt(state.elapsed + state.penalty - LIMIT)}`; pill.classList.add('warn'); return; }
  const r = remaining(); $('timer').textContent = fmt(r); pill.classList.toggle('warn', r < 300);
  if (r <= 0 && !timeWarned && !finale) { timeWarned = true; closeTopOverlay(); openOv('ovTime'); }
}
$('bContinue').addEventListener('click', () => { state.untimed = true; save(); closeOv('ovTime'); });
const restart = () => { try { localStorage.removeItem(KEY); } catch (e) { /* facoltativo */ } location.reload(); };
$('bRestart1').addEventListener('click', restart);
$('bRestart2').addEventListener('click', restart);

/* =====================================================================
   FINALE: IL MARE SI APRE
   ===================================================================== */
const CAPS = [
  [1, 'L’angelo del vero Dio e la colonna si spostarono dietro il popolo: buia da una parte, luminosa dall’altra.', 'Esodo 14:19, 20'],
  [7, 'Mosè stese la mano sul mare. Per tutta la notte Geova lo fece indietreggiare con un forte vento orientale.', 'Esodo 14:21'],
  [14, 'Le acque si divisero e formarono un muro alla loro destra e alla loro sinistra.', 'Esodo 14:22'],
  [21, 'Gli israeliti attraversarono il mare camminando sull’asciutto.', 'Esodo 14:22, 29'],
  [29, 'Israele vide la grande potenza di Geova e ripose fede in lui.', 'Esodo 14:31'],
];
function startFinale() {
  finale = { t: 0, capI: 0, phase: 'night', ended: false, camFrom: camera.position.clone(), yaw: P.yaw };
  running = false;
  for (const id of ['hud', 'where', 'pad', 'cross', 'prompt', 'lockmsg']) $(id).style.display = 'none';
  tip.style.display = 'none'; stations.forEach(s => s.g.visible = false); names.visible = false;
  windTo(.35, 700, 6); document.body.classList.add('cine');
  if (animals) animals.recs.forEach(a => { if (a.cross) { a.ry0 = a.yaw; a.walk = false; } });
}
function stepFinale(dt) {
  const F = finale; F.t += dt; const t = F.t;
  if (F.capI < CAPS.length && t >= CAPS[F.capI][0]) { cap(CAPS[F.capI][1], CAPS[F.capI][2], 6400); voicePlay(`finale_${F.capI + 1}`, { queue: true }); F.capI++; }
  if (t > 27) F.phase = 'dawn';
  // la colonna passa dietro al popolo e diventa fuoco
  const pm = smooth(0, 6, t); pillar.position.set(118 + (96 - 118) * pm, 0, -12 + 12 * pm); fireK = t > 27 ? Math.max(0, 1 - (t - 27) / 4) : 1;
  // vento e mare
  const wk = smooth(5, 9, t) * (1 - smooth(24, 28, t));
  wind.material.opacity = .55 * wk;
  if (t > 7 && t < 8 && !F.w) { F.w = 1; windTo(.8, 1200, 3); }
  if (t > 25 && !F.w2) { F.w2 = 1; windTo(.15, 500, 4); }
  const part = smooth(8, 18, t); SEA.part(14 * part, .22 + 15 * part, t);
  placeCrowd(Math.max(0, t - 11), t > 11);
  if (animals && t > 11) for (const a of animals.recs) if (a.cross) { const [x, z, ry, mv] = walkPos(a, t - 11); a.x = x; a.z = z; a.yaw = ry; a.walk = mv; a.graze = false; animals.setInst(a, t); }
  if (raiseArm) raiseArm.rotation.x = -.3 - 2.1 * smooth(6, 8, t);
  SEA.setDry(smooth(12, 24, t));
  // camera: cinque inquadrature legate alle didascalie
  let cx = 0, n = 0; for (let i = 0; i < crowd.length; i += 3) { if (crowd[i].x > 129) { cx += crowd[i].x; n++; } }
  const front = n ? cx / n : 129, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const shot = (t0, t1, p0, p1, l0, l1) => { const k = smooth(t0, t1, t); camera.position.lerpVectors(p0, p1, k); return new THREE.Vector3().lerpVectors(l0, l1, k); };
  let look;
  if (t < 6.8) {        // 1. la colonna passa dietro al popolo (Esodo 14:19, 20)
    const fwd = V(F.camFrom.x - Math.sin(F.yaw) * 10, 1.6, F.camFrom.z - Math.cos(F.yaw) * 10);
    const k = smooth(0, 3.5, t), p = V(127, 11, -27).lerp(V(124, 12, -24), smooth(3.5, 6.8, t));
    camera.position.lerpVectors(F.camFrom, p, k); look = fwd.lerp(V(104, 7, 3), k);
  } else if (t < 13.6) { // 2. Mosè stende la mano sul mare (Esodo 14:21), visto da dietro e dal basso
    look = shot(6.8, 13.6, V(125.4, 1.5, 5.6), V(124.6, 2.1, 4.2), V(150, 3, -2), V(160, 7, 0));
  } else if (t < 20.6) { // 3. le acque formano un muro a destra e a sinistra (Esodo 14:22)
    look = shot(13.6, 20.6, V(140, 1.4, 0), V(152, 3.2, 0), V(200, 6, 0), V(215, 9, 0));
  } else if (t < 28.4) { // 4. il popolo cammina sull'asciutto, carrellata laterale
    look = shot(20.6, 28.4, V(front + 12, 2.2, 5), V(front + 9, 2.6, -4), V(front - 12, 1.6, 0), V(front - 10, 1.8, 0));
  } else {               // 5. all'alba la gru si alza su tutto il passaggio (Esodo 14:31)
    look = shot(28.4, 36, V(front - 20, 6, 0), V(front - 30, 32, 4), V(front + 20, 1, 0), V(front + 60, -4, 0));
  }
  camera.lookAt(look);
  if (t > 36 && !F.ended) {
    F.ended = true; document.body.classList.remove('cine');
    $('eTime').textContent = fmt(state.elapsed + state.penalty); $('eHints').textContent = String(state.hints);
    if (state.name) $('eText').textContent = `${state.name}, Israele vide la grande potenza di Geova e ripose fede in lui. Lo stesso Dio sostiene anche oggi chi confida in lui.`;
    openOv('ovEnd'); try { localStorage.removeItem(KEY); } catch (e) { /* facoltativo */ }
  }
}
$('bLook').addEventListener('click', () => closeOv('ovEnd'));
$('bSkip').addEventListener('click', () => { if (!finale || finale.ended) return; voiceStop(); finale.capI = CAPS.length; finale.t = Math.max(finale.t, 35.9); });
function stepWind(dt) {
  if (wind.material.opacity <= 0) return;
  const a = windGeo.attributes.position.array;
  windP.forEach((w, i) => { w.x -= w.v * dt; if (w.x < 95) w.x = 300 + Math.random() * 60; a.set([w.x, w.y, w.z, w.x + w.l, w.y + .05, w.z], i * 6); });
  windGeo.attributes.position.needsUpdate = true;
}

/* =====================================================================
   CICLO
   ===================================================================== */
function resize() { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock(); let nearCheckT = 0, saveT = 0, insideK = 0;
camera.position.set(-60, 30, 70); camera.lookAt(0, 0, 0);
const moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 32), THREE.MathUtils.degToRad(100));
let lastPhaseCheck = 0;
function loop() {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  shared.uTime.value = t;
  if (finale) stepFinale(dt);
  else if (running) {
    stepWalk(dt); state.elapsed += dt;
    if ((t * 4 | 0) !== nearCheckT) { nearCheckT = t * 4 | 0; checkNear(); updateTimer(); if (++saveT % 20 === 0) save(); }
  } else { const a = t * .025; camera.position.set(-20 + Math.sin(a) * 120, 34, Math.cos(a) * 95); camera.lookAt(0, 2, 0); }
  // luce
  if (t - lastPhaseCheck > .05) { applyPhase(phaseNow(), Math.min(1, (t - lastPhaseCheck) * .6)); lastPhaseCheck = t; }
  const inside = running && inHouse() ? 1 : 0; insideK += (inside - insideK) * Math.min(1, dt * 2.5);
  sun.intensity = L.sunI * (1 - .9 * insideK); hemi.intensity = L.hemiI * (1 - .6 * insideK);
  const lampOn = phaseNow() !== 'day' || inside ? 1 : 0;
  houseLamp.intensity += ((lampOn ? 22 + Math.sin(t * 11) * 2 + Math.sin(t * 7.3) * 1.5 : 0) - houseLamp.intensity) * Math.min(1, dt * 6);
  houseLamp.castShadow = lampOn && Math.hypot(P.x - 18, P.z) < 20; lampFlame.visible = !!lampOn; lampFlame.scale.y = .2 + Math.sin(t * 13) * .02;
  for (const f of fires) { f.scale.set(.85 + Math.sin(t * 9 + f.position.x) * .08, 1.1 + Math.sin(t * 11 + f.position.z) * .15, 1); f.material.opacity = phaseNow() === 'day' ? .55 : 1; }
  const cx = finale ? 140 : running ? P.x : 0, cz = finale ? 0 : running ? P.z : 0;
  sun.target.position.set(Math.round(cx / 4) * 4, 0, Math.round(cz / 4) * 4);
  sun.position.copy(sun.target.position).addScaledVector(L.dir, 250);
  SKY.stars.position.copy(camera.position); NIGHT.position.copy(camera.position); updatePalmLOD(); SKY.moon.position.copy(camera.position).addScaledVector(moonDir, 2600);
  tickNile(t); SEA.tick(t, dt);
  SEA.water.material.uniforms.sunDirection.value.copy(L.dir);
  SEA.water.material.uniforms.sunColor.value.copy(L.sun);
  // passaggi, porta di casa
  for (const g of gates) { g.open += ((g.cond() ? 1 : 0) - g.open) * Math.min(1, dt * 1.6); for (const l of g.leaves) l.piv.rotation.y = l.s * g.open * 1.5; }
  doorPivot.rotation.y += ((solvedHas(7) ? 1.6 : 0) - doorPivot.rotation.y) * Math.min(1, dt * 1.5);
  // colonna di nuvola / fuoco
  const showPillar = finale || solvedHas(8);
  pillar.visible = !!showPillar;
  if (pillar.visible) {
    const night = finale ? fireK : (phaseNow() === 'night' ? 1 : 0);
    for (let i = 0; i < cloudSpr.length; i++) {
      const c = cloudSpr[i], f = fireSpr[i], u = c.userData;
      c.position.y = f.position.y = u.y + Math.sin(t * .4 + u.ph) * .6;
      c.material.rotation += u.rot * dt; f.material.rotation -= u.rot * dt * 1.6;
      c.material.opacity = .8 * (1 - night); f.material.opacity = (.4 + Math.sin(t * 5 + u.ph) * .08) * night;
    }
    fireLight.intensity = 420 * (finale ? fireK : 0);
  }
  for (const s of stations) if (s.beam.visible) { s.beam.material.opacity = .18 + Math.sin(t * 3) * .08; s.spr.position.y = 2.45 + Math.sin(t * 2) * .08; }
  animatePeople(people, t);
  if (animals && !finale) for (const a of animals.recs) if (a.graze || a.jump > 0) { if (a.jump > 0) a.jump = Math.max(0, a.jump - dt * 1.7); animals.setInst(a, t); }
  for (const m of crowdMeshes) m.visible = !!(finale || solvedHas(8));
  for (const p of people) p.visible = !!finale || Math.hypot(p.position.x - camera.position.x, p.position.z - camera.position.z) < 110;
  if (animals) for (const m of animals.meshes) if (m.userData.list[0].cross) m.visible = !!(finale || solvedHas(8));
  stepWind(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
refreshStations();
loop();
const hideLoading = () => { const el = $('loading'); if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 450); } };
manager.onLoad = hideLoading; setTimeout(hideLoading, 25000);
(async () => {
  try { const assets = await loadAnimals(bgManager); animals = placeAnimals(assets, ANIM, scene); }
  catch (err) { console.error(err); toast('Alcuni modelli degli animali non si sono caricati.', 5000); hideLoading(); }
})();
