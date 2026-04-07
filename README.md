# Character Play Prototype

This folder contains a standalone browser-based third-person character controller prototype built with Three.js and Vite.

## Asset inspection

Available source asset in this folder:

- `cyberpunk_character.glb`

Asset notes:

- glTF 2.0 binary with embedded textures
- skinned humanoid-style character mesh
- one embedded clip only: `A-pose (0.00s)`

Because the asset pack does not include usable locomotion clips, the prototype drives walk and run body motion procedurally on the character rig instead of relying on animation files.

## Controls

- `WASD` move
- `Shift` run
- `Space` jump
- `Mouse` look around
- `Esc` release mouse capture

### Mobile controls

- left thumbstick moves the character
- drag on the right side of the screen to look around
- hold `Run` to sprint
- tap `Jump` to jump, ledge grab, or climb

## Local setup

Install dependencies:

```bash
npm install
```

Run the prototype:

```bash
npm run dev
```

Open the local URL shown by Vite, usually:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

## CI/CD (GitHub Actions)

This repo now includes a workflow at `.github/workflows/ci-cd.yml`.

- **CI**: runs on every pull request and on pushes to `main` and `work`
- **CD**: deploys to **GitHub Pages** on pushes to `main`

### One-time GitHub setup

1. Go to **Settings → Pages** in your GitHub repo.
2. Set **Source** to **GitHub Actions**.
3. Push this branch (or merge to `main`) and the workflow will deploy automatically.

## What is implemented

- battlefield test map with ground plane and placeholder cover
- third-person camera with mouse look
- camera clamp so it does not dip below the floor
- WASD movement
- run on `Shift`
- jump on `Space`
- gravity and ground collision
- basic obstacle collision
- procedural walk and run arm/leg motion on the imported rig
