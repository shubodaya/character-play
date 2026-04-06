import * as THREE from 'three';

export function createCameraRig(camera, canvas, scene) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const lookSensitivity = 0.0022;
  const minPitch = -Math.PI / 3;
  const maxPitch = Math.PI / 3;

  const raycaster = new THREE.Raycaster();

  let yaw = 0;
  let pitch = -0.2;

  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= event.movementX * lookSensitivity;
    pitch -= event.movementY * lookSensitivity;
    pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
  });

  return {
    getYaw() {
      return yaw;
    },
    update(target, delta, obstacleMeshes) {
      // Desired camera offset in local orbit coordinates.
      const desiredDistance = 5;
      const targetHeight = 1.5;

      euler.set(pitch, yaw, 0);
      const localOffset = new THREE.Vector3(0, 1.2, desiredDistance).applyEuler(euler);

      const anchor = new THREE.Vector3(target.x, target.y + targetHeight, target.z);
      const desiredPos = anchor.clone().add(localOffset);

      // Pull camera in if geometry blocks the line to prevent heavy clipping.
      const direction = desiredPos.clone().sub(anchor).normalize();
      raycaster.set(anchor, direction);
      raycaster.far = desiredDistance;
      const hits = raycaster.intersectObjects(obstacleMeshes, false);

      const finalPos = desiredPos.clone();
      if (hits.length) {
        finalPos.copy(anchor).add(direction.multiplyScalar(Math.max(1.1, hits[0].distance - 0.2)));
      }

      camera.position.lerp(finalPos, 1 - Math.exp(-delta * 16));
      camera.lookAt(anchor);
    }
  };
}
