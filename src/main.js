import * as THREE from "three";
import { GUI } from "lil-gui";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import {
  buildTower,
  createRenderer,
  createCamera,
  createControls
} from "./buildTower.js";
import { defaultState, ranges, clampState, defaultProfile, cloneProfile } from "./state.js";

const textureCache = new Map();
const profileModel = {
  text: pointsToString(cloneProfile(defaultProfile)),
  reset() {
    state.profilePoints = cloneProfile(defaultProfile);
    profileModel.text = pointsToString(state.profilePoints);
    if (profileTextarea) profileTextarea.value = profileModel.text;
    updateProfilePlot(state.profilePoints);
    scheduleRebuild();
  }
};
const container = document.body;
const renderer = createRenderer(container);
renderer.setClearColor(0x1f2329, 1);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = createCamera(container);
camera.position.set(700, 500, 900);
const controls = createControls(camera, renderer.domElement);
controls.target.set(0, 200, 0);
controls.update();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c2f36);

const lightRig = new THREE.Group();
scene.add(lightRig);

const ground = makeGround();
scene.add(ground);

const axes = new THREE.AxesHelper(200);
axes.position.y = 0;
scene.add(axes);

const overlay = document.getElementById("overlay");
if (overlay) overlay.textContent = "Scene initializing...";

const autoRotate = { enabled: false, speed: 0.4 };
const clock = new THREE.Clock();

let state = { ...defaultState, profilePoints: cloneProfile(defaultProfile) };
let temple = null;
let hasFittedView = false;
let lastBounds = null;
const sceneMode = { mode: "Day" };
let rebuildTimer = null;
let lastDetailKey = null;
let lastCamCheck = { pos: new THREE.Vector3(), time: 0 };
let profileCanvas = null;
let profileTextarea = null;
rebuild({ fit: true, camPos: camera.position });
loadHDR();

const gui = new GUI();
for (const [key, cfg] of Object.entries(ranges)) {
  if (key === "lodNear" || key === "lodFar") continue;
  gui
    .add(state, key, cfg.min, cfg.max, cfg.step)
    .name(key)
    .onChange(() => scheduleRebuild());
}
const advanced = gui.addFolder("Advanced");
advanced
  .add(state, "lodNear", ranges.lodNear.min, ranges.lodNear.max, ranges.lodNear.step)
  .name("LOD near")
  .onChange(() => {
    if (state.lodNear >= state.lodFar) state.lodFar = Math.min(ranges.lodFar.max, state.lodNear + 100);
    scheduleRebuild();
  });
advanced
  .add(state, "lodFar", ranges.lodFar.min, ranges.lodFar.max, ranges.lodFar.step)
  .name("LOD far")
  .onChange(() => {
    if (state.lodFar <= state.lodNear) state.lodNear = Math.max(ranges.lodNear.min, state.lodFar - 100);
    scheduleRebuild();
  });
advanced
  .add(state, "beadEnabled", ranges.beadEnabled.min, ranges.beadEnabled.max, ranges.beadEnabled.step)
  .name("Beads")
  .onChange(() => scheduleRebuild());
advanced
  .add(state, "beadDistance", ranges.beadDistance.min, ranges.beadDistance.max, ranges.beadDistance.step)
  .name("Beads max dist")
  .onChange(() => scheduleRebuild());

gui.add({ refit: () => rebuild({ fit: true }) }, "refit").name("Refit view");
gui
  .add(sceneMode, "mode", ["Day", "Dusk"])
  .name("Scene")
  .onChange(() => applyLighting());
gui.add(autoRotate, "enabled").name("Auto rotate");
gui.add(autoRotate, "speed", 0.05, 2, 0.05).name("Rotate speed");

const profileFolder = gui.addFolder("Profile");
profileFolder.add(profileModel, "reset").name("Reset profile");
appendProfileEditor(profileFolder);
// Keep non-essential controls hidden until toggled open.
advanced.close();
profileFolder.close();
gui.close();

function disposeObject(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => mat.dispose && mat.dispose());
      } else if (child.material.dispose) {
        child.material.dispose();
      }
    }
  });
}

function rebuild(options = { fit: false, camPos: null }) {
  const next = clampState(state);
  Object.assign(state, next);
  if (temple) {
    scene.remove(temple);
    disposeObject(temple);
  }
  try {
    const camPos = options.camPos ? options.camPos.clone() : camera.position.clone();
    temple = buildTempleComplex(state, camPos);
    temple.rotation.y = 0;
    scene.add(temple);
    if (options.fit || !hasFittedView) {
      fitView(temple);
      hasFittedView = true;
    }
    if (options.fit || !lastBounds) {
      const b = new THREE.Box3().setFromObject(temple);
      lastBounds = b;
    }
    lastDetailKey = computeDetailSignature(camPos);
    applyLighting();
    if (overlay) overlay.textContent = options.fit ? "Scene fitted" : "Scene updated";
  } catch (err) {
    console.error(err);
    if (overlay) overlay.textContent = `Build error: ${err.message}`;
  }
}

function scheduleRebuild() {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }
  rebuildTimer = setTimeout(() => {
    rebuild({ fit: false, camPos: camera.position });
  }, 120);
}

function onResize() {
  const { innerWidth, innerHeight } = window;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onResize);

function fitView(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  lastBounds = box.clone();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  // Default framing similar to reference view
  const dist = (maxDim * 1.4) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

  const offset = new THREE.Vector3(1.4, 0.6, 1.0).normalize().multiplyScalar(dist);
  camera.position.copy(center).add(offset);
  controls.target.copy(center);
  controls.update();

  camera.near = Math.max(1, dist * 0.01);
  camera.far = dist * 10;
  camera.updateProjectionMatrix();

  applyLighting();
}

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (autoRotate.enabled && temple) {
    temple.rotation.y += autoRotate.speed * dt;
  }
  maybeUpdateDetail();
  controls.update();
  renderer.render(scene, camera);
});

if (overlay) overlay.textContent = "Scene loaded";

window.addEventListener("error", evt => {
  if (overlay) overlay.textContent = `Error: ${evt.message}`;
});

window.addEventListener("unhandledrejection", evt => {
  if (overlay) overlay.textContent = `Promise error: ${evt.reason}`;
});

function applyLighting() {
  lightRig.clear();
  const bounds = lastBounds;
  const size = bounds ? bounds.getSize(new THREE.Vector3()) : new THREE.Vector3(500, 500, 500);
  const center = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const key = new THREE.DirectionalLight(
    sceneMode.mode === "Day" ? 0xfff2d8 : 0xffb070,
    sceneMode.mode === "Day" ? 1.0 : 0.65
  );
  key.position.set(center.x - size.x, center.y + size.y * 1.4, center.z - size.z);
  key.castShadow = false;

  const fill = new THREE.DirectionalLight(0xcfd8ff, sceneMode.mode === "Day" ? 0.35 : 0.2);
  fill.position.set(center.x + size.x, center.y + size.y * 1.2, center.z + size.z * 0.6);

  const rim = new THREE.DirectionalLight(0x88aaff, sceneMode.mode === "Day" ? 0.25 : 0.4);
  rim.position.set(center.x, center.y + size.y * 1.6, center.z + size.z * 1.4);

  const hemi = new THREE.HemisphereLight(
    sceneMode.mode === "Day" ? 0xaec6ff : 0x223345,
    0x1b1d22,
    sceneMode.mode === "Day" ? 0.45 : 0.3
  );

  lightRig.add(key, fill, rim, hemi);

  if (sceneMode.mode === "Dusk") {
    const lampPositions = [
      new THREE.Vector3(center.x - size.x * 0.4, center.y * 0.2, center.z + size.z * 0.65),
      new THREE.Vector3(center.x + size.x * 0.4, center.y * 0.2, center.z + size.z * 0.65),
      new THREE.Vector3(center.x - size.x * 0.4, center.y * 0.2, center.z - size.z * 0.65),
      new THREE.Vector3(center.x + size.x * 0.4, center.y * 0.2, center.z - size.z * 0.65)
    ];
    lampPositions.forEach(pos => {
      const p = new THREE.PointLight(0xffb361, 0.8, size.x * 1.2, 2);
      p.position.copy(pos);
      lightRig.add(p);
    });
  }

  if (sceneMode.mode === "Day") {
    scene.background = new THREE.Color(0x546070);
    renderer.setClearColor(0x546070, 1);
    renderer.toneMappingExposure = 1.05;
  } else {
    scene.background = new THREE.Color(0x0f131b);
    renderer.setClearColor(0x0f131b, 1);
    renderer.toneMappingExposure = 0.9;
  }
}

function makeGround() {
  const size = 4000;
  const tileTex = (() => {
    const key = "ground-tiles";
    if (textureCache.has(key)) return textureCache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#3b3f47";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 2;
    const step = 32;
    for (let i = 0; i <= 256; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    tex.anisotropy = 4;
    textureCache.set(key, tex);
    return tex;
  })();

  const mat = new THREE.MeshStandardMaterial({
    map: tileTex,
    roughness: 0.95,
    metalness: 0.0,
    color: 0x555a64
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.1;
  plane.receiveShadow = true;
  return plane;
}

function makeContextWalls() {
  const w = 2500;
  const h = 500;
  const d = 2500;
  const mat = graniteMaterial();
  const walls = new THREE.Group();
  return walls;
}

function loadHDR() {
  const hdrUrl = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr";
  const loader = new RGBELoader();
  loader.setDataType(THREE.UnsignedByteType);
  const pmrem = new THREE.PMREMGenerator(renderer);
  loader.load(
    hdrUrl,
    texture => {
      const envMap = pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      scene.environment = envMap;
      scene.background = envMap;
      if (overlay) overlay.textContent = "HDR loaded";
    },
    undefined,
    err => {
      console.error("HDR load failed", err);
      if (overlay) overlay.textContent = "HDR load failed, using flat bg";
    }
  );
}

function buildTempleComplex(state, camPos = new THREE.Vector3()) {
  const group = new THREE.Group();
  const wallThickness = state.wallThickness;
  const baseHeight = 100 * state.baseScale;
  const wallHeight = baseHeight; // walls top align with tower base height
  const wallMat = graniteMaterial();

  const baseSpan = 1500;
  const wallSpacing = state.wallSpacing;
  const innerCount = Math.max(0, Math.floor(state.innerWalls));

  // outer enclosure
  const outerSpan = baseSpan;
  group.add(buildWalls(outerSpan, wallThickness, wallHeight, wallMat, -20));
  placeTowers(group, state, outerSpan / 2 + wallThickness, 1, camPos);
  placeCentralShrine(group, state);

  // inner enclosures
  for (let i = 0; i < innerCount; i++) {
    const span = Math.max(300, outerSpan - wallSpacing * (i + 1));
    if (span <= 300) break;
    const tScale = Math.max(0.6, 1 - 0.1 * (i + 1));
    const thickness = wallThickness * Math.max(0.5, 1 - 0.08 * (i + 1));
    const height = wallHeight * Math.max(0.5, 1 - 0.08 * (i + 1));
    group.add(buildWalls(span, thickness, height, wallMat, -20));
    placeTowers(group, state, span / 2 + thickness, tScale, camPos);
  }

  // pond/tank placeholder
  const tankSpan = innerCount > 0 ? Math.max(200, outerSpan - wallSpacing * innerCount) : outerSpan * 0.5;
  const tank = new THREE.Mesh(
    new THREE.BoxGeometry(400, 20, 400),
    new THREE.MeshStandardMaterial({ color: 0x264c5a, roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.9 })
  );
  tank.position.set(-tankSpan / 3, -10, tankSpan / 3);
  group.add(tank);

  return group;
}

function buildWalls(span, thickness, height, mat, yOffset = 0) {
  // Single extruded ring for crisp corners (no overlapping “#” pattern).
  const walls = new THREE.Group();
  const outer = span / 2 + thickness;
  const inner = Math.max(1, span / 2 - thickness);

  const shape = new THREE.Shape([
    new THREE.Vector2(-outer, -outer),
    new THREE.Vector2(outer, -outer),
    new THREE.Vector2(outer, outer),
    new THREE.Vector2(-outer, outer)
  ]);
  const hole = new THREE.Path([
    new THREE.Vector2(-inner, -inner),
    new THREE.Vector2(-inner, inner),
    new THREE.Vector2(inner, inner),
    new THREE.Vector2(inner, -inner)
  ]);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  // Extend wall downward slightly more to fully close gap to plinth.
  const plinthExtra = thickness * 0.5;
  geo.translate(0, height / 2 + yOffset - plinthExtra, 0);
  const mesh = new THREE.Mesh(geo, mat);
  walls.add(mesh);

  // Add a stepped plinth beneath the wall ring.
  const stepHeights = [thickness * 0.35, thickness * 0.25, thickness * 0.2];
  let accHeight = 0;
  stepHeights.forEach((h, idx) => {
    const scale = 1 + 0.1 * (stepHeights.length - idx); // wider toward ground
    const o = outer * scale;
    const i = Math.max(1, inner * scale - thickness * 0.4);
    const stepShape = new THREE.Shape([
      new THREE.Vector2(-o, -o),
      new THREE.Vector2(o, -o),
      new THREE.Vector2(o, o),
      new THREE.Vector2(-o, o)
    ]);
    const stepHole = new THREE.Path([
      new THREE.Vector2(-i, -i),
      new THREE.Vector2(-i, i),
      new THREE.Vector2(i, i),
      new THREE.Vector2(i, -i)
    ]);
    stepShape.holes.push(stepHole);
    const stepGeo = new THREE.ExtrudeGeometry(stepShape, { depth: h, bevelEnabled: false });
    stepGeo.rotateX(-Math.PI / 2);
    // Stack steps upward from the ground reference (yOffset).
    stepGeo.translate(0, yOffset + accHeight + h / 2, 0);
    const stepMesh = new THREE.Mesh(stepGeo, mat);
    walls.add(stepMesh);
    accHeight += h;
  });
  return walls;
}

function placeTowers(group, state, offset, scale = 1, camPos = new THREE.Vector3()) {
  const towerPositions = [
    { pos: [0, 0, offset], rot: Math.PI }, // north
    { pos: [0, 0, -offset], rot: 0 }, // south
    { pos: [offset, 0, 0], rot: -Math.PI / 2 }, // east
    { pos: [-offset, 0, 0], rot: Math.PI / 2 } // west
  ];
  towerPositions.forEach(cfg => {
    const tPos = new THREE.Vector3(cfg.pos[0], 0, cfg.pos[2]);
    const dist = tPos.distanceTo(camPos);
    const detail = detailForPos(camPos, tPos, state);
    const beadVisible = state.beadEnabled && dist < state.beadDistance && detail !== "low";
    const t = buildTower(state, detail, beadVisible);
    t.scale.setScalar(scale);
    t.position.copy(tPos);
    t.rotation.y = cfg.rot;
    group.add(t);
  });
}

function makeNoiseTexture(base, noise, size = 256, density = 0.06) {
  const key = `noise-${base}-${noise}-${size}-${density}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = noise;
  const dots = Math.floor(size * size * density);
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.4 + 0.3;
    ctx.globalAlpha = Math.random() * 0.25 + 0.35;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

function graniteMaterial() {
  const tex = makeNoiseTexture("#8e929a", "#5c6068", 256, 0.07);
  tex.repeat.set(6, 6);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0x8e929a,
    roughness: 0.92,
    metalness: 0.03
  });
}

function placeCentralShrine(group, state) {
  const s = { ...state, scaleX: 0.6, scaleY: 0.6, scaleZ: 0.6, visibleTiers: Math.min(state.visibleTiers, 6) };
  const tower = buildTower(s, "medium", state.beadEnabled && state.beadDistance > 0);
  tower.position.set(0, 0, 0);
  group.add(tower);
}

function computeDetailSignature(camPos) {
  const wallThickness = state.wallThickness;
  const wallSpacing = state.wallSpacing;
  const innerCount = Math.max(0, Math.floor(state.innerWalls));
  const baseSpan = 1500;
  const sig = [];

  const outerSpan = baseSpan;
  const outerOffset = outerSpan / 2 + wallThickness;
  sig.push(...detailEntriesForOffset(outerOffset, camPos));

  for (let i = 0; i < innerCount; i++) {
    const span = Math.max(300, outerSpan - wallSpacing * (i + 1));
    if (span <= 300) break;
    const thickness = wallThickness * Math.max(0.5, 1 - 0.08 * (i + 1));
    const offset = span / 2 + thickness;
    sig.push(...detailEntriesForOffset(offset, camPos));
  }

  // central
  sig.push(detailForPos(camPos, new THREE.Vector3(0, 0, 0), state));
  return sig.join(",");
}

function detailEntriesForOffset(offset, camPos) {
  return [
    detailForPos(camPos, new THREE.Vector3(0, 0, offset), state),
    detailForPos(camPos, new THREE.Vector3(0, 0, -offset), state),
    detailForPos(camPos, new THREE.Vector3(offset, 0, 0), state),
    detailForPos(camPos, new THREE.Vector3(-offset, 0, 0), state)
  ];
}

function detailForPos(camPos, towerPos, st = state) {
  const near = Math.min(st.lodNear, st.lodFar - 50);
  const far = Math.max(st.lodFar, near + 50);
  const dist = camPos.distanceTo(towerPos);
  if (dist < near) return "high";
  if (dist < far) return "medium";
  return "low";
}

function maybeUpdateDetail() {
  const now = performance.now();
  const maxInterval = 250; // ms
  if (now - lastCamCheck.time < maxInterval) return;
  const sig = computeDetailSignature(camera.position);
  lastCamCheck.pos.copy(camera.position);
  lastCamCheck.time = now;
  if (sig !== lastDetailKey && !rebuildTimer) {
    rebuild({ fit: false, camPos: camera.position });
  }
}

function appendProfileEditor(folder) {
  const wrap = document.createElement("div");
  wrap.style.padding = "8px";
  wrap.style.background = "rgba(0,0,0,0.15)";
  wrap.style.borderRadius = "6px";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "6px";

  const label = document.createElement("div");
  label.textContent = "Profile points (x, y per line):";
  label.style.fontSize = "11px";
  wrap.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.rows = 8;
  textarea.value = profileModel.text;
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";
  textarea.style.fontSize = "11px";
  textarea.style.fontFamily = "monospace";
  profileTextarea = textarea;
  textarea.addEventListener("change", () => {
    const parsed = parseProfileText(textarea.value);
    if (parsed.length < 3) {
      textarea.value = profileModel.text;
      return;
    }
    state.profilePoints = cloneProfile(parsed);
    profileModel.text = pointsToString(parsed);
    textarea.value = profileModel.text;
    updateProfilePlot(state.profilePoints);
    scheduleRebuild();
  });
  wrap.appendChild(textarea);

  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;
  canvas.style.width = "100%";
  canvas.style.border = "1px solid rgba(255,255,255,0.1)";
  wrap.appendChild(canvas);
  profileCanvas = canvas;
  updateProfilePlot(state.profilePoints);

  folder.domElement.appendChild(wrap);
}

function parseProfileText(text) {
  const lines = text.split(/\n|;/).map(s => s.trim()).filter(Boolean);
  const pts = [];
  lines.forEach(line => {
    const parts = line.split(/[ ,\t]+/).filter(Boolean);
    if (parts.length < 2) return;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pts.push({ x, y });
    }
  });
  return pts;
}

function pointsToString(points) {
  return points.map(p => `${(p.x ?? p[0]).toFixed(6)}, ${(p.y ?? p[1]).toFixed(6)}`).join("\n");
}

function updateProfilePlot(points) {
  if (!profileCanvas) return;
  const ctx = profileCanvas.getContext("2d");
  const w = profileCanvas.width;
  const h = profileCanvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!points || points.length < 2) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x ?? p[0]);
    maxX = Math.max(maxX, p.x ?? p[0]);
    minY = Math.min(minY, p.y ?? p[1]);
    maxY = Math.max(maxY, p.y ?? p[1]);
  });
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  const scale = 0.8 * Math.min(w / spanX, h / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, -1);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, h / 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = ((p.x ?? p[0]) - cx) * scale;
    const y = ((p.y ?? p[1]) - cy) * scale;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
