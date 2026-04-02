import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- HALFTONE CONTROLS ---
const HALFTONE_CONFIG = {
    size: 0.6,               
    rotation: Math.PI / 8,   
    shape: 0                 
};

// --- Scene Setup ---
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

// --- POST-PROCESSING (HDR BLOOM) ---
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
});

const composer = new EffectComposer(renderer, renderTarget);
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    0.3,  
    1.0,  
    0.05   
);

composer.addPass(renderScene);
composer.addPass(bloomPass);

// --- Procedural Sky/Ground Environment ---
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

// --- Chrome Orb ---
const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 250, 250),
    new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.02,
        envMap: envMap, 
        envMapIntensity: 0.4 
    })
);
scene.add(orb);

// --- Particle Logic ---
const canvas = document.createElement('canvas');
canvas.width = 128; canvas.height = 128;
const ctx = canvas.getContext('2d');
const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
grad.addColorStop(0, 'rgba(255,255,255,1)');
grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
grad.addColorStop(1, 'rgba(255,255,255,0)');
ctx.fillStyle = grad;
ctx.fillRect(0,0,128,128);

const particleCount = 3000; 
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(particleCount * 3);
const pRand = new Float32Array(particleCount * 3);
const pTimeOffset = new Float32Array(particleCount);

for(let i=0; i<particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    pPos[i*3] = Math.sin(phi) * Math.cos(theta); 
    pPos[i*3+1] = Math.sin(phi) * Math.sin(theta); 
    pPos[i*3+2] = Math.cos(phi); 
    pRand[i*3] = Math.random();
    pRand[i*3+1] = Math.random();
    pRand[i*3+2] = Math.random();
    pTimeOffset[i] = Math.random() * 5.0; 
}

pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aRand', new THREE.BufferAttribute(pRand, 3));
pGeo.setAttribute('aTimeOffset', new THREE.BufferAttribute(pTimeOffset, 1));

const pMat = new THREE.ShaderMaterial({
    uniforms: { 
        uTime: { value: 0 }, 
        uTexture: { value: new THREE.CanvasTexture(canvas) },
        uBurst: { value: 0.0 },
        uHtSize: { value: HALFTONE_CONFIG.size },
        uHtRotation: { value: HALFTONE_CONFIG.rotation },
        uHtShape: { value: HALFTONE_CONFIG.shape }
    },
    transparent: true,
    blending: THREE.AdditiveBlending, 
    depthWrite: false, 
    vertexShader: `
        uniform float uTime;
        uniform float uBurst;
        attribute vec3 aRand;
        attribute float aTimeOffset;
        varying float vAlpha;
        varying vec3 vColor;

        vec3 getWind(vec3 p, float t) {
            float x = sin(p.y * 1.2 + t * -1.5) * 0.4;
            float z = cos(p.y * -2.1 + t * 5.3) * 0.4;
            return vec3(x, -1.0, z);
        }

        void main() {
            float maxLife = 2.0 + (aRand.y * 1.5); 
            float age = mod(uTime + aTimeOffset, maxLife);
            float normalizedAge = age / maxLife; 

            vec3 startPos = normalize(position) * 1.25; 
            vec3 pos = startPos;
            
            float burstForce = uBurst * aRand.x * 2.5;
            pos += normalize(startPos) * burstForce * (1.0 - normalizedAge);

            pos.y += age * 3.0; 

            float orbRadius = 1.0; 
            if (pos.y < orbRadius) {
                float surfaceDist = sqrt(max(0.0, orbRadius*orbRadius - pos.y*pos.y));
                if (length(pos.xz) < surfaceDist) {
                    pos.xz = normalize(pos.xz) * surfaceDist;
                }
            }

            if (pos.y > orbRadius) {
                pos.xz *= exp(-(pos.y - orbRadius) * 0.5);
            }

            pos += getWind(pos, uTime) * age * 1.5;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 0.9);
            gl_Position = projectionMatrix * mvPosition;
            
            float burstShrink = 1.0 - (uBurst * aRand.x * 0.7); 
            
            gl_PointSize = (100.0 * aRand.x + 300.0) * burstShrink * sin(normalizedAge * 3.14) * (15.0 / -mvPosition.z);

            vec3 magenta = vec3(4.0, 0.0, 4.0);
            vec3 green = vec3(0.0, 4.0, 1.0);
            
            vColor = mix(magenta, green, step(0.6, aRand.z));
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
            if (uHtShape == 0) {
                pattern = sin(screenPos.x) * sin(screenPos.y); 
            } else if (uHtShape == 1) {
                pattern = sin(screenPos.x); 
            } else if (uHtShape == 2) {
                pattern = sin(screenPos.x) + sin(screenPos.y); 
            }
            
            float threshold = 0.4 + (alphaMask * -0.2);
            if (uHtShape == 2) threshold *= 1.5; 
            
            if (pattern < threshold) discard;

            gl_FragColor = vec4(vColor, alphaMask * 0.4);
        }
    `
});

const firePoints = new THREE.Points(pGeo, pMat);
scene.add(firePoints);

// --- INTERACTION LOGIC ---
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

// Time & Speed Management Variables
let previousRealTime = performance.now() * 0.001;
let visualTime = 0.0;
let currentSpeed = 1.0;
let slowMoReleaseTime = 0;

function handleInteractionStart(x, y) {
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(orb);
    
    if (intersects.length > 0) {
        isPressed = true;
        targetScale = 1.25; 
        targetBurst = 1.0; 
        slowMoReleaseTime = 0; 
    }
}

function handleInteractionEnd() {
    if (isPressed) {
        slowMoReleaseTime = performance.now() * 0.001;
    }
    isPressed = false;
    targetScale = 1.0;
    targetBurst = 0.0; 
}

window.addEventListener('mousedown', (e) => handleInteractionStart(e.clientX, e.clientY));
window.addEventListener('mouseup', handleInteractionEnd);

window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY);
});
window.addEventListener('touchend', handleInteractionEnd);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    const realTime = performance.now() * 0.001;
    const dt = realTime - previousRealTime;
    previousRealTime = realTime;
    
    controls.update();
    
    pMat.uniforms.uHtSize.value = HALFTONE_CONFIG.size;
    pMat.uniforms.uHtRotation.value = HALFTONE_CONFIG.rotation;
    pMat.uniforms.uHtShape.value = HALFTONE_CONFIG.shape;

    // --- SPEED STATE MACHINE ---
    if (isPressed) {
        // Drop into deep slow-mo (0.25x)
        currentSpeed += (0.25 - currentSpeed) * 0.15; 
    } else {
        if (slowMoReleaseTime > 0) {
            const timeSinceRelease = realTime - slowMoReleaseTime;
            
            if (timeSinceRelease < 2.0) {
                // EASE: 2 Second transition from 0.25x back to 1.0x speed
                const t = timeSinceRelease / 2.0; 
                const smoothstepCurve = t * t * (3.0 - 2.0 * t); 
                // Start at 0.25, and add up to 0.75 based on the curve to reach 1.0
                currentSpeed = 0.25 + (0.75 * smoothstepCurve);
            } else {
                // REST: Return to normal
                currentSpeed = 1.0;
            }
        } else {
            currentSpeed += (1.0 - currentSpeed) * 0.1;
        }
    }

    visualTime += dt * currentSpeed;

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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    renderTarget.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();