import * as THREE from "three";
import { GUI } from "lil-gui";
import {
  buildTower,
  createRenderer,
  createCamera,
  createControls
} from "./buildTower.js";
import { defaultState, ranges, clampState } from "./state.js";

const container = document.body;
const renderer = createRenderer(container);
renderer.setClearColor(0x1f2329, 1);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";

const camera = createCamera(container);
camera.position.set(700, 500, 900);
const controls = createControls(camera, renderer.domElement);
controls.target.set(0, 200, 0);
controls.update();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c2f36);

const ambient = new THREE.AmbientLight(0x999999);
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(-300, 500, -400);
scene.add(ambient, dir);

const ground = new THREE.GridHelper(2000, 40, 0x444444, 0x555555);
ground.position.y = -2;
scene.add(ground);

const axes = new THREE.AxesHelper(200);
axes.position.y = 0;
scene.add(axes);

const overlay = document.getElementById("overlay");
if (overlay) overlay.textContent = "Scene initializing...";

let state = { ...defaultState };
let tower = null;
rebuild(true);

const gui = new GUI();
for (const [key, cfg] of Object.entries(ranges)) {
  gui
    .add(state, key, cfg.min, cfg.max, cfg.step)
    .name(key)
    .onChange(() => rebuild());
}

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

function rebuild(initial = false) {
  state = clampState(state);
  if (tower) {
    scene.remove(tower);
    disposeObject(tower);
  }
  try {
    tower = buildTower(state);
    scene.add(tower);
    fitView(tower);
    if (overlay) overlay.textContent = initial ? "Scene loaded" : "Scene updated";
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
}

renderer.setAnimationLoop(() => {
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
