import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HALFTONE_CONFIG = { size: 0.6, rotation: Math.PI / 8, shape: 0 };

const EVENT_INFO = {
    title: 'FIRESIDE [MEETUP]',
    marqueeTitle: 'Fireside [Meetup]',
    dateLabel: 'Date & Time:',
    dateTime: 'Thursday, April 23rd from 6:00-9:00pm',
    venueLabel: 'Location:',
    venueName: 'Goodies Snack Shop',
    venueAddress: '139 NW 2nd Ave, Portland, OR 97209',
    speakerLabel: 'Guest Speaker:',
    speakerName: 'BLVCKL!GHT',
    speakerHandle: '(@blvcklightai)',
    speakerUrl: 'https://www.youtube.com/@BLVCKLIGHTai',
    ticketLabel: 'GET TICKETS HERE',
    ticketUrl: 'https://luma.com/7pxx55kq',
    guestTheme: 'AI'
};

// --- LAYER SETUP FOR OPTIMIZED REFLECTIONS ---
const REFLECTION_LAYER = 1;

const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.25, 0); 
controls.enableDamping = true;
controls.enablePan = false; 
controls.autoRotate = true; 
controls.autoRotateSpeed = -0.5;
controls.maxDistance = 50.0;
controls.minDistance = 2.0;
controls.update();

// Standard lightweight render target
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
});

const composer = new EffectComposer(renderer, renderTarget);
const renderScene = new RenderPass(scene, camera);

// --- UNIFIED VISUAL STATE & BLOOM LOGIC ---
const bloomStrength = 0.4;
const bloomRadius = 2.0;
const bloomThreshold = 2.0;

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), bloomStrength, bloomRadius, bloomThreshold);
composer.addPass(renderScene);
composer.addPass(bloomPass);


// --- TEMPORAL ACCUMULATION: HALLUCINATION PASS ---
class HallucinationPass extends Pass {
    constructor() {
        super();
        this.accumTarget1 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { 
            type: THREE.HalfFloatType, format: THREE.RGBAFormat 
        });
        this.accumTarget2 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { 
            type: THREE.HalfFloatType, format: THREE.RGBAFormat 
        });
        this.readTarget = this.accumTarget1;
        this.writeTarget = this.accumTarget2;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tAccum: { value: null },
                uTheme: { value: 0 },
                uNextTheme: { value: 0 }, 
                uTransition: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform sampler2D tAccum;
                uniform int uTheme;
                uniform int uNextTheme;
                uniform float uTransition;
                varying vec2 vUv;

                float getTrailStrength(int t) {
                    if (t == 3) return 0.97; // FIX: Lowered significantly from 0.94 for readable heat-vision marquees
                    if (t == 1) return 0.82; // Faint Black Light Trace
                    if (t == 5) return 0.80; // ASCII Phosphor Ghosting
                    return 0.0;
                }

                void main() {
                    vec4 texColor = texture2D(tDiffuse, vUv);

                    float currentStrength = mix(getTrailStrength(uTheme), getTrailStrength(uNextTheme), uTransition);

                    if (currentStrength <= 0.01) {
                        gl_FragColor = texColor;
                        return;
                    }

                    vec2 dir = vUv - vec2(0.5);
                    float dist = length(dir);
                    
                    vec2 rUv = vUv - dir * 0.015 * dist;
                    vec2 gUv = vUv - dir * 0.007 * dist;
                    vec2 bUv = vUv; 

                    float r = texture2D(tAccum, rUv).r;
                    float g = texture2D(tAccum, gUv).g;
                    float b = texture2D(tAccum, bUv).b;
                    
                    vec3 trail = vec3(r, g, b) * currentStrength;

                    gl_FragColor = vec4(max(texColor.rgb, trail), 1.0);
                }
            `
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    render(renderer, writeBuffer, readBuffer) {
        this.material.uniforms.tDiffuse.value = readBuffer.texture;
        this.material.uniforms.tAccum.value = this.readTarget.texture;

        renderer.setRenderTarget(this.writeTarget);
        this.fsQuad.render(renderer);

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
        }
        this.fsQuad.render(renderer);

        let temp = this.readTarget;
        this.readTarget = this.writeTarget;
        this.writeTarget = temp;
    }

    setSize(width, height) {
        this.accumTarget1.setSize(width, height);
        this.accumTarget2.setSize(width, height);
    }
}

const hallucinationPass = new HallucinationPass();
composer.addPass(hallucinationPass);


// --- THEME ENGINE: POST-PROCESSING LENS ---
const themeShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTheme: { value: 0 }, 
        uNextTheme: { value: 0 }, 
        uTransition: { value: 0.0 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform int uTheme;
        uniform int uNextTheme;
        uniform float uTransition;
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float luminance(vec3 color) {
            return dot(color, vec3(0.299, 0.587, 0.114));
        }

        vec3 getThemeColor(int t, vec2 uv, float scanline) {
            vec3 rawColor = texture2D(tDiffuse, uv).rgb;
            float lum = luminance(rawColor);

            if (t == 2) {
                // THEME 2: E-INK LIGHT MODE
                vec3 bgEink = vec3(0.92, 0.90, 0.88); 
                vec3 fgEink = vec3(0.15, 0.15, 0.17); 
                float mixVal = smoothstep(0.05, 0.5, lum);
                return mix(bgEink, fgEink, mixVal) - scanline; 
                
            } else if (t == 3) {
                // THEME 3: INFRARED / HEAT VISION (Custom 6-Color Mapping)
                float h = clamp(lum * 1.5, 0.0, 1.0); // Boosted for better range
                
                vec3 c1 = vec3(0.031, 0.035, 0.137); // #080923 (Coldest / Bottom)
                vec3 c2 = vec3(0.012, 0.196, 0.506); // #033281
                vec3 c3 = vec3(0.145, 0.573, 0.157); // #259228
                vec3 c4 = vec3(0.894, 0.871, 0.200); // #e4de33
                vec3 c5 = vec3(0.706, 0.094, 0.078); // #b41814
                vec3 c6 = vec3(0.757, 0.753, 0.682); // #c1c0ae (Hottest / Top)
                
                vec3 heat;
                if (h < 0.2) heat = mix(c1, c2, h / 0.2);
                else if (h < 0.4) heat = mix(c2, c3, (h - 0.2) / 0.2);
                else if (h < 0.6) heat = mix(c3, c4, (h - 0.4) / 0.2);
                else if (h < 0.8) heat = mix(c4, c5, (h - 0.6) / 0.2);
                else heat = mix(c5, c6, (h - 0.8) / 0.2);
                
                return heat - scanline * 0.5;

            } else if (t == 4) {
                // THEME 4: TACTICAL RED NIGHT MODE WITH NASA RESEAU GRID
                vec3 bgNight = vec3(0.0, 0.0, 0.0); 
                vec3 fgNight = vec3(0.85, 0.1, 0.1); 
                float mixVal = smoothstep(0.0, 0.6, lum);
                vec3 baseNight = mix(bgNight, fgNight, mixVal);
                
                // Calculate correct aspect ratio for square crosses
                vec2 aspectUv = uv * vec2(uResolution.x / uResolution.y, 1.0);
                
                // Scale the grid up/down (number of crosses)
                vec2 gridUv = fract(aspectUv * 6.0) - 0.5; 
                
                float crossThickness = 0.006;
                float crossLength = 0.12;
                
                // Draw horizontal and vertical bars for the '+'
                float vertBar = step(abs(gridUv.x), crossThickness) * step(abs(gridUv.y), crossLength);
                float horzBar = step(abs(gridUv.y), crossThickness) * step(abs(gridUv.x), crossLength);
                float crossMask = clamp(vertBar + horzBar, 0.0, 1.0);
                
                // Blend crosses over the scene in a deep tactical red
                vec3 crossColor = vec3(0.15, 0.0, 0.0); 
                return mix(baseNight, crossColor, crossMask * 0.8) - scanline; 
                
            } else if (t == 1) {
                // THEME 1: BLACK LIGHT MODE
                vec3 deepPurple = vec3(0.5, 0.0, 1.0) * lum * 1.5;
                vec3 hotPink = vec3(1.0, 0.0, 0.8) * smoothstep(0.4, 1.5, lum) * 1.2;
                vec3 purpleWash = deepPurple + hotPink;
                
                float orangeScore = (rawColor.r * rawColor.g) - (rawColor.b * 2.0);
                float isOrange = smoothstep(0.1, 0.5, orangeScore);
                
                return mix(purpleWash, rawColor, isOrange); 
                
            } else if (t == 5) {
                // THEME 5: ASCII MAINFRAME
                float gridSize = 600.0;
                vec2 gridUv = floor(uv * gridSize * vec2(1.0, 1.0)) / (gridSize * vec2(1.0, 1.0));
                float blockLum = luminance(texture2D(tDiffuse, gridUv).rgb);
                
                vec2 localUv = fract(uv * gridSize * vec2(1.0, 0.5));
                float charMask = step(0.5, localUv.x) * step(0.5, localUv.y);
                
                vec3 phosphor = vec3(0.0, 1.0, 0.25);
                vec3 asciiColor = phosphor * blockLum * charMask * 1.5;
                asciiColor += vec3(0.5, 1.0, 0.5) * step(0.8, blockLum); 
                return asciiColor - scanline * 3.0;
            }
            
            // Theme 0 (Default) simply passes raw color
            return rawColor;
        }

        void main() {
            float scanline = sin(gl_FragCoord.y * 1.5) * 0.04;

            vec3 colorCurrent = getThemeColor(uTheme, vUv, scanline);
            
            if (uTransition > 0.0) {
                vec3 colorNext = getThemeColor(uNextTheme, vUv, scanline);
                gl_FragColor = vec4(mix(colorCurrent, colorNext, uTransition), 1.0);
            } else {
                gl_FragColor = vec4(colorCurrent, 1.0);
            }
        }
    `
};

const themePass = new ShaderPass(themeShader);
composer.addPass(themePass);


// --- REAL-TIME CHROME REFLECTION SETUP ---
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    colorSpace: THREE.SRGBColorSpace 
});
const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
// Force the reflection camera to ONLY look at the solid 3D meshes, ignoring particles
cubeCamera.layers.set(REFLECTION_LAYER); 
scene.add(cubeCamera);


// 1. The Visual Orb (Modified for Real-Time Chrome Reflections)
const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 250, 250),
    new THREE.MeshPhysicalMaterial({
        color: 0xffffff, 
        metalness: 1.0, 
        roughness: 0.0, // Pure mirror finish
        envMap: cubeRenderTarget.texture, 
        envMapIntensity: 1.0, 
        transparent: true,
        opacity: 1.0
    })
);
scene.add(orb);

// 2. The Invisible Hitbox
const hitBox = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 16),
    new THREE.MeshBasicMaterial({ visible: false })
);
scene.add(hitBox);


const MARQUEE_FONT = 'bold 50px "SF Mono", "Roboto Mono", monospace';
const MARQUEE_IDEAL_WIDTH = 1930;
const MARQUEE_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

function createLEDFragmentShader({
    rows,
    cols,
    scrollSpeed,
    invertText,
    defaultColor,
    theme1Color,
    theme3Color,
    theme5Color
}) {
    return `
        uniform sampler2D tText;
        uniform float uTime;
        uniform int uTheme;
        uniform int uNextTheme;
        uniform float uTransition;
        varying vec2 vUv;

        vec3 getLEDColor(int t) {
            if (t == 3) return vec3(${theme3Color.join(', ')});
            if (t == 1) return vec3(${theme1Color.join(', ')});
            if (t == 5) return vec3(${theme5Color.join(', ')});
            return vec3(${defaultColor.join(', ')});
        }

        void main() {
            float rows = ${rows.toFixed(1)};
            float cols = ${cols.toFixed(1)};

            vec2 gridUv = vec2(floor(vUv.x * cols) / cols, floor(vUv.y * rows) / rows);
            vec2 sampleUv = gridUv;
            sampleUv.x += uTime * ${scrollSpeed.toFixed(2)};

            vec4 textData = texture2D(tText, sampleUv);
            vec2 cellUv = fract(vUv * vec2(cols, rows)) - 0.5;
            float dist = length(cellUv);
            float ledRadius = 0.25;
            float ledMask = smoothstep(ledRadius, ledRadius - 0.05, dist);

            float isOn = ${invertText ? '1.0 - step(0.5, textData.r)' : 'step(0.5, textData.r)'};
            float finalAlpha = ledMask * isOn;

            if (finalAlpha < 0.01) discard;

            vec3 c1 = getLEDColor(uTheme);
            vec3 c2 = getLEDColor(uNextTheme);
            vec3 finalLedColor = mix(c1, c2, uTransition);

            gl_FragColor = vec4(finalLedColor, finalAlpha);
        }
    `;
}

function configureMarqueeTexture(texture) {
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
}

function paintMarqueeTexture(ctx, canvas, text, repeatCount) {
    ctx.font = MARQUEE_FONT;
    const segment = `${text} *** `;
    const segmentWidth = ctx.measureText(segment).width;
    let count = repeatCount ?? Math.max(1, Math.round(MARQUEE_IDEAL_WIDTH / segmentWidth));

    canvas.width = segmentWidth * count;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = MARQUEE_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < count; i++) {
        ctx.fillText(segment, i * segmentWidth, canvas.height / 2 + 4);
    }
}

function createMarquee({
    text,
    geometry,
    positionY,
    parent = scene,
    rows,
    cols,
    scrollSpeed,
    invertText = false,
    colorSet,
    repeatCountMap
}) {
    const canvas = document.createElement('canvas');
    canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const texture = new THREE.CanvasTexture(canvas);
    configureMarqueeTexture(texture);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            tText: { value: texture },
            uTime: { value: 0 },
            uTheme: { value: 0 },
            uNextTheme: { value: 0 },
            uTransition: { value: 0.0 }
        },
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: MARQUEE_VERTEX_SHADER,
        fragmentShader: createLEDFragmentShader({
            rows,
            cols,
            scrollSpeed,
            invertText,
            defaultColor: colorSet.default,
            theme1Color: colorSet.theme1,
            theme3Color: colorSet.theme3,
            theme5Color: colorSet.theme5
        })
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.enable(REFLECTION_LAYER);
    mesh.position.y = positionY;
    parent.add(mesh);

    const updateText = (nextText) => {
        paintMarqueeTexture(ctx, canvas, nextText, repeatCountMap?.[nextText]);
        texture.needsUpdate = true;
    };

    updateText(text);

    return { mesh, material, updateText };
}

const ledMarquee = createMarquee({
    text: EVENT_INFO.marqueeTitle,
    geometry: new THREE.CylinderGeometry(2.4, 2.4, 0.5, 64, 16, true),
    positionY: 3.0,
    rows: 24,
    cols: 720,
    scrollSpeed: 0.01,
    colorSet: {
        default: [0.0, 5.0, 0.0],
        theme1: [6.0, 0.5, 0.0],
        theme3: [0.0, 0.0, 5.0],
        theme5: [0.0, 4.0, 0.5]
    }
});
const ledRing = ledMarquee.mesh;
const ledMat = ledMarquee.material;

const bottomMarqueeBaseText = `${EVENT_INFO.dateTime.replace(':00', '')} @ ${EVENT_INFO.venueName} on ${EVENT_INFO.venueAddress}`;
const bottomMarqueeResetText = `${EVENT_INFO.dateTime.split(' from ')[0]} inside ${EVENT_INFO.venueName} on ${EVENT_INFO.venueAddress}`;

const bottomMarquee = createMarquee({
    text: bottomMarqueeBaseText,
    geometry: new THREE.CylinderGeometry(2.4, 2.4, 0.325, 64, 16, true),
    positionY: -0.45,
    parent: ledRing,
    rows: 17,
    cols: 720,
    scrollSpeed: 0.03,
    invertText: true,
    colorSet: {
        default: [0.0, 2.5, 0.0],
        theme1: [4.0, 0.4, 0.0],
        theme3: [0.0, 0.0, 2.5],
        theme5: [0.0, 2.5, 0.3]
    },
    repeatCountMap: {
        '[ VISION MODE LOCKED ]': 3,
        '[ VISION MODE UNLOCKED ]': 3
    }
});
const ledRingBottom = bottomMarquee.mesh;
const ledMatBottom = bottomMarquee.material;

const guestMarquee = createMarquee({
    text: `${EVENT_INFO.speakerLabel} ${EVENT_INFO.speakerName} ${EVENT_INFO.speakerHandle} Theme: ${EVENT_INFO.guestTheme}`,
    geometry: new THREE.CylinderGeometry(1.7, 1.5, 0.4, 64, 16, true),
    positionY: -4.0,
    parent: ledRing,
    rows: 22,
    cols: 420,
    scrollSpeed: 0.06,
    invertText: true,
    colorSet: {
        default: [0.0, 2.5, 0.0],
        theme1: [4.0, 0.4, 0.0],
        theme3: [0.0, 0.0, 2.5],
        theme5: [0.0, 2.5, 0.3]
    }
});
const ledMatGuest = guestMarquee.material;


// ---------------------------------------------------------
// EASTER EGG 1: GLORP DOG (HOLOGRAPHIC MASCOT)
// ---------------------------------------------------------
let glorpDog;
const gltfLoader = new GLTFLoader();
gltfLoader.load('glorp-dog.glb', (gltf) => {
    glorpDog = gltf.scene;
    
    // Scale and prepare for the holographic hover above the top marquee
    glorpDog.scale.setScalar(3.75); 
    
    // Traverse the model to setup its materials for Black Light reactivity
    glorpDog.traverse((child) => {
        child.layers.enable(REFLECTION_LAYER); // Add to reflection layer
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = 0.0;
            child.material.depthWrite = true; // Smooths out holographic compositing
            
            // Emulate UV reactive paint by making the texture itself emissive
            if (child.material.map) {
                child.material.emissiveMap = child.material.map;
                // Tint the emission towards a hot neon magenta 
                child.material.emissive = new THREE.Color(0xffff00); 
                child.material.emissiveIntensity = 0.0;
            }
        }
    });
    
    ledRing.add(glorpDog); 
});

// ---------------------------------------------------------
// EASTER EGG 2: GIANT SALAMANDER ARRAY
// ---------------------------------------------------------
const salamanderGroup = new THREE.Group();
scene.add(salamanderGroup);
let salamanderMeshes = [];

gltfLoader.load('recursive-salamander.glb', (gltf) => {
    const baseModel = gltf.scene;
    
    // USER CONTROLS: Completely decoupled Scale, Position, and Rotation
    const SALAMANDER_SCALE = 15.0; 
    const SALAMANDER_RADIUS = 20.0; 
    // Set custom rotation here (in radians, e.g., Math.PI / 2)
    const SALAMANDER_ROT_X = 0.0; 
    const SALAMANDER_ROT_Y = -45.0;
    const SALAMANDER_ROT_Z = 0.0;
    
    // Calculate the raw bounding box first
    const box = new THREE.Box3().setFromObject(baseModel);
    const center = box.getCenter(new THREE.Vector3());
    const bottomY = box.min.y;
    
    // Shift the raw geometry so its absolute bottom-center rests precisely at its own local [0,0,0]
    baseModel.position.set(-center.x, -bottomY, -center.z);
    
    // Wrap the shifted geometry inside a new group. 
    // This wrapper acts as the clean pivot point so scaling it doesn't move it across the scene.
    const wrapper = new THREE.Group();
    wrapper.add(baseModel);
    
    // Apply the scale to the wrapper cleanly in-place
    wrapper.scale.setScalar(SALAMANDER_SCALE);
    
    wrapper.traverse((child) => {
        child.layers.enable(REFLECTION_LAYER); // Add to reflection layer
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = 0.0;
            child.material.depthWrite = true; 
            
            if (child.material.map) {
                child.material.emissiveMap = child.material.map;
            }
            child.material.emissive = new THREE.Color(0xffff00); 
            child.material.emissiveIntensity = 0.0;
        }
    });

    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const clone = wrapper.clone();
        
        clone.position.x = Math.cos(angle) * SALAMANDER_RADIUS;
        clone.position.z = Math.sin(angle) * SALAMANDER_RADIUS;
        
        // Locked exactly to the traffic floor (-3.5)
        clone.position.y = -3.5; 
        
        clone.lookAt(0, -3.5, 0); 
        
        // Add optional user-defined rotations on top of the 'lookAt' orientation
        clone.rotateX(SALAMANDER_ROT_X);
        clone.rotateY(SALAMANDER_ROT_Y);
        clone.rotateZ(SALAMANDER_ROT_Z);
        
        salamanderGroup.add(clone);
        salamanderMeshes.push(clone);
    }
});

// ---------------------------------------------------------
// EASTER EGG 3: BORBON ARRAY
// ---------------------------------------------------------
const borbonGroup = new THREE.Group();
scene.add(borbonGroup);
let borbonMeshes = [];

gltfLoader.load('borbon.glb', (gltf) => {
    const baseModel = gltf.scene;
    
    // USER CONTROLS: Completely decoupled Scale, Position, and Rotation
    const BORBON_SCALE = 60.0; 
    const BORBON_RADIUS = 100.0; 
    const BORBON_ROT_X = 0.0; 
    const BORBON_ROT_Y = 0.0;
    const BORBON_ROT_Z = 0.0;
    
    const box = new THREE.Box3().setFromObject(baseModel);
    const center = box.getCenter(new THREE.Vector3());
    const bottomY = box.min.y;
    
    baseModel.position.set(-center.x, -bottomY, -center.z);
    
    const wrapper = new THREE.Group();
    wrapper.add(baseModel);
    
    wrapper.scale.setScalar(BORBON_SCALE);
    
    wrapper.traverse((child) => {
        child.layers.enable(REFLECTION_LAYER); // Add to reflection layer
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = 0.0;
            child.material.depthWrite = true; 
            
            if (child.material.map) {
                child.material.emissiveMap = child.material.map;
            }
            child.material.emissive = new THREE.Color(0xffff00); 
            child.material.emissiveIntensity = 0.0;
        }
    });

    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const clone = wrapper.clone();
        
        clone.position.x = Math.cos(angle) * BORBON_RADIUS;
        clone.position.z = Math.sin(angle) * BORBON_RADIUS;
        
        clone.position.y = -3.5; 
        clone.lookAt(0, -3.5, 0); 
        
        clone.rotateX(BORBON_ROT_X);
        clone.rotateY(BORBON_ROT_Y);
        clone.rotateZ(BORBON_ROT_Z);
        
        borbonGroup.add(clone);
        borbonMeshes.push(clone);
    }
});


// --- STATE MANAGERS & AUTO-TRANSITION LOGIC ---
let currentTheme = 0;
let nextTheme = 0;
let isTransitioning = false;
let transitionProgress = 0.0;
let idleTimer = 0.0;
let uiUpdated = false;

// Master lock variable for the idle transition
let isAutoCycleLocked = false;

const themeBtn = document.getElementById('theme-btn');
if (themeBtn) {
    themeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        if (isTransitioning) {
            currentTheme = nextTheme;
        }
        
        currentTheme = (currentTheme + 1) % 6; 
        
        isTransitioning = false;
        transitionProgress = 0.0;
        idleTimer = 0.0; 
        uiUpdated = false;
        
        themePass.uniforms.uTheme.value = currentTheme;
        themePass.uniforms.uTransition.value = 0.0;
        
        hallucinationPass.material.uniforms.uTheme.value = currentTheme;
        hallucinationPass.material.uniforms.uTransition.value = 0.0;
        
        ledMat.uniforms.uTheme.value = currentTheme;
        ledMat.uniforms.uTransition.value = 0.0;
        
        ledMatBottom.uniforms.uTheme.value = currentTheme;
        ledMatBottom.uniforms.uTransition.value = 0.0;

        ledMatGuest.uniforms.uTheme.value = currentTheme;
        ledMatGuest.uniforms.uTransition.value = 0.0;

        document.body.className = 'theme-' + currentTheme;
    });
}

// --- RESPONSIVE CAMERA LOGIC (Moiré Fix) ---
function updateResponsiveCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const scaleFactor = Math.min(1.0, aspect * 1.45); 
    camera.fov = 45 / scaleFactor;
    camera.updateProjectionMatrix();
}
updateResponsiveCamera(); 


// --- 3. SHIMMERING STARFIELD (FLOOR) ---
const starCount = 10000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
const starSeed = new Float32Array(starCount);

const maxRadius = 30.0; 

for(let i=0; i<starCount; i++) {
    const r = maxRadius * Math.sqrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    
    starPos[i*3 + 0] = r * Math.cos(theta); 
    starPos[i*3 + 1] = (Math.random() - 0.75) * 3.0;  
    starPos[i*3 + 2] = r * Math.sin(theta); 
    
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
            
            float dist = length(position.xz);
            float falloff = smoothstep(uMaxRadius, uMaxRadius * 0.2, dist);
            
            float twinkleSpeed = 1.0 + mod(aSeed, 2.0);
            float twinkle = sin(uTime * twinkleSpeed + aSeed) * 0.5 + 0.5;
            
            vAlpha = falloff * twinkle;
            
            float baseSize = 2.0 + mod(aSeed, 1.0);
            gl_PointSize = (baseSize * falloff) * (15.0 / max(0.1, -mvPosition.z));
        }
    `,
    fragmentShader: `
        varying float vAlpha;
        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            
            float glow = smoothstep(0.5, 0.0, dist);
            vec3 starColor = vec3(1.2, 1.5, 2.0) * glow; 
            gl_FragColor = vec4(starColor, vAlpha);
        }
    `
});

const starField = new THREE.Points(starGeo, starMat);
starField.position.y = -3.0; 
starField.frustumCulled = false; 
scene.add(starField);


// --- 4. FRESH APPROACH: STABLE CITY TRAFFIC LAYER ---
const trafficCount = 5000; 
const trafficRadius = 30.0; 
const laneSpacing = 2.0; 

const trafficGeo = new THREE.BufferGeometry();
const trafficPos = new Float32Array(trafficCount * 3);
const trafficColor = new Float32Array(trafficCount * 3);
const trafficSize = new Float32Array(trafficCount);

const cars = [];
const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];

for(let i=0; i<trafficCount; i++) {
    let startX = Math.round((Math.random() - 0.5) * (trafficRadius * 1.5) / laneSpacing) * laneSpacing;
    let startZ = Math.round((Math.random() - 0.5) * (trafficRadius * 1.5) / laneSpacing) * laneSpacing;
    
    let dir = DIRS[Math.floor(Math.random() * DIRS.length)];
    
    cars.push({
        x: startX,
        z: startZ,
        targetX: startX + (dir[0] * laneSpacing),
        targetZ: startZ + (dir[1] * laneSpacing),
        dirX: dir[0],
        dirZ: dir[1],
        speed: 0.05 + Math.random() * 1.0, 
        state: Math.random() > 0.5 ? 1 : 0, 
        timer: Math.random() * 2.0 
    });

    trafficPos[i*3 + 0] = startX;
    trafficPos[i*3 + 1] = 0;
    trafficPos[i*3 + 2] = startZ;

    if (Math.random() > 0.5) {
        trafficColor[i*3]=5.0; trafficColor[i*3+1]=0.0; trafficColor[i*3+2]=5.0;
    } else {
        trafficColor[i*3]=0.0; trafficColor[i*3+1]=5.0; trafficColor[i*3+2]=0.0;
    }

    trafficSize[i] = 1.0 + Math.random() * 3.0; 
}

trafficGeo.setAttribute('position', new THREE.BufferAttribute(trafficPos, 3));
trafficGeo.setAttribute('aColor', new THREE.BufferAttribute(trafficColor, 3));
trafficGeo.setAttribute('aSize', new THREE.BufferAttribute(trafficSize, 1));

const trafficMat = new THREE.ShaderMaterial({
    uniforms: {
        uMaxRadius: { value: trafficRadius }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
        uniform float uMaxRadius;
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
            vColor = aColor;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            float dist = length(position.xz);
            float falloff = smoothstep(uMaxRadius * 1.2, uMaxRadius * 0.2, dist);
            vAlpha = falloff;
            
            gl_PointSize = (aSize * falloff) * (20.0 / max(0.1, -mvPosition.z));
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            float glow = smoothstep(0.5, 0.1, dist);
            gl_FragColor = vec4(vColor * glow, vAlpha * glow);
        }
    `
});

const trafficField = new THREE.Points(trafficGeo, trafficMat);
trafficField.position.y = -3.5; 
trafficField.frustumCulled = false; 
scene.add(trafficField);


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
            gl_PointSize = (200.0 * aRand.x + 1.0) * burstShrink * sin(normalizedAge * 3.14) * (30.0 / max(0.1, -mvPosition.z));

            vec3 magenta = vec3(2.5, 0.0, 2.5);
            vec3 green = vec3(0.0, 2.5, 0.0); 
            
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
        this.chars = '!<>-\\/[]{}_=+*^?#';
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

const eventBtn = document.getElementById('event-btn');
const eventModal = document.getElementById('event-modal');
const eventModalContent = document.getElementById('event-modal-content');

function renderEventModal() {
    eventModalContent.innerHTML = `
        <p class="event-copy">
            <strong class="event-glitch event-glitch-title" data-text="${EVENT_INFO.title}"></strong><br><br>
            <strong class="event-glitch" data-text="${EVENT_INFO.dateLabel}"></strong><br>
            <span class="event-glitch" data-text="${EVENT_INFO.dateTime}"></span><br><br>
            <strong class="event-glitch" data-text="${EVENT_INFO.venueLabel}"></strong><br>
            <span class="event-glitch" data-text="${EVENT_INFO.venueName}"></span><br>
            <span class="event-glitch" data-text="${EVENT_INFO.venueAddress}"></span><br><br>
            <strong class="event-glitch" data-text="${EVENT_INFO.speakerLabel}"></strong><br>
            <span class="event-glitch" data-text="${EVENT_INFO.speakerName}"></span><br>
            <a href="${EVENT_INFO.speakerUrl}" target="_blank" rel="noreferrer" class="event-glitch event-glitch-link" data-text="${EVENT_INFO.speakerHandle}"></a><br><br>
            <a href="${EVENT_INFO.ticketUrl}" target="_blank" rel="noreferrer" class="event-glitch event-glitch-link event-glitch-title" data-text="${EVENT_INFO.ticketLabel}"></a>
        </p>
    `;
}

renderEventModal();

const eventGlitchEls = Array.from(eventModalContent.querySelectorAll('.event-glitch'));
const eventScramblers = eventGlitchEls.map((el) => ({
    scrambler: new TextScramble(el),
    text: el.getAttribute('data-text')
}));
const heatIndicators = [
    document.querySelector('#heat-legend-left .heat-indicator'),
    document.querySelector('#heat-legend-right .heat-indicator')
];

let step1Timeout;
let step2Timeout;
let eventStep1Timeout;
let eventStep2Timeout;
let eventStaggerTimeouts = []; // Tracks the line-by-line reveal timeouts

glitchEl.innerHTML = '';
eventGlitchEls.forEach(el => el.innerHTML = ''); // Hide all event text immediately

function closeModal() {
    clearTimeout(step1Timeout);
    clearTimeout(step2Timeout);
    cancelAnimationFrame(scrambler.frameRequest);
    infoModal.classList.remove('step1', 'step2');
    glitchEl.innerHTML = ''; 
    
    clearTimeout(eventStep1Timeout);
    clearTimeout(eventStep2Timeout);
    
    // Clear any staggered line reveals currently running
    eventStaggerTimeouts.forEach(clearTimeout);
    eventStaggerTimeouts = [];
    
    eventModal.classList.remove('step1', 'step2');
    eventScramblers.forEach(obj => {
        cancelAnimationFrame(obj.scrambler.frameRequest);
        obj.scrambler.el.innerHTML = ''; 
    });
}

infoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (infoModal.classList.contains('step1')) return; 
    
    closeModal(); 
    
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

eventBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (eventModal.classList.contains('step1')) return; 
    
    closeModal(); 
    
    eventModal.classList.add('step1');
    eventStep1Timeout = setTimeout(() => {
        if (!eventModal.classList.contains('step1')) return; 
        eventModal.classList.add('step2');
        
        // Stagger the scramblers line-by-line.
        // This prevents frame-drops (snapping) and creates a smooth cascading reveal.
        eventStep2Timeout = setTimeout(() => {
            if (!eventModal.classList.contains('step2')) return;
            
            eventStaggerTimeouts = [];
            eventScramblers.forEach((obj, index) => {
                const t = setTimeout(() => {
                    if (eventModal.classList.contains('step2')) {
                        obj.scrambler.setText(obj.text);
                    }
                }, index * 120); // 120ms delay between each line's reveal
                eventStaggerTimeouts.push(t);
            });
        }, 200);
        
    }, 350); 
});

infoModal.addEventListener('click', closeModal);

eventModal.addEventListener('click', (e) => {
    if(e.target.tagName !== 'A') {
        closeModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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

// Timeout references for the Marquee feedback text
let marqueeBotTimer = null;

function handlePointerMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    if (!isTransitioning && !isAutoCycleLocked) idleTimer = 0.0;
    
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
    // 1. Tell the raycaster to ignore clicks if they happen inside the UI or EITHER modal
    if (e.target.closest('#ui-layer') || e.target.closest('#info-modal') || e.target.closest('#event-modal')) return;

    // 2. If EITHER modal is currently open, clicking the background closes it and stops the interaction
    if (infoModal.classList.contains('step1') || eventModal.classList.contains('step1')) {
        closeModal();
        return; 
    }

    raycaster.setFromCamera(mouse, camera);
    
    // --- MARQUEE HIJACK CHECK ---
    const marqueeIntersects = raycaster.intersectObjects([ledRingBottom]); // Only check the second marquee
    if (marqueeIntersects.length > 0) {
        isAutoCycleLocked = !isAutoCycleLocked;
        const statusMsg = isAutoCycleLocked ? "[ VISION MODE LOCKED ]" : "[ VISION MODE UNLOCKED ]";
        
        if (marqueeBotTimer) clearTimeout(marqueeBotTimer);
        bottomMarquee.updateText(statusMsg);
        marqueeBotTimer = setTimeout(() => bottomMarquee.updateText(bottomMarqueeResetText), 3000);
        
        if (!isAutoCycleLocked) idleTimer = 0.0;
        
        return; // Prevent triggering the orb interaction burst
    }
    
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
    
    mouse3D.set(999, 999, 999);
    lastMouse3D.set(999, 999, 999);
}

window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerdown', handleInteractionStart);
window.addEventListener('pointerup', handleInteractionEnd);

let lastWidth = 0;
let lastHeight = 0;

let reflectionFrame = 0; // Throttles the CubeCamera updates

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    if (window.innerWidth !== lastWidth || window.innerHeight !== lastHeight) {
        lastWidth = window.innerWidth;
        lastHeight = window.innerHeight;
        
        camera.aspect = lastWidth / lastHeight;
        const scaleFactor = Math.min(1.0, camera.aspect * 1.45); 
        camera.fov = 45 / scaleFactor;
        camera.updateProjectionMatrix();
        
        renderer.setSize(lastWidth, lastHeight);
        renderTarget.setSize(lastWidth, lastHeight);
        composer.setSize(lastWidth, lastHeight);
        
        hallucinationPass.setSize(lastWidth, lastHeight);
        
        themePass.uniforms.uResolution.value.set(lastWidth, lastHeight);
    }
    
    const realTime = performance.now() * 0.001;
    const rawDt = realTime - previousRealTime;
    previousRealTime = realTime;
    const visualDt = Math.min(rawDt, 0.05); 
    
    controls.update();

    // --- AUTOMATED IDLE TRANSITION LOGIC ---
    if (!isTransitioning) {
        if (!isAutoCycleLocked) {
            idleTimer += rawDt;
            
            if (idleTimer >= 30.0) {
                isTransitioning = true;
                nextTheme = (currentTheme + 1) % 6;
                transitionProgress = 0.0;
                uiUpdated = false;
                
                themePass.uniforms.uNextTheme.value = nextTheme;
                hallucinationPass.material.uniforms.uNextTheme.value = nextTheme;
                ledMat.uniforms.uNextTheme.value = nextTheme;
                ledMatBottom.uniforms.uNextTheme.value = nextTheme;
                ledMatGuest.uniforms.uNextTheme.value = nextTheme;
            }
        }
    } else {
        transitionProgress += rawDt / 10.0;
        
        if (transitionProgress >= 0.5 && !uiUpdated) {
            document.body.className = 'theme-' + nextTheme;
            uiUpdated = true;
        }
        
        if (transitionProgress >= 1.0) {
            transitionProgress = 1.0;
            currentTheme = nextTheme;
            isTransitioning = false;
            idleTimer = 0.0;
            
            themePass.uniforms.uTheme.value = currentTheme;
            hallucinationPass.material.uniforms.uTheme.value = currentTheme;
            ledMat.uniforms.uTheme.value = currentTheme;
            ledMatBottom.uniforms.uTheme.value = currentTheme;
            ledMatGuest.uniforms.uTheme.value = currentTheme;
        }
    }
    
    let ease = transitionProgress * transitionProgress * (3.0 - 2.0 * transitionProgress);
    themePass.uniforms.uTransition.value = isTransitioning ? ease : 0.0;
    hallucinationPass.material.uniforms.uTransition.value = isTransitioning ? ease : 0.0;
    ledMat.uniforms.uTransition.value = isTransitioning ? ease : 0.0;
    ledMatBottom.uniforms.uTransition.value = isTransitioning ? ease : 0.0;
    ledMatGuest.uniforms.uTransition.value = isTransitioning ? ease : 0.0;


    // --- DYNAMIC BLOOM CROSSFADING ---
    let getBloomS = (t) => (t === 1) ? 0.6 : bloomStrength;
    let getBloomT = (t) => (t === 1) ? 0.5 : bloomThreshold;

    let targetBloomS = getBloomS(currentTheme);
    let targetBloomT = getBloomT(currentTheme);

    if (isTransitioning) {
        let nextBloomS = getBloomS(nextTheme);
        let nextBloomT = getBloomT(nextTheme);
        
        let blendS = targetBloomS + (nextBloomS - targetBloomS) * ease;
        let blendT = targetBloomT + (nextBloomT - targetBloomT) * ease;
        
        bloomPass.strength += (blendS - bloomPass.strength) * 0.05;
        bloomPass.threshold += (blendT - bloomPass.threshold) * 0.05;
    } else {
        bloomPass.strength += (targetBloomS - bloomPass.strength) * 0.05;
        bloomPass.threshold += (targetBloomT - bloomPass.threshold) * 0.05;
    }

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

    const scaledDt = visualDt * currentSpeed;
    visualTime += scaledDt;

    themePass.uniforms.uTime.value = visualTime;

    ledMat.uniforms.uTime.value = visualTime;
    ledMatBottom.uniforms.uTime.value = visualTime;
    ledMatGuest.uniforms.uTime.value = visualTime;
    starMat.uniforms.uTime.value = visualTime; 

    // --- GLORP DOG ANIMATION & STATE ---
    let a1 = (currentTheme === 1) ? 1.0 : 0.0;
    let a2 = (nextTheme === 1) ? 1.0 : 0.0;
    let targetAlpha = isTransitioning ? a1 + (a2 - a1) * ease : a1;

    if (glorpDog) {
        // Spin slowly like a holographic collectible
        glorpDog.rotation.y += visualDt * -0.5;
        
        // Hover bobbing directly above the top ring
        glorpDog.position.y = 0.4 + Math.sin(visualTime * 1.0) * 0.2;
        
        glorpDog.visible = targetAlpha > 0.001; 
        
        glorpDog.traverse((child) => {
            if (child.isMesh) {
                child.material.opacity = targetAlpha;
                child.material.emissiveIntensity = targetAlpha * 0.8; 
                child.material.depthWrite = (targetAlpha > 0.99); 
            }
        });
    }

    // --- GIANT SALAMANDER ARRAY ANIMATION & STATE ---
    if (salamanderGroup) {
        salamanderGroup.visible = targetAlpha > 0.001; 
        
        for (let i = 0; i < salamanderMeshes.length; i++) {
            let salamander = salamanderMeshes[i];
            
            salamander.traverse((child) => {
                if (child.isMesh) {
                    child.material.opacity = targetAlpha;
                    child.material.emissiveIntensity = targetAlpha * 0.8; 
                    child.material.depthWrite = (targetAlpha > 0.99); 
                }
            });
        }
    }

    // --- EASTER EGG 3: BORBON ARRAY ANIMATION & STATE ---
    if (borbonGroup) {
        borbonGroup.visible = targetAlpha > 0.001; 
        
        for (let i = 0; i < borbonMeshes.length; i++) {
            let borbon = borbonMeshes[i];
            
            borbon.traverse((child) => {
                if (child.isMesh) {
                    child.material.opacity = targetAlpha;
                    child.material.emissiveIntensity = targetAlpha * 0.8; 
                    child.material.depthWrite = (targetAlpha > 0.99); 
                }
            });
        }
    }

    const tPositions = trafficField.geometry.attributes.position.array;
    
    for(let i = 0; i < trafficCount; i++) {
        let car = cars[i];
        
        if (car.state === 0) { 
            car.timer -= visualDt;
            if (car.timer <= 0) {
                car.state = 1; 
                
                const possibleDirs = [];
                if (car.dirX !== -1) possibleDirs.push([1,0]);
                if (car.dirX !== 1) possibleDirs.push([-1,0]);
                if (car.dirZ !== -1) possibleDirs.push([0,1]);
                if (car.dirZ !== 1) possibleDirs.push([0,-1]);
                
                let nextDir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
                car.dirX = nextDir[0];
                car.dirZ = nextDir[1];
                
                car.targetX = car.x + (car.dirX * laneSpacing);
                car.targetZ = car.z + (car.dirZ * laneSpacing);
                
                if (car.targetX*car.targetX + car.targetZ*car.targetZ > trafficRadius*trafficRadius) {
                    car.x = Math.round((Math.random() - 0.5) * (trafficRadius) / laneSpacing) * laneSpacing;
                    car.z = Math.round((Math.random() - 0.5) * (trafficRadius) / laneSpacing) * laneSpacing;
                    car.targetX = car.x + (car.dirX * laneSpacing);
                    car.targetZ = car.z + (car.dirZ * laneSpacing);
                }
            }
        } else { 
            let dx = car.targetX - car.x;
            let dz = car.targetZ - car.z;
            
            let dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist <= 0.001) {
                car.x = car.targetX;
                car.z = car.targetZ;
                car.state = 0; 
                car.timer = 0.5 + Math.random() * 2.0; 
            } else {
                let progress = 1.0 - (dist / laneSpacing);
                let easeSpeed = Math.max(0.02, Math.sin(progress * Math.PI)); 
                let stepDist = car.speed * easeSpeed * visualDt;
                
                if (stepDist >= dist) {
                    car.x = car.targetX;
                    car.z = car.targetZ;
                    car.state = 0;
                    car.timer = 0.5 + Math.random() * 2.0;
                } else {
                    car.x += (dx / dist) * stepDist;
                    car.z += (dz / dist) * stepDist;
                }
            }
        }
        
        tPositions[i*3 + 0] = car.x;
        tPositions[i*3 + 2] = car.z;
    }
    trafficField.geometry.attributes.position.needsUpdate = true;

    velVar.material.uniforms.uTime.value = visualTime;
    velVar.material.uniforms.dt.value = scaledDt; 
    velVar.material.uniforms.uBurst.value = currentBurst;
    velVar.material.uniforms.uMouse3D.value.copy(mouse3D);
    velVar.material.uniforms.uMouseVel.value.copy(currentMouseVel);
    posVar.material.uniforms.dt.value = scaledDt;

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
    
    // --- DYNAMIC ORB FADE LOGIC ---
    const distToCamera = camera.position.distanceTo(orb.position);

    let targetOrbOpacity = 1.0;
    if (distToCamera < 3.0) {
        targetOrbOpacity = 0.0;
    }

    orb.material.opacity += (targetOrbOpacity - orb.material.opacity) * (visualDt * 5.0);

    if (orb.material.opacity < 0.99) {
        orb.material.transparent = true;
        orb.material.depthWrite = false; 
    } else {
        orb.material.transparent = false;
        orb.material.depthWrite = true;
    }
    
    orb.visible = orb.material.opacity > 0.01;

    // --- UPDATE UI HEAT LEGENDS BY CAMERA DISTANCE (Theme 3 Only) ---
    if (currentTheme === 3 || (isTransitioning && nextTheme === 3)) {
        const [indLeft, indRight] = heatIndicators;
        if (indLeft && indRight) {
            const minD = 2.0;
            const maxD = 50.0;
            
            // Map the camera distance to a percentage (closer = higher percentage)
            let heatPercent = 100.0 * (1.0 - (Math.max(minD, Math.min(distToCamera, maxD)) - minD) / (maxD - minD));
            
            // Add a tiny bit of jitter/noise to make it feel like a live analog meter
            const noise = (Math.random() - 0.5) * 1.5;
            heatPercent = Math.max(0, Math.min(100, heatPercent + noise));
            
            indLeft.style.bottom = `${heatPercent}%`;
            indRight.style.bottom = `${heatPercent}%`;
        }
    }
    
    const floatY = Math.sin(visualTime * 0.8) * 0.1;
    orb.position.y = floatY;
    firePoints.position.y = floatY;

    // --- OPTIMIZED REAL-TIME REFLECTIONS ---
    reflectionFrame++;
    if (orb.visible && reflectionFrame % 3 === 0) {
        orb.visible = false; 
        cubeCamera.position.copy(orb.position);
        cubeCamera.update(renderer, scene);
        orb.visible = true; 
    }
    
    ledRing.position.y = 3.0 + (floatY * 0.5);
    
    composer.render();
}

animate();
