(function () {
  var LETTER_FONT = '600 460px "Tektur"';

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  var VERTEX_SRC = [
    "attribute vec2 aPos;",
    "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
  ].join("\n");

  var FRAGMENT_SRC = [
    "precision highp float;",
    "uniform vec2 uResolution;",
    "uniform float uTime;",
    "uniform vec2 uMouse;",
    "uniform vec2 uMouseRaw;",
    "uniform sampler2D uLetterTex;",
    "",
    "float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {",
    "  vec3 pa = p - a, ba = b - a;",
    "  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);",
    "  return length(pa - ba * h) - r;",
    "}",
    "",
    "float smin(float a, float b, float k) {",
    "  float res = exp2(-a / k) + exp2(-b / k);",
    "  return -k * log2(max(res, 1e-6));",
    "}",
    "",
    "mat2 rot(float a) {",
    "  float s = sin(a), c = cos(a);",
    "  return mat2(c, -s, s, c);",
    "}",
    "",
    "float map(vec3 p) {",
    "  p.x += sin(uTime * 0.4) * 0.02;",
    "  p.xz *= rot(uMouse.x * 0.5);",
    "  p.yz *= rot(-uMouse.y * 0.28 + 0.04);",
    "  float top    = sdCapsule(p, vec3(0.0,  0.44, 0.0), vec3(0.0,  0.12, 0.0), 0.40);",
    "  float bottom = sdCapsule(p, vec3(0.0, -0.10, 0.0), vec3(0.0, -0.44, 0.0), 0.46);",
    "  return smin(top, bottom, 0.15);",
    "}",
    "",
    "vec3 calcNormal(vec3 p) {",
    "  vec2 e = vec2(0.0015, 0.0);",
    "  return normalize(vec3(",
    "    map(p + e.xyy) - map(p - e.xyy),",
    "    map(p + e.yxy) - map(p - e.yxy),",
    "    map(p + e.yyx) - map(p - e.yyx)",
    "  ));",
    "}",
    "",
    "float hash(vec2 p) {",
    "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);",
    "}",
    "float vnoise(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0));",
    "  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;",
    "}",
    "float fbm(vec2 p) {",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 4; i++) {",
    "    v += a * vnoise(p);",
    "    p *= 2.03;",
    "    a *= 0.52;",
    "  }",
    "  return v;",
    "}",
    "",
    "float letterMaskAt(vec2 uv) {",
    "  vec2 tuv = vec2(uv.x / 1.05 + 0.5, 1.0 - (uv.y / 1.9 + 0.5));",
    "  if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) return 0.0;",
    "  return texture2D(uLetterTex, tuv).r;",
    "}",
    "",
    "float gridGroove(vec2 uv) {",
    "  vec2 cell = fract(uv * 2.0) - 0.5;",
    "  float dline = min(abs(cell.x), abs(cell.y));",
    "  return exp(-pow(dline / 0.028, 2.0));",
    "}",
    "",
    "float wallHeight(vec2 uv) {",
    "  float grain = fbm(uv * 3.1) * 0.5 + fbm(uv * 11.0) * 0.16;",
    "  float groove = gridGroove(uv) * 0.05;",
    "  float letters = letterMaskAt(uv) * 0.11;",
    "  return grain * 0.022 - groove - letters;",
    "}",
    "",
    "vec3 wallSurface(vec3 rd, vec3 lightDir) {",
    "  float t = -1.9 / rd.z;",
    "  vec2 uv = rd.xy * t * 0.95;",
    "",
    "  float h  = wallHeight(uv);",
    "  vec2 eps = vec2(0.0025, 0.0);",
    "  float hx = wallHeight(uv + eps.xy) - wallHeight(uv - eps.xy);",
    "  float hy = wallHeight(uv + eps.yx) - wallHeight(uv - eps.yx);",
    "  vec3 n = normalize(vec3(-hx * 22.0, -hy * 22.0, 1.0));",
    "",
    "  float fine = fbm(uv * 9.0 + 4.2);",
    "  vec3 albedo = mix(vec3(0.028, 0.027, 0.026), vec3(0.06, 0.058, 0.056), fine);",
    "  albedo = mix(albedo, albedo * 1.35, fbm(uv * 1.6));",
    "",
    "  float lambert = max(dot(n, lightDir), 0.0);",
    "  float ambient = 0.10;",
    "  vec3 col = albedo * (ambient + lambert * 0.9);",
    "",
    "  vec3 refl = reflect(-lightDir, n);",
    "  float sheen = pow(max(dot(refl, vec3(0.0, 0.0, 1.0)), 0.0), 6.0);",
    "  col += vec3(0.05, 0.05, 0.055) * sheen;",
    "",
    "  float dist = length(uv);",
    "  float glow = exp(-dist * 2.1) * (0.16 + 0.03 * sin(uTime * 0.35));",
    "  col += vec3(1.0, 0.97, 0.9) * glow;",
    "",
    "  float vignette = 1.0 - smoothstep(0.6, 1.75, dist);",
    "  col *= mix(0.62, 1.0, vignette);",
    "",
    "  return col;",
    "}",
    "",
    "vec4 renderRay(vec3 ro, vec3 rd, vec3 lightDir) {",
    "  float t = 0.0, d;",
    "  bool hit = false;",
    "  vec3 p = ro;",
    "  for (int i = 0; i < 100; i++) {",
    "    p = ro + rd * t;",
    "    d = map(p);",
    "    if (d < t * 0.0006 + 0.0006) { hit = true; break; }",
    "    t += d * 0.85;",
    "    if (t > 8.0) break;",
    "  }",
    "",
    "  vec3 col = wallSurface(rd, lightDir);",
    "  if (!hit) return vec4(col, 1.0);",
    "",
    "  vec3 n = calcNormal(p);",
    "  vec3 viewDir = -rd;",
    "  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);",
    "",
    "  vec3 refR = refract(rd, n, 1.0 / 1.46);",
    "  vec3 refG = refract(rd, n, 1.0 / 1.49);",
    "  vec3 refB = refract(rd, n, 1.0 / 1.52);",
    "  vec3 refracted = vec3(",
    "    wallSurface(refR, lightDir).r,",
    "    wallSurface(refG, lightDir).g,",
    "    wallSurface(refB, lightDir).b",
    "  );",
    "",
    "  vec3 fillDir = normalize(vec3(-0.4, -0.5, 0.6));",
    "  vec3 refl = reflect(rd, n);",
    "  vec3 sky = mix(vec3(0.05, 0.055, 0.065), vec3(1.0, 1.0, 1.0), smoothstep(-0.4, 0.98, refl.y));",
    "  float spec = pow(max(dot(refl, lightDir), 0.0), 30.0);",
    "  float spec2 = pow(max(dot(refl, lightDir), 0.0), 220.0);",
    "  vec3 reflection = sky + vec3(1.0) * spec * 1.9 + vec3(1.0) * spec2 * 2.2;",
    "",
    "  float fres2 = pow(1.0 - max(dot(n, viewDir), 0.0), 2.3);",
    "  vec3 glass = mix(refracted, reflection, clamp(fres2 * 1.2 + fresnel * 0.32, 0.06, 0.94));",
    "",
    "  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);",
    "  glass += vec3(1.0, 0.99, 0.985) * rim * 1.05;",
    "",
    "  float topLight = smoothstep(-0.4, 0.9, n.y);",
    "  glass += vec3(0.14, 0.145, 0.16) * topLight;",
    "",
    "  float lambert = max(dot(n, lightDir), 0.0);",
    "  float fill = max(dot(n, fillDir), 0.0);",
    "  glass += vec3(0.1, 0.105, 0.12) * lambert;",
    "  glass += vec3(0.05, 0.052, 0.06) * fill;",
    "",
    "  float sweep = sin((n.y * 1.5 + n.x * 0.5) * 2.6 - uTime * 0.5);",
    "  float band = smoothstep(0.82, 1.0, sweep) * smoothstep(1.0, 0.82, sweep - 0.001);",
    "  glass += vec3(1.0) * band * 0.4;",
    "",
    "  glass.r += rim * 0.06 * (0.5 + 0.5 * sin(uTime * 0.3));",
    "  glass.b += rim * 0.08 * (0.5 - 0.5 * sin(uTime * 0.3));",
    "",
    "  glass = max(glass, vec3(0.012, 0.013, 0.017));",
    "  return vec4(glass, 1.0);",
    "}",
    "",
    "void main() {",
    "  vec3 ro = vec3(0.0, 0.0, 3.0);",
    "  vec3 lightDir = normalize(vec3(0.45 + uMouseRaw.x * 0.35, 0.85, 0.55));",
    "  vec3 col = vec3(0.0);",
    "  const float aa = 2.0;",
    "  for (float ax = 0.0; ax < aa; ax++) {",
    "    for (float ay = 0.0; ay < aa; ay++) {",
    "      vec2 offset = (vec2(ax, ay) / aa - 0.5) / uResolution.y;",
    "      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y + offset;",
    "      vec3 rd = normalize(vec3(uv, -2.05));",
    "      vec3 roi = ro;",
    "      roi.x += uMouseRaw.x * 0.035;",
    "      roi.y += uMouseRaw.y * 0.025;",
    "      col += renderRay(roi, rd, lightDir).rgb;",
    "    }",
    "  }",
    "  col /= (aa * aa);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function buildLetterTexture(gl) {
    var letterCanvas = document.createElement("canvas");
    letterCanvas.width = 512;
    letterCanvas.height = 1024;
    var lctx = letterCanvas.getContext("2d");

    function draw() {
      lctx.fillStyle = "#000";
      lctx.fillRect(0, 0, 512, 1024);
      lctx.fillStyle = "#fff";
      lctx.textAlign = "center";
      lctx.textBaseline = "middle";
      lctx.font = LETTER_FONT;
      lctx.fillText("K", 256, 270);
      lctx.fillText("S", 256, 754);
    }
    draw();

    var tex = gl.createTexture();
    function upload() {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, letterCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    upload();

    if (document.fonts && document.fonts.load) {
      document.fonts
        .load(LETTER_FONT)
        .then(function () {
          draw();
          upload();
        })
        .catch(function () {});
    }

    return tex;
  }

  function init() {
    var canvas = document.getElementById("hero-glass-canvas");
    if (!canvas) return;
    var hub = canvas.parentElement;
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!hub || !heroLogo) return;

    var gl;
    try {
      gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    } catch (e) {
      gl = null;
    }
    if (!gl) return;

    var vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      return;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uResolution = gl.getUniformLocation(prog, "uResolution");
    var uTime = gl.getUniformLocation(prog, "uTime");
    var uMouse = gl.getUniformLocation(prog, "uMouse");
    var uMouseRaw = gl.getUniformLocation(prog, "uMouseRaw");
    var uLetterTex = gl.getUniformLocation(prog, "uLetterTex");

    var letterTex = buildLetterTexture(gl);
    gl.uniform1i(uLetterTex, 0);

    var reduced = prefersReducedMotion();
    var mouseTarget = [0, 0];
    var mouseSmooth = [0, 0];

    function onMouseMove(e) {
      var r = hub.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      mouseTarget[0] = Math.max(-1.4, Math.min(1.4, (e.clientX - cx) / (r.width / 2)));
      mouseTarget[1] = Math.max(-1.4, Math.min(1.4, (e.clientY - cy) / (r.height / 2)));
    }
    if (!reduced) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
    }

    var start = null;
    var lastW = 0;
    var lastH = 0;
    var rafId = null;
    var running = true;

    function resizeIfNeeded() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = hub.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width * dpr));
      var h = Math.max(1, Math.round(rect.height * dpr));
      if (w !== lastW || h !== lastH) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        lastW = w;
        lastH = h;
      }
    }

    function draw(now) {
      resizeIfNeeded();
      mouseSmooth[0] += (mouseTarget[0] - mouseSmooth[0]) * 0.07;
      mouseSmooth[1] += (mouseTarget[1] - mouseSmooth[1]) * 0.07;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, letterTex);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, now);
      gl.uniform2f(uMouse, mouseSmooth[0], mouseSmooth[1]);
      gl.uniform2f(uMouseRaw, mouseTarget[0], mouseTarget[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function frame(t) {
      if (!running) return;
      if (start === null) start = t;
      draw((t - start) / 1000);
      rafId = window.requestAnimationFrame(frame);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
      } else if (!reduced) {
        running = true;
        start = null;
        rafId = window.requestAnimationFrame(frame);
      }
    });

    hub.classList.add("is-ready");
    heroLogo.classList.add("has-glass-hub");

    if (reduced) {
      resizeIfNeeded();
      draw(0);
    } else {
      rafId = window.requestAnimationFrame(frame);
    }
  }

  window.KanasakaHeroGlass = {
    init: init,
  };
})();
