// Render-Worker: bekommt Modell-Bytes und Einstellungen, liefert ein SVG zurück.
// Wird von build.sh gebündelt und inline in krbn.html eingesetzt.
import { Scene, Mesh, parseSTL, parseOBJ, type MeshInput, type Camera, type Vec3 } from "./Krbn/src/index.ts";
import { knotTube, torusMesh, bumpyBlob, uvSphere, cube, gravitySheet } from "./Krbn/src/shapes.ts";
// @ts-ignore: esbuild text-loader
import mushroom from "./Krbn/examples/importers/mushroom.obj";

const SIZE = 3; // Diagonale nach dem Normalisieren, wie examples/importers/frame.ts

const DEMOS: Record<string, () => MeshInput> = {
  mushroom: () => parseOBJ(mushroom),
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
    const el = scene.add(mesh).setRole(p.role).style({
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
    postMessage({ svg, w: p.width, h: p.height, faces: mesh.he.faceCount, ms: performance.now() - t0 });
  } catch (err) {
    cacheKey = "";
    postMessage({ error: String((err as Error)?.message ?? err) });
  }
};
