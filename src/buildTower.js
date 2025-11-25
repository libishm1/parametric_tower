import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js";
import { palette, defaultProfile } from "./state.js";

const noiseGen = new ImprovedNoise();
const materialCache = new Map();
const textureCache = new Map();

function setInstanceMatrix(mesh, index, position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
  const m = new THREE.Matrix4();
  m.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
  mesh.setMatrixAt(index, m);
}

function makeNoiseTexture(baseColor, noiseColor, size = 256, density = 0.08) {
  const key = `${baseColor}-${noiseColor}-${size}-${density}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  const dots = Math.floor(size * size * density);
  ctx.fillStyle = noiseColor;
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.2 + 0.3;
    ctx.globalAlpha = Math.random() * 0.35;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

function getMaterial(key, params) {
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshStandardMaterial(params);
  materialCache.set(key, mat);
  return mat;
}

function createMaterials() {
  // Granite base: cool gray with subtle speckle.
  const graniteTex = makeNoiseTexture("#8e929a", "#5c6068", 256, 0.07);
  // Lime plaster: warm off-white with subtle variation.
  const plasterTex = makeNoiseTexture("#f3f1e4", "#d8d2be", 256, 0.045);
  const woodTex = makeNoiseTexture("#5a3a1f", "#2f1f12", 256, 0.05);
  const metalTex = makeNoiseTexture("#d4a33a", "#8f6a1f", 256, 0.03);
  graniteTex.repeat.set(4, 4);
  plasterTex.repeat.set(3, 3);
  woodTex.repeat.set(2, 2);
  metalTex.repeat.set(2, 2);
  return {
    stone: () =>
      getMaterial("stone", {
        color: 0x8e929a,
        map: graniteTex,
        roughness: 0.9,
        metalness: 0.03
      }),
    stoneDark: () =>
      getMaterial("stoneDark", {
        color: 0x585d66,
        map: graniteTex,
        roughness: 0.95,
        metalness: 0.02
      }),
    plaster: color =>
      getMaterial(`plaster-${color}`, {
        color,
        map: plasterTex,
        roughness: 0.75,
        metalness: 0.05
      }),
    wood: () =>
      getMaterial("wood", {
        color: 0x5a3a1f,
        map: woodTex,
        roughness: 0.8,
        metalness: 0.05
      }),
    metal: () =>
      getMaterial("metal", {
        color: 0xd7a500,
        map: metalTex,
        roughness: 0.4,
        metalness: 0.65
      }),
    bronze: () =>
      getMaterial("bronze", {
        color: 0xb8863b,
        map: metalTex,
        roughness: 0.55,
        metalness: 0.65
      })
  };
}

const materials = createMaterials();

function fractalOutline(width, depth, levels = 4, shrink = 0.8) {
  const w2 = width / 2;
  const d2 = depth / 2;
  const xs = [];
  const zs = [];
  for (let i = 0; i < levels; i++) {
    const f = Math.pow(shrink, i);
    xs.push(w2 * f);
    zs.push(d2 * f);
  }

  const pts = [];
  // start at outer top-right
  pts.push(new THREE.Vector2(xs[0], -zs[0]));
  // top edge stepping inward
  for (let i = 0; i < levels - 1; i++) {
    pts.push(new THREE.Vector2(xs[i], -zs[i + 1]));
    pts.push(new THREE.Vector2(-xs[i + 1], -zs[i + 1]));
  }
  pts.push(new THREE.Vector2(-xs[levels - 1], -zs[levels - 1]));
  // left edge
  for (let i = levels - 1; i > 0; i--) {
    pts.push(new THREE.Vector2(-xs[i], zs[i - 1]));
    pts.push(new THREE.Vector2(-xs[i - 1], zs[i - 1]));
  }
  pts.push(new THREE.Vector2(-xs[0], zs[0]));
  // bottom edge
  for (let i = 0; i < levels - 1; i++) {
    pts.push(new THREE.Vector2(xs[i + 1], zs[i]));
    pts.push(new THREE.Vector2(xs[i + 1], zs[i + 1]));
  }
  pts.push(new THREE.Vector2(xs[levels - 1], zs[levels - 1]));
  // right edge
  for (let i = levels - 1; i > 0; i--) {
    pts.push(new THREE.Vector2(xs[i], -zs[i - 1]));
    pts.push(new THREE.Vector2(xs[i - 1], -zs[i - 1]));
  }

  const unique = [];
  pts.forEach(p => {
    if (!unique.length || !p.equals(unique[unique.length - 1])) unique.push(p);
  });
  if (!unique[0].equals(unique[unique.length - 1])) unique.push(unique[0].clone());
  return unique;
}

function profileToShape(profilePoints, width, depth, fallbackSteps = 4, insetFrac = 0) {
  const pts = (profilePoints && profilePoints.length ? profilePoints : defaultProfile).map(p =>
    Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }
  );
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pts.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Choose orientation that best inscribes the target rectangle; apply a slight inset if requested.
  const effectiveW = Math.max(1e-3, width * (1 - insetFrac));
  const effectiveD = Math.max(1e-3, depth * (1 - insetFrac));
  const scaleA = { sx: effectiveW / spanX, sy: effectiveD / spanY, min: Math.min(effectiveW / spanX, effectiveD / spanY), rotated: false };
  const scaleB = { sx: effectiveW / spanY, sy: effectiveD / spanX, min: Math.min(effectiveW / spanY, effectiveD / spanX), rotated: true };
  const chosen = scaleB.min > scaleA.min ? scaleB : scaleA;

  const scaled = pts.map(p => {
    const px = p.x - cx;
    const py = p.y - cy;
    if (chosen.rotated) {
      // rotate 90deg clockwise when swapping axes
      return new THREE.Vector2(py * chosen.sx, -px * chosen.sy);
    }
    return new THREE.Vector2(px * chosen.sx, py * chosen.sy);
  });

  const unique = [];
  scaled.forEach(v => {
    if (!unique.length || !v.equals(unique[unique.length - 1])) unique.push(v);
  });
  if (unique.length && !unique[0].equals(unique[unique.length - 1])) unique.push(unique[0].clone());

  if (unique.length < 4) {
    // Fallback to previous fractal outline if the custom profile is invalid.
    const fallback = fractalOutline(width, depth, fallbackSteps, 0.82);
    return new THREE.Shape(fallback);
  }
  return new THREE.Shape(unique);
}

function noise2d(x, z) {
  // ImprovedNoise returns -1..1; normalize to 0..1
  return (noiseGen.noise(x, 0, z) + 1) * 0.5;
}

function addDoorPlanes(group, height, depth, doorHeightOffset) {
  const doorW = group.userData.baseW * 0.22;
  const doorH = height * 0.62;
  const frameW = doorW * 1.12;
  const frameH = doorH * 1.08;
  const geo = new THREE.PlaneGeometry(doorW, doorH);
  const frameGeo = new THREE.PlaneGeometry(frameW, frameH);
  const mat = materials.wood();
  const frameMat = materials.stoneDark();
  const yLocal = -height / 2 + doorH * doorHeightOffset;

  const frontFrame = new THREE.Mesh(frameGeo, frameMat);
  frontFrame.position.set(0, yLocal, depth / 2 + 0.6);
  group.add(frontFrame);

  const front = new THREE.Mesh(geo, mat);
  front.position.set(0, yLocal, depth / 2 + 0.8);
  group.add(front);

  const backFrame = new THREE.Mesh(frameGeo, frameMat);
  backFrame.rotation.y = Math.PI;
  backFrame.position.set(0, yLocal, -depth / 2 - 0.6);
  group.add(backFrame);

  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  back.position.set(0, yLocal, -depth / 2 - 0.8);
  group.add(back);
}

function addStripes(container, width, height, depth, colorHex) {
  const stripeCount = 3;
  const stripeH = 2.2;
  const mat = materials.plaster(colorHex);

  for (let i = 0; i < stripeCount; i++) {
    const y = height / 2 - (i + 1) * (height / (stripeCount + 1));

    const front = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.95, stripeH), mat);
    front.position.set(0, y, depth / 2 + 0.5);
    container.add(front);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.95, stripeH), mat);
    back.rotation.y = Math.PI;
    back.position.set(0, y, -depth / 2 - 0.5);
    container.add(back);

    const left = new THREE.Mesh(new THREE.PlaneGeometry(depth * 0.95, stripeH), mat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-width / 2 - 0.5, y, 0);
    container.add(left);

    const right = new THREE.Mesh(new THREE.PlaneGeometry(depth * 0.95, stripeH), mat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(width / 2 + 0.5, y, 0);
    container.add(right);
  }
}

function addCornice(container, width, depth, baseColor, profilePoints, steps = 4) {
  const darker = new THREE.Color(baseColor).lerp(new THREE.Color(0x000000), 0.2);
  const columnWidth = 6; // matches cylinder diameter in addColumns
  const corniceH = columnWidth * 0.5; // give thickness so it is not just a plane
  const scaleFactor = 1.14; // slightly wider to cover column tops
  const shape = profileToShape(profilePoints, width * scaleFactor, depth * scaleFactor, steps);

  const makeCorniceMesh = (height, sf = 1) => {
    const shp = profileToShape(profilePoints, width * scaleFactor * sf, depth * scaleFactor * sf, steps);
    const geo = new THREE.ExtrudeGeometry(shp, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, height / 2);
    return new THREE.Mesh(geo, materials.plaster(darker.getHex()));
  };

  const main = makeCorniceMesh(corniceH, 1);
  main.position.y = -corniceH * 0.4;
  container.add(main);

  // Secondary stepped cornice slightly inset and raised for a stepped effect.
  const secondaryH = corniceH * 0.65;
  const secondary = makeCorniceMesh(secondaryH, 0.96);
  secondary.position.y = main.position.y + corniceH * 0.8;
  container.add(secondary);
}

function addPlinth(baseW, baseD, plinthH) {
  const g = new THREE.Group();
  const stepHeights = [plinthH * 0.15, plinthH * 0.12, plinthH * 0.1];
  let yAcc = 0;

  const steps = [
    { w: 1.28, d: 1.28 },
    { w: 1.2, d: 1.2 },
    { w: 1.12, d: 1.12 }
  ];

  steps.forEach((s, idx) => {
    const h = stepHeights[idx];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(baseW * s.w, h, baseD * s.d),
      materials.stoneDark()
    );
    m.position.y = yAcc + h / 2;
    g.add(m);
    yAcc += h;
  });

  const bodyH = Math.max(plinthH - yAcc, plinthH * 0.5);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(baseW * 1.06, bodyH, baseD * 1.06),
    materials.stone()
  );
  body.position.y = yAcc + bodyH / 2;
  g.add(body);
  yAcc += bodyH;

  // add face protrusions to mimic cross/stepped outline
  const protrudeW = baseW * 0.38;
  const protrudeD = baseD * 0.08;
  const protrudeH = bodyH * 0.55;
  const protrudeY = body.position.y;
  const protrudeMat = materials.stoneDark();
  ["front", "back"].forEach((side, i) => {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(protrudeW, protrudeH, protrudeD),
      protrudeMat
    );
    p.position.set(
      0,
      protrudeY,
      (baseD * 0.53) * (i === 0 ? 1 : -1)
    );
    g.add(p);
  });
  ["left", "right"].forEach((side, i) => {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(protrudeD, protrudeH, protrudeW),
      protrudeMat
    );
    p.position.set(
      (baseW * 0.53) * (i === 0 ? -1 : 1),
      protrudeY,
      0
    );
    g.add(p);
  });

  g.userData.totalHeight = yAcc;
  return g;
}

function addNiches(container, width, height, depth) {
  const nicheCount = 2;
  const nicheW = width * 0.18;
  const nicheH = height * 0.4;
  const mat = materials.stoneDark();
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < nicheCount; i++) {
      const x = THREE.MathUtils.lerp(-width / 3, width / 3, i / Math.max(1, nicheCount - 1));
      const niche = new THREE.Mesh(new THREE.PlaneGeometry(nicheW, nicheH), mat);
      niche.position.set(x, height * 0.2, (depth / 2 + 1.1) * side);
      niche.rotation.y = side === -1 ? 0 : Math.PI;
      container.add(niche);
    }
  }
}

function addPilasters(container, width, height, depth, count, mat) {
  const geo = new THREE.BoxGeometry(6, height * 0.85, 8);
  const y = height * 0.35;
  const pilasterDepth = 8;
  const inset = Math.min(12, Math.min(width, depth) * 0.03);
  const faceOffset = Math.max(pilasterDepth / 2, depth / 2 - inset - pilasterDepth * 0.5);
  const minX = -width / 2 + 8;
  const maxX = width / 2 - 8;
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k < count; k++) {
      const x = THREE.MathUtils.lerp(minX, maxX, k / Math.max(1, count - 1));
      const pilaster = new THREE.Mesh(geo, mat);
      pilaster.position.set(x, y, faceOffset * side);
      container.add(pilaster);
    }
  }
}

function addBeadRow(container, width, depth, y, mat) {
  const beadGeo = new THREE.SphereGeometry(2.2, 8, 6);
  const count = Math.max(6, Math.floor(width / 20));
  const total = count * 2;
  const inst = new THREE.InstancedMesh(beadGeo, mat, total);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const inset = Math.min(10, Math.min(width, depth) * 0.02);
  let idx = 0;
  for (let i = 0; i < count; i++) {
    const x = THREE.MathUtils.lerp(-width / 2 + 6, width / 2 - 6, i / Math.max(1, count - 1));
    setInstanceMatrix(inst, idx++, new THREE.Vector3(x, y, depth / 2 - inset));
    setInstanceMatrix(inst, idx++, new THREE.Vector3(x, y, -depth / 2 + inset));
  }
  container.add(inst);
}

function buildStatue(scale = 1) {
  const group = new THREE.Group();
  const bodyMat = materials.plaster(0xf0c8a0);
  const baseMat = materials.stoneDark();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5 * scale, 6 * scale, 6 * scale, 8), baseMat);
  base.position.y = 3 * scale;
  group.add(base);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(6 * scale, 10, 8), bodyMat);
  torso.position.y = 12 * scale;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(4 * scale, 12, 10), bodyMat);
  head.position.y = 20 * scale;
  group.add(head);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(4 * scale, 6 * scale, 10), materials.metal());
  crown.position.y = 26 * scale;
  group.add(crown);
  return group;
}

function addStatueRow(container, width, height, depth, count) {
  const y = height * 0.15;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < count; i++) {
      const x = THREE.MathUtils.lerp(-width / 2 + 10, width / 2 - 10, i / Math.max(1, count - 1));
      const s = buildStatue(0.4);
      s.position.set(x, y, (depth / 2 + 6) * side);
      s.rotation.y = side === 1 ? Math.PI : 0;
      container.add(s);
    }
  }
}

function addMiniShrines(container, width, height, depth, protrudeFactor = 0.125, colorHex = 0xffc896) {
  const miniW = width * 0.15;
  const miniD = depth * 0.15;
  const miniH = height * 1.2;
  const shrineMat = materials.plaster(colorHex);
  const faceMat = materials.stoneDark();
  const roofMat = materials.stone();

  // target ~1/8 protruding: center sits miniW/2 - miniW/8 inside the face plane
  // Move back to previous near-face placement: 0.75 inset factor
  const protrudeX = miniW * 0.75;
  const protrudeZ = miniD * 0.75;
  const positions = [
    // left / right faces (push out along X)
    { x: -width / 2 - miniW / 2 + protrudeX, z: 0, rot: 0 },
    { x: width / 2 + miniW / 2 - protrudeX, z: 0, rot: Math.PI },
    // front / back faces (push out along Z)
    { x: 0, z: -depth / 2 - miniD / 2 + protrudeZ, rot: 0 },
    { x: 0, z: depth / 2 + miniD / 2 - protrudeZ, rot: Math.PI }
  ];

  for (const pos of positions) {
    const shrine = new THREE.Mesh(new THREE.BoxGeometry(miniW, miniH, miniD), shrineMat);
    shrine.position.set(pos.x, miniH / 2, pos.z);
    container.add(shrine);

    const door = new THREE.Mesh(new THREE.PlaneGeometry(miniW * 0.6, miniH * 0.5), faceMat);
    door.position.set(0, miniH * 0.75, miniD / 2 + 1);
    door.rotation.y = pos.rot;
    shrine.add(door);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(miniW * 1.05, 4, miniD * 1.05), roofMat);
    roof.position.y = miniH;
    shrine.add(roof);
  }
}

function addColumns(container, width, height, depth, count, colorHex) {
  const mat = materials.plaster(colorHex);
  const radius = 3;
  const geo = new THREE.CylinderGeometry(radius, radius, 18, 10);
  const y = height / 4;
  // Push columns slightly outward so they remain visible beyond cornices.
  const protrude = Math.max(2, radius * 0.8);
  const faceOffsetZ = depth / 2 + protrude;
  const faceOffsetX = width / 2 + protrude;

  const xPositions = columnPositions(width, count);
  const zPositions = columnPositions(depth, count);

  // front/back instanced
  const fbCount = xPositions.length * 2;
  const fb = new THREE.InstancedMesh(geo, mat, fbCount);
  fb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let idx = 0;
  [-1, 1].forEach(side => {
    xPositions.forEach(x => {
      const pos = new THREE.Vector3(x, y, faceOffsetZ * side);
      setInstanceMatrix(fb, idx++, pos);
    });
  });
  container.add(fb);

  // left/right instanced
  const lrCount = zPositions.length * 2;
  const lr = new THREE.InstancedMesh(geo, mat, lrCount);
  lr.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  idx = 0;
  [-1, 1].forEach(side => {
    zPositions.forEach(z => {
      const pos = new THREE.Vector3(faceOffsetX * side, y, z);
      setInstanceMatrix(lr, idx++, pos, new THREE.Euler(0, Math.PI / 2, 0));
    });
  });
  container.add(lr);
}

function miniShrineClearance(span) {
  // keep a central gap proportional to mini shrine width to frame them
  return span * 0.18;
}

function columnPositions(span, count) {
  const positions = [];
  for (let k = 0; k < count; k++) {
    const p = THREE.MathUtils.lerp(-span / 2 + 8, span / 2 - 8, k / Math.max(1, count - 1));
    if (Math.abs(p) >= miniShrineClearance(span)) {
      positions.push(p);
    }
  }
  if (positions.length === 0) {
    const edge = span * 0.35;
    positions.push(-edge, edge);
  } else if (positions.length === 1) {
    const edge = span * 0.4;
    positions.push(positions[0] > 0 ? -edge : edge);
  }
  return positions;
}

function addKalashas(container, topY, scaleX, layout = "ring", spanX = 0) {
  const r = 20 * scaleX;
  const h = 40 * scaleX;
  const positions = [];
  const count = 6;

  if (layout === "ridge") {
    const half = (spanX || r * 10) * 0.45;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = THREE.MathUtils.lerp(-half, half, t);
      positions.push(new THREE.Vector3(x, topY, 0));
    }
  } else {
    const ringRadius = r * 3.2;
    for (let i = 0; i < count; i++) {
      const theta = (Math.PI * 2 * i) / count;
      positions.push(new THREE.Vector3(Math.cos(theta) * ringRadius, topY, Math.sin(theta) * ringRadius));
    }
  }
  const mat = materials.metal();

  for (const pos of positions) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 24, 16), mat);
    sphere.position.y = r * 0.6;
    g.add(sphere);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h, 16), mat);
    cone.position.y = sphere.position.y + h / 2; // base at sphere center, apex upward
    g.add(cone);

    container.add(g);
  }

  const railCount = 14;
  const railGeo = new THREE.ConeGeometry(r * 0.25, h * 0.6, 12);
  const rail = new THREE.InstancedMesh(railGeo, mat, railCount);
  rail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < railCount; i++) {
    const f = i / (railCount - 1);
    const x = THREE.MathUtils.lerp(-r * 3.5, r * 3.5, f);
    const y = topY;
    setInstanceMatrix(rail, i, new THREE.Vector3(x, y, 0));
  }
  container.add(rail);
}

export function buildTower(state, detail = "high", beadVisible = true) {
  const group = new THREE.Group();
  group.name = "Gopuram";

  const {
    scaleX,
    scaleY,
    scaleZ,
    striations,
    noiseIntensity,
    baseScale,
    doorHeightOffset,
    columnCount,
    visibleTiers,
    profilePoints
  } = state;

  const baseW = 250 * scaleX;
  const baseD = 180 * scaleZ;
  const baseH = 100 * baseScale;
  const totalH = 720 * scaleY;
  const tiers = Math.max(1, striations);
  const tierH = (totalH - baseH) / tiers;

  const plinth = addPlinth(baseW, baseD, baseH * 0.35);
  group.add(plinth);
  // Use actual bounding height of plinth to seat the base flush.
  const plinthBox = new THREE.Box3().setFromObject(plinth);
  const plinthTop = plinthBox.max.y;
  plinth.userData.totalHeight = plinthTop;

  const base = buildProfiledPrism(baseW, baseD, baseH, materials.stone(), profilePoints, tierSteps(state));
  base.position.y = baseH / 2 + plinthTop;
  base.userData.baseW = baseW;
  group.add(base);
  addDoorPlanes(base, baseH, baseD, doorHeightOffset);

  let topY = base.position.y + baseH / 2;

  for (let i = 0; i < tiers && i < visibleTiers; i++) {
    const t = i / tiers;
    const baseTierScale = 1 - t * 0.3;
    const subStepsBase = 2 + Math.floor(noise2d(i * 0.3, 0) * 2);
    const subSteps = detail === "low" ? 1 : detail === "medium" ? Math.max(1, Math.floor(subStepsBase * 0.8)) : subStepsBase;
    const isTopRendered = i === Math.min(tiers, visibleTiers) - 1;

    for (let j = 0; j < subSteps; j++) {
      const subT = j / subSteps;
      const w = baseW * baseTierScale * (1 - subT * 0.1);
      const d = baseD * baseTierScale * (1 - subT * 0.1);
      const h = tierH / subSteps;
      const yOffset = i * tierH + j * h;
      const noiseOffset = (noise2d((i + j) * 0.3, j * 0.17) - 0.5) * (noiseIntensity * 0.5);
      const yBase = plinthTop + baseH + yOffset + noiseOffset;

    const colorHex = palette[(i + j) % palette.length];
    const layer = new THREE.Group();
    layer.position.y = yBase;

      const tierMesh = buildSteppedTier(w, d, h, colorHex, tierSteps(state), profilePoints);
      tierMesh.position.y = h / 2;
      layer.add(tierMesh);

      if (detail !== "low") {
        addPilasters(layer, w, h, d, Math.max(3, columnCount - 1), materials.plaster(colorHex));
        addNiches(layer, w, h, d);
        addStripes(layer, w, h, d, colorHex);
      }
      if (detail === "high") {
        addStatueRow(layer, w, h, d, Math.max(3, columnCount - 2));
      }
      if (!isTopRendered && detail !== "low") {
        // Match mini-shrine body to the current tier color for cohesive striations.
        addMiniShrines(layer, w, h, d, state.shrineProtrude ?? 0.125, colorHex);
      }
      if (detail !== "low") {
        // Keep full column count in medium/high LOD so columns remain visible.
        addColumns(layer, w, h, d, columnCount, colorHex);
      }
      // Always draw cornices, even for medium/low LOD.
      addCornice(layer, w, d, colorHex, profilePoints, tierSteps(state));
      if (detail === "high" && state.beadEnabled && beadVisible) {
        addBeadRow(layer, w, d, h * 0.05, materials.stoneDark());
      }

      group.add(layer);
      topY = Math.max(topY, yBase + h);
    }
  }

  addKalashas(group, topY, scaleX);
  return group;
}

function tierSteps(state) {
  return 4;
}

function buildProfiledPrism(width, depth, height, material, profilePoints, steps = 4) {
  const shape = profileToShape(profilePoints, width, depth, steps, 0.02);
  const extrudeSettings = { depth: height, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(-Math.PI / 2);
  // Center geometry vertically so bottom sits at -height/2 and top at +height/2.
  geo.translate(0, -height / 2, 0);
  return new THREE.Mesh(geo, material);
}

function buildSteppedTier(width, depth, height, colorHex, steps, profilePoints) {
  const shape = profileToShape(profilePoints, width, depth, steps, 0.02);
  const extrudeSettings = { depth: height, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(-Math.PI / 2);
  // Center vertically so placement is consistent with base.
  geo.translate(0, -height / 2, 0);
  return new THREE.Mesh(geo, materials.plaster(colorHex));
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createCamera(container) {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
  camera.position.set(700, 450, 900);
  return camera;
}

export function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.target.set(0, 200, 0);
  return controls;
}
