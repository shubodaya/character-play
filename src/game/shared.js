import * as THREE from "three";

export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.75;
export const WALK_SPEED = 4.25;
export const RUN_SPEED = 7.4;
export const JUMP_SPEED = 8.9;
export const GRAVITY = 26;
export const CAMERA_DISTANCE = 4.35;
export const CAMERA_FOLLOW = 12;
export const CAMERA_HEIGHT_OFFSET = 0.35;
export const CAMERA_MIN_HEIGHT = 1.2;
export const CAMERA_PITCH_MAX = 0.55;
export const CAMERA_PITCH_MIN = 0.04;
export const LOOK_SENSITIVITY = 0.0024;
export const WORLD_LIMIT = 36;

export function createObstacle(scene, position, size, color) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.15,
    roughness: 0.9,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return {
    max: new THREE.Vector3(
      position[0] + size[0] * 0.5,
      position[1] + size[1] * 0.5,
      position[2] + size[2] * 0.5,
    ),
    mesh,
    min: new THREE.Vector3(
      position[0] - size[0] * 0.5,
      position[1] - size[1] * 0.5,
      position[2] - size[2] * 0.5,
    ),
  };
}

export function buildBattlefield(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 96, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x49554d,
      roughness: 1,
    }),
  );
  ground.rotation.x = -Math.PI * 0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(10, 13.2, 48),
    new THREE.MeshBasicMaterial({
      color: 0xd7c89d,
      opacity: 0.16,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  ring.position.y = 0.01;
  ring.rotation.x = -Math.PI * 0.5;
  scene.add(ring);

  const grid = new THREE.GridHelper(96, 48, 0x5f6f7a, 0x2c3338);
  grid.position.y = 0.02;
  scene.add(grid);

  return [
    createObstacle(scene, [0, 1.2, -7], [7, 2.4, 2.2], 0x626b75),
    createObstacle(scene, [-8, 0.75, 5], [3, 1.5, 3], 0x7a6753),
    createObstacle(scene, [8, 1.4, 8], [4, 2.8, 2.4], 0x52616b),
    createObstacle(scene, [-11, 0.55, -3], [2.6, 1.1, 2.6], 0x6a7266),
    createObstacle(scene, [11, 0.45, -2], [2.2, 0.9, 2.2], 0x81624d),
    createObstacle(scene, [0, 0.6, 11], [6, 1.2, 2], 0x59645c),
    createObstacle(scene, [18.5, 1.5, 0], [1, 3, 38], 0x3a4348),
    createObstacle(scene, [-18.5, 1.5, 0], [1, 3, 38], 0x3a4348),
    createObstacle(scene, [0, 1.5, 18.5], [38, 3, 1], 0x3a4348),
    createObstacle(scene, [0, 1.5, -18.5], [38, 3, 1], 0x3a4348),
  ];
}

export function dampFactor(smoothing, delta) {
  return 1 - Math.exp(-smoothing * delta);
}

export function wrapAngle(angle) {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

export function dampAngle(current, target, smoothing, delta) {
  return current + wrapAngle(target - current) * dampFactor(smoothing, delta);
}

function getTopInset(collider, axis, inset) {
  const span = collider.max[axis] - collider.min[axis];
  return Math.min(inset, Math.max(span * 0.5 - 0.05, 0));
}

export function getTopBounds(collider, inset = PLAYER_RADIUS * 0.55) {
  const insetX = getTopInset(collider, "x", inset);
  const insetZ = getTopInset(collider, "z", inset);

  return {
    maxX: collider.max.x - insetX,
    maxZ: collider.max.z - insetZ,
    minX: collider.min.x + insetX,
    minZ: collider.min.z + insetZ,
  };
}

export function isWithinTopBounds(collider, x, z, inset = PLAYER_RADIUS * 0.55) {
  const bounds = getTopBounds(collider, inset);

  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function findGroundSupport(position, previousFeetY, velocityY, colliders) {
  const isDescending = velocityY <= 0;
  let bestSupport = null;

  for (const collider of colliders) {
    const topY = collider.max.y;

    if (!isWithinTopBounds(collider, position.x, position.z)) {
      continue;
    }

    const standingOnTop = Math.abs(position.y - topY) <= 0.12;
    const landedOnTop =
      isDescending &&
      previousFeetY >= topY - 0.04 &&
      position.y <= topY + 0.18;

    if (!standingOnTop && !landedOnTop) {
      continue;
    }

    if (!bestSupport || topY > bestSupport.height) {
      bestSupport = {
        collider,
        height: topY,
      };
    }
  }

  return bestSupport;
}

export function resolveCollisionsOnAxis(axis, position, previousValue, feetY, colliders) {
  let collision = null;
  const headY = feetY + PLAYER_HEIGHT;
  const otherAxis = axis === "x" ? "z" : "x";

  for (const collider of colliders) {
    if (headY <= collider.min.y || feetY >= collider.max.y) {
      continue;
    }

    const minOther = collider.min[otherAxis] - PLAYER_RADIUS;
    const maxOther = collider.max[otherAxis] + PLAYER_RADIUS;
    const currentOther = position[otherAxis];

    if (currentOther <= minOther || currentOther >= maxOther) {
      continue;
    }

    const minAxis = collider.min[axis] - PLAYER_RADIUS;
    const maxAxis = collider.max[axis] + PLAYER_RADIUS;
    const currentAxis = position[axis];

    if (currentAxis <= minAxis || currentAxis >= maxAxis) {
      continue;
    }

    let side = 0;

    if (previousValue <= minAxis) {
      position[axis] = minAxis;
      side = -1;
    } else if (previousValue >= maxAxis) {
      position[axis] = maxAxis;
      side = 1;
    } else {
      const pushToMin = Math.abs(previousValue - minAxis) < Math.abs(previousValue - maxAxis);
      position[axis] = pushToMin ? minAxis : maxAxis;
      side = pushToMin ? -1 : 1;
    }

    if (!collision) {
      collision = {
        axis,
        collider,
        side,
      };
    }
  }

  return collision;
}

export function summarizeClips(clips) {
  if (clips.length === 0) {
    return "none";
  }

  return clips
    .map((clip) => `${clip.name || "unnamed"} (${clip.duration.toFixed(2)}s)`)
    .join(", ");
}

export function disposeMaterial(material) {
  Object.values(material).forEach((value) => {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  });

  material.dispose();
}
