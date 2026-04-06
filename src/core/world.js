import * as THREE from 'three';

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x88a2b5);
  scene.fog = new THREE.Fog(0x88a2b5, 50, 230);

  const hemi = new THREE.HemisphereLight(0xdde9ff, 0x3a342f, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(35, 60, 20);
  sun.castShadow = true;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  // Large battlefield ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x64784b, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sparse obstacle set to test collision and camera behavior.
  const obstacleDefs = [
    { size: [8, 3, 12], pos: [-16, 1.5, -14], color: 0x726656 },
    { size: [10, 5, 6], pos: [22, 2.5, -5], color: 0x6a5d4e },
    { size: [7, 6, 7], pos: [-10, 3, 25], color: 0x7f7f82 },
    { size: [14, 4, 2], pos: [18, 2, 18], color: 0x5a5854 },
    { size: [4, 2, 4], pos: [0, 1, -24], color: 0x7a7062 }
  ];

  const obstacles = [];
  for (const def of obstacleDefs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...def.size),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.95 })
    );
    mesh.position.set(...def.pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const half = new THREE.Vector3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2);
    const min = mesh.position.clone().sub(half);
    const max = mesh.position.clone().add(half);
    obstacles.push(new THREE.Box3(min, max));
  }

  return {
    groundY: 0,
    obstacles
  };
}
