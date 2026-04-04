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
controls.target.set(0, 1, 0); 
controls.enableDamping = true;
controls.enablePan = false; 
controls.autoRotate = false; 
controls.autoRotateSpeed = -0.5; 
controls.update();

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
});

const composer = new EffectComposer(renderer, renderTarget);
const renderScene = new RenderPass(scene, camera);

// --- MOBILE STATE & BLOOM LOGIC ---
const isMobile = window.innerWidth <= 768;
const bloomStrength = isMobile ? 0.08 : 0.15;
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

// 1. The Visual Orb (FIXED TYPO HERE)
const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 250, 250),
    new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 1.0, roughness: 0.02, envMap: envMap, envMapIntensity: 0.4 
    })
);
scene.add(orb);

// 2. The Invisible Hitbox
const hitBox = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 16, 16),
    new THREE.MeshBasicMaterial({ visible: false })
);
scene.add(hitBox);


// --- 1. TOP HOLOGRAPHIC LED MARQUEE ---
const textCanvas = document.createElement('canvas');
textCanvas.height = 64;  
const tCtx = textCanvas.getContext('2d', { willReadFrequently: true });

const ledTexture = new THREE.CanvasTexture(textCanvas);
ledTexture.minFilter = THREE.NearestFilter;
ledTexture.magFilter = THREE.NearestFilter;
ledTexture.wrapS = THREE.RepeatWrapping; 
ledTexture.wrapT = THREE.ClampToEdgeWrapping;

function updateMarqueeText(text) {
    tCtx.font = 'bold 50px "SF Mono", "Roboto Mono", monospace'; 
    const segment = `${text} *** `;
    const segmentWidth = tCtx.measureText(segment).width;
    
    const IDEAL_WIDTH = 1930; 
    let count = Math.round(IDEAL_WIDTH / segmentWidth);
    if (count < 1) count = 1; 
    
    textCanvas.width = segmentWidth * count;
    
    tCtx.fillStyle = '#000000'; 
    tCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    
    tCtx.fillStyle = '#ffffff'; 
    tCtx.font = 'bold 50px "SF Mono", "Roboto Mono", monospace'; 
    tCtx.textAlign = 'left';
    tCtx.textBaseline = 'middle';
    
    for(let i = 0; i < count; i++) {
        tCtx.fillText(segment, i * segmentWidth, textCanvas.height / 2 + 4); 
    }
    
    ledTexture.needsUpdate = true;
}

updateMarqueeText("Fireside [Meetup]");

const ledMat = new THREE.ShaderMaterial({
    uniforms: {
        tText: { value: ledTexture },
        uTime: { value: 0 }
    },
    transparent: true,
    side: THREE.DoubleSide, 
    blending: THREE.AdditiveBlending, 
    depthWrite: false, 
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tText;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
            float rows = 24.0;   
            float cols = 720.0;  

            vec2 gridUv = vec2(floor(vUv.x * cols) / cols, floor(vUv.y * rows) / rows);
            vec2 sampleUv = gridUv;
            
            // Top Line
            sampleUv.x += uTime * 0.01; 
            
            vec4 textData = texture2D(tText, sampleUv);
            vec2 cellUv = fract(vUv * vec2(cols, rows)) - 0.5;
            float dist = length(cellUv);
            float ledRadius = 0.25; 
            float ledMask = smoothstep(ledRadius, ledRadius - 0.05, dist);
            
            float isOn = step(0.5, textData.r);
            float finalAlpha = ledMask * isOn;
            
            if (finalAlpha < 0.01) discard; 
            
            vec3 ledColor = vec3(0.0, 5.0, 0.0); 
            gl_FragColor = vec4(ledColor, finalAlpha);
        }
    `
});

const ledGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.5, 64, 16, true);
const ledRing = new THREE.Mesh(ledGeo, ledMat);
ledRing.position.y = 3.0; 
scene.add(ledRing);


// --- 2. BOTTOM HOLOGRAPHIC LED MARQUEE ---
const textCanvasBottom = document.createElement('canvas');
textCanvasBottom.height = 64;  
const tCtxBottom = textCanvasBottom.getContext('2d', { willReadFrequently: true });

const ledTextureBottom = new THREE.CanvasTexture(textCanvasBottom);
ledTextureBottom.minFilter = THREE.NearestFilter;
ledTextureBottom.magFilter = THREE.NearestFilter;
ledTextureBottom.wrapS = THREE.RepeatWrapping; 
ledTextureBottom.wrapT = THREE.ClampToEdgeWrapping;

function updateMarqueeBottom(text) {
    tCtxBottom.font = 'bold 50px "SF Mono", "Roboto Mono", monospace'; 
    const segment = `${text} *** `;
    const segmentWidth = tCtxBottom.measureText(segment).width;
    
    const IDEAL_WIDTH = 1930; 
    let count = Math.round(IDEAL_WIDTH / segmentWidth);
    if (count < 1) count = 1; 
    
    textCanvasBottom.width = segmentWidth * count;
    
    tCtxBottom.fillStyle = '#000000'; 
    tCtxBottom.fillRect(0, 0, textCanvasBottom.width, textCanvasBottom.height);
    
    tCtxBottom.fillStyle = '#ffffff'; 
    tCtxBottom.font = 'bold 50px "SF Mono", "Roboto Mono", monospace'; 
    tCtxBottom.textAlign = 'left';
    tCtxBottom.textBaseline = 'middle';
    
    for(let i = 0; i < count; i++) {
        tCtxBottom.fillText(segment, i * segmentWidth, textCanvasBottom.height / 2 + 4); 
    }
    
    ledTextureBottom.needsUpdate = true;
}

updateMarqueeBottom("Thursday April 23rd @ 7:00PM @ Goodies Snack Shop");

const ledMatBottom = new THREE.ShaderMaterial({
    uniforms: {
        tText: { value: ledTextureBottom },
        uTime: { value: 0 }
    },
    transparent: true,
    side: THREE.DoubleSide, 
    blending: THREE.AdditiveBlending, 
    depthWrite: false, 
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tText;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
            float rows = 17.0;   
            float cols = 720.0;  

            vec2 gridUv = vec2(floor(vUv.x * cols) / cols, floor(vUv.y * rows) / rows);
            vec2 sampleUv = gridUv;
            
            // Bottom Line 
            sampleUv.x += uTime * 0.03; 
            
            vec4 textData = texture2D(tText, sampleUv);
            vec2 cellUv = fract(vUv * vec2(cols, rows)) - 0.5;
            float dist = length(cellUv);
            float ledRadius = 0.25; 
            float ledMask = smoothstep(ledRadius, ledRadius - 0.05, dist);
            
            // INVERTED LOGIC: 1.0 - step() makes black canvas pixels ON, and white text pixels OFF
            float isOn = 1.0 - step(0.5, textData.r);
            float finalAlpha = ledMask * isOn;
            
            if (finalAlpha < 0.01) discard; 
            
            // Dialed back slightly to 2.5 because 90% of the LEDs are now on, keeping the bloom controlled
            vec3 ledColor = vec3(0.0, 2.5, 0.0); 
            gl_FragColor = vec4(ledColor, finalAlpha);
        }
    `
});

const ledGeoBottom = new THREE.CylinderGeometry(2.4, 2.4, 0.325, 64, 16, true);
const ledRingBottom = new THREE.Mesh(ledGeoBottom, ledMatBottom);
ledRingBottom.position.y = 2.55; 
scene.add(ledRingBottom);


// --- 3. NEW: SHIMMERING STARFIELD (FLOOR) ---
const starCount = 3000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
const starSeed = new Float32Array(starCount);

const maxRadius = 30.0; // The vast size of the field

for(let i=0; i<starCount; i++) {
    // Distribute them evenly in a circle
    const r = maxRadius * Math.sqrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    
    starPos[i*3 + 0] = r * Math.cos(theta); // x
    starPos[i*3 + 1] = 0;                   // y (flat plane)
    starPos[i*3 + 2] = r * Math.sin(theta); // z
    
    // Random seed so they twinkle asynchronously
    starSeed[i] = Math.random() * 100.0;
}

starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));

const starMat = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uMaxRadius: { value: maxRadius }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
        uniform float uTime;
        uniform float uMaxRadius;
        attribute float aSeed;
        
        varying float vAlpha;
        
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Calculate distance from absolute center
            float dist = length(position.xz);
            
            // Smooth radial falloff starting at 20% from the edge, dropping to 0 at maxRadius
            float falloff = smoothstep(uMaxRadius, uMaxRadius * 0.2, dist);
            
            // Twinkle effect using uTime and the unique seed
            // Modifying speed slightly per star so it feels organic
            float twinkleSpeed = 1.0 + mod(aSeed, 2.0);
            float twinkle = sin(uTime * twinkleSpeed + aSeed) * 0.5 + 0.5;
            
            vAlpha = falloff * twinkle;
            
            // Size shrinks dynamically towards the edge, with some random size variation per star
            float baseSize = 4.0 + mod(aSeed, 5.0);
            gl_PointSize = (baseSize * falloff) * (15.0 / -mvPosition.z);
        }
    `,
    fragmentShader: `
        varying float vAlpha;
        void main() {
            // Cut standard square gl_Point into a soft circle
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            
            float glow = smoothstep(0.5, 0.0, dist);
            
            // Soft, icy white/blue glow pushed just past 1.0 to catch the Bloom Pass
            vec3 starColor = vec3(1.2, 1.5, 2.0) * glow; 
            
            gl_FragColor = vec4(starColor, vAlpha);
        }
    `
});

const starField = new THREE.Points(starGeo, starMat);
// Push it way down below the scene to create vertigo/depth
starField.position.y = -6.0; 
scene.add(starField);



// --- GPGPU SETUP (TRUE FLUID INERTIA) ---
const WIDTH = isMobile ? 32 : 64;
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
    uniform vec3 uMouse3D;
    uniform vec3 uMouseVel;
    uniform sampler2D tBaseInfo1; 
    uniform sampler2D tBaseInfo2; 

    vec3 getWind(vec3 p, float t) {
        float x = sin(p.y * 1.2 + t * -1.5) * 0.4;
        float z = cos(p.y * -2.1 + t * 5.3) * 0.4;
        return vec3(x, -1.0, z);
    }

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

        vec3 startPos = normalize(aStartXYZ) * 1.25;
        vec3 basePos = startPos;
        
        float burstForce = uBurst * aRand.x * 2.5;
        basePos += normalize(startPos) * burstForce * (1.0 - normalizedAge);

        basePos.y += age * 3.0;

        float orbRadius = 1.0;
        if (basePos.y < orbRadius) {
            float surfaceDist = sqrt(max(0.0, orbRadius*orbRadius - basePos.y*basePos.y));
            if (length(basePos.xz) < surfaceDist) {
                basePos.xz = normalize(basePos.xz) * surfaceDist;
            }
        }
        if (basePos.y > orbRadius) {
            basePos.xz *= exp(-(basePos.y - orbRadius) * 0.5);
        }

        basePos += getWind(basePos, uTime) * age * 1.5;

        vec3 actualPos = basePos + offsetPos;
        float individualStrength = mix(0.4, 1.0, fract(aRand.y * 11.7));

        float distToMouse = length(actualPos - uMouse3D);
        float mouseForce = smoothstep(4.5, 0.0, distToMouse);
        vec3 repulseDir = actualPos - uMouse3D;
        repulseDir.x += sin(uTime * 3.0 + aRand.y * 15.0) * 0.8;
        repulseDir.z += cos(uTime * 3.0 + aRand.x * 15.0) * 0.8;
        repulseDir.y += 0.8;
        if (length(repulseDir) < 0.01) repulseDir = vec3(0.0, 1.0, 0.0);
        
        vec3 repulsion = normalize(repulseDir) * mouseForce * 18.0 * individualStrength; 

        float dragForce = smoothstep(5.5, 0.0, distToMouse);
        float rawSpeed = length(uMouseVel);
        
        float boostedSpeed = pow(rawSpeed, 0.4) * 25.0; 
        
        vec3 dragDir = rawSpeed > 0.0001 ? normalize(uMouseVel) : vec3(0.0);
        vec3 drag = dragDir * boostedSpeed * dragForce * individualStrength;

        vec3 addedForce = (repulsion + drag) * dt;
        addedForce = clamp(addedForce, vec3(-100.0), vec3(100.0));
        
        offsetVel += addedForce;

        vec3 springForce = -offsetPos * 3.5;
        offsetVel += springForce * dt;
        offsetVel *= exp(-5.0 * dt);

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
        uniform sampler2D tOffsetPos;
        
        attribute vec2 aUv;
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
            vec3 aStartXYZ = position;
            
            float maxLife = 2.0 + (aRand.y * 1.5);
            float age = mod(uTime + aTimeOffset, maxLife);
            float normalizedAge = age / maxLife;

            vec3 startPos = normalize(aStartXYZ) * 1.25;
            vec3 basePos = startPos;
            
            float burstForce = uBurst * aRand.x * 2.5;
            basePos += normalize(startPos) * burstForce * (1.0 - normalizedAge);

            basePos.y += age * 3.0;

            float orbRadius = 1.0;
            if (basePos.y < orbRadius) {
                float surfaceDist = sqrt(max(0.0, orbRadius*orbRadius - basePos.y*basePos.y));
                if (length(basePos.xz) < surfaceDist) {
                    basePos.xz = normalize(basePos.xz) * surfaceDist;
                }
            }
            if (basePos.y > orbRadius) {
                basePos.xz *= exp(-(basePos.y - orbRadius) * 0.5);
            }

            basePos += getWind(basePos, uTime) * age * 1.5;

            vec3 physicalOffset = texture2D(tOffsetPos, aUv).xyz;
            vec3 finalPos = basePos + physicalOffset;

            vec4 mvPosition = modelViewMatrix * vec4(finalPos, 0.9);
            gl_Position = projectionMatrix * mvPosition;
            
            float burstShrink = 1.0 - (uBurst * aRand.x * 0.7); 
            gl_PointSize = (100.0 * aRand.x + 200.0) * burstShrink * sin(normalizedAge * 3.14) * (15.0 / -mvPosition.z);

            vec3 magenta = vec3(4.0, 0.0, 4.0);
            vec3 green = vec3(0.0, 4.0, 0.0); 
            
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


// --- GLITCH DECRYPTER EFFECT & ANIMATION LOGIC ---
class TextScramble {
    constructor(el) {
        this.el = el;
        this.chars = '!<>-\\/[]{}—=+*^?#';
        this.update = this.update.bind(this);
    }
    setText(newText) {
        const oldText = this.el.innerText;
        const length = Math.max(oldText.length, newText.length);
        const promise = new Promise((resolve) => this.resolve = resolve);
        this.queue = [];
        for (let i = 0; i < length; i++) {
            const from = oldText[i] || '';
            const to = newText[i] || '';
            const start = Math.floor(Math.random() * 40);
            const end = start + Math.floor(Math.random() * 40);
            this.queue.push({ from, to, start, end });
        }
        cancelAnimationFrame(this.frameRequest);
        this.frame = 0;
        this.update();
        return promise;
    }
    update() {
        let output = '';
        let complete = 0;
        for (let i = 0, n = this.queue.length; i < n; i++) {
            let { from, to, start, end, char } = this.queue[i];
            if (this.frame >= end) {
                complete++;
                output += to;
            } else if (this.frame >= start) {
                if (!char || Math.random() < 0.28) {
                    char = this.randomChar();
                    this.queue[i].char = char;
                }
                output += `<span style="color: #00ff00; opacity: 0.7;">${char}</span>`;
            } else {
                output += from;
            }
        }
        this.el.innerHTML = output;
        if (complete === this.queue.length) {
            this.resolve();
        } else {
            this.frameRequest = requestAnimationFrame(this.update);
            this.frame++;
        }
    }
    randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
}

const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const glitchEl = document.getElementById('glitch-text');
const targetText = glitchEl.getAttribute('data-text');
const scrambler = new TextScramble(glitchEl);

glitchEl.innerHTML = '';

let step1Timeout;
let step2Timeout;

function closeModal() {
    clearTimeout(step1Timeout);
    clearTimeout(step2Timeout);
    cancelAnimationFrame(scrambler.frameRequest);
    
    infoModal.classList.remove('step1', 'step2');
    glitchEl.innerHTML = ''; 
}

infoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (infoModal.classList.contains('step1')) return; 
    
    infoModal.classList.add('step1');
    
    step1Timeout = setTimeout(() => {
        if (!infoModal.classList.contains('step1')) return; 
        infoModal.classList.add('step2');
        
        step2Timeout = setTimeout(() => {
            if (!infoModal.classList.contains('step2')) return;
            scrambler.setText(targetText);
        }, 200); 
    }, 350); 
});

infoModal.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && infoModal.classList.contains('step1')) {
        closeModal();
    }
});


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
            if (!isMobile) {
                targetMouseVel.subVectors(intersectPoint, lastMouse3D).multiplyScalar(3.0);
                mouse3D.copy(intersectPoint);
            }
            lastMouse3D.copy(intersectPoint);
        }
    }
}

function handleInteractionStart(e) {
    if (e.target.closest('#ui-layer') || e.target.closest('#info-modal')) return;

    if (infoModal.classList.contains('step1')) {
        closeModal();
        return; 
    }

    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObject(hitBox);
    
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

    pMat.uniforms.uHtSize.value = HALFTONE_CONFIG.size;
    pMat.uniforms.uHtRotation.value = HALFTONE_CONFIG.rotation;
    pMat.uniforms.uHtShape.value = HALFTONE_CONFIG.shape;

    targetMouseVel.lerp(new THREE.Vector3(0, 0, 0), 0.015); 
    currentMouseVel.lerp(targetMouseVel, 0.05);

    if (isPressed) {
        currentSpeed += (0.25 - currentSpeed) * 0.15; 
    } else {
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

    // --- UPDATE ALL ANIMATED SHADER TIMES ---
    ledMat.uniforms.uTime.value = visualTime;
    ledMatBottom.uniforms.uTime.value = visualTime;
    starMat.uniforms.uTime.value = visualTime; // NEW: Update the stars!

    velVar.material.uniforms.uTime.value = visualTime;
    velVar.material.uniforms.dt.value = visualDt; 
    velVar.material.uniforms.uBurst.value = currentBurst;
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
    
    // Make BOTH rings gently float up and down slightly with the orb
    ledRing.position.y = 3.0 + (floatY * 0.5);
    ledRingBottom.position.y = 2.55 + (floatY * 0.5);
    
    composer.render();
}

window.addEventListener('resize', () => {
    const isMobileResize = window.innerWidth <= 768;
    bloomPass.strength = isMobileResize ? 0.08 : 0.15;
    bloomPass.threshold = isMobileResize ? 0.1 : 0.05;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderTarget.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();