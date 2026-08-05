"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { cn } from "@/lib/utils";

const MAX_COLORS = 8;
type FlowDirection = "up" | "down" | "left" | "right";
type Uniform<T> = { value: T };
interface FerroUniforms {
  iResolution: Uniform<[number, number, number]>;
  iMouse: Uniform<[number, number]>;
  iTime: Uniform<number>;
  uColor0: Uniform<[number, number, number]>;
  uColor1: Uniform<[number, number, number]>;
  uColor2: Uniform<[number, number, number]>;
  uColor3: Uniform<[number, number, number]>;
  uColor4: Uniform<[number, number, number]>;
  uColor5: Uniform<[number, number, number]>;
  uColor6: Uniform<[number, number, number]>;
  uColor7: Uniform<[number, number, number]>;
  uColorCount: Uniform<number>;
  uFlow: Uniform<[number, number]>;
  uSpeed: Uniform<number>;
  uScale: Uniform<number>;
  uTurbulence: Uniform<number>;
  uFluidity: Uniform<number>;
  uRimWidth: Uniform<number>;
  uSharpness: Uniform<number>;
  uShimmer: Uniform<number>;
  uGlow: Uniform<number>;
  uOpacity: Uniform<number>;
  uMouseEnabled: Uniform<number>;
  uMouseStrength: Uniform<number>;
  uMouseRadius: Uniform<number>;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const color = hex.replace("#", "").padEnd(6, "0");
  return [
    parseInt(color.slice(0, 2), 16) / 255,
    parseInt(color.slice(2, 4), 16) / 255,
    parseInt(color.slice(4, 6), 16) / 255,
  ];
};

const prepareColors = (input: string[]) => {
  const base = (input.length ? input : ["#4F46E5", "#06B6D4", "#E0F2FE"]).slice(
    0,
    MAX_COLORS,
  );
  const arr = Array.from({ length: MAX_COLORS }, (_, index) =>
    hexToRgb(base[Math.min(index, base.length - 1)]),
  );
  const avg: [number, number, number] = [0, 0, 0];
  for (const color of arr.slice(0, base.length)) {
    avg[0] += color[0];
    avg[1] += color[1];
    avg[2] += color[2];
  }
  avg[0] /= base.length;
  avg[1] /= base.length;
  avg[2] /= base.length;
  return { arr, count: base.length, avg };
};

const flowVector = (direction: FlowDirection): [number, number] => {
  if (direction === "up") return [0, 1];
  if (direction === "left") return [-1, 0];
  if (direction === "right") return [1, 0];
  return [0, -1];
};

const vertex = `attribute vec2 position; attribute vec2 uv; varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision highp float;
uniform vec3 iResolution; uniform vec2 iMouse; uniform float iTime;
uniform vec3 uColor0; uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
uniform vec3 uColor4; uniform vec3 uColor5; uniform vec3 uColor6; uniform vec3 uColor7;
uniform int uColorCount; uniform vec2 uFlow; uniform float uSpeed; uniform float uScale;
uniform float uTurbulence; uniform float uFluidity; uniform float uRimWidth; uniform float uSharpness;
uniform float uShimmer; uniform float uGlow; uniform float uOpacity; uniform float uMouseEnabled;
uniform float uMouseStrength; uniform float uMouseRadius; varying vec2 vUv;
#define PI 3.14159265
vec3 palette(float h){int count=uColorCount;if(count<1)count=1;int idx=int(floor(clamp(h,0.0,0.999999)*float(count)));if(idx<=0)return uColor0;if(idx==1)return uColor1;if(idx==2)return uColor2;if(idx==3)return uColor3;if(idx==4)return uColor4;if(idx==5)return uColor5;if(idx==6)return uColor6;return uColor7;}
float hash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+33.33);return fract((p.x+p.y)*p.z);}
float smin(float a,float b,float k){float r=exp2(-a/k)+exp2(-b/k);return-k*log2(r);}
float sinlerp(float a,float b,float w){return mix(a,b,(sin(w*PI-PI/2.0)+1.0)/2.0);}
float vn(vec2 p,float s,float seed){vec2 cell=floor(p/s);vec2 rel=mod(p,s);float a=hash(vec3(cell,seed));float b=hash(vec3(cell.x+1.0,cell.y,seed));float c=hash(vec3(cell.x+1.0,cell.y+1.0,seed));float d=hash(vec3(cell.x,cell.y+1.0,seed));return sinlerp(sinlerp(a,b,rel.x/s),sinlerp(d,c,rel.x/s),rel.y/s);}
float dbn(vec2 p,float s,float seed){float o=s/2.0;return(2.0*vn(p,s,seed)+1.5*vn(p+vec2(o,o),s,seed+.1)+1.25*vn(p+vec2(-o,o),s,seed+.2)+1.125*vn(p+vec2(o,-o),s,seed+.3)+vn(p+vec2(-o,-o),s,seed+.4))/7.0;}
void main(){float ref=700.0/max(uScale,.05);vec2 p=vUv*iResolution.xy/iResolution.y*ref;float spd=200.0*uSpeed;float t=iTime;vec2 dir=uFlow;vec2 perp=vec2(-dir.y,dir.x);float d1=vn(p+perp*t*spd,60.0,10.0)*50.0*uTurbulence;float d2=vn(p-perp*t*spd,120.0,15.0)*100.0*uTurbulence;float a=dbn(p+d1+dir*t*spd*.5,40.0,1.0);float b=dbn(p+d2-dir*t*spd*.5,40.0,0.0);float merged=smin(a,b,max(uFluidity,.001));float mouse=0.0;if(uMouseEnabled>.5){vec2 mp=iMouse/iResolution.y*ref;float md=length(p-mp)/ref;mouse=exp(-md*md/(max(uMouseRadius,.02)*max(uMouseRadius,.02)))*uMouseStrength;}float band=(uRimWidth-abs((merged-.4)*2.0))*5.0;float light=clamp(band-vn(p+dir*t*spd*.5,60.0,12.0)*uShimmer,0.0,1.0);light=pow(light,uSharpness)*uGlow*clamp(1.0-mouse,0.0,1.0);vec3 color=palette(clamp(.5+(a-b)*.8,0.0,1.0))*light;float alpha=clamp(max(color.r,max(color.g,color.b)),0.0,1.0);gl_FragColor=vec4(color,alpha*uOpacity);}`;

export interface FerrofluidProps {
  className?: string;
  colors?: string[];
  speed?: number;
  scale?: number;
  turbulence?: number;
  fluidity?: number;
  rimWidth?: number;
  sharpness?: number;
  shimmer?: number;
  glow?: number;
  flowDirection?: FlowDirection;
  opacity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  mouseRadius?: number;
  mouseDampening?: number;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  paused?: boolean;
  dpr?: number;
}

export default function Ferrofluid({
  className,
  colors = ["#4F46E5", "#06B6D4", "#E0F2FE"],
  speed = 0.5,
  scale = 1.6,
  turbulence = 1,
  fluidity = 0.1,
  rimWidth = 0.2,
  sharpness = 2.5,
  shimmer = 1.5,
  glow = 2,
  flowDirection = "down",
  opacity = 1,
  mouseInteraction = true,
  mouseStrength = 1,
  mouseRadius = 0.35,
  mouseDampening = 0.15,
  mixBlendMode,
  paused = false,
  dpr,
}: FerrofluidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const colorsKey = useMemo(() => colors.join("|"), [colors]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const effectColors = colorsKey.split("|");
    const renderer = new Renderer({ dpr: Math.min(dpr ?? (window.devicePixelRatio || 1), 2), alpha: true, antialias: true });
    const { gl } = renderer;
    const canvas = gl.canvas;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "width:100%;height:100%;display:block";
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(canvas);
    const prepared = prepareColors(effectColors);
    const uniforms: FerroUniforms = {
      iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] }, iTime: { value: 0 },
      uColor0: { value: prepared.arr[0] }, uColor1: { value: prepared.arr[1] }, uColor2: { value: prepared.arr[2] }, uColor3: { value: prepared.arr[3] },
      uColor4: { value: prepared.arr[4] }, uColor5: { value: prepared.arr[5] }, uColor6: { value: prepared.arr[6] }, uColor7: { value: prepared.arr[7] },
      uColorCount: { value: prepared.count }, uFlow: { value: flowVector(flowDirection) }, uSpeed: { value: speed }, uScale: { value: scale },
      uTurbulence: { value: turbulence }, uFluidity: { value: fluidity }, uRimWidth: { value: rimWidth }, uSharpness: { value: sharpness },
      uShimmer: { value: shimmer }, uGlow: { value: glow }, uOpacity: { value: opacity }, uMouseEnabled: { value: mouseInteraction ? 1 : 0 },
      uMouseStrength: { value: mouseStrength }, uMouseRadius: { value: mouseRadius },
    };
    const program = new Program(gl, { vertex, fragment, uniforms });
    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });
    const mouse: { target: [number, number]; last: number } = {
      target: [0, 0],
      last: 0,
    };
    const draw = () => renderer.render({ scene: mesh });
    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
      if (reduceMotion.matches) draw();
    };
    const observer = new ResizeObserver(resize); resize(); observer.observe(container);
    const move = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); const factor = renderer.dpr || 1; mouse.target = [(event.clientX - rect.left) * factor, (rect.height - event.clientY + rect.top) * factor]; };
    if (mouseInteraction) canvas.addEventListener("pointermove", move);
    let frame = 0;
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || paused) return;
      if (reduceMotion.matches) {
        draw();
        cancelAnimationFrame(frame);
        return;
      }
      uniforms.iTime.value = time * 0.001;
      if (mouseDampening > 0) {
        const dt = mouse.last ? (time - mouse.last) / 1000 : 0;
        mouse.last = time;
        const factor =
          1 - Math.exp(-dt / Math.max(mouseDampening, 0.0001));
        const current = uniforms.iMouse.value;
        current[0] += (mouse.target[0] - current[0]) * factor;
        current[1] += (mouse.target[1] - current[1]) * factor;
      } else {
        uniforms.iMouse.value = mouse.target;
      }
      draw();
    };
    frame = requestAnimationFrame(render);
    const visibility = () => {
      if (!document.hidden && reduceMotion.matches) draw();
    };
    const motionPreference = () => {
      if (reduceMotion.matches) draw();
      else frame = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", visibility);
    reduceMotion.addEventListener("change", motionPreference);
    return () => {
      cancelAnimationFrame(frame);
      reduceMotion.removeEventListener("change", motionPreference);
      document.removeEventListener("visibilitychange", visibility);
      if (mouseInteraction) canvas.removeEventListener("pointermove", move);
      observer.disconnect();
      if (canvas.parentElement === container) container.removeChild(canvas);
      program.remove();
      geometry.remove();
      renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [colorsKey, dpr, flowDirection, fluidity, glow, mouseDampening, mouseInteraction, mouseRadius, mouseStrength, opacity, paused, rimWidth, scale, sharpness, shimmer, speed, turbulence]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{ mixBlendMode }}
    />
  );
}
