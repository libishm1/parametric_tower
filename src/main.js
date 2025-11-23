import * as THREE from "../node_modules/three/build/three.module.js";
import { GUI } from "../node_modules/lil-gui/dist/lil-gui.esm.js";
import {
  buildTower,
  createRenderer,
  createCamera,
  createControls
} from "./buildTower.js";
import { defaultState, ranges, clampState } from "./state.js";

const container = document.body;
const renderer = createRenderer(container);
const camera = createCamera(container);
const controls = createControls(camera, renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6e6e6);

const ambient = new THREE.AmbientLight(0x999999);
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(-300, 500, -400);
scene.add(ambient, dir);

const ground = new THREE.GridHelper(2000, 40, 0xcccccc, 0xdddddd);
ground.position.y = -2;
scene.add(ground);

let state = { ...defaultState };
let tower = buildTower(state);
scene.add(tower);

const gui = new GUI();
for (const [key, cfg] of Object.entries(ranges)) {
  gui
    .add(state, key, cfg.min, cfg.max, cfg.step)
    .name(key)
    .onChange(() => rebuild());
}

function disposeObject(obj) {
  obj.traverse(child => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => mat.dispose && mat.dispose());
      } else if (child.material.dispose) {
        child.material.dispose();
      }
    }
  });
}

function rebuild() {
  state = clampState(state);
  scene.remove(tower);
  disposeObject(tower);
  tower = buildTower(state);
  scene.add(tower);
}

function onResize() {
  const { innerWidth, innerHeight } = window;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onResize);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
