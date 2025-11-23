import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js";
import { palette } from "./state.js";

const noiseGen = new ImprovedNoise();

function getMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.6,
    metalness: 0.05,
    flatShading: true
  });
}

function noise2d(x, z) {
  // ImprovedNoise returns -1..1; normalize to 0..1
  return (noiseGen.noise(x, 0, z) + 1) * 0.5;
}

function addDoorPlanes(group, height, depth, doorHeightOffset) {
  const doorW = group.userData.baseW * 0.2;
  const doorH = height * 0.6;
  const geo = new THREE.PlaneGeometry(doorW, doorH);
  const mat = getMaterial(0x3c3c3c);
  const yLocal = -height / 2 + doorH * doorHeightOffset;

  const front = new THREE.Mesh(geo, mat);
  front.position.set(0, yLocal, depth / 2 + 0.5);
  group.add(front);

  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  back.position.set(0, yLocal, -depth / 2 - 0.5);
  group.add(back);
}

function addStripes(container, width, height, depth, colorHex) {
  const stripeCount = 3;
  const stripeH = 2;
  const mat = getMaterial(colorHex);

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

function addCornice(container, width, depth, baseColor) {
  const darker = new THREE.Color(baseColor).lerp(new THREE.Color(0x000000), 0.2);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.05, 4, depth * 1.05),
    getMaterial(darker)
  );
  mesh.position.y = -2;
  container.add(mesh);
}

function addColumns(container, width, height, depth, count, colorHex) {
  const mat = getMaterial(colorHex);
  const geo = new THREE.CylinderGeometry(3, 3, 16, 8);
  const y = height / 4;

  for (let side = -1; side <= 1; side += 2) {
    const face = new THREE.Group();
    face.position.z = (depth / 2 + 1) * side;
    face.position.y = y;
    container.add(face);
    for (let k = 0; k < count; k++) {
      const x = THREE.MathUtils.lerp(-width / 2 + 5, width / 2 - 5, k / Math.max(1, count - 1));
      const col = new THREE.Mesh(geo, mat);
      col.position.x = x;
      face.add(col);
    }
  }

  for (let side = -1; side <= 1; side += 2) {
    const face = new THREE.Group();
    face.position.x = (width / 2 + 1) * side;
    face.position.y = y;
    face.rotation.y = Math.PI / 2;
    container.add(face);
    for (let k = 0; k < count; k++) {
      const z = THREE.MathUtils.lerp(-depth / 2 + 5, depth / 2 - 5, k / Math.max(1, count - 1));
      const col = new THREE.Mesh(geo, mat);
      col.position.x = z;
      face.add(col);
    }
  }
}

function addMiniShrines(container, width, height, depth) {
  const miniW = width * 0.15;
  const miniD = depth * 0.15;
  const miniH = height * 1.2;
  const shrineMat = getMaterial(0xffc896);
  const faceMat = getMaterial(0x646464);

  const positions = [
    { x: -width / 2 + miniW / 2, z: 0, rot: 0 },
    { x: width / 2 - miniW / 2, z: 0, rot: Math.PI },
    { x: 0, z: -depth / 2 + miniD / 2, rot: 0 },
    { x: 0, z: depth / 2 - miniD / 2, rot: Math.PI }
  ];

  for (const pos of positions) {
    const shrine = new THREE.Mesh(new THREE.BoxGeometry(miniW, miniH, miniD), shrineMat);
    shrine.position.set(pos.x, miniH / 2, pos.z);
    container.add(shrine);

    const door = new THREE.Mesh(new THREE.PlaneGeometry(miniW * 0.6, miniH * 0.5), faceMat);
    door.position.set(0, miniH * 0.75, miniD / 2 + 1);
    door.rotation.y = pos.rot;
    shrine.add(door);
  }
}

function addKalashas(container, topY, scaleX) {
  const r = 20 * scaleX;
  const h = 40 * scaleX;
  const positions = [
    new THREE.Vector3(0, topY, 0),
    new THREE.Vector3(-r * 2, topY, r * 2),
    new THREE.Vector3(r * 2, topY, r * 2)
  ];
  const mat = getMaterial(0xd7a500);

  for (const pos of positions) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 24, 16), mat);
    sphere.position.y = r * 0.6;
    g.add(sphere);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h, 16), mat);
    cone.position.y = h / 2;
    cone.rotation.x = Math.PI;
    g.add(cone);

    container.add(g);
  }
}

export function buildTower(state) {
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
    visibleTiers
  } = state;

  const baseW = 250 * scaleX;
  const baseD = 180 * scaleZ;
  const baseH = 100 * baseScale;
  const totalH = 720 * scaleY;
  const tiers = Math.max(1, striations);
  const tierH = (totalH - baseH) / tiers;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, baseH, baseD),
    getMaterial(0xa0a0a0)
  );
  base.position.y = baseH / 2;
  base.userData.baseW = baseW;
  group.add(base);
  addDoorPlanes(base, baseH, baseD, doorHeightOffset);

  let topY = baseH;

  for (let i = 0; i < tiers && i < visibleTiers; i++) {
    const t = i / tiers;
    const baseTierScale = 1 - t * 0.3;
    const subSteps = 2 + Math.floor(noise2d(i * 0.3, 0) * 2);

    for (let j = 0; j < subSteps; j++) {
      const subT = j / subSteps;
      const w = baseW * baseTierScale * (1 - subT * 0.1);
      const d = baseD * baseTierScale * (1 - subT * 0.1);
      const h = tierH / subSteps;
      const yOffset = i * tierH + j * h;
      const noiseOffset = (noise2d((i + j) * 0.3, j * 0.17) - 0.5) * (noiseIntensity * 0.5);
      const yBase = baseH + yOffset + noiseOffset;

      const colorHex = palette[(i + j) % palette.length];
      const layer = new THREE.Group();
      layer.position.y = yBase;

      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMaterial(colorHex));
      box.position.y = h / 2;
      layer.add(box);

      addStripes(layer, w, h, d, colorHex);
      addMiniShrines(layer, w, h, d);
      addCornice(layer, w, d, colorHex);
      addColumns(layer, w, h, d, columnCount, colorHex);

      group.add(layer);
      topY = Math.max(topY, yBase + h);
    }
  }

  addKalashas(group, topY, scaleX);
  return group;
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
