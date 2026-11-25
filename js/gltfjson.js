// Carica un glTF .json con buffer base64 senza usare fetch('data:…'),
// che la pagina pubblicata blocca: decodifica il buffer e costruisce un GLB in memoria.
export async function loadGltfJson(loader, url) {
  const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
  const j = await res.json();
  const b = j.buffers[0], comma = b.uri.indexOf(',');
  const bin = Uint8Array.from(atob(b.uri.slice(comma + 1)), c => c.charCodeAt(0));
  j.buffers = [{ byteLength: bin.length }];
  const pad = n => (n + 3) & ~3;
  let js = new TextEncoder().encode(JSON.stringify(j));
  const jl = pad(js.length), bl = pad(bin.length);
  const out = new Uint8Array(12 + 8 + jl + 8 + bl), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true);
  out.set(js, 20); out.fill(0x20, 20 + js.length, 20 + jl);
  const o = 20 + jl; dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004E4942, true); out.set(bin, o + 8);
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return new Promise((ok, ko) => loader.parse(out.buffer, base, ok, ko));
}
