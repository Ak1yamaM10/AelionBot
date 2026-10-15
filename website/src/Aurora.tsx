import { useEffect, useRef } from 'react';

/**
 * Moving backgrounds drawn by a fragment shader instead of a video: a few KB, sharp at any size,
 * paused off screen and frozen to one frame when the system asks for reduced motion.
 * Without WebGL the CSS gradient on the wrapper stays visible.
 */
export type AuroraScene = 'veils' | 'clouds';

const NOISE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}
`;

// Three curtains of aurora hanging over a warm horizon, each made of fine vertical rays.
const VEILS = `${NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.045;
  vec3 col = vec3(0.010, 0.011, 0.022) + vec3(0.16, 0.07, 0.035) * exp(-uv.y * 6.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 tint = i == 0 ? vec3(0.50, 0.40, 1.00) : (i == 1 ? vec3(0.32, 0.52, 1.00) : vec3(1.00, 0.52, 0.30));
    float x = p.x + u_pointer.x * 0.035 * (fi + 1.0);
    // Where the curtain's lower edge hangs: a slow wave plus a wandering fold.
    float curve = 0.12 - fi * 0.14 + 0.10 * sin(x * 1.5 + t * 3.0 + fi * 2.1)
      + 0.22 * (fbm(vec2(x * 0.8 + t * (1.0 + fi * 0.5), fi * 7.3)) - 0.5);
    float d = p.y - curve;
    // A sharp lower edge that fades out upward, like real aurora.
    float body = d > 0.0 ? exp(-d * (5.0 + fi * 1.5)) : exp(-d * d * 900.0);
    float sx = x + 0.02 * sin(p.y * 6.0 + t * 4.0 + fi);
    float rays = 0.55 * noise(vec2(sx * 34.0 + t * 2.0 + fi * 11.0, t * 0.5))
      + 0.45 * noise(vec2(sx * 90.0 - t * 3.0 + fi * 5.0, fi));
    rays = pow(rays, 2.2) * 2.6 + 0.12;
    float fold = 0.55 + 0.45 * fbm(vec2(x * 2.2 - t * 1.2, fi * 4.0 + t * 0.3));
    col += tint * body * rays * fold * (0.55 - fi * 0.1);
  }
  col = 1.0 - exp(-col * 1.15);
  col *= 1.0 - 0.4 * smoothstep(0.45, 1.25, length(p * vec2(0.68, 1.0)));
  col += (hash(gl_FragCoord.xy + fract(u_time * 7.0)) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

// Night clouds lit from below by a warm glow, drifting sideways.
const CLOUDS = `${NOISE}
// Two more octaves than fbm, so cloud edges keep detail at full resolution.
float fbmFine(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 7; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.025;
  vec2 q = p * vec2(1.4, 2.2) + vec2(t, 0.0);
  float d = fbmFine(q + fbm(q * 1.3 + vec2(-t * 1.6, t)) * 1.4);
  d = smoothstep(0.42, 0.8, d) * smoothstep(1.0, -0.15, uv.y);
  vec2 light = vec2(0.12 + u_pointer.x * 0.02, -0.22);
  float glow = exp(-2.2 * length((p - light) * vec2(0.85, 1.35)));
  vec3 sky = mix(vec3(0.014, 0.016, 0.03), vec3(0.06, 0.04, 0.035), smoothstep(0.9, 0.0, uv.y));
  vec3 lit = mix(vec3(0.16, 0.09, 0.05), vec3(1.0, 0.56, 0.2), glow);
  vec3 col = sky + d * lit * (0.25 + 1.1 * glow);
  col += vec3(1.0, 0.6, 0.25) * glow * glow * 0.12;
  col *= smoothstep(1.0, 0.62, uv.y);
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.014;
  gl_FragColor = vec4(col, 1.0);
}`;

// Canvas pixels per CSS pixel (before device pixel ratio). The veils are soft enough to draw at
// reduced size; the clouds' edges blur visibly when upscaled, so they draw at least at CSS size.
const RESOLUTION: Record<AuroraScene, (ratio: number) => number> = {
  veils: (ratio) => ratio * 0.6,
  clouds: (ratio) => Math.max(1, ratio * 0.75),
};

const VERTEX = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';

export function Aurora({ scene, className = '' }: { scene: AuroraScene; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const wrapper = element?.parentElement;
    const gl = element?.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!element || !wrapper || !gl) {
      wrapper?.setAttribute('data-aurora', 'unavailable');
      return;
    }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, scene === 'veils' ? VEILS : CLOUDS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      wrapper.setAttribute('data-aurora', 'unavailable');
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = {
      res: gl.getUniformLocation(program, 'u_res'),
      time: gl.getUniformLocation(program, 'u_time'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scale = RESOLUTION[scene](Math.min(window.devicePixelRatio || 1, 2));
    let frame = 0,
      visible = true,
      pointerX = 0,
      pointerY = 0,
      easedX = 0,
      easedY = 0;
    const start = performance.now() - 40_000;
    const draw = (now: number) => {
      easedX += (pointerX - easedX) * 0.04;
      easedY += (pointerY - easedY) * 0.04;
      gl.uniform2f(uniform.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniform.time, (now - start) / 1000);
      gl.uniform2f(uniform.pointer, easedX, easedY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(loop);
    };
    const play = () => {
      cancelAnimationFrame(frame);
      if (reduced.matches) {
        draw(start + 40_000);
        frame = 0;
      } else if (visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const resize = () => {
      const box = element.getBoundingClientRect();
      element.width = Math.max(1, Math.round(box.width * scale));
      element.height = Math.max(1, Math.round(box.height * scale));
      gl.viewport(0, 0, element.width, element.height);
      if (reduced.matches || !frame) draw(start + 40_000);
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(element);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      play();
    });
    seen.observe(element);
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = 0.5 - event.clientY / window.innerHeight;
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      wrapper.setAttribute('data-aurora', 'unavailable');
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', play);
    reduced.addEventListener('change', play);
    element.addEventListener('webglcontextlost', onLost);
    resize();
    play();
    wrapper.setAttribute('data-aurora', 'ready');
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      seen.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', play);
      reduced.removeEventListener('change', play);
      element.removeEventListener('webglcontextlost', onLost);
      // No loseContext() here: a canvas has one context for life, so losing it would leave a remount
      // (React StrictMode runs every effect twice) with a dead context. The browser frees it with the canvas.
      gl.deleteProgram(program);
    };
  }, [scene]);
  return (
    <div className={`aurora aurora-${scene} ${className}`} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
