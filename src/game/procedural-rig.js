import * as THREE from "three";
import { JUMP_SPEED, RUN_SPEED, WALK_SPEED, dampFactor } from "./shared.js";

const TAU = Math.PI * 2;

function wrapPhase(phase) {
  return THREE.MathUtils.euclideanModulo(phase, TAU);
}

function sampleCurve(keys, t) {
  if (t <= keys[0][0]) {
    return keys[0][1];
  }

  for (let index = 1; index < keys.length; index += 1) {
    const [endTime, endValue] = keys[index];

    if (t <= endTime) {
      const [startTime, startValue] = keys[index - 1];
      const localT = THREE.MathUtils.smootherstep(
        (t - startTime) / Math.max(endTime - startTime, 0.0001),
        0,
        1,
      );

      return THREE.MathUtils.lerp(startValue, endValue, localT);
    }
  }

  return keys[keys.length - 1][1];
}

function sampleLegPose(phase, runBlend, moveBlend) {
  const normalizedPhase = wrapPhase(phase) / TAU;
  const walkPose = {
    footHeight: sampleCurve([
      [0.0, 0.0],
      [0.5, 0.0],
      [0.66, 0.052],
      [0.82, 0.036],
      [1.0, 0.0],
    ], normalizedPhase),
    footPitch: sampleCurve([
      [0.0, -0.095],
      [0.16, -0.014],
      [0.36, 0.038],
      [0.5, 0.122],
      [0.68, 0.052],
      [0.84, -0.062],
      [1.0, -0.095],
    ], normalizedPhase),
    kneeBend: sampleCurve([
      [0.0, 0.034],
      [0.12, 0.082],
      [0.34, 0.048],
      [0.5, 0.126],
      [0.68, 0.27],
      [0.84, 0.13],
      [1.0, 0.034],
    ], normalizedPhase),
    legAngle: sampleCurve([
      [0.0, 0.34],
      [0.16, 0.2],
      [0.34, 0.02],
      [0.5, -0.3],
      [0.68, -0.12],
      [0.84, 0.18],
      [1.0, 0.34],
    ], normalizedPhase),
    support: sampleCurve([
      [0.0, 1.0],
      [0.42, 1.0],
      [0.54, 0.45],
      [0.62, 0.0],
      [1.0, 0.0],
    ], normalizedPhase),
    toeAngle: sampleCurve([
      [0.0, 0.0],
      [0.38, 0.0],
      [0.5, 0.1],
      [0.66, 0.045],
      [1.0, 0.0],
    ], normalizedPhase),
  };
  const runPose = {
    footHeight: sampleCurve([
      [0.0, 0.0],
      [0.32, 0.0],
      [0.48, 0.13],
      [0.72, 0.1],
      [0.92, 0.024],
      [1.0, 0.0],
    ], normalizedPhase),
    footPitch: sampleCurve([
      [0.0, -0.145],
      [0.12, 0.028],
      [0.28, 0.155],
      [0.42, 0.235],
      [0.62, 0.078],
      [0.84, -0.102],
      [1.0, -0.145],
    ], normalizedPhase),
    kneeBend: sampleCurve([
      [0.0, 0.072],
      [0.12, 0.14],
      [0.3, 0.22],
      [0.48, 0.54],
      [0.72, 0.44],
      [0.9, 0.17],
      [1.0, 0.072],
    ], normalizedPhase),
    legAngle: sampleCurve([
      [0.0, 0.58],
      [0.16, 0.26],
      [0.32, -0.04],
      [0.46, -0.52],
      [0.68, -0.18],
      [0.86, 0.28],
      [1.0, 0.58],
    ], normalizedPhase),
    support: sampleCurve([
      [0.0, 1.0],
      [0.24, 1.0],
      [0.34, 0.22],
      [0.4, 0.0],
      [1.0, 0.0],
    ], normalizedPhase),
    toeAngle: sampleCurve([
      [0.0, 0.0],
      [0.28, 0.0],
      [0.44, 0.18],
      [0.62, 0.08],
      [1.0, 0.0],
    ], normalizedPhase),
  };

  return {
    footHeight: THREE.MathUtils.lerp(walkPose.footHeight, runPose.footHeight, runBlend) * moveBlend,
    footPitch: THREE.MathUtils.lerp(walkPose.footPitch, runPose.footPitch, runBlend) * moveBlend,
    forward: sampleCurve([
      [0.0, 1.0],
      [0.18, 0.45],
      [0.5, -1.0],
      [0.82, 0.1],
      [1.0, 1.0],
    ], normalizedPhase),
    kneeBend: THREE.MathUtils.lerp(walkPose.kneeBend, runPose.kneeBend, runBlend) * moveBlend,
    legAngle: THREE.MathUtils.lerp(walkPose.legAngle, runPose.legAngle, runBlend) * moveBlend,
    support: THREE.MathUtils.lerp(walkPose.support, runPose.support, runBlend),
    toeAngle: THREE.MathUtils.lerp(walkPose.toeAngle, runPose.toeAngle, runBlend) * moveBlend,
  };
}

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
  let traversalCycle = 0;
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

      if (player.mode === "hanging" || player.mode === "climbing") {
        const climbBlend = player.mode === "climbing" ? 1 : 0;
        const hangBlend = 1 - climbBlend;
        const climbProgress = THREE.MathUtils.clamp(player.climbProgress ?? 0, 0, 1);
        const pullOver = THREE.MathUtils.smoothstep(climbProgress, 0.62, 1);
        traversalCycle = wrapPhase(
          traversalCycle + delta * THREE.MathUtils.lerp(1.6, 8.1, climbBlend),
        );

        const climbWave = Math.sin(traversalCycle);
        const hangSway = Math.sin(traversalCycle * 0.5);
        const leftReach =
          hangBlend * (0.82 + hangSway * 0.06) +
          climbBlend * (0.42 + Math.max(0, climbWave) * 0.52 + pullOver * 0.06);
        const rightReach =
          hangBlend * (0.82 - hangSway * 0.06) +
          climbBlend * (0.42 + Math.max(0, -climbWave) * 0.52 + pullOver * 0.06);
        const leftPull = climbBlend * Math.max(0, -climbWave);
        const rightPull = climbBlend * Math.max(0, climbWave);
        const leftLegLift = climbBlend > 0 ? leftPull + pullOver * 0.18 : 0.18 + hangSway * 0.04;
        const rightLegLift =
          climbBlend > 0 ? rightPull + pullOver * 0.18 : 0.18 - hangSway * 0.04;
        const bodyLift = 0.024 + hangBlend * 0.01 + climbBlend * 0.05 + pullOver * 0.05;
        const armReachBase = 0.58 + hangBlend * 0.1 + pullOver * 0.08;
        const shoulderSpread = 0.22 + hangBlend * 0.05 + climbBlend * 0.03;
        const elbowBend = 0.56 + hangBlend * 0.1 + climbBlend * 0.16 + pullOver * 0.12;
        const handGrip = 0.18 + pullOver * 0.08;
        const footBrace = 0.22 + climbBlend * 0.08;

        blendBonePosition(rig.hips, hangSway * 0.01, bodyLift, 0, delta, 10);
        blendBoneRotation(rig.hips, {
          x: 0.16 + climbBlend * 0.1 + pullOver * 0.1,
          y: hangSway * 0.04,
          z: hangSway * 0.025,
        }, delta, 10);
        blendBoneRotation(rig.spine1, {
          x: -0.06 - climbBlend * 0.05,
          y: -hangSway * 0.03,
          z: hangSway * 0.02,
        }, delta);
        blendBoneRotation(rig.spine2, {
          x: -0.12 - climbBlend * 0.05,
          y: -hangSway * 0.04,
        }, delta);
        blendBoneRotation(rig.spine3, {
          x: -0.2 - climbBlend * 0.06 - pullOver * 0.08,
          y: -hangSway * 0.05,
        }, delta);
        blendBoneRotation(rig.neck, {
          x: 0.16 + pullOver * 0.04,
          y: hangSway * 0.04,
        }, delta, 10);
        blendBoneRotation(rig.head, {
          x: 0.08 + pullOver * 0.03,
          y: hangSway * 0.02,
        }, delta, 10);

        blendBoneRotation(rig.leftShoulder, {
          x: -0.22 - leftPull * 0.08 - pullOver * 0.04,
          y: armReachBase + leftReach * 0.26 - leftPull * 0.08,
          z: shoulderSpread + leftReach * 0.06,
        }, delta);
        blendBoneRotation(rig.rightShoulder, {
          x: -0.22 - rightPull * 0.08 - pullOver * 0.04,
          y: armReachBase + rightReach * 0.26 - rightPull * 0.08,
          z: -shoulderSpread - rightReach * 0.06,
        }, delta);
        blendBoneRotation(rig.leftArm, {
          x: -0.16 - leftPull * 0.06,
          y: 0.74 + leftReach * 0.32 + pullOver * 0.08 - leftPull * 0.12,
          z: 0.2 + leftReach * 0.1 - leftPull * 0.08,
        }, delta);
        blendBoneRotation(rig.rightArm, {
          x: -0.16 - rightPull * 0.06,
          y: 0.74 + rightReach * 0.32 + pullOver * 0.08 - rightPull * 0.12,
          z: -0.2 - rightReach * 0.1 + rightPull * 0.08,
        }, delta);
        blendBoneRotation(rig.leftForearm, {
          y: 0.08 + leftPull * 0.14,
          z: -(elbowBend + leftReach * 0.2 + leftPull * 0.24 - pullOver * 0.08),
        }, delta);
        blendBoneRotation(rig.rightForearm, {
          y: 0.08 + rightPull * 0.14,
          z: elbowBend + rightReach * 0.2 + rightPull * 0.24 - pullOver * 0.08,
        }, delta);
        blendBoneRotation(rig.leftHand, {
          z: -(handGrip + elbowBend * 0.28 + leftPull * 0.1),
        }, delta, 12);
        blendBoneRotation(rig.rightHand, {
          z: handGrip + elbowBend * 0.28 + rightPull * 0.1,
        }, delta, 12);

        blendBoneRotation(rig.leftLeg, {
          x: 0.06,
          y: -0.03,
          z: 0.18 + leftLegLift * 0.3 + pullOver * 0.08,
        }, delta);
        blendBoneRotation(rig.rightLeg, {
          x: 0.06,
          y: 0.03,
          z: -(0.18 + rightLegLift * 0.3 + pullOver * 0.08),
        }, delta);
        blendBoneRotation(rig.leftKnee, {
          z: 0.34 + leftLegLift * 0.24 + pullOver * 0.08,
        }, delta);
        blendBoneRotation(rig.rightKnee, {
          z: -(0.34 + rightLegLift * 0.24 + pullOver * 0.08),
        }, delta);
        blendBonePosition(rig.leftFoot, 0, leftLegLift * 0.04, 0, delta, 16);
        blendBonePosition(rig.rightFoot, 0, rightLegLift * 0.04, 0, delta, 16);
        blendBoneRotation(rig.leftFoot, {
          y: -0.05,
          z: -(footBrace + leftLegLift * 0.14),
        }, delta);
        blendBoneRotation(rig.rightFoot, {
          y: 0.05,
          z: footBrace + rightLegLift * 0.14,
        }, delta);
        blendBoneRotation(rig.leftToes, {
          z: 0.05 + pullOver * 0.02,
        }, delta, 12);
        blendBoneRotation(rig.rightToes, {
          z: -(0.05 + pullOver * 0.02),
        }, delta, 12);

        return;
      }

      const groundedBlend = player.grounded ? 1 : 0;
      const moveBlend = groundedBlend * THREE.MathUtils.clamp(horizontalSpeed / 0.45, 0, 1);
      const runBlend = THREE.MathUtils.smoothstep(horizontalSpeed, WALK_SPEED + 0.2, RUN_SPEED);
      const airBlend = 1 - groundedBlend;
      const airborneTilt = THREE.MathUtils.clamp(player.velocity.y / JUMP_SPEED, -1, 1);

      if (moveBlend > 0.04 && player.grounded) {
        const cycleDistance = THREE.MathUtils.lerp(4.2, 5.2, runBlend);
        const cadenceScale = THREE.MathUtils.lerp(1.32, 1.22, runBlend);
        locomotionCycle += (horizontalSpeed * delta * TAU * cadenceScale) / cycleDistance;
      }

      const phase = wrapPhase(locomotionCycle);
      const leftLegPose = sampleLegPose(phase, runBlend, moveBlend);
      const rightLegPose = sampleLegPose(phase + Math.PI, runBlend, moveBlend);
      const maxStride = Math.max(THREE.MathUtils.lerp(0.48, 0.72, runBlend) * moveBlend, 0.001);
      const gaitSignal = THREE.MathUtils.clamp(
        (leftLegPose.legAngle - rightLegPose.legAngle) / (maxStride * 2),
        -1,
        1,
      );
      const leftLegForward = leftLegPose.forward;
      const rightLegForward = rightLegPose.forward;
      const leftArmForward = -gaitSignal;
      const rightArmForward = gaitSignal;
      const weightShift =
        (rightLegPose.support - leftLegPose.support + Math.sin(phase) * 0.35) * moveBlend;
      const bounce = Math.sin(phase * 2) * moveBlend;
      const armSwing = THREE.MathUtils.lerp(0.18, 0.34, runBlend) * moveBlend;
      const shoulderSwing = THREE.MathUtils.lerp(0.08, 0.16, runBlend) * moveBlend;
      const elbowBase = THREE.MathUtils.lerp(0.08, 0.12, runBlend) * moveBlend;
      const elbowAccent = THREE.MathUtils.lerp(0.05, 0.12, runBlend) * moveBlend;
      const hipYaw = THREE.MathUtils.lerp(0.035, 0.08, runBlend) * moveBlend;
      const hipRoll = THREE.MathUtils.lerp(0.02, 0.045, runBlend) * moveBlend;
      const torsoCounter = hipYaw * 0.95;
      const torsoLift = THREE.MathUtils.lerp(0.16, 0.48, runBlend) * moveBlend;
      const leftKneeBend = leftLegPose.kneeBend + airBlend * 0.26;
      const rightKneeBend = rightLegPose.kneeBend + airBlend * 0.26;
      const leftFootAngle = leftLegPose.footPitch;
      const rightFootAngle = rightLegPose.footPitch;
      const leftElbowBend =
        elbowBase + Math.max(0, leftArmForward) * elbowAccent;
      const rightElbowBend =
        elbowBase + Math.max(0, rightArmForward) * elbowAccent;

      blendBonePosition(
        rig.hips,
        weightShift * 0.024,
        bounce * torsoLift,
        0,
        delta,
        10,
      );
      blendBoneRotation(rig.hips, {
        x: airBlend * -0.05 * airborneTilt,
        y: leftLegForward * hipYaw,
        z: -weightShift * hipRoll,
      }, delta, 10);
      blendBoneRotation(rig.spine1, {
        y: -leftLegForward * torsoCounter * 0.4,
        z: weightShift * hipRoll * 0.35,
      }, delta);
      blendBoneRotation(rig.spine2, {
        x: airBlend * 0.08 * Math.max(0, -airborneTilt),
        y: -leftLegForward * torsoCounter * 0.7,
        z: weightShift * hipRoll * 0.22,
      }, delta);
      blendBoneRotation(rig.spine3, {
        x: airBlend * -0.1 * airborneTilt,
        y: -leftLegForward * torsoCounter,
      }, delta);
      blendBoneRotation(rig.neck, {
        x: airBlend * 0.05 * Math.max(0, -airborneTilt),
        y: leftLegForward * torsoCounter * 0.16,
      }, delta, 10);
      blendBoneRotation(rig.head, {
        x: airBlend * 0.04 * Math.max(0, -airborneTilt),
        y: leftLegForward * torsoCounter * 0.08,
      }, delta, 10);

      blendBoneRotation(rig.leftShoulder, {
        x: -leftArmForward * shoulderSwing * 0.22,
        y: leftArmForward * shoulderSwing - airBlend * 0.04,
        z: 0.08 * moveBlend - leftArmForward * shoulderSwing * 0.15,
      }, delta);
      blendBoneRotation(rig.rightShoulder, {
        x: -rightArmForward * shoulderSwing * 0.22,
        y: rightArmForward * shoulderSwing + airBlend * 0.04,
        z: -0.08 * moveBlend + rightArmForward * shoulderSwing * 0.15,
      }, delta);
      blendBoneRotation(rig.leftArm, {
        x: airBlend * -0.08,
        y: leftArmForward * armSwing - airBlend * 0.1,
        z: 0.12 * moveBlend - leftArmForward * armSwing * 0.12,
      }, delta);
      blendBoneRotation(rig.rightArm, {
        x: airBlend * -0.08,
        y: rightArmForward * armSwing + airBlend * 0.1,
        z: -0.12 * moveBlend + rightArmForward * armSwing * 0.12,
      }, delta);
      blendBoneRotation(rig.leftForearm, {
        y: leftArmForward * armSwing * 0.18,
        z: -leftElbowBend - airBlend * 0.14,
      }, delta);
      blendBoneRotation(rig.rightForearm, {
        y: rightArmForward * armSwing * 0.18,
        z: rightElbowBend + airBlend * 0.14,
      }, delta);
      blendBoneRotation(rig.leftHand, {
        z: -(leftElbowBend * 0.4),
      }, delta, 12);
      blendBoneRotation(rig.rightHand, {
        z: rightElbowBend * 0.4,
      }, delta, 12);

      blendBoneRotation(rig.leftLeg, {
        x: airBlend * 0.04,
        y: -0.018 * moveBlend,
        z: leftLegPose.legAngle - 0.014 * moveBlend,
      }, delta);
      blendBoneRotation(rig.rightLeg, {
        x: airBlend * 0.04,
        y: 0.018 * moveBlend,
        z: -rightLegPose.legAngle + 0.014 * moveBlend,
      }, delta);
      blendBoneRotation(rig.leftKnee, { z: leftKneeBend }, delta);
      blendBoneRotation(rig.rightKnee, { z: -rightKneeBend }, delta);
      blendBonePosition(rig.leftFoot, 0, leftLegPose.footHeight, 0, delta, 16);
      blendBonePosition(rig.rightFoot, 0, rightLegPose.footHeight, 0, delta, 16);
      blendBoneRotation(rig.leftFoot, {
        y: -leftLegForward * 0.035 * moveBlend,
        z: -leftFootAngle - airBlend * 0.08,
      }, delta);
      blendBoneRotation(rig.rightFoot, {
        y: -rightLegForward * 0.035 * moveBlend,
        z: rightFootAngle + airBlend * 0.08,
      }, delta);
      blendBoneRotation(rig.leftToes, {
        z: leftLegPose.toeAngle,
      }, delta, 12);
      blendBoneRotation(rig.rightToes, {
        z: -rightLegPose.toeAngle,
      }, delta, 12);
    },
  };
}
