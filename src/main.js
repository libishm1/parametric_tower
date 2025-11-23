import * as THREE from "three";
import { GUI } from "lil-gui";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import {
  buildTower,
  createRenderer,
  createCamera,
  createControls
} from "./buildTower.js";
import { defaultState, ranges, clampState } from "./state.js";

const textureCache = new Map();
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

let state = { ...defaultState };
let temple = null;
let hasFittedView = false;
let lastBounds = null;
const sceneMode = { mode: "Day" };
rebuild({ fit: true });
loadHDR();

const gui = new GUI();
for (const [key, cfg] of Object.entries(ranges)) {
  gui
    .add(state, key, cfg.min, cfg.max, cfg.step)
    .name(key)
    .onChange(() => rebuild({ fit: false }));
}
gui.add({ refit: () => rebuild({ fit: true }) }, "refit").name("Refit view");
gui
  .add(sceneMode, "mode", ["Day", "Dusk"])
  .name("Scene")
  .onChange(() => applyLighting());
gui.add(autoRotate, "enabled").name("Auto rotate");
gui.add(autoRotate, "speed", 0.05, 2, 0.05).name("Rotate speed");

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

function rebuild(options = { fit: false }) {
  const next = clampState(state);
  Object.assign(state, next);
  if (temple) {
    scene.remove(temple);
    disposeObject(temple);
  }
  try {
    temple = buildTempleComplex(state);
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
    applyLighting();
    if (overlay) overlay.textContent = options.fit ? "Scene fitted" : "Scene updated";
  } catch (err) {
    console.error(err);
    if (overlay) overlay.textContent = `Build error: ${err.message}`;
  }
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
  const dist = (maxDim * 2.2) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

  const offset = new THREE.Vector3(1.8, 0.9, 1.4).normalize().multiplyScalar(dist);
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
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a4152,
    roughness: 0.9,
    metalness: 0.05
  });
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

function buildTempleComplex(state) {
  const group = new THREE.Group();
  const wallThickness = state.wallThickness;
  const wallHeight = 160;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x56524b,
    roughness: 0.9,
    metalness: 0.05
  });

  const baseSpan = 1500;
  const wallSpacing = state.wallSpacing;
  const innerCount = Math.max(0, Math.floor(state.innerWalls));

  // outer enclosure
  const outerSpan = baseSpan;
  group.add(buildWalls(outerSpan, wallThickness, wallHeight, wallMat));
  placeTowers(group, state, outerSpan / 2 + wallThickness, 1);
  placeCentralShrine(group, state);

  // inner enclosures
  for (let i = 0; i < innerCount; i++) {
    const span = Math.max(300, outerSpan - wallSpacing * (i + 1));
    if (span <= 300) break;
    const tScale = Math.max(0.6, 1 - 0.1 * (i + 1));
    const thickness = wallThickness * Math.max(0.5, 1 - 0.08 * (i + 1));
    const height = wallHeight * Math.max(0.5, 1 - 0.08 * (i + 1));
    group.add(buildWalls(span, thickness, height, wallMat));
    placeTowers(group, state, span / 2 + thickness, tScale);
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

function buildWalls(span, thickness, height, mat) {
  const walls = new THREE.Group();
  const wallX = new THREE.Mesh(new THREE.BoxGeometry(span + 2 * thickness, height, thickness), mat);
  wallX.position.set(0, height / 2, span / 2);
  walls.add(wallX);

  const wallX2 = wallX.clone();
  wallX2.position.set(0, height / 2, -span / 2);
  walls.add(wallX2);

  const wallZ = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, span + 2 * thickness), mat);
  wallZ.position.set(span / 2, height / 2, 0);
  walls.add(wallZ);

  const wallZ2 = wallZ.clone();
  wallZ2.position.set(-span / 2, height / 2, 0);
  walls.add(wallZ2);
  return walls;
}

function placeTowers(group, state, offset, scale = 1) {
  const towerPositions = [
    { pos: [0, 0, offset], rot: Math.PI }, // north
    { pos: [0, 0, -offset], rot: 0 }, // south
    { pos: [offset, 0, 0], rot: -Math.PI / 2 }, // east
    { pos: [-offset, 0, 0], rot: Math.PI / 2 } // west
  ];
  towerPositions.forEach(cfg => {
    const t = buildTower(state);
    t.scale.setScalar(scale);
    t.position.set(cfg.pos[0], 0, cfg.pos[2]);
    t.rotation.y = cfg.rot;
    group.add(t);
  });
}

function placeCentralShrine(group, state) {
  const s = { ...state, scaleX: 0.6, scaleY: 0.6, scaleZ: 0.6, visibleTiers: Math.min(state.visibleTiers, 6) };
  const tower = buildTower(s);
  tower.position.set(0, 0, 0);
  group.add(tower);
}
