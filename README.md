# Character Battlefield Prototype (Three.js)

Simple browser-based 3D prototype with walking, running, jumping, and free look.

## Features

- Third-person camera with smooth mouse look (pointer lock).
- Controls:
  - `W A S D` movement
  - `Shift` hold to run
  - `Space` to jump
  - Mouse to look around
- Simple battlefield-style map:
  - large ground plane
  - a few basic obstacles (box/rock style blockers)
- Basic physics feel:
  - gravity
  - ground collision
  - obstacle collision in horizontal movement
- Optional animation support (`idle`, `walk`, `run`, `jump`) if your model has matching clips.

## Project Structure

```
character-play/
├─ public/
│  └─ assets/
│     └─ character/          # put model files here
├─ src/
│  ├─ config/
│  │  └─ character.js        # model path + animation name hints
│  ├─ core/
│  │  ├─ cameraRig.js        # smooth third-person camera + clip prevention
│  │  ├─ input.js            # keyboard input
│  │  ├─ player.js           # character loading + animation setup
│  │  └─ world.js            # map / lighting / obstacles
│  ├─ main.js                # game loop + movement + collision
│  └─ styles.css
├─ index.html
└─ package.json
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add your character asset into:

```text
public/assets/character/
```

3. Update `src/config/character.js`:

```js
export const CHARACTER_MODEL_PATH = '/assets/character/character.glb';
```

Supported model types:

- `.glb` / `.gltf` (GLTFLoader)
- `.fbx` (FBXLoader)

If the model is missing or fails to load, the app uses a capsule fallback so you can still test movement and camera.

4. Run locally:

```bash
npm run dev
```

5. Open the URL shown by Vite (usually `http://localhost:5173`).

## Notes on animations

- Animation matching is name-based and case-insensitive.
- Edit `ANIMATION_HINTS` in `src/config/character.js` if your clip names differ.
