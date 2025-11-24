<img width="1268" height="589" alt="image" src="https://github.com/user-attachments/assets/84a32a83-de3a-42d1-ba37-226c42524ab8" />
# parametric_tower

Parametric Gopuram generator rebuilt in Three.js with the original p5.js controls mirrored for 3D navigation, lighting, and material hooks. The tower is constructed from configurable tiers, cornices, columns, and kalashas with Panchavarnam-inspired palette cycling.

## Features
- Three.js scene with OrbitControls and flat-shaded materials for crisp forms.
- UI sliders (lil-gui) matching the p5.js controls: scale X/Y/Z, striations, noise intensity, base scale, door height offset, column count, visible tiers.
- Procedural stack with cornices, stripes, mini-shrines, columns, and kalasha finials; basic Perlin-style perturbation for tier offsets.
- Palette cycling that matches the original Panchavarnam colors; hooks ready for texture maps later.

## Getting Started
1) Install dependencies: `npm install`.
2) Run a static server from the project root (pick one):
   - `npx serve .`
   - `python -m http.server 8080`
3) Open `http://localhost:3000` (or the port your server prints) to interact with the generator.

## Controls
- `scaleX`, `scaleY`, `scaleZ`: overall width/height/depth scaling.
- `striations`: number of tiers (stacks).
- `noiseIntensity`: vertical perturbation intensity.
- `baseScale`: base platform height scaling.
- `doorHeightOffset`: door position along the base face (0 = top, 1 = toward bottom).
- `columnCount`: number of columns per face stripe.
- `visibleTiers`: limit how many tiers are rendered (for animation-style reveals).

acess website here ,

https://libishm1.github.io/parametric_tower/