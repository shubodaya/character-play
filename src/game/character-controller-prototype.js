import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildProceduralRig, createProceduralRigDriver } from "./procedural-rig.js";
import {
  CAMERA_DISTANCE,
  CAMERA_FOLLOW,
  CAMERA_HEIGHT_OFFSET,
  CAMERA_MIN_HEIGHT,
  CAMERA_PITCH_MAX,
  CAMERA_PITCH_MIN,
  GRAVITY,
  JUMP_SPEED,
  LOOK_SENSITIVITY,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  RUN_SPEED,
  WALK_SPEED,
  WORLD_LIMIT,
  buildBattlefield,
  dampAngle,
  dampFactor,
  disposeMaterial,
  findGroundSupport,
  getTopBounds,
  resolveCollisionsOnAxis,
  summarizeClips,
} from "./shared.js";

const ASSET_URL = new URL("../../cyberpunk_character.glb", import.meta.url).href;
const HOP_SNAP_HEIGHT = 1.15;
const HANG_DROP_RATIO = 0.68;
const HANG_PULL_IN = PLAYER_RADIUS - 0.03;
const CLIMB_DURATION = 0.34;

export function createCharacterControllerPrototype({
  assetText,
  container,
  errorText,
  jumpButton,
  lookZone,
  mobileHud,
  movePad,
  moveThumb,
  prompt,
  runButton,
  stateText,
  statusText,
}) {
  let disposed = false;
  let currentState = "loading";
  let bobTime = 0;
  let proceduralRig = null;
  const prefersTouchUi =
    window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const touchInput = {
    jump: false,
    lookPointerId: null,
    lookX: 0,
    lookY: 0,
    movePointerId: null,
    moveX: 0,
    moveZ: 0,
    run: false,
  };

  const setState = (nextState) => {
    currentState = nextState;
    stateText.textContent = nextState;
  };

  const setStatus = (message) => {
    statusText.textContent = message;
  };

  const setPointerLocked = (locked) => {
    if (prefersTouchUi) {
      prompt.hidden = true;

      if (currentState !== "loading") {
        setStatus("Use the left stick, drag the right side to look, and tap Jump to climb.");
      }

      return;
    }

    prompt.hidden = locked;

    if (currentState !== "loading") {
      setStatus(
        locked
          ? "Mouse captured. Press Esc to release."
          : "Click the battlefield to capture the mouse.",
      );
    }
  };

  if (mobileHud) {
    mobileHud.hidden = !prefersTouchUi;
  }

  if (movePad) {
    movePad.dataset.active = "false";
  }

  if (lookZone) {
    lookZone.dataset.active = "false";
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x92a5ad);
  scene.fog = new THREE.FogExp2(0x92a5ad, 0.02);

  const camera = new THREE.PerspectiveCamera(
    54,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    160,
  );
  camera.position.set(0, CAMERA_MIN_HEIGHT + 1.05, CAMERA_DISTANCE + 0.55);

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
    climbFrom: new THREE.Vector3(),
    climbProgress: 0,
    climbTo: new THREE.Vector3(),
    grounded: true,
    hangCollider: null,
    hangNormal: new THREE.Vector3(),
    jumpQueued: false,
    mode: "normal",
    pitch: 0.16,
    position: new THREE.Vector3(0, 0, 10),
    supportCollider: null,
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
  const smoothedFocusPoint = new THREE.Vector3(
    player.position.x,
    player.position.y + PLAYER_HEIGHT * 0.64,
    player.position.z,
  );
  const rigDriver = createProceduralRigDriver();

  const getMinimumPitch = () => {
    const focusHeight = player.position.y + PLAYER_HEIGHT * 0.64 + CAMERA_HEIGHT_OFFSET;
    const heightRatio = THREE.MathUtils.clamp(
      (CAMERA_MIN_HEIGHT - focusHeight) / CAMERA_DISTANCE,
      -0.98,
      0.98,
    );

    return Math.max(CAMERA_PITCH_MIN, Math.asin(heightRatio));
  };

  const clampVectorToTopBounds = (target, collider, inset = PLAYER_RADIUS * 0.75) => {
    const bounds = getTopBounds(collider, inset);

    target.x = THREE.MathUtils.clamp(
      target.x,
      Math.min(bounds.minX, bounds.maxX),
      Math.max(bounds.minX, bounds.maxX),
    );
    target.z = THREE.MathUtils.clamp(
      target.z,
      Math.min(bounds.minZ, bounds.maxZ),
      Math.max(bounds.minZ, bounds.maxZ),
    );
  };

  const landOnSurface = (height, collider = null) => {
    player.position.y = height;
    player.velocity.y = 0;
    player.grounded = true;
    player.mode = "normal";
    player.supportCollider = collider;
    player.hangCollider = null;
  };

  const startClimb = () => {
    if (!player.hangCollider) {
      return;
    }

    const collider = player.hangCollider;
    const topInset = PLAYER_RADIUS * 0.92;
    player.mode = "climbing";
    player.climbProgress = 0;
    player.supportCollider = null;
    player.climbFrom.copy(player.position);
    player.climbTo.copy(player.position);
    player.climbTo.y = collider.max.y;

    if (Math.abs(player.hangNormal.x) > 0) {
      player.climbTo.x =
        player.hangNormal.x < 0 ? collider.min.x + topInset : collider.max.x - topInset;
    } else {
      player.climbTo.z =
        player.hangNormal.z < 0 ? collider.min.z + topInset : collider.max.z - topInset;
    }

    clampVectorToTopBounds(player.climbTo, collider, PLAYER_RADIUS * 0.92);
    player.velocity.set(0, 0, 0);
    player.jumpQueued = false;
  };

  const tryHopOntoObstacle = (collision, previousFeetY) => {
    if (!collision) {
      return false;
    }

    const { axis, collider, side } = collision;
    const topY = collider.max.y;
    const riseToTop = topY - previousFeetY;
    const torsoY = player.position.y + PLAYER_HEIGHT * 0.58;
    const isStepUp = riseToTop <= 0.42;
    const isAirHop = player.position.y > 0.16 || player.velocity.y > 0.8;

    if (riseToTop <= 0.18 || riseToTop > HOP_SNAP_HEIGHT) {
      return false;
    }

    if (!isStepUp && !isAirHop) {
      return false;
    }

    if (torsoY < topY || player.velocity.y < -0.8) {
      return false;
    }

    player.position.y = topY;

    if (axis === "x") {
      player.position.x =
        side < 0 ? collider.min.x + PLAYER_RADIUS * 0.88 : collider.max.x - PLAYER_RADIUS * 0.88;
    } else {
      player.position.z =
        side < 0 ? collider.min.z + PLAYER_RADIUS * 0.88 : collider.max.z - PLAYER_RADIUS * 0.88;
    }

    clampVectorToTopBounds(player.position, collider, PLAYER_RADIUS * 0.88);
    landOnSurface(topY, collider);
    return true;
  };

  const tryStartHang = (collision, horizontalSpeed) => {
    if (!collision || player.mode !== "normal" || player.grounded) {
      return false;
    }

    const { axis, collider, side } = collision;
    const topY = collider.max.y;
    const torsoY = player.position.y + PLAYER_HEIGHT * 0.62;
    const handReachY = player.position.y + PLAYER_HEIGHT * 0.94;
    const isAirborneReach = player.position.y > 0.12 || player.velocity.y > 0.6;

    if (
      !isAirborneReach ||
      horizontalSpeed < 1.25 ||
      handReachY < topY - 0.08 ||
      torsoY > topY + 0.32
    ) {
      return false;
    }

    player.mode = "hanging";
    player.grounded = false;
    player.supportCollider = null;
    player.hangCollider = collider;
    player.hangNormal.set(axis === "x" ? side : 0, 0, axis === "z" ? side : 0);
    player.velocity.set(0, 0, 0);
    player.position.y = topY - PLAYER_HEIGHT * HANG_DROP_RATIO;

    if (axis === "x") {
      player.position.x = side < 0 ? collider.min.x - HANG_PULL_IN : collider.max.x + HANG_PULL_IN;
      const bounds = getTopBounds(collider, PLAYER_RADIUS * 0.45);
      player.position.z = THREE.MathUtils.clamp(
        player.position.z,
        Math.min(bounds.minZ, bounds.maxZ),
        Math.max(bounds.minZ, bounds.maxZ),
      );
    } else {
      player.position.z = side < 0 ? collider.min.z - HANG_PULL_IN : collider.max.z + HANG_PULL_IN;
      const bounds = getTopBounds(collider, PLAYER_RADIUS * 0.45);
      player.position.x = THREE.MathUtils.clamp(
        player.position.x,
        Math.min(bounds.minX, bounds.maxX),
        Math.max(bounds.minX, bounds.maxX),
      );
    }

    player.jumpQueued = false;
    return true;
  };

  const setButtonActive = (button, active) => {
    if (!button) {
      return;
    }

    button.dataset.active = active ? "true" : "false";
  };

  setButtonActive(runButton, false);
  setButtonActive(jumpButton, false);

  const updateMoveThumb = (x, y) => {
    if (!moveThumb) {
      return;
    }

    moveThumb.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  };

  const resetMovePad = () => {
    touchInput.movePointerId = null;
    touchInput.moveX = 0;
    touchInput.moveZ = 0;

    if (movePad) {
      movePad.dataset.active = "false";
    }

    updateMoveThumb(0, 0);
  };

  const updateMovePadFromPoint = (clientX, clientY) => {
    if (!movePad) {
      return;
    }

    const rect = movePad.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const radius = rect.width * 0.32;
    let offsetX = clientX - centerX;
    let offsetY = clientY - centerY;
    const distance = Math.hypot(offsetX, offsetY);

    if (distance > radius && distance > 0) {
      const clampRatio = radius / distance;
      offsetX *= clampRatio;
      offsetY *= clampRatio;
    }

    touchInput.moveX = THREE.MathUtils.clamp(offsetX / radius, -1, 1);
    touchInput.moveZ = THREE.MathUtils.clamp(-offsetY / radius, -1, 1);
    movePad.dataset.active = "true";
    updateMoveThumb(offsetX, offsetY);
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
      setStatus(
        prefersTouchUi
          ? "Use the left stick, drag the right side to look, and tap Jump to climb."
          : "Click the battlefield to capture the mouse.",
      );
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
      setStatus(
        prefersTouchUi
          ? "Use the left stick, drag the right side to look, and tap Jump to climb."
          : "Click the battlefield to capture the mouse.",
      );
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
    if (disposed || prefersTouchUi || document.pointerLockElement) {
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
      CAMERA_PITCH_MAX,
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
    touchInput.jump = false;
    touchInput.run = false;
    touchInput.lookPointerId = null;
    resetMovePad();

    if (lookZone) {
      lookZone.dataset.active = "false";
    }

    setButtonActive(runButton, false);
    setButtonActive(jumpButton, false);
  };

  const handleMovePadPointerDown = (event) => {
    if (!prefersTouchUi || touchInput.movePointerId !== null) {
      return;
    }

    event.preventDefault();
    touchInput.movePointerId = event.pointerId;
    movePad?.setPointerCapture?.(event.pointerId);
    updateMovePadFromPoint(event.clientX, event.clientY);
  };

  const handleMovePadPointerMove = (event) => {
    if (!prefersTouchUi || event.pointerId !== touchInput.movePointerId) {
      return;
    }

    event.preventDefault();
    updateMovePadFromPoint(event.clientX, event.clientY);
  };

  const handleMovePadPointerEnd = (event) => {
    if (event.pointerId !== touchInput.movePointerId) {
      return;
    }

    event.preventDefault();
    resetMovePad();
  };

  const handleLookPointerDown = (event) => {
    if (!prefersTouchUi || touchInput.lookPointerId !== null) {
      return;
    }

    event.preventDefault();
    touchInput.lookPointerId = event.pointerId;
    touchInput.lookX = event.clientX;
    touchInput.lookY = event.clientY;
    lookZone?.setPointerCapture?.(event.pointerId);

    if (lookZone) {
      lookZone.dataset.active = "true";
    }
  };

  const handleLookPointerMove = (event) => {
    if (!prefersTouchUi || event.pointerId !== touchInput.lookPointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - touchInput.lookX;
    const deltaY = event.clientY - touchInput.lookY;
    touchInput.lookX = event.clientX;
    touchInput.lookY = event.clientY;

    player.yaw -= deltaX * LOOK_SENSITIVITY * 1.1;
    player.pitch = THREE.MathUtils.clamp(
      player.pitch - deltaY * LOOK_SENSITIVITY * 0.9,
      getMinimumPitch(),
      CAMERA_PITCH_MAX,
    );
  };

  const handleLookPointerEnd = (event) => {
    if (event.pointerId !== touchInput.lookPointerId) {
      return;
    }

    event.preventDefault();
    touchInput.lookPointerId = null;

    if (lookZone) {
      lookZone.dataset.active = "false";
    }
  };

  const handleRunPointerDown = (event) => {
    if (!prefersTouchUi) {
      return;
    }

    event.preventDefault();
    runButton?.setPointerCapture?.(event.pointerId);
    touchInput.run = true;
    setButtonActive(runButton, true);
  };

  const handleRunPointerEnd = (event) => {
    if (!prefersTouchUi) {
      return;
    }

    event.preventDefault();
    touchInput.run = false;
    setButtonActive(runButton, false);
  };

  const handleJumpPointerDown = (event) => {
    if (!prefersTouchUi) {
      return;
    }

    event.preventDefault();
    jumpButton?.setPointerCapture?.(event.pointerId);
    touchInput.jump = true;
    setButtonActive(jumpButton, true);
  };

  const handleJumpPointerEnd = (event) => {
    if (!prefersTouchUi) {
      return;
    }

    event.preventDefault();
    setButtonActive(jumpButton, false);
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

  if (prefersTouchUi) {
    prompt.hidden = true;
    setStatus("Use the left stick, drag the right side to look, and tap Jump to climb.");
  }

  container.addEventListener("click", handlePointerLockRequest);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);

  movePad?.addEventListener("pointerdown", handleMovePadPointerDown);
  movePad?.addEventListener("pointermove", handleMovePadPointerMove);
  movePad?.addEventListener("pointerup", handleMovePadPointerEnd);
  movePad?.addEventListener("pointercancel", handleMovePadPointerEnd);
  movePad?.addEventListener("lostpointercapture", handleMovePadPointerEnd);
  lookZone?.addEventListener("pointerdown", handleLookPointerDown);
  lookZone?.addEventListener("pointermove", handleLookPointerMove);
  lookZone?.addEventListener("pointerup", handleLookPointerEnd);
  lookZone?.addEventListener("pointercancel", handleLookPointerEnd);
  lookZone?.addEventListener("lostpointercapture", handleLookPointerEnd);
  runButton?.addEventListener("pointerdown", handleRunPointerDown);
  runButton?.addEventListener("pointerup", handleRunPointerEnd);
  runButton?.addEventListener("pointercancel", handleRunPointerEnd);
  runButton?.addEventListener("lostpointercapture", handleRunPointerEnd);
  jumpButton?.addEventListener("pointerdown", handleJumpPointerDown);
  jumpButton?.addEventListener("pointerup", handleJumpPointerEnd);
  jumpButton?.addEventListener("pointercancel", handleJumpPointerEnd);
  jumpButton?.addEventListener("lostpointercapture", handleJumpPointerEnd);

  renderer.setAnimationLoop(() => {
    if (disposed) {
      return;
    }

    const delta = Math.min(clock.getDelta(), 0.05);
    const wantsRun = keys.has("ShiftLeft") || keys.has("ShiftRight") || touchInput.run;
    const rawInputX = Number(keys.has("KeyD")) - Number(keys.has("KeyA")) + touchInput.moveX;
    const rawInputZ = Number(keys.has("KeyW")) - Number(keys.has("KeyS")) + touchInput.moveZ;
    const inputLength = Math.hypot(rawInputX, rawInputZ);
    const inputX = inputLength > 1 ? rawInputX / inputLength : rawInputX;
    const inputZ = inputLength > 1 ? rawInputZ / inputLength : rawInputZ;

    if (touchInput.jump) {
      player.jumpQueued = true;
      touchInput.jump = false;
    }

    player.pitch = THREE.MathUtils.clamp(
      player.pitch,
      getMinimumPitch(),
      CAMERA_PITCH_MAX,
    );

    desiredVelocity.set(0, 0, 0);

    if (player.mode === "hanging") {
      player.velocity.set(0, 0, 0);

      if (keys.has("KeyS")) {
        player.mode = "normal";
        player.hangCollider = null;
        player.jumpQueued = false;
        player.velocity.y = -4;
      } else if (keys.has("KeyW") || player.jumpQueued) {
        startClimb();
      }
    } else if (player.mode === "climbing") {
      player.climbProgress = Math.min(player.climbProgress + delta / CLIMB_DURATION, 1);
      const climbBlend = THREE.MathUtils.smootherstep(player.climbProgress, 0, 1);
      player.position.lerpVectors(player.climbFrom, player.climbTo, climbBlend);
      player.velocity.set(0, 0, 0);
      player.grounded = false;

      if (player.climbProgress >= 1) {
        player.position.copy(player.climbTo);
        landOnSurface(player.climbTo.y, player.hangCollider);
      }
    } else {
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

      const previousFeetY = player.position.y;

      if (player.grounded) {
        player.velocity.y = Math.max(player.velocity.y, 0);

        if (player.jumpQueued) {
          player.velocity.y = JUMP_SPEED;
          player.grounded = false;
          player.supportCollider = null;
          player.jumpQueued = false;
        }
      }

      if (!player.grounded) {
        player.velocity.y -= GRAVITY * delta;
        player.supportCollider = null;
      }

      const previousX = player.position.x;
      player.position.x += player.velocity.x * delta;
      const collisionX = resolveCollisionsOnAxis(
        "x",
        player.position,
        previousX,
        player.position.y,
        obstacleColliders,
      );

      if (collisionX) {
        player.velocity.x = 0;
      }

      const previousZ = player.position.z;
      player.position.z += player.velocity.z * delta;
      const collisionZ = resolveCollisionsOnAxis(
        "z",
        player.position,
        previousZ,
        player.position.y,
        obstacleColliders,
      );

      if (collisionZ) {
        player.velocity.z = 0;
      }

      player.position.x = THREE.MathUtils.clamp(player.position.x, -WORLD_LIMIT, WORLD_LIMIT);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -WORLD_LIMIT, WORLD_LIMIT);
      player.position.y += player.velocity.y * delta;

      const groundSupport =
        player.position.y > 0
          ? findGroundSupport(player.position, previousFeetY, player.velocity.y, obstacleColliders)
          : null;

      if (player.position.y <= 0) {
        landOnSurface(0);
      } else if (groundSupport) {
        landOnSurface(groundSupport.height, groundSupport.collider);
      } else {
        player.grounded = false;
        player.supportCollider = null;

        const primaryCollision =
          Math.abs(desiredVelocity.z) > Math.abs(desiredVelocity.x)
            ? collisionZ ?? collisionX
            : collisionX ?? collisionZ;

        if (
          !tryHopOntoObstacle(primaryCollision, previousFeetY) &&
          !tryStartHang(primaryCollision, Math.hypot(desiredVelocity.x, desiredVelocity.z))
        ) {
          player.mode = "normal";
        }
      }
    }

    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);

    if (player.mode === "hanging") {
      setState("hang");
    } else if (player.mode === "climbing") {
      setState("climb");
    } else if (!player.grounded) {
      setState("jump");
    } else if (horizontalSpeed > WALK_SPEED + 0.35) {
      setState("run");
    } else if (horizontalSpeed > 0.3) {
      setState("walk");
    } else {
      setState("idle");
    }

    if (player.mode === "hanging" || player.mode === "climbing") {
      const facingAngle = Math.atan2(-player.hangNormal.x, -player.hangNormal.z);
      visualRoot.rotation.y = dampAngle(visualRoot.rotation.y, facingAngle, 14, delta);
    } else if (horizontalSpeed > 0.1) {
      const facingAngle = Math.atan2(player.velocity.x, player.velocity.z);
      visualRoot.rotation.y = dampAngle(visualRoot.rotation.y, facingAngle, 14, delta);
    }

    bobTime += delta * (horizontalSpeed > WALK_SPEED ? 11 : 8);

    if (player.mode === "hanging") {
      modelMount.position.y = THREE.MathUtils.damp(modelMount.position.y, 0.06, 10, delta);
      modelMount.rotation.x = THREE.MathUtils.damp(modelMount.rotation.x, 0.2, 10, delta);
      modelMount.rotation.z = THREE.MathUtils.damp(modelMount.rotation.z, 0, 10, delta);
    } else if (player.mode === "climbing") {
      modelMount.position.y = THREE.MathUtils.damp(modelMount.position.y, 0.08, 10, delta);
      modelMount.rotation.x = THREE.MathUtils.damp(modelMount.rotation.x, 0.24, 10, delta);
      modelMount.rotation.z = THREE.MathUtils.damp(modelMount.rotation.z, 0, 10, delta);
    } else if (!player.grounded) {
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
    focusPoint.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.64, player.position.z);
    smoothedFocusPoint.lerp(focusPoint, dampFactor(CAMERA_FOLLOW + 3, delta));

    desiredCameraPosition.set(
      smoothedFocusPoint.x + Math.sin(player.yaw) * Math.cos(player.pitch) * CAMERA_DISTANCE,
      smoothedFocusPoint.y + CAMERA_HEIGHT_OFFSET + Math.sin(player.pitch) * CAMERA_DISTANCE,
      smoothedFocusPoint.z + Math.cos(player.yaw) * Math.cos(player.pitch) * CAMERA_DISTANCE,
    );

    desiredCameraPosition.y = Math.max(CAMERA_MIN_HEIGHT, desiredCameraPosition.y);
    cameraDirection.copy(desiredCameraPosition).sub(smoothedFocusPoint);
    const cameraDistance = cameraDirection.length();

    if (cameraDistance > 0) {
      cameraDirection.normalize();
      raycaster.set(smoothedFocusPoint, cameraDirection);
      const hits = raycaster.intersectObjects(cameraBlockers, false);

      if (hits.length > 0 && hits[0].distance < cameraDistance) {
        desiredCameraPosition.copy(smoothedFocusPoint).addScaledVector(
          cameraDirection,
          Math.max(0.85, hits[0].distance - 0.25),
        );
      }
    }

    camera.position.lerp(desiredCameraPosition, dampFactor(CAMERA_FOLLOW, delta));
    camera.lookAt(smoothedFocusPoint);

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
      movePad?.removeEventListener("pointerdown", handleMovePadPointerDown);
      movePad?.removeEventListener("pointermove", handleMovePadPointerMove);
      movePad?.removeEventListener("pointerup", handleMovePadPointerEnd);
      movePad?.removeEventListener("pointercancel", handleMovePadPointerEnd);
      movePad?.removeEventListener("lostpointercapture", handleMovePadPointerEnd);
      lookZone?.removeEventListener("pointerdown", handleLookPointerDown);
      lookZone?.removeEventListener("pointermove", handleLookPointerMove);
      lookZone?.removeEventListener("pointerup", handleLookPointerEnd);
      lookZone?.removeEventListener("pointercancel", handleLookPointerEnd);
      lookZone?.removeEventListener("lostpointercapture", handleLookPointerEnd);
      runButton?.removeEventListener("pointerdown", handleRunPointerDown);
      runButton?.removeEventListener("pointerup", handleRunPointerEnd);
      runButton?.removeEventListener("pointercancel", handleRunPointerEnd);
      runButton?.removeEventListener("lostpointercapture", handleRunPointerEnd);
      jumpButton?.removeEventListener("pointerdown", handleJumpPointerDown);
      jumpButton?.removeEventListener("pointerup", handleJumpPointerEnd);
      jumpButton?.removeEventListener("pointercancel", handleJumpPointerEnd);
      jumpButton?.removeEventListener("lostpointercapture", handleJumpPointerEnd);

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
