import * as THREE from "three/webgpu";
import {
  uniform,
  float,
  vec2,
  vec4,
  color,
  uv,
  mix,
  pass,
  mrt,
  output,
  normalView,
  diffuseColor,
  velocity,
  add,
  directionToColor,
  colorToDirection,
  sample,
  metalness,
  roughness,
  positionWorld,
  fract,
  abs,
  max,
  step,
  convertToTexture,
} from "three/tsl";
import { ssgi } from "three/addons/tsl/display/SSGINode.js";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { WaterPlane } from "./water-plane.js";
import { WaterCaustics } from "./water-caustics.js";

// ─── Params ─────────────────────────────────────────────────────────────────
const params = {
  // Camera
  fov: 55,
  cameraTransitionDuration: 3,
  blur: 0,
  // Lighting
  sunColor: "#fffbe8",
  sunIntensity: 3.8,
  ambientColor: "#70d0e8",
  ambientIntensity: 1.0,
  exposure: 1.5,
  // Fog
  fogEnabled: false,
  fogColor: "#2a6a7a",
  fogDensity: 0.012,
  // Buildings
  buildingColor: "#3a9e96",
  sphereColor: "#ffcc33",
  groundColor: "#2a9a8e",
  causticColor: "#60ffe0",
  floorColor: "#3aafa5",
  floorGroutColor: "#2a9a8e",
  bigSphereEmissiveColor: "#ffaa22",
  bigSphereEmissiveIntensity: 6,
  fresnelBias: 0.1,
  fresnelPower: 2.0,
  fresnelScale: 1.0,
  floorTileSize: 0.4,
  causticStrength: 1.8,
  causticShadowInfluence: 1.0,
  causticHeightMultiplier: 8,
  // Sky
  skyTopColor: "#1a6070",
  skyBottomColor: "#30b8a8",
  // Sun Position
  sunX: -26,
  sunY: 4,
  sunZ: -9,
  // Shadows
  shadowEnabled: true,
  shadowRadius: 8,
  shadowBlurSamples: 12,
  shadowBias: -0.001,
  shadowNormalBias: 0.02,
  shadowMapSize: 1024,
};

// ─── Scene ──────────────────────────────────────────────────────────────────
export async function createWaterIntroScene({ container, scrollRoot }) {
  let width = Math.max(container.clientWidth, 1);
  let height = Math.max(container.clientHeight, 1);
  const scene = new THREE.Scene();
  scene.fog = params.fogEnabled
    ? new THREE.FogExp2(params.fogColor, params.fogDensity)
    : null;

  const camera = new THREE.PerspectiveCamera(
    params.fov,
    width / height,
    0.1,
    500,
  );
  camera.position.set(0, 3, 9);
  camera.lookAt(0, 1.5, -10);

  const renderer = new THREE.WebGPURenderer({
    antialias: false,
    requiredLimits: {
      maxStorageBuffersInVertexStage: 2,
      maxColorAttachmentBytesPerSample: 64,
    },
  });
  const pixelRatio = 1;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setClearColor(params.skyTopColor);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = params.exposure;
  renderer.domElement.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;";
  container.appendChild(renderer.domElement);
  await renderer.init();

  const skyTopColorU = uniform(new THREE.Color(params.skyTopColor));

  // ─── Post-Processing (SSGI + TRAA) ──────────────────────────────────────────
  const scenePass = pass(scene, camera);
  scenePass.setMRT(
    mrt({
      output: output,
      diffuseColor: diffuseColor,
      normal: directionToColor(normalView),
      velocity: velocity,
      metalrough: vec2(metalness, roughness),
    }),
  );

  const scenePassColor = scenePass.getTextureNode("output");
  const scenePassDiffuse = scenePass.getTextureNode("diffuseColor");
  const scenePassDepth = scenePass.getTextureNode("depth");
  const scenePassNormal = scenePass.getTextureNode("normal");
  const scenePassVelocity = scenePass.getTextureNode("velocity");
  const scenePassMetalRough = scenePass.getTextureNode("metalrough");

  const sceneNormal = sample((uvCoord) => {
    return colorToDirection(scenePassNormal.sample(uvCoord));
  });

  const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
  giPass.sliceCount.value = 2;
  giPass.stepCount.value = 4;
  giPass.radius.value = 4;
  giPass.expFactor.value = 2;
  giPass.thickness.value = 0.09;
  giPass.backfaceLighting.value = 0;
  giPass.aoIntensity.value = 3.1;
  giPass.giIntensity.value = 22;
  giPass.useLinearThickness.value = false;
  giPass.useScreenSpaceSampling.value = true;
  giPass.useTemporalFiltering = true;
  giPass.giEnabled = true;
  giPass.aoEnabled = true;

  const gi = giPass.rgb;
  const ao = giPass.a;

  // ─── Water ──────────────────────────────────────────────────────────────────
  const waterPlane = new WaterPlane(scene, renderer, {
    sizeX: 8,
    sizeZ: 8,
    center: new THREE.Vector3(0, 0.25, -1),
    resolution: 256,
    fresnelBias: params.fresnelBias,
    fresnelPower: params.fresnelPower,
    fresnelScale: params.fresnelScale,
    colliderStrength: 0.005,
  });

  // ─── SSR ─────────────────────────────────────────────────────────────────────
  const ssrPass = ssr(
    scenePassColor,
    scenePassDepth,
    sceneNormal,
    scenePassMetalRough.r,
    scenePassMetalRough.g,
  );
  ssrPass.quality.value = 0.3;
  ssrPass.blurQuality.value = 1;
  ssrPass.maxDistance.value = 60;
  ssrPass.opacity.value = 1;
  ssrPass.thickness.value = 0.03;
  ssrPass.enabled = true;

  const ssrMasked = mix(
    skyTopColorU.mul(scenePassMetalRough.r),
    ssrPass.rgb,
    ssrPass.a,
  );

  // ─── RenderPipeline ─────────────────────────────────────────────────────────
  const renderPipeline = new THREE.RenderPipeline(renderer);

  // SSGI composites (without SSR)
  const compositeGiAo = vec4(
    add(scenePassColor.rgb.mul(ao), scenePassDiffuse.rgb.mul(gi)),
    scenePassColor.a,
  );
  const compositeGiOnly = vec4(
    add(scenePassColor.rgb, scenePassDiffuse.rgb.mul(gi)),
    scenePassColor.a,
  );
  const compositeAoOnly = vec4(scenePassColor.rgb.mul(ao), scenePassColor.a);

  // SSGI composites (with SSR)
  const compositeGiAoSsr = vec4(
    add(scenePassColor.rgb.mul(ao), scenePassDiffuse.rgb.mul(gi)).add(
      ssrMasked,
    ),
    scenePassColor.a,
  );
  const compositeGiOnlySsr = vec4(
    add(scenePassColor.rgb, scenePassDiffuse.rgb.mul(gi)).add(ssrMasked),
    scenePassColor.a,
  );
  const compositeAoOnlySsr = vec4(
    scenePassColor.rgb.mul(ao).add(ssrMasked),
    scenePassColor.a,
  );
  const compositeSsrOnly = vec4(
    scenePassColor.rgb.add(ssrMasked),
    scenePassColor.a,
  );

  // TRAA variants (without SSR)
  const traaGiAo = traa(
    compositeGiAo,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );
  const traaGiOnly = traa(
    compositeGiOnly,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );
  const traaAoOnly = traa(
    compositeAoOnly,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  // TRAA variants (with SSR)
  const traaGiAoSsr = traa(
    compositeGiAoSsr,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );
  const traaGiOnlySsr = traa(
    compositeGiOnlySsr,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );
  const traaAoOnlySsr = traa(
    compositeAoOnlySsr,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );
  const traaSsrOnly = traa(
    compositeSsrOnly,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  // ─── Gaussian Blur ──────────────────────────────────────────────────────────
  const blurDirectionU = uniform(params.blur * 10);
  const blurPass = gaussianBlur(traaGiAoSsr, blurDirectionU, 10);

  const cameraTarget = new THREE.Vector3(0, 1.5, -5);

  // ─── Uniforms ───────────────────────────────────────────────────────────────
  const buildingColorU = uniform(new THREE.Color(params.buildingColor));
  const groundColorU = uniform(new THREE.Color(params.groundColor));
  const floorColorU = uniform(new THREE.Color(params.floorColor));
  const floorGroutColorU = uniform(new THREE.Color(params.floorGroutColor));
  const floorTileSizeU = uniform(params.floorTileSize);
  const causticStrengthU = uniform(params.causticStrength);
  const causticHeightMultiplierU = uniform(params.causticHeightMultiplier);
  const causticColorU = uniform(new THREE.Color(params.causticColor));
  const bigSphereEmissiveColorU = uniform(
    new THREE.Color(params.bigSphereEmissiveColor),
  );
  const bigSphereEmissiveIntensityU = uniform(
    params.bigSphereEmissiveIntensity,
  );
  const lightDirU = uniform(
    new THREE.Vector3(params.sunX, params.sunY, params.sunZ)
      .normalize()
      .negate(),
  );

  // ─── Lighting ───────────────────────────────────────────────────────────────
  const sunLight = new THREE.DirectionalLight(
    params.sunColor,
    params.sunIntensity,
  );
  sunLight.position.set(params.sunX, params.sunY, params.sunZ);
  sunLight.castShadow = params.shadowEnabled;
  sunLight.shadow.mapSize.width = params.shadowMapSize;
  sunLight.shadow.mapSize.height = params.shadowMapSize;
  sunLight.shadow.camera.near = 0.1;
  sunLight.shadow.camera.far = 40;
  sunLight.shadow.camera.left = -45;
  sunLight.shadow.camera.right = 10;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.radius = params.shadowRadius;
  sunLight.shadow.blurSamples = params.shadowBlurSamples;
  sunLight.shadow.bias = params.shadowBias;
  sunLight.shadow.normalBias = params.shadowNormalBias;
  scene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(
    params.ambientColor,
    params.ambientIntensity,
  );
  scene.add(ambientLight);

  // ─── Sky Gradient (background plane) ────────────────────────────────────────
  const skyBottomColorU = uniform(new THREE.Color(params.skyBottomColor));
  const skyHeight = 30;
  const skyGeo = new THREE.PlaneGeometry(120, skyHeight);
  const skyMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  skyMat.colorNode = mix(skyBottomColorU, skyTopColorU, uv().y);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.position.set(0, skyHeight / 2, -50);
  scene.add(skyMesh);

  // ─── Building Material ──────────────────────────────────────────────────────
  const buildingMat = new THREE.MeshStandardNodeMaterial();
  buildingMat.colorNode = buildingColorU;
  buildingMat.roughnessNode = float(0.85);
  buildingMat.metalnessNode = float(0.0);

  // ─── Architecture ───────────────────────────────────────────────────────────

  // Boundary walls with arches (left and right)
  {
    const wallH = 8;
    const wallThickness = 3.5;
    const archRadius = 2.2;
    const archStraight = 2.5;
    const segmentLen = 8;
    const distanceFromCenter = 7;
    for (const { wallX, rotY } of [
      { wallX: -distanceFromCenter, rotY: Math.PI / 2 },
      { wallX: distanceFromCenter, rotY: -Math.PI / 2 },
    ]) {
      const sign = Math.sign(wallX);
      for (let z = 5; z >= -40; z -= segmentLen) {
        const wallShape = new THREE.Shape();
        wallShape.moveTo(0, 0);
        wallShape.lineTo(segmentLen, 0);
        wallShape.lineTo(segmentLen, wallH);
        wallShape.lineTo(0, wallH);
        wallShape.lineTo(0, 0);

        const hole = new THREE.Path();
        const cx = segmentLen / 2;
        hole.moveTo(cx - archRadius, 0);
        hole.lineTo(cx - archRadius, archStraight);
        hole.absarc(cx, archStraight, archRadius, Math.PI, 0, true);
        hole.lineTo(cx + archRadius, 0);
        hole.lineTo(cx - archRadius, 0);
        wallShape.holes.push(hole);

        const geo = new THREE.ExtrudeGeometry(wallShape, {
          depth: wallThickness,
          bevelEnabled: false,
          curveSegments: 16,
        });
        const mesh = new THREE.Mesh(geo, buildingMat);
        mesh.rotation.y = rotY;
        mesh.position.set(
          wallX + (sign * wallThickness) / 2,
          -0.1,
          sign < 0 ? z : z - segmentLen,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  }

  // ─── Right side building details ────────────────────────────────────────────

  // Floor with water pool indentation
  {
    const floorMat = new THREE.MeshStandardNodeMaterial();
    // Procedural square tile pattern using world position
    const worldPos = positionWorld.xz.div(floorTileSizeU);
    const tileUV = fract(worldPos);
    // Distance from tile edge (0 at edge, 0.5 at center)
    const edgeDist = abs(tileUV.sub(0.5));
    const grout = step(0.48, max(edgeDist.x, edgeDist.y));
    floorMat.colorNode = mix(floorColorU, floorGroutColorU, grout);
    floorMat.roughnessNode = float(0.85);
    floorMat.metalnessNode = float(0.0);

    const floorW = 17.5; // spans to outer wall edges at x=±8.75
    const floorD = 50; // z from +7 to -43 (back arch)
    // Derive circular pool cutout from water plane geometry
    const waterCenter = waterPlane.mesh.position;
    const poolRadius_ = Math.min(waterPlane.sizeX, waterPlane.sizeZ) / 2;

    // Pool center in floor-local coordinates (floor rotated -PI/2 around X, positioned at z=7)
    const poolCenterLocalX = waterCenter.x;
    const poolCenterLocalY = 7 - waterCenter.z;

    const shape = new THREE.Shape();
    shape.moveTo(-floorW / 2, 0);
    shape.lineTo(floorW / 2, 0);
    shape.lineTo(floorW / 2, floorD);
    shape.lineTo(-floorW / 2, floorD);
    shape.closePath();

    // Circular hole
    const hole = new THREE.Path();
    hole.absarc(
      poolCenterLocalX,
      poolCenterLocalY,
      poolRadius_ + 0.05,
      0,
      Math.PI * 2,
      false,
    );
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.4,
      bevelEnabled: false,
    });
    const floor = new THREE.Mesh(geo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 7);
    floor.receiveShadow = true;
    floor.castShadow = true;
    scene.add(floor);
  }

  // Steps from platform to pool
  // for (let i = 0; i < 3; i++) {
  //   addBox(3, 0.25, 1, 4.5, 0.1 - i * 0.15, 5.5 + i * 1)
  // }

  // ─── Front arch wall ────────────────────────────────────────────────────────
  {
    const wallW = 22;
    const wallH = 13;
    const archRadius = 3.8;
    const archStraight = 7;

    const wallShape = new THREE.Shape();
    wallShape.moveTo(-wallW / 2, 0);
    wallShape.lineTo(wallW / 2, 0);
    wallShape.lineTo(wallW / 2, wallH);
    wallShape.lineTo(-wallW / 2, wallH);
    wallShape.lineTo(-wallW / 2, 0);

    const hole = new THREE.Path();
    hole.moveTo(-archRadius, 0);
    hole.lineTo(-archRadius, archStraight);
    hole.absarc(0, archStraight, archRadius, Math.PI, 0, true);
    hole.lineTo(archRadius, 0);
    hole.lineTo(-archRadius, 0);
    wallShape.holes.push(hole);

    const archWallGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: 0.8,
      bevelEnabled: false,
      curveSegments: 32,
    });
    const archWall = new THREE.Mesh(archWallGeo, buildingMat);
    //   archWall.position.set(0, -0.1, -11.4)
    archWall.position.set(0, -0.1, -19.5);
    archWall.castShadow = true;
    archWall.receiveShadow = true;
    scene.add(archWall);
  }

  // ─── Back arch frame (double arch) ──────────────────────────────────────────
  {
    const outerRadius = 5.3;
    const innerRadius = 3;
    const straight = 8;

    // Outer arch shape
    const shape = new THREE.Shape();
    shape.moveTo(-outerRadius, 0);
    shape.lineTo(-outerRadius, straight);
    shape.absarc(0, straight, outerRadius, Math.PI, 0, true);
    shape.lineTo(outerRadius, 0);
    shape.lineTo(-outerRadius, 0);

    // Inner arch as hole
    const hole = new THREE.Path();
    hole.moveTo(-innerRadius, 0);
    hole.lineTo(-innerRadius, straight);
    hole.absarc(0, straight, innerRadius, Math.PI, 0, true);
    hole.lineTo(innerRadius, 0);
    hole.lineTo(-innerRadius, 0);
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.8,
      bevelEnabled: false,
      curveSegments: 32,
    });
    const archFrameMat = new THREE.MeshStandardNodeMaterial();
    archFrameMat.colorNode = buildingColorU;
    archFrameMat.roughnessNode = float(0.85);
    archFrameMat.metalnessNode = float(0.0);
    archFrameMat.side = THREE.DoubleSide;
    const archFrame = new THREE.Mesh(geo, archFrameMat);
    //   archFrame.position.set(0, 0, -27.5)
    archFrame.position.set(0, 0, -43);
    archFrame.castShadow = true;
    archFrame.receiveShadow = true;
    scene.add(archFrame);
  }

  // ─── Scenography (back half of the set) ─────────────────────────────────────

  // Columns — arranged in a semicircle around the pool and along the corridor
  {
    const columnGeo = new THREE.CylinderGeometry(0.3, 0.38, 5.5, 16);
    const capGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16);
    const baseGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.35, 16);

    // Semicircle of columns around the back of the pool
    const poolCx = waterPlane.center.x;
    const poolCz = waterPlane.center.z;
    const poolRadius = Math.min(waterPlane.sizeX, waterPlane.sizeZ) / 2;
    const colRing = poolRadius + 1.8;
    const columnPositions = [];
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * 0.15 + ((Math.PI * 0.7) / 4) * i;
      columnPositions.push([
        poolCx + Math.sin(angle) * colRing,
        poolCz - Math.cos(angle) * colRing,
      ]);
    }
    // Corridor columns
    const columnX = 5.2;
    columnPositions.push([-columnX, -14], [columnX, -14]);
    columnPositions.push([-columnX, -23], [columnX, -23]);
    columnPositions.push([-columnX, -33], [columnX, -33]);

    for (const [cx, cz] of columnPositions) {
      const column = new THREE.Mesh(columnGeo, buildingMat);
      column.position.set(cx, 2.75, cz);
      column.castShadow = true;
      column.receiveShadow = true;
      scene.add(column);

      const base = new THREE.Mesh(baseGeo, buildingMat);
      base.position.set(cx, 0.175, cz);
      base.castShadow = true;
      base.receiveShadow = true;
      scene.add(base);

      const cap = new THREE.Mesh(capGeo, buildingMat);
      cap.position.set(cx, 5.65, cz);
      cap.castShadow = true;
      cap.receiveShadow = true;
      scene.add(cap);
    }
  }

  // Decorative spheres on pedestals — flanking the pool and at focal points
  {
    const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.0, 16);
    const sphereDecGeo = new THREE.IcosahedronGeometry(0.4, 4);

    const spherePositions = [
      [-3, 3.2],
      [3, 3.2],
      [0, -40],
    ];

    const sphereMat = new THREE.MeshStandardNodeMaterial();
    const sphereColorU = uniform(new THREE.Color(params.sphereColor));
    sphereMat.colorNode = sphereColorU;
    sphereMat.roughnessNode = float(0.5);
    sphereMat.metalnessNode = float(0.15);

    for (const [sx, sz] of spherePositions) {
      const pedestal = new THREE.Mesh(pedestalGeo, buildingMat);
      pedestal.position.set(sx, 0.5, sz);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      scene.add(pedestal);

      const sph = new THREE.Mesh(sphereDecGeo, sphereMat);
      sph.position.set(sx, 1.4, sz);
      sph.castShadow = true;
      sph.receiveShadow = true;
      scene.add(sph);
    }
  }

  // Freestanding arches
  {
    function createArch(x, z, scale = 1, rotY = 0) {
      const outerR = 1.2 * scale;
      const innerR = 0.9 * scale;
      const straight = 2.5 * scale;
      const depth = 0.4 * scale;

      const shape = new THREE.Shape();
      shape.moveTo(-outerR, 0);
      shape.lineTo(-outerR, straight);
      shape.absarc(0, straight, outerR, Math.PI, 0, true);
      shape.lineTo(outerR, 0);
      shape.lineTo(innerR, 0);
      shape.lineTo(innerR, straight);
      shape.absarc(0, straight, innerR, 0, Math.PI, false);
      shape.lineTo(-innerR, 0);
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 16,
      });
      const mesh = new THREE.Mesh(geo, buildingMat);
      mesh.position.set(x, 0, z + depth / 2);
      mesh.rotation.y = rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    createArch(0, -40, 1.4, 0);
    createArch(4.5, -28, 0.9, Math.PI / 2);
    createArch(-4.5, -18, 0.9, -Math.PI / 2);
  }

  // Stairs going up to the right side
  {
    const stepMat = buildingMat;
    const stepCount = 8;
    const stepH = 0.25;
    const stepD = 0.4;
    const stepW = 2.5;

    const rightZ = -16;

    // Right-side staircase going from center toward the right wall
    for (let i = 0; i < stepCount; i++) {
      const stepGeo = new THREE.BoxGeometry(stepD, stepH * (i + 1), stepW);
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(2.3 + i * stepD, (stepH * (i + 1)) / 2, rightZ);
      step.castShadow = true;
      step.receiveShadow = true;
      scene.add(step);
    }

    // Landing platform at the top
    const landingGeo = new THREE.BoxGeometry(3.5, stepH * stepCount, 4.5);
    const landing = new THREE.Mesh(landingGeo, stepMat);
    landing.position.set(7, (stepH * stepCount) / 2, rightZ);
    landing.castShadow = true;
    landing.receiveShadow = true;
    scene.add(landing);

    const leftZ = -30;

    // Left-side staircase going toward the left wall
    for (let i = 0; i < stepCount; i++) {
      const stepGeo = new THREE.BoxGeometry(stepD, stepH * (i + 1), stepW);
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(-2.3 - i * stepD, (stepH * (i + 1)) / 2, leftZ);
      step.castShadow = true;
      step.receiveShadow = true;
      scene.add(step);
    }

    // Landing platform at the top (left)
    const landingGeo2 = new THREE.BoxGeometry(3.5, stepH * stepCount, 4.5);
    const landing2 = new THREE.Mesh(landingGeo2, stepMat);
    landing2.position.set(-7, (stepH * stepCount) / 2, leftZ);
    landing2.castShadow = true;
    landing2.receiveShadow = true;
    scene.add(landing2);
  }

  // Big sphere half-buried in the ground — centered behind the pool
  {
    const bigSphereMat = new THREE.MeshStandardNodeMaterial();
    bigSphereMat.colorNode = buildingColorU;
    bigSphereMat.emissiveNode = bigSphereEmissiveColorU.mul(
      bigSphereEmissiveIntensityU,
    );
    bigSphereMat.roughnessNode = float(1);
    bigSphereMat.metalnessNode = float(0);
    const bigSphereGeo = new THREE.IcosahedronGeometry(2.2, 5);
    const bigSphere = new THREE.Mesh(bigSphereGeo, bigSphereMat);
    bigSphere.position.set(0, 0.2, -9);
    bigSphere.castShadow = false;
    bigSphere.receiveShadow = false;
    scene.add(bigSphere);
  }

  // Tall obelisk near the back arch
  {
    const obeliskGeo = new THREE.CylinderGeometry(0.15, 0.35, 6, 4);
    const obelisk = new THREE.Mesh(obeliskGeo, buildingMat);
    obelisk.position.set(-4, 3, -38);
    obelisk.castShadow = true;
    obelisk.receiveShadow = true;
    scene.add(obelisk);
  }

  // Floating ring on the pool surface
  {
    const ringGeo = new THREE.TorusGeometry(1.6, 0.08, 16, 48);
    const ringMat = new THREE.MeshStandardNodeMaterial();
    ringMat.colorNode = bigSphereEmissiveColorU;
    ringMat.emissiveNode = bigSphereEmissiveColorU.mul(float(1.5));
    ringMat.roughnessNode = float(0.3);
    ringMat.metalnessNode = float(0.5);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = "floatingRing";
    ring.position.set(
      waterPlane.center.x,
      waterPlane.center.y + 0.3,
      waterPlane.center.z,
    );
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    ring.receiveShadow = false;
    scene.add(ring);
  }

  // ─── Lounge Chairs ──────────────────────────────────────────────────────────
  const woodMat = new THREE.MeshStandardNodeMaterial();
  woodMat.colorNode = color(0x28756a);
  woodMat.roughnessNode = float(0.8);

  const cushionMat = new THREE.MeshStandardNodeMaterial();
  cushionMat.colorNode = color(0xd8f0e8);
  cushionMat.roughnessNode = float(0.6);

  function createLoungeChair(x, z, rotY) {
    const group = new THREE.Group();

    // Frame (base)
    const frameGeo = new THREE.BoxGeometry(0.8, 0.08, 1.9);
    const frame = new THREE.Mesh(frameGeo, woodMat);
    frame.position.y = 0.35;
    frame.position.z = -0.1;
    group.add(frame);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.08, 0.35, 0.08);
    const positions = [
      [-0.35, 0.175, -0.85],
      [0.35, 0.175, -0.85],
      [-0.35, 0.175, 0.85],
      [0.35, 0.175, 0.85],
    ];
    for (const [lx, ly, lz] of positions) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, ly, lz);
      leg.position.z -= 0.1;
      group.add(leg);
    }

    // Cushion (seat)
    const cushionGeo = new THREE.BoxGeometry(0.75, 0.12, 1.4);
    const cushion = new THREE.Mesh(cushionGeo, cushionMat);
    cushion.position.set(0, 0.45, 0.1);
    group.add(cushion);

    // Back rest (angled)
    const backGeo = new THREE.BoxGeometry(0.75, 0.1, 0.7);
    const back = new THREE.Mesh(backGeo, cushionMat);
    back.position.set(0, 0.5, -0.7);
    back.rotation.x = 0.4;
    group.add(back);

    group.position.set(x, 0.2, z);
    group.rotation.y = rotY;
    scene.add(group);
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  createLoungeChair(5, 1.5, (-Math.PI / 2) * 0.85);
  createLoungeChair(5.5, 3.2, (-Math.PI / 2) * 0.85);

  // ─── Ground plane ────────────────────────────────────────────
  const groundMat = new THREE.MeshStandardNodeMaterial();
  groundMat.colorNode = groundColorU;
  groundMat.roughnessNode = float(0.9);
  const groundGeo = new THREE.PlaneGeometry(120, 80);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.01, -30);
  // ground.receiveShadow = true
  scene.add(ground);

  // ─── Caustics (deformed water mesh projected to floor) ──────────────────────
  new WaterCaustics(scene, waterPlane, {
    lightDir: lightDirU,
    floorY: waterPlane.mesh.position.y - 0.24,
    causticColor: causticColorU,
    causticStrength: causticStrengthU,
    baseColor: groundColorU,
    shadowInfluence: params.causticShadowInfluence,
    heightMultiplier: causticHeightMultiplierU,
  });

  function updateOutputPipeline() {
    const { giEnabled, aoEnabled } = giPass;
    const { enabled: ssrEnabled } = ssrPass;
    let node;

    if (giEnabled && aoEnabled) {
      node = ssrEnabled ? traaGiAoSsr : traaGiAo;
    } else if (giEnabled) {
      node = ssrEnabled ? traaGiOnlySsr : traaGiOnly;
    } else if (aoEnabled) {
      node = ssrEnabled ? traaAoOnlySsr : traaAoOnly;
    } else {
      node = ssrEnabled ? traaSsrOnly : scenePassColor;
    }

    if (params.blur > 0) {
      blurPass.textureNode = convertToTexture(node);
      renderPipeline.outputNode = blurPass;
    } else {
      renderPipeline.outputNode = node;
    }
    renderPipeline.needsUpdate = true;
  }
  updateOutputPipeline();
  const colliderPosition = new THREE.Vector3(0, 1.25, -1);
  const colliderRadius = 1.5;

  // ─── Scroll-driven camera Z animation ────────────────────────────────────────
  const cameraStartZ = camera.position.z;
  const cameraMidZ = -14;
  const cameraEndZ = -31;
  const targetStartZ = cameraTarget.z;

  // Ease-in-out transition state
  let transitionFromCamZ = cameraStartZ;
  let transitionFromTargetZ = targetStartZ;
  let transitionToCamZ = cameraStartZ;
  let transitionToTargetZ = targetStartZ;
  let transitionStartTime = 0;
  let transitionProgress = 1;

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  let transitionDuration = params.cameraTransitionDuration;

  const allSections = Array.from(
    scrollRoot.querySelectorAll("[data-intro-step]"),
  );
  const sectionThree = allSections[2];
  const sectionFour = allSections[3];
  const finale = allSections[4];

  let section3Top = 0;
  let section4Top = 0;
  let finaleTop = 0;
  function updateSectionOffsets() {
    section3Top = sectionThree?.offsetTop ?? 0;
    section4Top = sectionFour?.offsetTop ?? 0;
    finaleTop = finale?.offsetTop ?? scrollRoot.scrollHeight;
  }
  updateSectionOffsets();

  function updateCameraProgress() {
    const viewportCenter = scrollRoot.scrollTop + height / 2;

    let newTargetCamZ;
    if (viewportCenter >= section4Top) {
      newTargetCamZ = cameraEndZ;
    } else if (viewportCenter >= section3Top) {
      newTargetCamZ = cameraMidZ;
    } else {
      newTargetCamZ = cameraStartZ;
    }

    if (newTargetCamZ !== transitionToCamZ) {
      transitionFromCamZ = camera.position.z;
      transitionFromTargetZ = cameraTarget.z;
      transitionToCamZ = newTargetCamZ;
      transitionToTargetZ = targetStartZ + (newTargetCamZ - cameraStartZ);
      transitionStartTime = performance.now() / 1000;
      transitionProgress = 0;
      transitionDuration = params.cameraTransitionDuration;
    }
  }
  // Blur transition state
  let blurFrom = 0;
  let blurTo = 0;
  let blurTransitionStart = 0;
  let blurTransitionProgress = 1;

  function updateBlurTarget(targetBlur) {
    if (targetBlur === blurTo) return;
    blurFrom = params.blur;
    blurTo = targetBlur;
    blurTransitionStart = performance.now() / 1000;
    blurTransitionProgress = 0;
  }

  function updateCameraAndBlurProgress() {
    updateCameraProgress();

    const viewportCenter = scrollRoot.scrollTop + height / 2;
    updateBlurTarget(viewportCenter >= finaleTop ? 0.1 : 0);
  }

  scrollRoot.addEventListener("scroll", updateCameraAndBlurProgress, {
    passive: true,
  });

  // ─── Mouse interaction ──────────────────────────────────────────────────────
  const mouseNDC = new THREE.Vector2(-Infinity, -Infinity);

  function handlePointerMove(event) {
    const bounds = container.getBoundingClientRect();
    mouseNDC.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
  }
  scrollRoot.addEventListener("pointermove", handlePointerMove, {
    passive: true,
  });

  // ─── Resize ─────────────────────────────────────────────────────────────────
  function resize() {
    width = Math.max(container.clientWidth, 1);
    height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    updateSectionOffsets();
    updateCameraProgress();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resizeObserver.observe(scrollRoot);

  // ─── Animate ────────────────────────────────────────────────────────────────
  const ringMesh = scene.getObjectByName("floatingRing");
  function animate() {
    const elapsed = performance.now() / 1000;
    if (ringMesh) {
      ringMesh.position.y =
        waterPlane.center.y + 0.28 + Math.sin(elapsed * 0.8) * 0.04;
      ringMesh.rotation.z = elapsed * 0.12;
    }
    colliderPosition.x = Math.sin(elapsed * 0.55) * 1.4;
    colliderPosition.z = waterPlane.center.z + Math.cos(elapsed * 0.4) * 1.2;

    if (transitionProgress < 1) {
      transitionProgress = Math.min(
        (performance.now() / 1000 - transitionStartTime) / transitionDuration,
        1,
      );
      const eased = ease(transitionProgress);
      camera.position.z =
        transitionFromCamZ + (transitionToCamZ - transitionFromCamZ) * eased;
      cameraTarget.z =
        transitionFromTargetZ +
        (transitionToTargetZ - transitionFromTargetZ) * eased;
    }
    camera.lookAt(cameraTarget);

    if (blurTransitionProgress < 1) {
      const prevBlur = params.blur;
      blurTransitionProgress = Math.min(
        (performance.now() / 1000 - blurTransitionStart) / 0.3,
        1,
      );
      const eased =
        1 - (1 - blurTransitionProgress) * (1 - blurTransitionProgress);
      const blurValue = blurFrom + (blurTo - blurFrom) * eased;
      params.blur = blurValue;
      blurDirectionU.value = blurValue * 10;
      if ((prevBlur === 0) !== (blurValue === 0)) {
        updateOutputPipeline();
      }
    }

    if (waterPlane.mesh.visible) {
      waterPlane.update(mouseNDC, camera, colliderPosition, colliderRadius);
    }

    renderPipeline.render();
  }

  function handleVisibilityChange() {
    renderer.setAnimationLoop(document.hidden ? null : animate);
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  updateCameraAndBlurProgress();
  renderer.setAnimationLoop(animate);

  return () => {
    renderer.setAnimationLoop(null);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    scrollRoot.removeEventListener("scroll", updateCameraAndBlurProgress);
    scrollRoot.removeEventListener("pointermove", handlePointerMove);
    resizeObserver.disconnect();
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material.dispose();
      } else if (object.material) {
        object.material.dispose();
      }
    });
    renderPipeline.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
