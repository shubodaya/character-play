import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ANIMATION_HINTS, CHARACTER_MODEL_PATH } from '../config/character.js';

const CAPSULE_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.8;

export async function createPlayer(scene) {
  const container = new THREE.Group();
  container.position.set(0, 0, 0);

  let mixer = null;
  let actions = {};

  try {
    const { model, animations } = await loadCharacter(CHARACTER_MODEL_PATH);
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    fitCharacterHeight(model, PLAYER_HEIGHT);
    container.add(model);

    if (animations?.length) {
      mixer = new THREE.AnimationMixer(model);
      actions = mapActions(mixer, animations);
    }
  } catch (error) {
    // Fallback mesh keeps the prototype playable if no model is present yet.
    const fallback = new THREE.Mesh(
      new THREE.CapsuleGeometry(CAPSULE_RADIUS, PLAYER_HEIGHT - CAPSULE_RADIUS * 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9d9df })
    );
    fallback.castShadow = true;
    container.add(fallback);
    console.warn('Character asset failed to load, using fallback capsule.', error);
  }

  scene.add(container);

  return {
    group: container,
    height: PLAYER_HEIGHT,
    radius: CAPSULE_RADIUS,
    velocity: new THREE.Vector3(),
    mixer,
    actions,
    activeAction: null
  };
}

async function loadCharacter(path) {
  const ext = path.split('.').pop().toLowerCase();

  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(path);
    return { model: gltf.scene, animations: gltf.animations ?? [] };
  }

  if (ext === 'fbx') {
    const loader = new FBXLoader();
    const model = await loader.loadAsync(path);
    return { model, animations: model.animations ?? [] };
  }

  throw new Error(`Unsupported model format: ${ext}`);
}

function fitCharacterHeight(model, targetHeight) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y <= 0.0001) return;

  const scale = targetHeight / size.y;
  model.scale.setScalar(scale);

  const scaled = new THREE.Box3().setFromObject(model);
  const minY = scaled.min.y;
  model.position.y -= minY;
}

function mapActions(mixer, clips) {
  const actions = {};
  for (const [key, hints] of Object.entries(ANIMATION_HINTS)) {
    const clip = clips.find((candidate) =>
      hints.some((hint) => candidate.name.toLowerCase().includes(hint))
    );
    if (clip) {
      actions[key] = mixer.clipAction(clip);
      actions[key].enabled = true;
    }
  }
  return actions;
}

export function setPlayerAnimation(player, name) {
  if (!player.mixer || !player.actions[name]) return;
  if (player.activeAction === name) return;

  const next = player.actions[name];
  const current = player.activeAction ? player.actions[player.activeAction] : null;

  if (current) {
    current.fadeOut(0.2);
  }

  next.reset().fadeIn(0.2).play();
  player.activeAction = name;
}
