import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

const HALFTONE_CONFIG = { size: 0.6, rotation: Math.PI / 8, shape: 0 };

const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0); 
controls.enableDamping = true;
controls.enablePan = false; 
controls.autoRotate = true; 
controls.autoRotateSpeed = -1.5; 
controls.update();

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
});

const composer = new EffectComposer(renderer, renderTarget);
const renderScene = new RenderPass(scene, camera);

// --- MOBILE BLOOM LOGIC ---
// If the screen is mobile-sized, heavily reduce bloom strength and raise the threshold
const isMobile = window.innerWidth <= 768;
const bloomStrength = isMobile ? 0.12 : 0.3;
const bloomThreshold = isMobile ? 0.1 : 0.05;

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), bloomStrength, 1.0, bloomThreshold);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const envScene = new THREE.Scene();
const envGeo = new THREE.SphereGeometry(50, 64, 64);
const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec3 dir = normalize(vWorldPosition);
            vec3 skyColor = mix(vec3(0.0), vec3(0.02, 0.0, 0.04), dir.y);
            vec3 groundColor = vec3(0.0);
            float horizon = smoothstep(-0.01, 0.01, dir.y);
            gl_FragColor = vec4(mix(groundColor, skyColor, horizon), 1.0);
        }
    `
});
envScene.add(new THREE.Mesh(envGeo, envMat));
const envMap = new THREE.PMREMGenerator(renderer).fromScene(envScene).texture;

const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 250, 250),
    new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 1.0, roughness: 0.02, envMap: envMap, envMapIntensity: 0.4 
    })
);
scene.add(orb);

// --- AUDIO REACTIVE SETUP ---
let audioCtx, analyser, dataArray, mediaStream;
let isAudioActive = false;
let smoothedLow = 0;
let smoothedHigh = 0;

const micBtn = document.getElementById('mic-btn');
micBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (isAudioActive) {
        if (mediaStream) mediaStream.getTracks().forEach(track => track.stop()); 
        if (audioCtx) audioCtx.close(); 
        isAudioActive = false;
        micBtn.classList.remove('active');
        return;
    } 

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(mediaStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; 
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        isAudioActive = true;
        micBtn.classList.add('active');
    } catch (err) {
        console.error('Mic access denied:', err);
        alert('Microphone access is required to use the Audio Reactive mode.');
    }
});


// --- GPGPU SETUP (TRUE FLUID INERTIA) ---
const WIDTH = 64;
const particleCount = WIDTH * WIDTH; 

const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
const dtOffsetPos = gpuCompute.createTexture(); 
const dtOffsetVel = gpuCompute.createTexture(); 
const dtBaseInfo1 = gpuCompute.createTexture(); 
const dtBaseInfo2 = gpuCompute.createTexture(); 

const b1 = dtBaseInfo1.image.data;
const b2 = dtBaseInfo2.image.data;

const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(particleCount * 3);
const pRand = new Float32Array(particleCount * 3);
const pTimeOffset = new Float32Array(particleCount);
const pUv = new Float32Array(particleCount * 2); 

for(let i=0; i<particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const startX = Math.sin(phi) * Math.cos(theta);
    const startY = Math.sin(phi) * Math.sin(theta);
    const startZ = Math.cos(phi);

    pPos[i*3] = startX; pPos[i*3+1] = startY; pPos[i*3+2] = startZ;

    const rx = Math.random(); const ry = Math.random(); const rz = Math.random();
    pRand[i*3] = rx; pRand[i*3+1] = ry; pRand[i*3+2] = rz;

    const tOff = Math.random() * 5.0;
    pTimeOffset[i] = tOff;

    pUv[i*2] = (i % WIDTH) / WIDTH; pUv[i*2+1] = Math.floor(i / WIDTH) / WIDTH;

    b1[i*4 + 0] = startX; b1[i*4 + 1] = startY; b1[i*4 + 2] = startZ; b1[i*4 + 3] = tOff;
    b2[i*4 + 0] = rx; b2[i*4 + 1] = ry; b2[i*4 + 2] = rz; b2[i*4 + 3] = 0.0; 
}

const offsetVelShader = `
    uniform float uTime;
    uniform float dt;
    uniform float uBurst;
    uniform float uSporeBlend;
    uniform float uAudioLow;  
    uniform float uAudioHigh; 
    uniform vec3 uMouse3D;
    uniform vec3 uMouseVel;
    uniform sampler2D tBaseInfo1; 
    uniform sampler2D tBaseInfo2; 

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 offsetPos = texture2D(tOffsetPos, uv).xyz;
        vec3 offsetVel = texture2D(tOffsetVel, uv).xyz;

        vec4 base1 = texture2D(tBaseInfo1, uv);
        vec4 base2 = texture2D(tBaseInfo2, uv);

        vec3 aStartXYZ = base1.xyz;
        float timeOffset = base1.w;
        vec3 aRand = base2.xyz;

        float maxLife = 2.0 + (aRand.y * 1.5);
        float age = mod(uTime + timeOffset, maxLife);
        float normalizedAge = age / maxLife;

        float sRad = mix(1.25, 2.0, uSporeBlend);
        vec3 startPos = normalize(aStartXYZ) * sRad;
        vec3 basePos = startPos;
        
        float burstForce = uBurst * aRand.x * 2.5;
        basePos += normalize(startPos) * burstForce * (1.0 - normalizedAge);

        float fireY = age * 3.0;
        float sporeY = -age * 0.4;
        basePos.y += mix(fireY, sporeY, uSporeBlend);

        float orbRadius = 1.0;
        if (basePos.y > -orbRadius && basePos.y < orbRadius) {
            float surfaceDist = sqrt(max(0.0, orbRadius*orbRadius - basePos.y*basePos.y));
            if (length(basePos.xz) < surfaceDist) {
                basePos.xz = normalize(basePos.xz) * surfaceDist;
            }
        }
        float taperTop = exp(-(basePos.y - orbRadius) * 0.5);
        float taperBot = exp(-(-basePos.y - orbRadius) * 1.5);
        if (basePos.y > orbRadius) basePos.xz *= mix(taperTop, 1.0, uSporeBlend);
        if (basePos.y < -orbRadius) basePos.xz *= mix(1.0, taperBot, uSporeBlend);

        float fx = sin(basePos.y * 1.2 + uTime * -1.5) * 0.4;
        float fz = cos(basePos.y * -2.1 + uTime * 5.3) * 0.4;
        float sx = sin(basePos.y * 3.0 + uTime * 0.5) * 0.5;
        float sz = cos(basePos.y * -2.8 + uTime * 0.6) * 0.5;
        vec3 wind = vec3(mix(fx, sx, uSporeBlend), mix(-1.0, 0.0, uSporeBlend), mix(fz, sz, uSporeBlend));
        basePos += wind * age * mix(1.5, 0.5, uSporeBlend);

        vec3 actualPos = basePos + offsetPos;
        float individualStrength = mix(0.4, 1.0, fract(aRand.y * 11.7));

        float distToMouse = length(actualPos - uMouse3D);
        float mouseForce = smoothstep(4.5, 0.0, distToMouse);
        vec3 repulseDir = actualPos - uMouse3D;
        repulseDir.x += sin(uTime * 3.0 + aRand.y * 15.0) * 0.8;
        repulseDir.z += cos(uTime * 3.0 + aRand.x * 15.0) * 0.8;
        repulseDir.y += 0.8;
        if (length(repulseDir) < 0.01) repulseDir = vec3(0.0, 1.0, 0.0);
        
        float curRepulse = mix(16.0, 4.0, uSporeBlend);
        vec3 repulsion = normalize(repulseDir) * mouseForce * curRepulse * individualStrength; 

        float dragForce = smoothstep(5.5, 0.0, distToMouse);
        float rawSpeed = length(uMouseVel);
        
        float curDrag = mix(25.0, 6.0, uSporeBlend);
        float boostedSpeed = pow(rawSpeed, 0.4) * curDrag; 
        
        vec3 dragDir = rawSpeed > 0.0001 ? normalize(uMouseVel) : vec3(0.0);
        vec3 drag = dragDir * boostedSpeed * dragForce * individualStrength;

        float distToCenter = length(actualPos);
        float kickForce = exp(-distToCenter * 1.5) * uAudioLow * 120.0; 
        vec3 kickDir = actualPos;
        if (length(kickDir) < 0.01) kickDir = vec3(0.0, 1.0, 0.0);
        vec3 audioKick = normalize(kickDir) * kickForce * individualStrength;

        vec3 audioJitter = vec3(
            sin(uTime * 25.0 + aRand.x * 50.0),
            cos(uTime * 27.0 + aRand.y * 50.0),
            sin(uTime * 23.0 + aRand.z * 50.0)
        ) * uAudioHigh * 30.0 * individualStrength;

        vec3 addedForce = (repulsion + drag + audioKick + audioJitter) * dt;
        addedForce = clamp(addedForce, vec3(-100.0), vec3(100.0));
        
        offsetVel += addedForce;

        float curSpring = mix(3.5, 0.3, uSporeBlend);
        vec3 springForce = -offsetPos * curSpring;
        offsetVel += springForce * dt;

        float curFric = mix(5.0, 2.5, uSporeBlend);
        offsetVel *= exp(-curFric * dt);

        gl_FragColor = vec4(offsetVel, 1.0);
    }
`;

const offsetPosShader = `
    uniform float dt;
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 pos = texture2D(tOffsetPos, uv).xyz;
        vec3 vel = texture2D(tOffsetVel, uv).xyz;
        pos += vel * dt;
        gl_FragColor = vec4(pos, 1.0);
    }
`;

const velVar = gpuCompute.addVariable('tOffsetVel', offsetVelShader, dtOffsetVel);
const posVar = gpuCompute.addVariable('tOffsetPos', offsetPosShader, dtOffsetPos);
gpuCompute.setVariableDependencies(velVar, [velVar, posVar]);
gpuCompute.setVariableDependencies(posVar, [velVar, posVar]);

velVar.material.uniforms.uTime = { value: 0 };
velVar.material.uniforms.dt = { value: 0 };
velVar.material.uniforms.uBurst = { value: 0 };
velVar.material.uniforms.uSporeBlend = { value: 0 };
velVar.material.uniforms.uAudioLow = { value: 0 };
velVar.material.uniforms.uAudioHigh = { value: 0 };
velVar.material.uniforms.uMouse3D = { value: new THREE.Vector3(999,999,999) };
velVar.material.uniforms.uMouseVel = { value: new THREE.Vector3(0,0,0) };
velVar.material.uniforms.tBaseInfo1 = { value: dtBaseInfo1 };
velVar.material.uniforms.tBaseInfo2 = { value: dtBaseInfo2 };
posVar.material.uniforms.dt = { value: 0 };

gpuCompute.init();

// --- Main Particle Material ---
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aRand', new THREE.BufferAttribute(pRand, 3));
pGeo.setAttribute('aTimeOffset', new THREE.BufferAttribute(pTimeOffset, 1));
pGeo.setAttribute('aUv', new THREE.BufferAttribute(pUv, 2));

const canvas = document.createElement('canvas');
canvas.width = 128; canvas.height = 128;
const ctx = canvas.getContext('2d');
const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
grad.addColorStop(0, 'rgba(255,255,255,1)');
grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
grad.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = grad;
ctx.fillRect(0,0,128,128);

const pMat = new THREE.ShaderMaterial({
    uniforms: { 
        uTime: { value: 0 }, 
        uTexture: { value: new THREE.CanvasTexture(canvas) },
        uBurst: { value: 0.0 },
        uSporeBlend: { value: 0.0 },
        uHtSize: { value: HALFTONE_CONFIG.size },
        uHtRotation: { value: HALFTONE_CONFIG.rotation },
        uHtShape: { value: HALFTONE_CONFIG.shape },
        tOffsetPos: { value: null } 
    },
    transparent: true,
    blending: THREE.AdditiveBlending, 
    depthWrite: false, 
    vertexShader: `
        uniform float uTime;
        uniform float uBurst;
        uniform float uSporeBlend;
        uniform sampler2D tOffsetPos;
        
        attribute vec2 aUv;
        attribute vec3 aRand;
        attribute float aTimeOffset;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
            vec3 aStartXYZ = position;
            
            float maxLife = 2.0 + (aRand.y * 1.5);
            float age = mod(uTime + aTimeOffset, maxLife);
            float normalizedAge = age / maxLife;

            float sRad = mix(1.25, 2.0, uSporeBlend);
            vec3 startPos = normalize(aStartXYZ) * sRad;
            vec3 basePos = startPos;
            
            float burstForce = uBurst * aRand.x * 2.5;
            basePos += normalize(startPos) * burstForce * (1.0 - normalizedAge);

            float fireY = age * 3.0;
            float sporeY = -age * 0.4;
            basePos.y += mix(fireY, sporeY, uSporeBlend);

            float orbRadius = 1.0;
            if (basePos.y > -orbRadius && basePos.y < orbRadius) {
                float surfaceDist = sqrt(max(0.0, orbRadius*orbRadius - basePos.y*basePos.y));
                if (length(basePos.xz) < surfaceDist) {
                    basePos.xz = normalize(basePos.xz) * surfaceDist;
                }
            }
            float taperTop = exp(-(basePos.y - orbRadius) * 0.5);
            float taperBot = exp(-(-basePos.y - orbRadius) * 1.5);
            if (basePos.y > orbRadius) basePos.xz *= mix(taperTop, 1.0, uSporeBlend);
            if (basePos.y < -orbRadius) basePos.xz *= mix(1.0, taperBot, uSporeBlend);

            float fx = sin(basePos.y * 1.2 + uTime * -1.5) * 0.4;
            float fz = cos(basePos.y * -2.1 + uTime * 5.3) * 0.4;
            float sx = sin(basePos.y * 3.0 + uTime * 0.5) * 0.5;
            float sz = cos(basePos.y * -2.8 + uTime * 0.6) * 0.5;
            vec3 wind = vec3(mix(fx, sx, uSporeBlend), mix(-1.0, 0.0, uSporeBlend), mix(fz, sz, uSporeBlend));
            basePos += wind * age * mix(1.5, 0.5, uSporeBlend);

            vec3 physicalOffset = texture2D(tOffsetPos, aUv).xyz;
            vec3 finalPos = basePos + physicalOffset;

            vec4 mvPosition = modelViewMatrix * vec4(finalPos, 0.9);
            gl_Position = projectionMatrix * mvPosition;
            
            float burstShrink = 1.0 - (uBurst * aRand.x * 0.7); 
            float sizeMultiplier = mix(1.0, 0.1, uSporeBlend);
            gl_PointSize = (100.0 * aRand.x + 300.0) * burstShrink * sin(normalizedAge * 3.14) * (15.0 / -mvPosition.z) * sizeMultiplier;

            vec3 fireMag = vec3(4.0, 0.0, 4.0);
            vec3 fireGrn = vec3(0.0, 4.0, 1.0);
            vec3 sporeCyan = vec3(0.0, 4.0, 3.0);
            vec3 sporeGrn = vec3(1.0, 4.0, 0.0);
            
            vec3 c1 = mix(fireMag, sporeCyan, uSporeBlend);
            vec3 c2 = mix(fireGrn, sporeGrn, uSporeBlend);
            
            vColor = mix(c1, c2, step(0.6, aRand.z));
            vAlpha = smoothstep(1.5, 0.1, normalizedAge) * smoothstep(1.0, 0.05, normalizedAge);
        }
    `,
    fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uHtSize;
        uniform float uHtRotation;
        uniform int uHtShape;
        
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
            vec2 uv = gl_PointCoord;
            vec4 tex = texture2D(uTexture, uv);
            float alphaMask = tex.a * vAlpha;
            if (alphaMask < 0.7) discard; 
            
            vec2 screenPos = gl_FragCoord.xy * uHtSize;
            float s = sin(uHtRotation);
            float c = cos(uHtRotation);
            screenPos = mat2(c, -s, s, c) * screenPos;
            
            float pattern = 0.0;
            if (uHtShape == 0) pattern = sin(screenPos.x) * sin(screenPos.y); 
            else if (uHtShape == 1) pattern = sin(screenPos.x); 
            else if (uHtShape == 2) pattern = sin(screenPos.x) + sin(screenPos.y); 
            
            float threshold = 0.4 + (alphaMask * -0.2);
            if (uHtShape == 2) threshold *= 1.5; 
            if (pattern < threshold) discard;

            gl_FragColor = vec4(vColor, alphaMask * 0.4);
        }
    `
});

const firePoints = new THREE.Points(pGeo, pMat);
scene.add(firePoints);

// --- INTERACTION LOGIC & STATE ---
let targetScale = 1.0;
let currentScale = 1.0;
let scaleVel = 0;
const springK = 0.08; 
const damping = 0.85; 

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let currentBurst = 0.0;
let targetBurst = 0.0; 
let isPressed = false;

let previousRealTime = performance.now() * 0.001;
let visualTime = 0.0;
let currentSpeed = 1.0;
let slowMoReleaseTime = 0;

let lastClickTime = 0;
let targetSporeBlend = 0.0;
let currentSporeBlend = 0.0;

const virtualPlane = new THREE.Plane(); 
const mouse3D = new THREE.Vector3(999, 999, 999);
let lastMouse3D = new THREE.Vector3(999, 999, 999);
let targetMouseVel = new THREE.Vector3();
let currentMouseVel = new THREE.Vector3();

function handlePointerMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    virtualPlane.setFromNormalAndCoplanarPoint(cameraDir.negate(), new THREE.Vector3(0, 0, 0));
    
    raycaster.setFromCamera(mouse, camera);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(virtualPlane, intersectPoint);
    
    if (intersectPoint) {
        if (lastMouse3D.x === 999) {
            mouse3D.copy(intersectPoint);
            lastMouse3D.copy(intersectPoint);
        } else {
            targetMouseVel.subVectors(intersectPoint, lastMouse3D).multiplyScalar(3.0);
            mouse3D.copy(intersectPoint);
            lastMouse3D.copy(intersectPoint);
        }
    }
}

function handleInteractionStart(e) {
    if (e.target.closest('#ui-layer')) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(orb);
    
    if (intersects.length > 0) {
        const now = performance.now();
        
        if (now - lastClickTime < 300) {
            targetSporeBlend = targetSporeBlend > 0.5 ? 0.0 : 1.0;
            currentScale = 1.6; 
            currentBurst = 3.0; 
            lastClickTime = 0; 
        } else {
            lastClickTime = now;
            isPressed = true;
            slowMoReleaseTime = 0; 
        }
    }
}

function handleInteractionEnd() {
    if (isPressed) slowMoReleaseTime = performance.now() * 0.001;
    isPressed = false;
}

window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerdown', handleInteractionStart);
window.addEventListener('pointerup', handleInteractionEnd);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    const realTime = performance.now() * 0.001;
    const rawDt = realTime - previousRealTime;
    previousRealTime = realTime;
    const dt = Math.min(rawDt, 0.05); 
    
    controls.update();

    let rawLow = 0;
    let rawHigh = 0;
    
    if (isAudioActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
        let lowSum = 0;
        for(let i = 0; i < 10; i++) lowSum += dataArray[i];
        rawLow = (lowSum / 10) / 255.0; 

        let highSum = 0;
        for(let i = 50; i < 100; i++) highSum += dataArray[i];
        rawHigh = (highSum / 50) / 255.0; 
    }
    
    smoothedLow += (rawLow - smoothedLow) * 0.2;
    smoothedHigh += (rawHigh - smoothedHigh) * 0.2;

    currentSporeBlend += (targetSporeBlend - currentSporeBlend) * 0.02;
    
    pMat.uniforms.uHtSize.value = HALFTONE_CONFIG.size;
    pMat.uniforms.uHtRotation.value = HALFTONE_CONFIG.rotation;
    pMat.uniforms.uHtShape.value = HALFTONE_CONFIG.shape;
    pMat.uniforms.uSporeBlend.value = currentSporeBlend;

    targetMouseVel.lerp(new THREE.Vector3(0, 0, 0), 0.015); 
    currentMouseVel.lerp(targetMouseVel, 0.05);

    let baseScale = 1.0 + (smoothedLow * 0.8); 
    
    if (isPressed) {
        currentSpeed += (0.25 - currentSpeed) * 0.15; 
        targetScale = baseScale + 0.25; 
        targetBurst = 1.0; 
    } else {
        targetScale = baseScale;
        targetBurst = smoothedLow * 2.5; 
        
        if (slowMoReleaseTime > 0) {
            const timeSinceRelease = realTime - slowMoReleaseTime;
            if (timeSinceRelease < 2.0) {
                const t = timeSinceRelease / 2.0; 
                const smoothstepCurve = t * t * (3.0 - 2.0 * t); 
                currentSpeed = 0.25 + (0.75 * smoothstepCurve);
            } else {
                currentSpeed = 1.0;
            }
        } else {
            currentSpeed += (1.0 - currentSpeed) * 0.1;
        }
    }

    const visualDt = dt * currentSpeed;
    visualTime += visualDt;

    velVar.material.uniforms.uTime.value = visualTime;
    velVar.material.uniforms.dt.value = visualDt; 
    velVar.material.uniforms.uBurst.value = currentBurst;
    velVar.material.uniforms.uSporeBlend.value = currentSporeBlend;
    velVar.material.uniforms.uAudioLow.value = smoothedLow;
    velVar.material.uniforms.uAudioHigh.value = smoothedHigh;
    velVar.material.uniforms.uMouse3D.value.copy(mouse3D);
    velVar.material.uniforms.uMouseVel.value.copy(currentMouseVel);
    posVar.material.uniforms.dt.value = visualDt;

    gpuCompute.compute();
    
    pMat.uniforms.tOffsetPos.value = gpuCompute.getCurrentRenderTarget(posVar).texture;

    let force = (targetScale - currentScale) * springK;
    scaleVel += force;
    scaleVel *= damping;
    currentScale += scaleVel;
    orb.scale.setScalar(currentScale);

    currentBurst += (targetBurst - currentBurst) * 0.1; 
    pMat.uniforms.uBurst.value = currentBurst;
    
    pMat.uniforms.uTime.value = visualTime;
    
    const floatY = Math.sin(visualTime * 0.8) * 0.1;
    orb.position.y = floatY;
    firePoints.position.y = floatY;
    
    composer.render();
}

window.addEventListener('resize', () => {
    // --- MOBILE BLOOM DYNAMIC UPDATE ---
    const isMobileResize = window.innerWidth <= 768;
    bloomPass.strength = isMobileResize ? 0.12 : 0.3;
    bloomPass.threshold = isMobileResize ? 0.1 : 0.05;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderTarget.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();