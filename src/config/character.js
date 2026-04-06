/**
 * Drop your character files in /public/assets/character and update this path.
 * Supported: .glb .gltf .fbx
 */
export const CHARACTER_MODEL_PATH = '/assets/character/character.glb';

/**
 * Animation name hints. Matching is case-insensitive and partial.
 */
export const ANIMATION_HINTS = {
  idle: ['idle'],
  walk: ['walk'],
  run: ['run', 'sprint'],
  jump: ['jump']
};
