import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildProceduralRig, createProceduralRigDriver } from "./procedural-rig.js";
import {
  CAMERA_DISTANCE,
  CAMERA_FOLLOW,
  GRAVITY,
  JUMP_SPEED,
  LOOK_SENSITIVITY,
  PLAYER_HEIGHT,
  RUN_SPEED,
  WALK_SPEED,
  WORLD_LIMIT,
  buildBattlefield,
  dampAngle,
  dampFactor,
  disposeMaterial,
  resolveCollisionsOnAxis,
  summarizeClips,
} from "./shared.js";

const ASSET_URL = new URL("../../cyberpunk_character.glb", import.meta.url).href;

export function createCharacterControllerPrototype({
  assetText,
  container,
  errorText,
  prompt,
  stateText,
  statusText,
}) {
  let disposed = false;
  let currentState = "loading";
  let bobTime = 0;
  let proceduralRig = null;

  const setState = (nextState) => {
    currentState = nextState;
    stateText.textContent = nextState;
  };

  const setStatus = (message) => {
    statusText.textContent = message;
  };

  const setPointerLocked = (locked) => {
    prompt.hidden = locked;

    if (currentState !== "loading") {
      setStatus(
        locked
          ? "Mouse captured. Press Esc to release."
          : "Click the battlefield to capture the mouse.",
      );
    }
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x92a5ad);
  scene.fog = new THREE.FogExp2(0x92a5ad, 0.02);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    160,
  );
  camera.position.set(0, 3.4, 7.5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x4a3828, 2.1));

  const sunlight = new THREE.DirectionalLight(0xfff4d6, 2.2);
  sunlight.position.set(16, 24, 10);
  sunlight.castShadow = true;
  sunlight.shadow.bias = -0.00015;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -36;
  sunlight.shadow.camera.right = 36;
  sunlight.shadow.camera.top = 36;
  sunlight.shadow.camera.bottom = -36;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 72;
  scene.add(sunlight);

  const fillLight = new THREE.PointLight(0x8fd3ff, 60, 28, 2.3);
  fillLight.position.set(-8, 4.5, 9);
  scene.add(fillLight);

  const obstacleColliders = buildBattlefield(scene);
  const cameraBlockers = obstacleColliders.map((collider) => collider.mesh);

  const playerRoot = new THREE.Group();
  const visualRoot = new THREE.Group();
  const modelMount = new THREE.Group();
  scene.add(playerRoot);
  playerRoot.add(visualRoot);
  visualRoot.add(modelMount);

  const placeholder = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.386, PLAYER_HEIGHT - 0.84, 6, 12),
    new THREE.MeshStandardMaterial({
      color: 0x56d7ff,
      emissive: 0x08222e,
      emissiveIntensity: 0.75,
      metalness: 0.35,
      opacity: 0.7,
      roughness: 0.25,
      transparent: true,
    }),
  );
  placeholder.castShadow = true;
  placeholder.receiveShadow = true;
  placeholder.position.y = PLAYER_HEIGHT * 0.5;
  modelMount.add(placeholder);

  const player = {
    grounded: true,
    jumpQueued: false,
    pitch: -0.26,
    position: new THREE.Vector3(0, 0, 10),
    velocity: new THREE.Vector3(),
    yaw: 0,
  };

  playerRoot.position.copy(player.position);

  const keys = new Set();
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const focusPoint = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3();
  const rigDriver = createProceduralRigDriver();

  const getMinimumPitch = () => {
    const focusHeight = player.position.y + PLAYER_HEIGHT * 0.82 + 0.7;
    const minimumCameraHeight = 0.9;
    const heightRatio = THREE.MathUtils.clamp(
      (minimumCameraHeight - focusHeight) / CAMERA_DISTANCE,
      -0.98,
      0.2,
    );

    return Math.asin(heightRatio);
  };

  const loader = new GLTFLoader();

  loader.load(
    ASSET_URL,
    (gltf) => {
      if (disposed) {
        return;
      }

      const model = gltf.scene;

      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      });

      model.updateWorldMatrix(true, true);

      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = size.y > 0 ? PLAYER_HEIGHT / size.y : 1;
      model.scale.setScalar(scale);
      model.updateWorldMatrix(true, true);

      const scaledBounds = new THREE.Box3().setFromObject(model);
      const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
      model.position.set(-scaledCenter.x, -scaledBounds.min.y, -scaledCenter.z);
      model.rotation.y = Math.PI;
      model.updateWorldMatrix(true, true);

      modelMount.add(model);
      placeholder.visible = false;
      proceduralRig = buildProceduralRig(model);

      assetText.textContent =
        `Asset: cyberpunk_character.glb | Clips: ${summarizeClips(gltf.animations)} | ` +
        "Locomotion: procedural rig drive";
      errorText.hidden = true;
      setStatus("Click the battlefield to capture the mouse.");
      setState("idle");
    },
    (progress) => {
      if (disposed) {
        return;
      }

      const percentage =
        progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : null;

      setStatus(
        percentage === null
          ? "Loading character..."
          : `Loading character ${percentage}%...`,
      );
    },
    () => {
      if (disposed) {
        return;
      }

      assetText.textContent = "Asset: cyberpunk_character.glb | Clips: load failed";
      errorText.hidden = false;
      errorText.textContent =
        "The GLB could not be loaded, so the prototype kept the capsule placeholder.";
      setStatus("Click the battlefield to capture the mouse.");
      setState("idle");
    },
  );

  const handlePointerLockChange = () => {
    const locked =
      document.pointerLockElement === container ||
      document.pointerLockElement === renderer.domElement;

    setPointerLocked(locked);
  };

  const handlePointerLockRequest = () => {
    if (disposed || document.pointerLockElement) {
      return;
    }

    container.requestPointerLock?.();
  };

  const handleMouseMove = (event) => {
    const locked =
      document.pointerLockElement === container ||
      document.pointerLockElement === renderer.domElement;

    if (!locked) {
      return;
    }

    player.yaw -= event.movementX * LOOK_SENSITIVITY;
    player.pitch = THREE.MathUtils.clamp(
      player.pitch - event.movementY * LOOK_SENSITIVITY,
      getMinimumPitch(),
      0.45,
    );
  };

  const handleKeyDown = (event) => {
    if (
      event.code === "Space" ||
      event.code.startsWith("Arrow") ||
      event.code.startsWith("Key")
    ) {
      event.preventDefault();
    }

    keys.add(event.code);

    if (event.code === "Space" && !event.repeat) {
      player.jumpQueued = true;
    }
  };

  const handleKeyUp = (event) => {
    keys.delete(event.code);

    if (event.code === "Space") {
      player.jumpQueued = false;
    }
  };

  const handleBlur = () => {
    keys.clear();
    player.jumpQueued = false;
  };

  const resizeObserver = new ResizeObserver(() => {
    if (disposed) {
      return;
    }

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  resizeObserver.observe(container);
  container.addEventListener("click", handlePointerLockRequest);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);

  renderer.setAnimationLoop(() => {
    if (disposed) {
      return;
    }

    const delta = Math.min(clock.getDelta(), 0.05);
    const wantsRun = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const inputX = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const inputZ = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));

    player.pitch = THREE.MathUtils.clamp(player.pitch, getMinimumPitch(), 0.45);

    desiredVelocity.set(0, 0, 0);

    if (inputX !== 0 || inputZ !== 0) {
      forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      desiredVelocity.addScaledVector(forward, inputZ);
      desiredVelocity.addScaledVector(right, inputX);
      desiredVelocity.normalize().multiplyScalar(wantsRun ? RUN_SPEED : WALK_SPEED);
    }

    const horizontalSmoothing = player.grounded ? 16 : 4.5;
    player.velocity.x = THREE.MathUtils.damp(
      player.velocity.x,
      desiredVelocity.x,
      horizontalSmoothing,
      delta,
    );
    player.velocity.z = THREE.MathUtils.damp(
      player.velocity.z,
      desiredVelocity.z,
      horizontalSmoothing,
      delta,
    );

    if (player.grounded) {
      player.velocity.y = Math.max(player.velocity.y, 0);

      if (player.jumpQueued) {
        player.velocity.y = JUMP_SPEED;
        player.grounded = false;
        player.jumpQueued = false;
      }
    }

    if (!player.grounded) {
      player.velocity.y -= GRAVITY * delta;
    }

    const previousX = player.position.x;
    player.position.x += player.velocity.x * delta;

    if (
      resolveCollisionsOnAxis("x", player.position, previousX, player.position.y, obstacleColliders)
    ) {
      player.velocity.x = 0;
    }

    const previousZ = player.position.z;
    player.position.z += player.velocity.z * delta;

    if (
      resolveCollisionsOnAxis("z", player.position, previousZ, player.position.y, obstacleColliders)
    ) {
      player.velocity.z = 0;
    }

    player.position.x = THREE.MathUtils.clamp(player.position.x, -WORLD_LIMIT, WORLD_LIMIT);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -WORLD_LIMIT, WORLD_LIMIT);
    player.position.y += player.velocity.y * delta;

    if (player.position.y <= 0) {
      player.position.y = 0;
      player.velocity.y = Math.max(player.velocity.y, 0);
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);

    if (!player.grounded) {
      setState("jump");
    } else if (horizontalSpeed > WALK_SPEED + 0.35) {
      setState("run");
    } else if (horizontalSpeed > 0.3) {
      setState("walk");
    } else {
      setState("idle");
    }

    if (horizontalSpeed > 0.1) {
      const facingAngle = Math.atan2(player.velocity.x, player.velocity.z);
      visualRoot.rotation.y = dampAngle(visualRoot.rotation.y, facingAngle, 14, delta);
    }

    bobTime += delta * (horizontalSpeed > WALK_SPEED ? 11 : 8);

    if (!player.grounded) {
      modelMount.position.y = THREE.MathUtils.damp(modelMount.position.y, 0.12, 8, delta);
      modelMount.rotation.x = THREE.MathUtils.damp(modelMount.rotation.x, -0.22, 10, delta);
      modelMount.rotation.z = THREE.MathUtils.damp(modelMount.rotation.z, 0, 10, delta);
    } else if (horizontalSpeed > 0.3) {
      const bobAmount = horizontalSpeed > WALK_SPEED ? 0.075 : 0.05;
      modelMount.position.y = THREE.MathUtils.damp(
        modelMount.position.y,
        Math.sin(bobTime) * bobAmount,
        10,
        delta,
      );
      modelMount.rotation.x = THREE.MathUtils.damp(modelMount.rotation.x, 0.06, 10, delta);
      modelMount.rotation.z = THREE.MathUtils.damp(
        modelMount.rotation.z,
        Math.sin(bobTime) * bobAmount * 0.7,
        10,
        delta,
      );
    } else {
      modelMount.position.y = THREE.MathUtils.damp(modelMount.position.y, 0, 8, delta);
      modelMount.rotation.x = THREE.MathUtils.damp(modelMount.rotation.x, 0, 8, delta);
      modelMount.rotation.z = THREE.MathUtils.damp(modelMount.rotation.z, 0, 8, delta);
    }

    playerRoot.position.copy(player.position);
    focusPoint.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.82, player.position.z);

    desiredCameraPosition.set(
      focusPoint.x + Math.sin(player.yaw) * Math.cos(player.pitch) * CAMERA_DISTANCE,
      focusPoint.y + 0.7 + Math.sin(player.pitch) * CAMERA_DISTANCE,
      focusPoint.z + Math.cos(player.yaw) * Math.cos(player.pitch) * CAMERA_DISTANCE,
    );

    desiredCameraPosition.y = Math.max(0.9, desiredCameraPosition.y);
    cameraDirection.copy(desiredCameraPosition).sub(focusPoint);
    const cameraDistance = cameraDirection.length();

    if (cameraDistance > 0) {
      cameraDirection.normalize();
      raycaster.set(focusPoint, cameraDirection);
      const hits = raycaster.intersectObjects(cameraBlockers, false);

      if (hits.length > 0 && hits[0].distance < cameraDistance) {
        desiredCameraPosition.copy(focusPoint).addScaledVector(
          cameraDirection,
          Math.max(0.85, hits[0].distance - 0.25),
        );
      }
    }

    camera.position.lerp(desiredCameraPosition, dampFactor(CAMERA_FOLLOW, delta));
    camera.lookAt(focusPoint);

    rigDriver.update(proceduralRig, player, horizontalSpeed, delta);
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      container.removeEventListener("click", handlePointerLockRequest);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);

      if (
        document.pointerLockElement === container ||
        document.pointerLockElement === renderer.domElement
      ) {
        document.exitPointerLock();
      }

      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        object.geometry.dispose();

        if (Array.isArray(object.material)) {
          object.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(object.material);
        }
      });

      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
