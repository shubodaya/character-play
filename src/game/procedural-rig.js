import * as THREE from "three";
import { JUMP_SPEED, RUN_SPEED, WALK_SPEED, dampFactor } from "./shared.js";

export function captureBonePose(root, name) {
  const bone = root.getObjectByName(name);

  if (!(bone instanceof THREE.Bone)) {
    return undefined;
  }

  return {
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
  };
}

export function buildProceduralRig(root) {
  return {
    head: captureBonePose(root, "head_05"),
    hips: captureBonePose(root, "hips_00"),
    leftArm: captureBonePose(root, "l_arm_028"),
    leftFoot: captureBonePose(root, "l_foot_049"),
    leftForearm: captureBonePose(root, "l_forearm_029"),
    leftHand: captureBonePose(root, "l_hand_030"),
    leftKnee: captureBonePose(root, "l_knee_048"),
    leftLeg: captureBonePose(root, "l_leg_047"),
    leftShoulder: captureBonePose(root, "l_shoulder_027"),
    leftToes: captureBonePose(root, "l_toes_050"),
    neck: captureBonePose(root, "neck_04"),
    rightArm: captureBonePose(root, "r_arm_09"),
    rightFoot: captureBonePose(root, "r_foot_053"),
    rightForearm: captureBonePose(root, "r_forearm_010"),
    rightHand: captureBonePose(root, "r_hand_011"),
    rightKnee: captureBonePose(root, "r_knee_052"),
    rightLeg: captureBonePose(root, "r_leg_051"),
    rightShoulder: captureBonePose(root, "r_shoulder_08"),
    rightToes: captureBonePose(root, "r_toes_054"),
    spine1: captureBonePose(root, "spine1_01"),
    spine2: captureBonePose(root, "spine2_02"),
    spine3: captureBonePose(root, "spine3_03"),
  };
}

export function createProceduralRigDriver() {
  let locomotionCycle = 0;
  const scratchEuler = new THREE.Euler();
  const scratchQuaternionA = new THREE.Quaternion();
  const scratchQuaternionB = new THREE.Quaternion();
  const scratchVector = new THREE.Vector3();

  const blendBoneRotation = (pose, rotation, delta, smoothing = 14) => {
    if (!pose) {
      return;
    }

    scratchEuler.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0, "XYZ");
    scratchQuaternionA.setFromEuler(scratchEuler);
    scratchQuaternionB.copy(pose.quaternion).multiply(scratchQuaternionA);
    pose.bone.quaternion.slerp(scratchQuaternionB, dampFactor(smoothing, delta));
  };

  const blendBonePosition = (pose, x, y, z, delta, smoothing = 12) => {
    if (!pose) {
      return;
    }

    scratchVector.copy(pose.position);
    scratchVector.x += x;
    scratchVector.y += y;
    scratchVector.z += z;
    pose.bone.position.lerp(scratchVector, dampFactor(smoothing, delta));
  };

  return {
    update(rig, player, horizontalSpeed, delta) {
      if (!rig) {
        return;
      }

      const groundedBlend = player.grounded ? 1 : 0;
      const moveBlend = groundedBlend * THREE.MathUtils.clamp(horizontalSpeed / 0.45, 0, 1);
      const runBlend = THREE.MathUtils.smoothstep(horizontalSpeed, WALK_SPEED + 0.2, RUN_SPEED);
      const speedBlend = THREE.MathUtils.clamp(horizontalSpeed / RUN_SPEED, 0, 1);
      const airBlend = 1 - groundedBlend;

      if (moveBlend > 0.04 && player.grounded) {
        locomotionCycle +=
          delta *
          THREE.MathUtils.lerp(6.8, 10.8, runBlend) *
          THREE.MathUtils.lerp(0.72, 1.18, speedBlend);
      }

      const stride = Math.sin(locomotionCycle);
      const oppositeStride = Math.sin(locomotionCycle + Math.PI);
      const bounce = Math.sin(locomotionCycle * 2);
      const legSwing = THREE.MathUtils.lerp(0.26, 0.52, runBlend) * moveBlend;
      const armSwing = THREE.MathUtils.lerp(0.32, 0.56, runBlend) * moveBlend;
      const kneeBendScale = THREE.MathUtils.lerp(0.18, 0.42, runBlend) * moveBlend;
      const footBendScale = THREE.MathUtils.lerp(0.08, 0.18, runBlend) * moveBlend;
      const torsoTwist = THREE.MathUtils.lerp(0.035, 0.085, runBlend) * moveBlend;
      const torsoLift = THREE.MathUtils.lerp(0.5, 1.35, runBlend) * moveBlend;
      const airborneTilt = THREE.MathUtils.clamp(player.velocity.y / JUMP_SPEED, -1, 1);
      const leftKneeBend = Math.max(0, -stride) * kneeBendScale + airBlend * 0.26;
      const rightKneeBend = Math.max(0, -oppositeStride) * kneeBendScale + airBlend * 0.26;
      const leftFootPitch = Math.max(0, stride) * footBendScale - leftKneeBend * 0.45;
      const rightFootPitch =
        Math.max(0, oppositeStride) * footBendScale - rightKneeBend * 0.45;

      blendBonePosition(rig.hips, 0, bounce * torsoLift, 0, delta, 10);
      blendBoneRotation(rig.hips, {
        x: airBlend * -0.05 * airborneTilt,
        y: -stride * torsoTwist * 0.45,
        z: bounce * 0.03 * moveBlend,
      }, delta, 10);
      blendBoneRotation(rig.spine1, {
        y: stride * torsoTwist * 0.35,
        z: -bounce * 0.02 * moveBlend,
      }, delta);
      blendBoneRotation(rig.spine2, {
        x: airBlend * 0.08 * Math.max(0, -airborneTilt),
        y: stride * torsoTwist * 0.6,
        z: -bounce * 0.018 * moveBlend,
      }, delta);
      blendBoneRotation(rig.spine3, {
        x: airBlend * -0.1 * airborneTilt,
        y: stride * torsoTwist * 0.8,
      }, delta);
      blendBoneRotation(rig.neck, {
        x: airBlend * 0.05 * Math.max(0, -airborneTilt),
        y: -stride * torsoTwist * 0.2,
      }, delta, 10);
      blendBoneRotation(rig.head, {
        x: airBlend * 0.04 * Math.max(0, -airborneTilt),
        y: -stride * torsoTwist * 0.1,
      }, delta, 10);

      blendBoneRotation(rig.leftShoulder, {
        y: oppositeStride * armSwing * 0.22 - airBlend * 0.06,
        z: 0.06 * moveBlend,
      }, delta);
      blendBoneRotation(rig.rightShoulder, {
        y: stride * armSwing * 0.22 + airBlend * 0.06,
        z: -0.06 * moveBlend,
      }, delta);
      blendBoneRotation(rig.leftArm, {
        x: airBlend * -0.08,
        y: oppositeStride * armSwing - airBlend * 0.12,
        z: 0.08 * moveBlend,
      }, delta);
      blendBoneRotation(rig.rightArm, {
        x: airBlend * -0.08,
        y: stride * armSwing + airBlend * 0.12,
        z: -0.08 * moveBlend,
      }, delta);
      blendBoneRotation(rig.leftForearm, {
        y: oppositeStride * armSwing * 0.16,
        z: -Math.max(0, oppositeStride) * 0.16 - airBlend * 0.14,
      }, delta);
      blendBoneRotation(rig.rightForearm, {
        y: stride * armSwing * 0.16,
        z: Math.max(0, stride) * 0.16 + airBlend * 0.14,
      }, delta);
      blendBoneRotation(rig.leftHand, {
        z: -Math.max(0, oppositeStride) * 0.08,
      }, delta, 12);
      blendBoneRotation(rig.rightHand, {
        z: Math.max(0, stride) * 0.08,
      }, delta, 12);

      blendBoneRotation(rig.leftLeg, {
        x: airBlend * 0.04,
        y: stride * legSwing + airBlend * 0.08,
        z: -0.028 * moveBlend,
      }, delta);
      blendBoneRotation(rig.rightLeg, {
        x: airBlend * 0.04,
        y: oppositeStride * legSwing + airBlend * 0.08,
        z: 0.028 * moveBlend,
      }, delta);
      blendBoneRotation(rig.leftKnee, { z: leftKneeBend }, delta);
      blendBoneRotation(rig.rightKnee, { z: -rightKneeBend }, delta);
      blendBoneRotation(rig.leftFoot, {
        y: -stride * 0.05 * moveBlend,
        z: -leftFootPitch - airBlend * 0.08,
      }, delta);
      blendBoneRotation(rig.rightFoot, {
        y: oppositeStride * 0.05 * moveBlend,
        z: rightFootPitch + airBlend * 0.08,
      }, delta);
      blendBoneRotation(rig.leftToes, {
        z: Math.max(0, stride) * 0.08 * moveBlend,
      }, delta, 12);
      blendBoneRotation(rig.rightToes, {
        z: -Math.max(0, oppositeStride) * 0.08 * moveBlend,
      }, delta, 12);
    },
  };
}
