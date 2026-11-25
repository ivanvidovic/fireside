// Fireside shirt viewer: a faithful subset of ORB Garment Studio's renderer
// (orb.center). Fabric shader, lighting presets, environments, shadows, cloth
// motion and orbit controls are ported from ORB studio.js. Paths that cannot run
// for this baked shirt (camo, glow/UV artwork effects, afterglow, projector,
// presentation mode, artwork treatment) are removed; everything that can run is kept.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;

/* ------------------------------ ORB presets ------------------------------ */
const NIGHT={green:'#ffd6a0',magenta:'#a5b9ed'};
export const PRESETS={
  softbox:{label:'Neutral',exposure:1,hemi:.15,hemiSky:'#ffffff',hemiGround:'#b8b8b8',key:1.28,keyColor:'#ffffff',keyPos:[-.8,1.1,2.4],fill:.86,fillColor:'#ffffff',fillPos:[1.5,.5,2.4],rim:.24,rimColor:'#ffffff',rimPos:[.5,1.5,-1.8],env:.2},
  studio:{label:'Studio',exposure:.98,hemi:.32,hemiSky:'#ffffff',hemiGround:'#c2bdb6',key:2.05,keyColor:'#fff5e9',keyPos:[-1.65,1.85,1.35],fill:.48,fillColor:'#eef3fb',fillPos:[1.55,.45,1.0],rim:.85,rimColor:'#ffffff',rimPos:[.45,1.1,-1.8],env:.55},
  night:{label:'City night',exposure:1,hemi:.025,hemiSky:'#a5b9ed',hemiGround:'#252a38',key:.4125,keyColor:NIGHT.green,keyPos:[-1.7,2.4,1.4],fill:.12,fillColor:NIGHT.magenta,fillPos:[1.5,.6,.95],rim:.2875,rimColor:NIGHT.magenta,rimPos:[.8,1.1,-1.6],env:.1125},
  uv:{label:'Black light',exposure:1,hemi:.035,hemiSky:'#77718f',hemiGround:'#252030',key:.18,keyColor:'#824bff',keyPos:[-1.65,1.85,1.35],fill:.07,fillColor:'#c1c3d2',fillPos:[1.55,.45,1],rim:.18,rimColor:'#6633ef',rimPos:[.45,1.1,-1.8],env:.45}
};

/* ------------------------- ORB fabric shader code ------------------------ */
const VERT_HEAD=`
uniform float uTime; uniform float uWind; uniform float uTwist; uniform float uFlowHalfWidth;
uniform float uTwistFlowPower; uniform float uSleeveBoost; uniform float uSleeveArc; uniform vec3 uDir;
#ifdef ORB_ARTWORK
attribute vec2 aArtworkUv; attribute vec4 aArtworkClamp;
#endif
varying vec2 vArtworkUv; varying vec4 vArtworkClamp;
#ifdef ORB_MOTION
attribute float aFlow;
#ifdef ORB_ANCHOR_IS_POSITION
#define aMotionAnchor position
#else
attribute vec3 aMotionAnchor;
#endif
vec3 gDisp;
float kMotionFlow(vec3 p){
  float hn=clamp((p.y+.024)/.696,0.0,1.0);
  float f=pow(clamp(1.0-hn/.86,0.0,1.0),1.35);
  float rad=abs(p.x)/max(uFlowHalfWidth,.0001);
  return clamp(max(f,.8*pow(max(0.0,(rad-.70)/.30),1.2)*smoothstep(.26,.58,hn)),0.0,1.0);
}
vec3 kBreeze(vec3 p, float flow){
  if (flow < 0.001) return vec3(0.0);
  float t = uTime;
  float w1 = sin(p.y*6.4  - t*2.05 + p.x*3.1);
  float w2 = sin(p.y*12.7 + t*3.25 + p.z*5.3 + 1.7);
  float w3 = sin(p.x*8.6  + p.z*6.9 - t*1.35);
  float a = uWind*flow;
  vec3 o = uDir*((w1*0.62 + w2*0.24)*a);
  o.y += w3*0.13*a;
  o += normalize(vec3(p.x,0.0,p.z)+vec3(1e-4))*((w2*0.30 + w3*0.22)*a);
  return o;
}
vec3 kInertia(vec3 p, float flow){
  if (flow < 0.001 || abs(uTwist) < 0.00001) return vec3(0.0);
  float f = flow * flow * (3.0 - 2.0 * flow);
  f = pow(max(f, 0.0001), uTwistFlowPower);
  float sleeveX = smoothstep(0.16, 0.31, abs(p.x));
  float sleeveY = smoothstep(0.20, 0.42, p.y);
  float sleeve = sleeveX * sleeveY;
  float torsoA = uTwist * f;
  float globalA = torsoA * (1.0 + sleeve * uSleeveBoost);
  float cg = cos(globalA), sg = sin(globalA);
  vec3 qGlobal = p;
  qGlobal.x = cg*p.x + sg*p.z;
  qGlobal.z = -sg*p.x + cg*p.z;
  float side = p.x < 0.0 ? -1.0 : 1.0;
  vec3 pivot = vec3(side*0.145, 0.48, 0.0);
  vec3 local = p - pivot;
  float localA = torsoA * (1.0 + sleeve*(uSleeveBoost + uSleeveArc*0.90));
  float cl = cos(localA), sl = sin(localA);
  vec3 localRot = local;
  localRot.x = cl*local.x + sl*local.z;
  localRot.z = -sl*local.x + cl*local.z;
  vec3 qSleeve = pivot + localRot;
  float arcBlend = sleeve * uSleeveArc;
  vec3 q = mix(qGlobal, qSleeve, arcBlend);
  return q-p;
}
vec3 kFabricDisp(vec3 p, float flow){ return kBreeze(p, flow) + kInertia(p, flow); }
#endif
`;
const FRAG_HEAD=`
uniform float uArtRough,uHasArtwork;
uniform sampler2D uArtwork;
uniform float uBlackLight,uFabricReactive;
float kUVExposure=0.0,kUVVisibility=1.0,kHardVisibility=1.0;
vec3 kFabricColor=vec3(0.0),kEffectNormal=vec3(0.0);
varying vec2 vArtworkUv;
varying vec4 vArtworkClamp;
bool insideArtworkTile(){return all(greaterThanEqual(vArtworkUv,vArtworkClamp.xy))&&all(lessThanEqual(vArtworkUv,vArtworkClamp.zw))&&vArtworkClamp.z>vArtworkClamp.x;}
vec2 boundedArtworkUv(){return clamp(vArtworkUv,vArtworkClamp.xy,vArtworkClamp.zw);}
float kArtworkMask=0.0;`;
const FRAG_PRINT=`{
kArtworkMask=0.0;kFabricColor=diffuseColor.rgb;
#ifdef ORB_ARTWORK
if(gl_FrontFacing&&uHasArtwork>0.5&&insideArtworkTile()){
  vec4 art=texture2D(uArtwork,boundedArtworkUv());
  diffuseColor.rgb=diffuseColor.rgb*(1.0-art.a)+art.rgb;
  kArtworkMask=art.a;
}
#endif
if(!gl_FrontFacing)diffuseColor.rgb*=0.60;
}`;
// ORB's black-light fabric response (glow/UV artwork terms are zero for this design).
const FRAG_EMISSION=`
float kFabricLuma=dot(kFabricColor,vec3(.2126,.7152,.0722));
float kFabricLight=smoothstep(.015,.55,kFabricLuma);
float kFabricUVGain=clamp(uBlackLight*100.0,0.0,1.0)*uFabricReactive*(1.0-kArtworkMask);
reflectedLight.directDiffuse*=1.0+.16*kFabricLight*kFabricUVGain;
reflectedLight.indirectDiffuse*=1.0+.12*kFabricLight*kFabricUVGain;
float kUVReflection=1.0+mix(.18,.14,kFabricLight)*kFabricUVGain;
reflectedLight.directSpecular*=kUVReflection;
reflectedLight.indirectSpecular*=kUVReflection;
totalEmissiveRadiance+=.008*kFabricColor*kFabricLight*kUVExposure*uFabricReactive*(1.0-kArtworkMask)*(gl_FrontFacing?1.0:.6);
`;
function mustReplace(source,find,replacement,label){
  if(!source.includes(find))throw new Error('Shader patch failed: '+label);
  return source.replace(find,replacement);
}

/* ------------------------------- viewer ---------------------------------- */
export function createShirt({canvas,mobile,mobileMemory,reduced,power,assets,onError}){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  const pixelCap=mobileMemory?1.5:2;
  renderer.setPixelRatio(Math.min(pixelCap,devicePixelRatio||1));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.setClearColor(0x000000,0);

  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,0.003,40);

  // ORB makeEnvironment(): small procedural HDR environments.
  const environments={};
  function makeEnvironment(kind){
    const W=256,H=128,data=new Float32Array(W*H*4);
    const green=new THREE.Color(NIGHT.green).toArray(),magenta=new THREE.Color(NIGHT.magenta).toArray();
    const boxes=kind==='softbox'?[[-.8,.55,1.0,.8,.55,[1,1,1]],[.8,.55,1.0,.8,.55,[1,1,1]],[2.35,.55,1.0,.8,.55,[1,1,1]],[-2.35,.55,1.0,.8,.55,[1,1,1]]]
      :kind==='studio'?[[-.8,.65,.45,.5,2.8,[1,1,1]],[2.25,.3,.22,.65,1.8,[1,1,1]],[.9,1.2,.8,.22,1.2,[1,1,1]]]
      :kind==='uv'?[[-.8,.65,.5,.5,.16,[.32,.12,1]]]
      :[[-.9,.4,.22,.6,.55,green],[1.1,.25,.2,.55,.4,magenta],[2.8,.4,.35,.3,.35,magenta]];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const az=x/W*Math.PI*2-Math.PI,el=Math.PI/2-y/H*Math.PI,sky=Math.max(0,Math.sin(el));
      const base=kind==='softbox'?[.16+.06*sky,.16+.06*sky,.16+.06*sky]
        :kind==='studio'?[.08+.12*sky,.08+.12*sky,.08+.12*sky]
        :kind==='uv'?[.001,.001,.004]:[.006+.008*sky,.008+.01*sky,.012+.015*sky];
      for(const [a,e,w,h,p,color] of boxes){
        const distance=Math.atan2(Math.sin(az-a),Math.cos(az-a));
        const value=p*Math.exp(-Math.pow(distance/w,6)-Math.pow((el-e)/h,6));
        for(let c=0;c<3;c++)base[c]+=value*color[c];
      }
      const i=(y*W+x)*4;data[i]=base[0];data[i+1]=base[1];data[i+2]=base[2];data[i+3]=1;
    }
    const t=new THREE.DataTexture(data,W,H,THREE.RGBAFormat,THREE.FloatType);
    t.mapping=THREE.EquirectangularReflectionMapping;t.needsUpdate=true;
    const pm=new THREE.PMREMGenerator(renderer),target=pm.fromEquirectangular(t);
    pm.dispose();t.dispose();return target.texture;
  }
  const env=id=>environments[id]||(environments[id]=makeEnvironment(id==='night'?'night':id));

  // ORB light rig. Key casts the garment's self-shadow.
  const lightRig=new THREE.Group();scene.add(lightRig);
  const hemi=new THREE.HemisphereLight(),key=new THREE.DirectionalLight(),fil=new THREE.DirectionalLight(),rim=new THREE.DirectionalLight();
  lightRig.add(hemi,key,fil,rim,key.target,fil.target,rim.target);
  key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-.72,right:.72,top:.68,bottom:-.68,near:.1,far:6});
  key.shadow.camera.updateProjectionMatrix();
  function configureShadow(){
    const texel=(key.shadow.camera.right-key.shadow.camera.left)/key.shadow.mapSize.x;
    key.shadow.bias=-.0002;
    key.shadow.normalBias=Math.min(.004,Math.max(.0018,texel*(mobileMemory?2:1.5)));
  }
  function setShadowBudget(neutral){
    const size=neutral?1024:(mobile?1024:2048);
    if(key.shadow.mapSize.x!==size){key.shadow.map?.dispose();key.shadow.map=null;key.shadow.mapSize.set(size,size);}
    key.shadow.radius=1;configureShadow();shadowDirty=true;
  }
  // ORB City night passing traffic (three directional lights, no shadows).
  const traffic=(()=>{
    const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const events=[{start:1,duration:6.8,direction:1,brake:true,depth:1.5},{start:13,duration:5.5,direction:-1,brake:false,depth:-1.7},{start:24,duration:8,direction:-1,brake:true,depth:1.7},{start:39,duration:6,direction:1,brake:false,depth:-1.5}];
    const rig=new THREE.Group();lightRig.parent.add(rig);
    const head=new THREE.DirectionalLight('#e7edff',0),pair=new THREE.DirectionalLight('#fff1d9',0),tail=new THREE.DirectionalLight('#ff2412',0);
    rig.add(head,pair,tail,head.target,pair.target,tail.target);rig.visible=false;let time=0;
    return {rig,update(dt,enabled,gain){
      rig.visible=enabled;if(!enabled)return;
      if(!reduced)time+=Math.max(0,Math.min(.05,dt));
      const t=(time*1.45)%50,e=events.find(e=>t>=e.start&&t<=e.start+e.duration);
      let s={head:0,tail:0,x:0,z:1.5};
      if(e){const u=(t-e.start)/e.duration,h=smooth(0,.18,u)*(1-smooth(.46,.78,u)),tl=smooth(.38,.57,u)*(1-smooth(.82,1,u)),br=e.brake?smooth(.62,.68,u)*(1-smooth(.76,.87,u)):0;
        s={head:h*1.25,tail:tl*(.22+.62*br),x:e.direction*(-2.8+5.6*u),z:e.depth};}
      head.position.set(s.x,.02,s.z);pair.position.set(s.x+.32,.02,s.z);tail.position.set(s.x-.48,.08,s.z);
      head.intensity=s.head*.85*gain;pair.intensity=s.head*.28*gain;tail.intensity=s.tail*.9*gain;
    }};
  })();

  // Soft studio pool beneath the garment (ORB shirtShadow).
  const pool=(()=>{
    const S=256,c=document.createElement('canvas');c.width=c.height=S;
    const x=c.getContext('2d'),g=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(.55,'rgba(0,0,0,.13)');g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.fillRect(0,0,S,S);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.86,.40),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
    m.rotation.x=-Math.PI/2;m.position.y=-.455;scene.add(m);return m;
  })();

  const uni={
    uTime:{value:0},uWind:{value:reduced?0:.011},uTwist:{value:0},
    uTwistFlowPower:{value:.775},uSleeveBoost:{value:.8},uSleeveArc:{value:1},
    uDir:{value:new THREE.Vector3(.85,0,.53).normalize()},uArtRough:{value:.5}
  };
  const lightEnvRotation={value:new THREE.Matrix3()},envWA={value:1},envWB={value:0},envB={value:null},blackLight={value:0};
  const artwork={map:{value:null},has:{value:0}};

  function patchFabric(material,{motion,anchorIsPosition,art,halfWidth}){
    const defines={};if(motion)defines.ORB_MOTION='';if(motion&&anchorIsPosition)defines.ORB_ANCHOR_IS_POSITION='';if(art)defines.ORB_ARTWORK='';
    material.defines={...(material.defines||{}),...defines};
    material.onBeforeCompile=sh=>{
      Object.assign(sh.uniforms,uni);
      sh.uniforms.uFlowHalfWidth={value:halfWidth};
      sh.uniforms.uArtwork=artwork.map;sh.uniforms.uHasArtwork=art?artwork.has:{value:0};
      sh.uniforms.uBlackLight=blackLight;sh.uniforms.uFabricReactive={value:1};
      sh.uniforms.uLightEnvRotation=lightEnvRotation;sh.uniforms.uEnvWA=envWA;sh.uniforms.uEnvWB=envWB;sh.uniforms.uEnvB=envB;
      let envChunk=THREE.ShaderChunk.envmap_physical_pars_fragment;
      envChunk=mustReplace(envChunk,'inverseTransformDirection( normal, viewMatrix );','uLightEnvRotation * inverseTransformDirection( normal, viewMatrix );','env normal');
      envChunk=mustReplace(envChunk,'inverseTransformDirection( reflectVec, viewMatrix );','uLightEnvRotation * inverseTransformDirection( reflectVec, viewMatrix );','env reflect');
      // Theme fades: sample the outgoing and incoming preset environments, weighted.
      // At rest uEnvWB is 0 and this is ORB's single environment times its power.
      envChunk=mustReplace(envChunk,'textureCubeUV( envMap, worldNormal, 1.0 )','orbEnv( worldNormal, 1.0 )','env irradiance');
      envChunk=mustReplace(envChunk,'textureCubeUV( envMap, reflectVec, roughness )','orbEnv( reflectVec, roughness )','env radiance');
      envChunk=`#ifdef ENVMAP_TYPE_CUBE_UV
uniform sampler2D uEnvB; uniform float uEnvWA, uEnvWB;
vec4 orbEnv(vec3 d,float r){vec4 c=textureCubeUV(envMap,d,r)*uEnvWA;if(uEnvWB>0.0)c+=textureCubeUV(uEnvB,d,r)*uEnvWB;return c;}
#endif
`+envChunk;
      let lighting=THREE.ShaderChunk.lights_fragment_begin;
      const dirStart=lighting.indexOf('#if ( NUM_DIR_LIGHTS > 0 )'),dirEnd=lighting.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )',dirStart);
      if(dirStart<0||dirEnd<0)throw new Error('Shader patch failed: lights');
      let directional=lighting.slice(dirStart,dirEnd);
      directional=mustReplace(directional,'getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight );\n kUVVisibility=1.0;','dir info');
      directional=mustReplace(directional,'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow(','kUVVisibility = ( directLight.visible && receiveShadow ) ? getShadow(','dir shadow');
      directional=mustReplace(directional,'\n\t\tRE_Direct( directLight,',`\n        directLight.color *= kUVVisibility;
        #if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS)
        if(uBlackLight>0.0&&uFabricReactive>.5&&receiveShadow){
          kHardVisibility=kUVVisibility;
          kUVVisibility=.25*(
            getShadow(directionalShadowMap[i],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i]+vec4(vec2(2.0,0.0)/directionalLightShadow.shadowMapSize*vDirectionalShadowCoord[i].w,0.0,0.0))+
            getShadow(directionalShadowMap[i],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i]+vec4(vec2(-2.0,0.0)/directionalLightShadow.shadowMapSize*vDirectionalShadowCoord[i].w,0.0,0.0))+
            getShadow(directionalShadowMap[i],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i]+vec4(vec2(0.0,2.0)/directionalLightShadow.shadowMapSize*vDirectionalShadowCoord[i].w,0.0,0.0))+
            getShadow(directionalShadowMap[i],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i]+vec4(vec2(0.0,-2.0)/directionalLightShadow.shadowMapSize*vDirectionalShadowCoord[i].w,0.0,0.0)));
        }
        #endif
        #if UNROLLED_LOOP_INDEX == 0
          kUVExposure += uBlackLight*kUVVisibility*max(dot(kEffectNormal,directLight.direction),0.0);
        #endif
        RE_Direct( directLight,`,'dir RE');
      lighting=lighting.slice(0,dirStart)+directional+lighting.slice(dirEnd);
      sh.fragmentShader=mustReplace(sh.fragmentShader,'#include <lights_fragment_begin>',lighting,'lights include');
      sh.fragmentShader='uniform mat3 uLightEnvRotation;\n'+mustReplace(sh.fragmentShader,'#include <envmap_physical_pars_fragment>',envChunk,'env include');
      sh.vertexShader=VERT_HEAD+sh.vertexShader;
      sh.vertexShader=mustReplace(sh.vertexShader,'#include <beginnormal_vertex>',`#include <beginnormal_vertex>
       #ifdef ORB_ARTWORK
       vArtworkUv = aArtworkUv; vArtworkClamp = aArtworkClamp;
       #else
       vArtworkUv = vec2(-1.0); vArtworkClamp = vec4(0.0);
       #endif
       #ifdef ORB_MOTION
       gDisp = kFabricDisp(aMotionAnchor, aFlow);
       if (aFlow > 0.001) {
         vec3 T1 = normalize(cross(objectNormal, vec3(0.0,1.0,0.0)) + vec3(1e-5));
         vec3 T2 = normalize(cross(objectNormal, T1));
         float e = 0.001;
         vec3 p0 = position + gDisp;
         vec3 pa = position + T1*e + kFabricDisp(aMotionAnchor + T1*e, kMotionFlow(aMotionAnchor + T1*e));
         vec3 pb = position + T2*e + kFabricDisp(aMotionAnchor + T2*e, kMotionFlow(aMotionAnchor + T2*e));
         vec3 nn = normalize(cross(pa-p0, pb-p0));
         objectNormal = dot(nn, objectNormal) < 0.0 ? -nn : nn;
         #ifdef USE_TANGENT
           vec3 pt = position + objectTangent*e;
           objectTangent = normalize(pt + kFabricDisp(aMotionAnchor + objectTangent*e, kMotionFlow(aMotionAnchor + objectTangent*e)) - p0);
           objectTangent = normalize(objectTangent - objectNormal*dot(objectTangent,objectNormal));
         #endif
       }
       #endif`,'normal');
      sh.vertexShader=mustReplace(sh.vertexShader,'#include <begin_vertex>','#include <begin_vertex>\n#ifdef ORB_MOTION\n transformed += gDisp;\n#endif','vertex');
      sh.fragmentShader=FRAG_HEAD+'\n'+sh.fragmentShader;
      sh.fragmentShader=mustReplace(sh.fragmentShader,'#include <normal_fragment_maps>','kEffectNormal=normal;\n#include <normal_fragment_maps>','normal maps');
      sh.fragmentShader=mustReplace(sh.fragmentShader,'#include <map_fragment>','#include <map_fragment>\n'+FRAG_PRINT,'map');
      sh.fragmentShader=mustReplace(sh.fragmentShader,'#include <aomap_fragment>','#include <aomap_fragment>\n'+FRAG_EMISSION,'ao');
      sh.fragmentShader=mustReplace(sh.fragmentShader,'#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, clamp(uArtRough, 0.02, 1.0), clamp(kArtworkMask, 0.0, 1.0));','roughness');
    };
    material.customProgramCacheKey=()=>'fireside-orb-fabric-'+Object.keys(defines).sort().join('-');
    material.needsUpdate=true;
  }
  function depthMaterial(motion,anchorIsPosition,halfWidth){
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
    if(!motion)return depth;
    depth.defines={ORB_MOTION:''};if(anchorIsPosition)depth.defines.ORB_ANCHOR_IS_POSITION='';
    depth.onBeforeCompile=sh=>{
      Object.assign(sh.uniforms,uni);sh.uniforms.uFlowHalfWidth={value:halfWidth};
      sh.vertexShader=VERT_HEAD+sh.vertexShader;
      sh.vertexShader=mustReplace(sh.vertexShader,'#include <begin_vertex>','#include <begin_vertex>\n transformed += kFabricDisp(aMotionAnchor,aFlow);','depth');
    };
    depth.customProgramCacheKey=()=>'fireside-orb-depth-'+(anchorIsPosition?'p':'a');
    return depth;
  }

  const garment=new THREE.Group();garment.position.y=-.350;scene.add(garment);

  // ORB orbit state. Back view, ORB preview distance, tee torso frame center.
  const GARMENT_CENTER=new THREE.Vector3(0,.026,0);
  const state={az:Math.PI,el:1.45,r:1.62,taz:Math.PI,tel:1.45,tr:1.62,
    focus:GARMENT_CENTER.clone(),focusTarget:GARMENT_CENTER.clone(),preset:'softbox',lightPower:110};
  const INERTIA={enabled:!reduced,strength:15,ramp:100,settle:.5,elasticity:60,overshoot:70,release:70,sensitivity:50};
  let dragging=false,orbitInputVelocity=0,lastOrbitInputTime=0;
  // Idle turn: one full turn every 30 s. Stops while held; eases back in after release (~1.5 s).
  const IDLE_SPEED=reduced?0:Math.PI*2/30;let idleSpeed=IDLE_SPEED;
  let inertiaInput=0,inertiaTwist=0,inertiaVelocity=0,inertiaReleaseKick=0,inertiaLoadTarget=0,inertiaLastMotionVelocity=0;
  let lightReady=false,shadowDirty=true,lastShadowSig='';
  const lightReference=new THREE.Quaternion(),lightInverse=new THREE.Quaternion(),lightMatrix=new THREE.Matrix4(),rigFrom=new THREE.Quaternion();
  const frame={cx:.5,cy:.5,scale:1,zoom:1};   // hero framing: screen center, distance multiplier, pure zoom
  let cameraOverride=null,introR=reduced?1:0,startIntro=false,current=null;

  const power_={regular:power?.regular??110,night:power?.night??100,uv:power?.uv??100};
  let trafficGain=0;
  // Preset values in ORB terms; a theme change blends between two of these.
  function presetParams(id){
    const p=PRESETS[id]?PRESETS[id]:PRESETS.softbox;
    const power=(id==='uv'?power_.uv/100*8:id==='night'?power_.night/100:power_.regular/100);
    const C=c=>new THREE.Color(c),V=v=>new THREE.Vector3(...v);
    return {id,exposure:p.exposure,hemiSky:C(p.hemiSky),hemiGround:C(p.hemiGround),hemi:p.hemi*power,
      keyColor:C(p.keyColor),key:p.key*power,keyPos:V(p.keyPos),fillColor:C(p.fillColor),fill:p.fill*power,fillPos:V(p.fillPos),
      rimColor:C(p.rimColor),rim:p.rim*power,rimPos:V(p.rimPos),env:p.env*power,black:id==='uv'?power:0,traffic:id==='night'?power_.night/100:0};
  }
  function blend(a,b,t){
    renderer.toneMappingExposure=lerp(a.exposure,b.exposure,t);
    scene.environment=env(a.id);envB.value=env(b.id);envWA.value=a.env*(1-t);envWB.value=t>0?b.env*t:0;
    blackLight.value=lerp(a.black,b.black,t);trafficGain=lerp(a.traffic,b.traffic,t);
    hemi.color.lerpColors(a.hemiSky,b.hemiSky,t);hemi.groundColor.lerpColors(a.hemiGround,b.hemiGround,t);hemi.intensity=lerp(a.hemi,b.hemi,t);
    key.color.lerpColors(a.keyColor,b.keyColor,t);key.intensity=lerp(a.key,b.key,t);key.position.lerpVectors(a.keyPos,b.keyPos,t);
    fil.color.lerpColors(a.fillColor,b.fillColor,t);fil.intensity=lerp(a.fill,b.fill,t);fil.position.lerpVectors(a.fillPos,b.fillPos,t);
    rim.color.lerpColors(a.rimColor,b.rimColor,t);rim.intensity=lerp(a.rim,b.rim,t);rim.position.lerpVectors(a.rimPos,b.rimPos,t);
  }
  const FADE=.5;   // seconds; matches the page's theme transition
  let fadeFrom=null,fadeTo=null,fadeT=1;
  const fadeEase=t=>1-Math.pow(1-t,3);
  function applyPreset(id,animate=false){
    const target=presetParams(id);
    if(!animate||reduced||!fadeTo){fadeFrom=fadeTo=target;fadeT=1;blend(target,target,0);setShadowBudget(id==='softbox');}
    else if(fadeT<1&&fadeFrom.id===id){[fadeFrom,fadeTo]=[fadeTo,fadeFrom];fadeT=1-fadeT;}
    else{
      // A third preset mid-fade starts from whichever endpoint is currently closer.
      if(fadeT<1)fadeFrom=fadeEase(fadeT)>.5?fadeTo:fadeFrom;else fadeFrom=fadeTo;
      fadeTo=target;fadeT=0;
    }
    state.preset=id;shadowDirty=true;
  }
  function advanceFade(dt){
    if(fadeT>=1)return;
    fadeT=Math.min(1,fadeT+dt/FADE);
    if(fadeT>=1){fadeFrom=fadeTo;blend(fadeTo,fadeTo,0);setShadowBudget(fadeTo.id==='softbox');}
    else blend(fadeFrom,fadeTo,fadeEase(fadeT));
    shadowDirty=true;
  }
  function updateLightLock(){
    // ORB "lights follow your view": the rig keeps the orientation it had relative to
    // ORB's front reference camera. Neutral follows the camera exactly.
    if(!lightReady){
      // Saved lighting reference from Ivan's ORB design (Mens_Tee_Washed_Black_037.orb).
      lightReference.set(-0.17446752917996042,-0.5543859865524864,-0.08056921344338473,0.8097690170790562).normalize();lightReady=true;
    }
    const rule=(id,q)=>id==='softbox'?q.copy(camera.quaternion):q.copy(camera.quaternion).multiply(lightInverse.copy(lightReference).invert());
    rule(fadeTo?fadeTo.id:state.preset,lightRig.quaternion);
    if(fadeT<1&&fadeFrom.id!==fadeTo.id){rule(fadeFrom.id,rigFrom);lightRig.quaternion.copy(rigFrom.slerp(lightRig.quaternion,fadeEase(fadeT)));}
    lightMatrix.makeRotationFromQuaternion(lightInverse.copy(lightRig.quaternion).invert());
    lightEnvRotation.value.setFromMatrix4(lightMatrix);
    traffic.rig.quaternion.copy(lightRig.quaternion);
  }

  function updateFabricInertia(dt){
    if(!INERTIA.enabled){inertiaInput=inertiaTwist=inertiaVelocity=inertiaReleaseKick=inertiaLoadTarget=inertiaLastMotionVelocity=0;uni.uTwist.value=0;return;}
    const maxTwist=THREE.MathUtils.degToRad(INERTIA.strength);
    if(dragging){
      const rampTau=Math.max(.015,INERTIA.ramp/1000);
      inertiaInput+=(orbitInputVelocity-inertiaInput)*(1-Math.exp(-dt/rampTau));
      const sens=clamp(INERTIA.sensitivity/100,0,1),dead=lerp(.30,.04,sens),full=lerp(4.60,1.80,sens),mag=Math.abs(inertiaInput);
      if(mag>dead&&maxTwist>0){let t=clamp((mag-dead)/Math.max(.001,full-dead),0,1);t=t*t*(3-2*t);inertiaLoadTarget=Math.sign(inertiaInput)*maxTwist*t;}
      inertiaTwist+=(inertiaLoadTarget-inertiaTwist)*(1-Math.exp(-dt/Math.max(.025,rampTau*1.35)));
      inertiaVelocity=0;inertiaReleaseKick=0;
    }else{
      inertiaInput+=(0-inertiaInput)*(1-Math.exp(-dt/.10));
      const settleScale=clamp(INERTIA.settle/.35,.35,7.2),activeK=clamp(INERTIA.elasticity,10,100),k=activeK/(settleScale*settleScale);
      const over=clamp(INERTIA.overshoot/100,0,1),damping=(2*Math.sqrt(activeK)*lerp(1.02,.18,over))/settleScale;
      if(Math.abs(inertiaReleaseKick)>.000001){inertiaVelocity+=inertiaReleaseKick;inertiaReleaseKick=0;}
      inertiaVelocity+=(0-inertiaTwist)*k*dt;inertiaVelocity*=Math.exp(-damping*dt);inertiaTwist+=inertiaVelocity*dt;
      inertiaTwist=clamp(inertiaTwist,-maxTwist*1.2,maxTwist*1.2);
      if(Math.abs(inertiaTwist)<.00002&&Math.abs(inertiaVelocity)<.00005){inertiaTwist=inertiaVelocity=inertiaLoadTarget=inertiaLastMotionVelocity=0;}
    }
    uni.uTwist.value=inertiaTwist;
  }
  // Shared by drag and scroll-driven rotation: azimuth change plus its velocity.
  function orbitInput(dAz,dEl,sampleDt){
    state.taz+=dAz;state.tel=clamp(state.tel+dEl,.55,2.05);
    orbitInputVelocity=clamp(dAz/Math.max(.008,Math.min(.08,sampleDt)),-6,6);
    if(Math.abs(orbitInputVelocity)>.03)inertiaLastMotionVelocity=orbitInputVelocity;
  }
  function beginOrbit(){dragging=true;idleSpeed=0;orbitInputVelocity=0;inertiaInput=0;inertiaVelocity=0;inertiaReleaseKick=0;inertiaLoadTarget=inertiaTwist;inertiaLastMotionVelocity=0;lastOrbitInputTime=performance.now();}
  function endOrbit(){
    if(dragging){const rel=INERTIA.release/100;inertiaReleaseKick=-inertiaTwist*(4+4*rel)*rel-inertiaLastMotionVelocity*.010*rel;inertiaLoadTarget=0;}
    dragging=false;orbitInputVelocity=0;
  }

  function resize(){
    const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  addEventListener('resize',resize);resize();

  function applyFrame(){
    const w=innerWidth,h=innerHeight;
    // Move ORB's centered framing to the hero region via a principal-point offset.
    camera.setViewOffset(w,h,w*(.5-frame.cx),h*(.5-frame.cy),w,h);
  }
  function placeCamera(){
    if(cameraOverride){cameraOverride(camera);return;}
    camera.fov=34;
    const r=state.r*frame.scale;
    state.focus.lerp(state.focusTarget,.22);
    camera.position.set(state.focus.x+r*Math.sin(state.el)*Math.sin(state.az),r*Math.cos(state.el)+state.focus.y+.02,state.focus.z+r*Math.sin(state.el)*Math.cos(state.az));
    camera.lookAt(state.focus);
    camera.zoom=frame.zoom;applyFrame();camera.updateProjectionMatrix();
  }
  // Pose in ORB terms (for the intro hand-off): position on the orbit for given params.
  function orbitPose(az,el,r){
    const f=GARMENT_CENTER,rr=r*frame.scale;
    return {position:new THREE.Vector3(f.x+rr*Math.sin(el)*Math.sin(az),rr*Math.cos(el)+f.y+.02,f.z+rr*Math.sin(el)*Math.cos(az)),target:f.clone(),fov:34};
  }

  function updateShadowMap(){
    const q=camera.quaternion,sig=[state.preset,q.x,q.y,q.z,q.w].join('/');
    const moving=Math.abs(uni.uWind.value)>.00001||Math.abs(uni.uTwist.value)>.00001;
    if(shadowDirty||sig!==lastShadowSig||moving){renderer.shadowMap.needsUpdate=true;shadowDirty=false;lastShadowSig=sig;}
  }

  function frameTick(dt){
    if(!current)return;
    uni.uTime.value+=dt;
    if(!cameraOverride){
      if(startIntro&&introR<1){introR=Math.min(1,introR+dt/1.15);state.r=lerp(2.45,state.tr,1-Math.pow(1-introR,3));}
      else state.r+=(state.tr-state.r)*.16;
      idleSpeed+=((dragging?0:IDLE_SPEED)-idleSpeed)*(1-Math.exp(-dt/.5));state.taz+=idleSpeed*dt;
      state.az+=(state.taz-state.az)*.22;state.el+=(state.tel-state.el)*.22;
    }
    uni.uWind.value+=((reduced?0:.011)-uni.uWind.value)*.05;
    updateFabricInertia(dt);
    advanceFade(dt);
    traffic.update(dt,trafficGain>.0001,trafficGain);
    placeCamera();camera.updateMatrixWorld();updateLightLock();
    updateShadowMap();renderer.render(scene,camera);
  }

  // ---- loading ----
  async function load(){
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [gltf,bitmap]=await Promise.all([
      loader.loadAsync(assets.glb),
      Promise.resolve(typeof assets.artwork==='string'?fetch(assets.artwork):assets.artwork).then(r=>{if(!r.ok)throw new Error('Artwork '+r.status);return r.blob();})
        .then(b=>createImageBitmap(b,{premultiplyAlpha:'none',colorSpaceConversion:'none'}))
    ]);
    // ORB's packed artwork atlas (sRGB, premultiplied). ORB samples level 0 only because its
    // atlas tiles touch; this atlas has transparent gutters, so mipmaps are safe and keep
    // the fine print stable when the shirt is shown smaller than ORB's stage.
    const tex=new THREE.Texture(bitmap);
    tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.premultiplyAlpha=false;
    tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
    tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;
    artwork.map.value=tex;artwork.has.value=1;
    const aniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const root=gltf.scene;const halfWidth=.2992915344238281;
    root.traverse(o=>{
      if(!o.isMesh)return;
      const ex=o.parent?.userData?.orbMeshId?o.parent.userData:o.userData;
      const info={motion:!!ex.motion,anchorIsPosition:!!ex.anchorIsPosition,art:ex.orbMeshId===1,halfWidth};
      const g=o.geometry;
      for(const [from,to] of [['_flow','aFlow'],['_motion_anchor','aMotionAnchor'],['_artwork_uv','aArtworkUv'],['_artwork_clamp','aArtworkClamp']])
        if(g.attributes[from]){g.setAttribute(to,g.attributes[from]);g.deleteAttribute(from);}
      o.material=o.material.clone();   // ORB clones per mesh; patches differ by mesh
      for(const value of Object.values(o.material))if(value?.isTexture)value.anisotropy=aniso;
      o.material.side=THREE.DoubleSide;
      patchFabric(o.material,info);
      o.customDepthMaterial=depthMaterial(info.motion,info.anchorIsPosition,halfWidth);
      o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    });
    garment.add(root);current=root;
    applyPreset(state.preset);
    // Compile every program now so the first visible frame never stalls.
    placeCamera();camera.updateMatrixWorld();updateLightLock();
    renderer.compile(scene,camera);   // the site only uses Studio lighting, so the night-traffic programs are never compiled
  }
  const ready=load().catch(e=>{onError?.(e);throw e;});

  return {
    renderer,camera,scene,state,ready,canvas,uniforms:uni,
    tick:frameTick,
    setPreset:(id,animate=false)=>{applyPreset(id,animate);},
    get preset(){return state.preset;},
    setFrame(cx,cy,scale,zoom=1){frame.cx=cx;frame.cy=cy;frame.scale=scale;frame.zoom=zoom;},
    get frame(){return {...frame};},
    orbitPose,
    setCameraOverride(fn){cameraOverride=fn;},
    playSettle(){startIntro=true;introR=reduced?1:0;},
    orbitInput,beginOrbit,endOrbit,
    get dragging(){return dragging;},
    // Zoom toward the shirt: 1 = rest framing, up to 2.2 for a close look at the print.
    // Zoom toward the shirt: 1 = whole shirt, up to 3 for a close look at the print.
    // instant=true jumps there (used for the starting view, so it never animates in).
    setZoom(z,instant=false){
      const f=clamp(z,1,3);state.tr=1.62/f;
      // Drift the view up toward the back print as it zooms in (print sits ~.15 world units above center).
      state.focusTarget.y=GARMENT_CENTER.y+.15*Math.min(1,(f-1)/1.2);
      if(instant){state.r=state.tr;state.focus.copy(state.focusTarget);}
      return f;
    },
    dispose(){renderer.dispose();}
  };

}
