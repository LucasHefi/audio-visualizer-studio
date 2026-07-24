/** GLSL ES 3.00 sources for the deterministic Cosmic Kaleidoscope scene. */
export const COSMIC_KALEIDOSCOPE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;
uniform float uBass;
uniform float uCoreScale;
uniform float uZoom;
uniform float uBassPulse;
uniform float uMid;
uniform float uStructuralDeformation;
uniform float uTreble;
uniform float uFineDetail;
uniform float uBeatPulse;
uniform float uMotion;
uniform float uStarTravel;
uniform float uRadialLight;
uniform float uDensity;
uniform float uGlow;
uniform float uBackground;
uniform float uRadialIterations;
uniform float uDetailIterations;
uniform float uReducedMotion;
uniform vec3 uBackgroundColor;
uniform vec3 uPrimaryColor;
uniform vec3 uSecondaryColor;
uniform vec3 uAccentColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const int MAX_RADIAL_ITERATIONS = 12;
const int MAX_DETAIL_ITERATIONS = 8;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += vec2(dot(point, point + vec2(45.32 + uSeed)));
  return fract(point.x * point.y);
}

vec2 rotate2d(vec2 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine) * point;
}

float softLine(float distanceToLine, float width) {
  return 1.0 - smoothstep(0.0, width, abs(distanceToLine));
}

void main() {
  vec2 centered = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float radius = length(centered);
  float angle = atan(centered.y, centered.x);
  float motionTime = uReducedMotion > 0.5 ? 0.0 : uTime * uMotion;

  float sectorCount = mix(8.0, 24.0, uDensity);
  float sectorAngle = TAU / sectorCount;
  float foldedAngle = abs(mod(angle + motionTime * 0.11 + sectorAngle * 0.5, sectorAngle) - sectorAngle * 0.5);
  vec2 polarPoint = vec2(cos(foldedAngle), sin(foldedAngle)) * radius;
  polarPoint = rotate2d(polarPoint, motionTime * 0.035);

  float bassRadius = uCoreScale + uBassPulse * 0.12;
  float structuralWave = sin(polarPoint.x * 9.0 + polarPoint.y * 5.0 + motionTime * 0.7);
  structuralWave *= uStructuralDeformation * (0.35 + uMid * 0.65);
  float zoomWave = sin(motionTime * 0.9 + uSeed * 0.01) * 0.045 * uMotion;
  float zoomScale = 1.0 + zoomWave + uZoom * 0.12;
  float warpedRadius = radius / max(0.7, zoomScale) + structuralWave * 0.11;
  float core = exp(-warpedRadius * (12.0 - bassRadius * 4.0));
  float ringTarget = 0.2 + bassRadius * 0.42;
  float ring = exp(-abs(warpedRadius - ringTarget) * (30.0 - uBass * 12.0));

  vec3 color = mix(uBackgroundColor * (0.25 + uBackground * 0.55), uSecondaryColor, core * 0.18);
  float filament = 0.0;
  float dust = 0.0;
  float starField = 0.0;
  float radialLights = 0.0;

  for (int layer = 0; layer < MAX_RADIAL_ITERATIONS; layer++) {
    if (float(layer) >= uRadialIterations) break;
    float layerIndex = float(layer) + 1.0;
    float layerRadius = 0.13 + layerIndex * (0.075 + uDensity * 0.025);
    float layerPhase = layerIndex * 1.71 + uSeed * 0.013 + motionTime * (0.08 + layerIndex * 0.006);
    float layerWave = sin(foldedAngle * sectorCount * (1.0 + layerIndex * 0.08) + layerPhase);
    float layerDistance = warpedRadius - layerRadius - layerWave * (0.008 + uMid * 0.018);
    float line = softLine(layerDistance, 0.009 + uFineDetail * 0.012);
    float shimmer = 0.58 + 0.42 * sin(layerPhase + foldedAngle * 17.0 + uTreble * 3.0);
    filament += line * shimmer / (1.0 + layerIndex * 0.34);

    vec2 starPoint = polarPoint * (layerIndex * 2.3 + 1.0);
    float star = hash21(floor(starPoint * (2.0 + uFineDetail * 5.0)) + vec2(layerIndex));
    dust += smoothstep(0.82 - uTreble * 0.18, 1.0, star) * (1.0 - radius * 0.32);

    // Depth-sorted points travel from the core to the edge. Their size and
    // brightness grow with depth, creating a bounded perspective star-flight.
    float starDepth = fract(hash21(vec2(layerIndex * 2.17, uSeed + 9.0)) + uStarTravel * (0.75 + layerIndex * 0.018));
    float starRadius = 0.025 + starDepth * (1.12 + uDensity * 0.55);
    float starAngle = layerIndex * 2.399 + uSeed * 0.017 + sin(layerIndex + uTime) * 0.08;
    vec2 starCenter = vec2(cos(starAngle), sin(starAngle)) * starRadius;
    float starSize = 0.003 + starDepth * (0.008 + uFineDetail * 0.012);
    float starPointGlow = exp(-distance(centered, starCenter) / max(0.001, starSize));
    starField += starPointGlow * (0.18 + starDepth * 0.82) * (0.45 + uTreble * 0.85);

    // Beat-driven radial emitters originate at the center and sweep toward
    // the edge; their angular falloff keeps the center-to-edge direction clear.
    float rayAngle = layerIndex * 2.617 + uSeed * 0.013;
    float rayDepth = fract(hash21(vec2(layerIndex * 3.41, uSeed + 31.0)) + uStarTravel * (0.9 + uBass * 0.4));
    float rayRadius = rayDepth * 1.55;
    float rayDistance = abs(radius - rayRadius);
    float rayAngularDistance = abs(sin(angle - rayAngle));
    radialLights += exp(-rayDistance * (18.0 - uBass * 6.0)) * exp(-rayAngularDistance * 42.0) * uRadialLight / (1.0 + layerIndex * 0.18);
  }

  for (int detail = 0; detail < MAX_DETAIL_ITERATIONS; detail++) {
    if (float(detail) >= uDetailIterations) break;
    float detailIndex = float(detail) + 1.0;
    float detailAngle = foldedAngle * (10.0 + detailIndex * 3.0) + motionTime * (0.13 + detailIndex * 0.01);
    float detailLine = 0.5 + 0.5 * sin(detailAngle + uSeed * detailIndex);
    filament += pow(max(detailLine, 0.0), 10.0) * uFineDetail * 0.035 / detailIndex;
  }

  float bloom = (ring * (0.48 + uBassPulse * 0.7) + core * 0.52 + filament * 0.42);
  bloom *= uGlow * (0.72 + uBeatPulse * 1.35);
  vec3 filamentColor = mix(uPrimaryColor, uAccentColor, 0.5 + 0.5 * sin(foldedAngle * 3.0 + uTreble * 4.0));
  color += filamentColor * filament * (0.35 + uGlow * 1.25);
  color += uPrimaryColor * ring * (0.3 + uBassPulse * 0.7) * uGlow;
  color += uAccentColor * dust * uFineDetail * 0.08;
  color += mix(uPrimaryColor, uAccentColor, 0.55) * starField * (0.35 + uGlow * 0.7);
  color += uAccentColor * radialLights * (0.32 + uGlow * 0.9);
  color += mix(uSecondaryColor, uAccentColor, 0.5) * bloom * 0.18;

  float vignette = 1.0 - smoothstep(0.72, 1.55, radius);
  color *= 0.58 + vignette * 0.56;
  color = max(color, vec3(0.0));
  outColor = vec4(color, 1.0);
}
`;
