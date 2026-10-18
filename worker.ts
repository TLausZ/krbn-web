// Render-Worker: bekommt Modell-Bytes und Einstellungen, liefert ein SVG zurück.
// Wird von build.sh gebündelt und inline in index.html eingesetzt.
import { Scene, Mesh, parseSTL, parseOBJ, type MeshInput, type Camera, type Vec3 } from "./Krbn/src/index.ts";
import { knotTube, torusMesh, bumpyBlob, uvSphere, cube, gravitySheet } from "./Krbn/src/shapes.ts";
// @ts-ignore: esbuild text-loader
import bunny from "./models/stanford-bunny.obj";
// @ts-ignore: esbuild binary-loader
import bevelGear from "./models/apollo11-bevel-gear.stl";
// @ts-ignore: esbuild binary-loader
import bitcoinSign from "./models/bitcoin-sign-noto-sans.stl";

const SIZE = 3; // Diagonale nach dem Normalisieren, wie examples/importers/frame.ts

const DEMOS: Record<string, () => MeshInput> = {
  bunny: () => parseOBJ(bunny),
  bevel: () => parseSTL(bevelGear),
  bitcoin: () => parseSTL(bitcoinSign),
  knot: () => knotTube(),
  torus: () => torusMesh(1.3, 0.52, 72, 36),
  blob: () => bumpyBlob(),
  sphere: () => uvSphere(1, 48, 32),
  cube: () => cube(),
  well: () => gravitySheet(3, 72, 1.7, 0.95),
};

// Achse nach +z drehen (Determinante 1), um z spinnen, zentrieren, auf SIZE skalieren.
function normalize(mi: MeshInput, up: string, spinDeg: number): MeshInput {
  const a = (spinDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = mi.positions.map(([x, y, z]): Vec3 => {
    const p: Vec3 = up === "y" ? [x, -z, y] : up === "x" ? [-z, y, x] : [x, y, z];
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i]!, p[i]!);
    max[i] = Math.max(max[i]!, p[i]!);
  }
  const cen = min.map((v, i) => (v + max[i]!) / 2);
  const k = SIZE / (Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) || 1);
  return {
    positions: pts.map((p): Vec3 => [(p[0] - cen[0]!) * k, (p[1] - cen[1]!) * k, (p[2] - cen[2]!) * k]),
    triangles: mi.triangles,
  };
}

const sph = (azDeg: number, elDeg: number, r = 1): Vec3 => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return [r * Math.cos(el) * Math.cos(az), r * Math.cos(el) * Math.sin(az), r * Math.sin(el)];
};
const dash = (t: string) => t.split(/[\s,]+/).map(Number).filter((n) => n > 0);

// ponytail: Cache hält nur das zuletzt geparste Modell, reicht für einen Nutzer.
let cacheKey = "", cached: MeshInput | null = null;

self.onmessage = (e: MessageEvent) => {
  const { model, bytes, p } = e.data;
  const t0 = performance.now();
  try {
    const key = `${model}|${bytes?.byteLength ?? 0}|${p.up}|${p.spin}`;
    if (key !== cacheKey) {
      const raw = bytes
        ? /\.stl$/i.test(model) ? parseSTL(new Uint8Array(bytes)) : parseOBJ(new Uint8Array(bytes))
        : DEMOS[model]!();
      cached = normalize(raw, p.up, p.spin);
      cacheKey = key;
    }
    const viewport = { width: p.width, height: p.height };
    const cam: Camera = {
      eye: sph(p.camAz, p.camEl, 5.1),
      target: [0, 0, 0],
      up: [0, 0, 1],
      projection: p.projection,
      scale: p.projection === "perspective" ? 0.68 / p.zoom : 3.6 / (p.zoom * p.height),
      viewport,
    };
    const L = sph(p.lightAz, p.lightEl);
    const scene = new Scene({
      light: { direction: [-L[0], -L[1], -L[2]] },
      sample: { tolerancePx: p.tolerancePx, maxDepth: 20 },
      svg: { background: p.transparent ? null : p.background, precision: p.precision, centerline: p.centerline },
      abstraction: { minFeaturePx: p.minFeaturePx, toneLevels: p.toneLevels, consolidate: p.consolidate },
    });
    const mesh = new Mesh(cached!, {
      weldEps: SIZE * p.detail,
      creaseAngle: (p.creaseAngle * Math.PI) / 180,
      suggestive: p.suggestive ? { threshold: p.sugThreshold, fade: p.sugFade } : false,
    });
    const el = scene.add(mesh).setImportance(p.importance).style({
      weight: p.weight,
      color: p.color,
      wobble: p.wobble,
      variableWidth: p.variableWidth,
      hidden: p.hidden,
      ghostOpacity: p.ghostOpacity,
      hiddenDash: dash(p.hiddenDash),
      ...(dash(p.visibleDash).length ? { visibleDash: dash(p.visibleDash) } : {}),
      hatch: p.hatchMode === "none" ? null : {
        mode: p.hatchMode,
        angle: p.hatchAngle,
        ...(p.hatchSpacing > 0 ? { spacingPx: p.hatchSpacing } : {}),
        field: p.hatchField,
      },
      hatchWeight: p.hatchWeight,
      hatchOpacity: p.hatchOpacity,
    });
    if (p.highlight) scene.highlight(el, {
      color: p.hlColor,
      dashWhenHidden: p.hlDash,
      ...(p.hlHalo ? { halo: {} } : {}),
    });
    const svg = scene.render(cam).svg;
    // drehvorschau fuer den hauptthread: punktwolke mit hoechstens 4k punkten. unter 100 vertices
    // werden die punkte auf den dreiecksflaechen verteilt (flaechenproportional, fester seed),
    // sonst sind es die vertices selbst, ab 4k ausgeduennt
    const pts = cached!.positions, N = 4000;
    let cloud: Float32Array;
    if (pts.length < 100) {
      const tris = cached!.triangles;
      const area = tris.map((t) => {
        const [a, b, c] = [pts[t[0]!]!, pts[t[1]!]!, pts[t[2]!]!];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
      });
      const total = area.reduce((x, y) => x + y, 0);
      let seed = 1, j = 0;
      const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647); // ponytail: lehmer, reicht fuer streuung
      cloud = new Float32Array(N * 3 + tris.length * 3);
      tris.forEach((t, i) => {
        const [a, b, c] = [pts[t[0]!]!, pts[t[1]!]!, pts[t[2]!]!];
        for (let n = Math.round((N * area[i]!) / total); n > 0; n--) {
          let r1 = rnd(), r2 = rnd();
          if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
          for (let k = 0; k < 3; k++) cloud[j + k] = a[k]! + r1 * (b[k]! - a[k]!) + r2 * (c[k]! - a[k]!);
          j += 3;
        }
      });
      cloud = cloud.subarray(0, j);
    } else {
      const step = Math.ceil(pts.length / N);
      cloud = new Float32Array(Math.ceil(pts.length / step) * 3);
      for (let i = 0, j = 0; i < pts.length; i += step, j += 3) cloud.set(pts[i]!, j);
    }
    const out = cloud.slice(); // eigener puffer, subarray teilt sich sonst den grossen
    postMessage({ svg, w: p.width, h: p.height, faces: mesh.he.faceCount, ms: performance.now() - t0, cloud: out }, [out.buffer]);
  } catch (err) {
    cacheKey = "";
    postMessage({ error: String((err as Error)?.message ?? err) });
  }
};
