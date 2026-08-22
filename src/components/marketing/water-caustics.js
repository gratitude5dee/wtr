import * as THREE from "three/webgpu";
import {
  float,
  vec3,
  vec4,
  mix,
  Fn,
  vertexIndex,
  int,
  max,
  length,
  clamp,
  select,
  normalize,
  cross,
  refract,
  uniform,
  property,
  output,
} from "three/tsl";
import { PhysicalLightingModel } from "three/webgpu";

const causticShadow = property("float", "causticShadow");

class CausticLightingModel extends PhysicalLightingModel {
  direct(args, builder) {
    super.direct(args, builder);
    if (args.lightNode.shadowNode) {
      causticShadow.assign(args.lightNode.shadowNode);
    }
  }
}

export class WaterCaustics {
  constructor(
    scene,
    waterPlane,
    {
      lightDir,
      floorY,
      ior = 1.33,
      causticColor,
      causticStrength,
      baseColor,
      shadowInfluence = 1,
      heightMultiplier = 1,
    } = {},
  ) {
    const {
      resX,
      resZ,
      sizeX,
      sizeZ,
      center,
      heightStorageA,
      heightStorageB,
      readFromA,
    } = waterPlane;
    const cx = center.x;
    const cy = center.y;
    const cz = center.z;

    const eta = float(1 / ior);
    const floorYF = float(floorY);
    const causticsFactor = float(0.15);
    const shadowInfluenceU = uniform(shadowInfluence);
    const heightMul = heightMultiplier ?? float(1);

    const getHeight = (idx) => {
      const raw = select(
        readFromA,
        heightStorageA.element(idx),
        heightStorageB.element(idx),
      );
      return clamp(raw.mul(heightMul), float(-0.2), float(0.2));
    };

    const safeIdx = (ix, iz) =>
      clamp(iz, 0, resZ - 1)
        .mul(resX)
        .add(clamp(ix, 0, resX - 1));

    const waterWorldPos = (ix, iz) => {
      const height = getHeight(safeIdx(ix, iz));
      return vec3(
        float(ix)
          .div(resX - 1)
          .sub(0.5)
          .mul(sizeX)
          .add(cx),
        float(cy).add(height),
        float(iz)
          .div(resZ - 1)
          .sub(0.5)
          .mul(sizeZ)
          .add(cz),
      );
    };

    const waterNormal = (ix, iz) => {
      const heightLeft = getHeight(safeIdx(ix.sub(1), iz));
      const heightRight = getHeight(safeIdx(ix.add(1), iz));
      const heightDown = getHeight(safeIdx(ix, iz.sub(1)));
      const heightUp = getHeight(safeIdx(ix, iz.add(1)));
      return normalize(
        vec3(
          heightLeft.sub(heightRight).mul((0.5 * resX) / sizeX),
          float(1),
          heightDown.sub(heightUp).mul((0.5 * resZ) / sizeZ),
        ),
      );
    };

    const projectToFloor = (waterPosition, normal) => {
      const rayDirection = refract(lightDir, normal, eta);
      const distance = floorYF.sub(waterPosition.y).div(rayDirection.y);
      return vec3(
        waterPosition.x.add(rayDirection.x.mul(distance)),
        floorYF,
        waterPosition.z.add(rayDirection.z.mul(distance)),
      );
    };

    const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, resX - 1, resZ - 1);
    const position = geometry.attributes.position;
    const radius = Math.min(sizeX, sizeZ) / 2;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius) {
        const scale = radius / distance;
        position.setXY(index, x * scale, y * scale);
      }
    }
    position.needsUpdate = true;

    const material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.9,
      metalness: 0,
    });
    material.setupLightingModel = () => new CausticLightingModel();

    material.positionNode = Fn(() => {
      const ix = int(vertexIndex.mod(resX));
      const iz = int(vertexIndex.div(resX));
      const waterPosition = waterWorldPos(ix, iz);
      const normal = waterNormal(ix, iz);
      const floorPosition = projectToFloor(waterPosition, normal);

      const u = float(ix).div(resX - 1);
      const v = float(iz).div(resZ - 1);
      const fadeX = u.mul(float(1).sub(u)).mul(4).clamp(0, 1);
      const fadeZ = v.mul(float(1).sub(v)).mul(4).clamp(0, 1);
      const fade = fadeX.mul(fadeZ);
      const originalLocalPosition = vec3(
        float(ix)
          .div(resX - 1)
          .sub(0.5)
          .mul(sizeX),
        float(iz)
          .div(resZ - 1)
          .sub(0.5)
          .mul(sizeZ)
          .negate(),
        float(0),
      );
      const refractedLocalPosition = vec3(
        floorPosition.x.sub(cx),
        float(cz).sub(floorPosition.z),
        float(0),
      );

      return mix(originalLocalPosition, refractedLocalPosition, fade);
    })();

    const color = causticColor ?? vec3(1, 1, 1);
    const strength = causticStrength ?? float(1);
    const base = baseColor ?? vec3(0, 0, 0);

    const causticVarying = Fn(() => {
      const ix = int(vertexIndex.mod(resX));
      const iz = int(vertexIndex.div(resX));
      const waterPosition = waterWorldPos(ix, iz);
      const normal = waterNormal(ix, iz);
      const floorPosition = projectToFloor(waterPosition, normal);
      const waterPositionEast = waterWorldPos(ix.add(1), iz);
      const normalEast = waterNormal(ix.add(1), iz);
      const floorPositionEast = projectToFloor(waterPositionEast, normalEast);
      const waterPositionNorth = waterWorldPos(ix, iz.add(1));
      const normalNorth = waterNormal(ix, iz.add(1));
      const floorPositionNorth = projectToFloor(
        waterPositionNorth,
        normalNorth,
      );

      const oldArea = length(
        cross(
          waterPositionEast.sub(waterPosition),
          waterPositionNorth.sub(waterPosition),
        ),
      );
      const newArea = length(
        cross(
          floorPositionEast.sub(floorPosition),
          floorPositionNorth.sub(floorPosition),
        ),
      );
      const intensity = causticsFactor.mul(
        oldArea.div(max(newArea, float(0.00001))),
      );
      const u = float(ix).div(resX - 1);
      const v = float(iz).div(resZ - 1);
      const fadeX = u.mul(float(1).sub(u)).mul(4).clamp(0, 1);
      const fadeZ = v.mul(float(1).sub(v)).mul(4).clamp(0, 1);

      return color
        .mul(intensity.mul(fadeX).mul(fadeZ))
        .mul(strength)
        .toVertexStage();
    })();

    material.colorNode = base;
    material.outputNode = Fn(() => {
      const shadowMask = mix(float(1), causticShadow, shadowInfluenceU);
      return vec4(output.rgb.add(causticVarying.mul(shadowMask)), output.a);
    })();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, floorY, cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);

    this.mesh = mesh;
    this.material = material;
    this.uniforms = { shadowInfluence: shadowInfluenceU };
  }
}
