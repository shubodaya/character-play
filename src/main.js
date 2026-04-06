import * as THREE from 'three';
import { buildWorld } from './core/world.js';
import { createInput } from './core/input.js';
import { createPlayer, setPlayerAnimation } from './core/player.js';
import { createCameraRig } from './core/cameraRig.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);

const input = createInput();
const world = buildWorld(scene);
const obstacleMeshes = scene.children.filter((obj) => obj.isMesh && obj.geometry.type === 'BoxGeometry');
const player = await createPlayer(scene);
const cameraRig = createCameraRig(camera, canvas, scene);

const clock = new THREE.Clock();

const walkSpeed = 4;
const runSpeed = 7;
const jumpSpeed = 6;
const gravity = 18;

function resolveHorizontalCollisions(position, radius) {
  for (const box of world.obstacles) {
    const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);

    const deltaX = position.x - closestX;
    const deltaZ = position.z - closestZ;
    const distSq = deltaX * deltaX + deltaZ * deltaZ;

    if (distSq < radius * radius && distSq > 0.000001) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) + 0.001;
      position.x += (deltaX / dist) * push;
      position.z += (deltaZ / dist) * push;
    }
  }
}

function update() {
  const delta = Math.min(0.033, clock.getDelta());
  const yaw = cameraRig.getYaw();

  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

  const moveDir = new THREE.Vector3();
  if (input.isDown('KeyW')) moveDir.add(forward);
  if (input.isDown('KeyS')) moveDir.sub(forward);
  if (input.isDown('KeyD')) moveDir.add(right);
  if (input.isDown('KeyA')) moveDir.sub(right);

  const isMoving = moveDir.lengthSq() > 0;
  const isRunning = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

  if (isMoving) {
    moveDir.normalize();
    const speed = isRunning ? runSpeed : walkSpeed;
    player.velocity.x = moveDir.x * speed;
    player.velocity.z = moveDir.z * speed;

    const facingYaw = Math.atan2(moveDir.x, moveDir.z);
    player.group.rotation.y = THREE.MathUtils.lerp(player.group.rotation.y, facingYaw, 1 - Math.exp(-delta * 12));
  } else {
    player.velocity.x = 0;
    player.velocity.z = 0;
  }

  const isGrounded = player.group.position.y <= world.groundY + 0.0001;
  if (isGrounded && input.isDown('Space')) {
    player.velocity.y = jumpSpeed;
  }

  player.velocity.y -= gravity * delta;

  player.group.position.x += player.velocity.x * delta;
  player.group.position.z += player.velocity.z * delta;
  player.group.position.y += player.velocity.y * delta;

  resolveHorizontalCollisions(player.group.position, player.radius);

  if (player.group.position.y < world.groundY) {
    player.group.position.y = world.groundY;
    player.velocity.y = 0;
  }

  if (player.mixer) {
    const risingOrFalling = Math.abs(player.velocity.y) > 0.8 && !isGrounded;
    if (risingOrFalling && player.actions.jump) {
      setPlayerAnimation(player, 'jump');
    } else if (isMoving && isRunning && player.actions.run) {
      setPlayerAnimation(player, 'run');
    } else if (isMoving && player.actions.walk) {
      setPlayerAnimation(player, 'walk');
    } else if (player.actions.idle) {
      setPlayerAnimation(player, 'idle');
    }
    player.mixer.update(delta);
  }

  cameraRig.update(player.group.position, delta, obstacleMeshes);
  renderer.render(scene, camera);
  requestAnimationFrame(update);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

update();
