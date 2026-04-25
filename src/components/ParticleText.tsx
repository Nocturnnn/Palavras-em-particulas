import { memo, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type ParticleTextProps = {
  text: string;
};

type Particle = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
};

type Size = {
  width: number;
  height: number;
};

type PointerState = {
  x: number;
  y: number;
  radius: number;
  active: boolean;
};

type ParticleLayout = Size & {
  text: string;
};

const DEFAULT_WORD = 'REACT';
const MAX_PIXEL_RATIO = 1.25;
const DESKTOP_PARTICLE_BUDGET = 1400;
const MOBILE_PARTICLE_BUDGET = 750;
const RETURN_STRENGTH = 0.055;
const FRICTION = 0.88;
const REPULSION_RADIUS = 118;
const REPULSION_FORCE = 2.6;
const POSITION_EPSILON = 0.45;
const VELOCITY_EPSILON = 0.04;
const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const ParticleText = memo(function ParticleText({ text }: ParticleTextProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const spriteRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastLayoutRef = useRef<ParticleLayout | null>(null);
  const pointerRef = useRef<PointerState>({
    x: -9999,
    y: -9999,
    radius: REPULSION_RADIUS,
    active: false,
  });
  const animationFrameRef = useRef(0);
  const stepRef = useRef<((time: number) => void) | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const startAnimation = () => {
    if (animationFrameRef.current !== 0 || !stepRef.current) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame((time) => {
      animationFrameRef.current = 0;
      stepRef.current?.(time);
    });
  };

  const stopAnimation = () => {
    if (animationFrameRef.current !== 0) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
  };

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);

      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return { width: nextWidth, height: nextHeight };
      });
    });

    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!spriteRef.current) {
      const sprite = document.createElement('canvas');
      sprite.width = 32;
      sprite.height = 32;

      const spriteContext = sprite.getContext('2d');

      if (spriteContext) {
        const gradient = spriteContext.createRadialGradient(16, 16, 2, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(221, 246, 255, 0.98)');
        gradient.addColorStop(0.42, 'rgba(106, 201, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(106, 201, 255, 0)');
        spriteContext.fillStyle = gradient;
        spriteContext.beginPath();
        spriteContext.arc(16, 16, 16, 0, TAU);
        spriteContext.fill();
      }

      spriteRef.current = sprite;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !size.width || !size.height) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    canvas.width = Math.floor(size.width * pixelRatio);
    canvas.height = Math.floor(size.height * pixelRatio);

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = true;
  }, [size]);

  useEffect(() => {
    if (!size.width || !size.height) {
      return;
    }

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }

    const offscreenCanvas = offscreenRef.current;
    offscreenCanvas.width = size.width;
    offscreenCanvas.height = size.height;

    const context = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      return;
    }

    const compactMode = size.width < 900 || size.height < 560;
    const safeText = text.slice(0, 16).trim() || DEFAULT_WORD;
    const minFontSize = compactMode ? 22 : 92;
    const maxFontSize = compactMode ? 138 : 300;
    const horizontalPadding = compactMode ? size.width * 0.2 : size.width * 0.08;
    const verticalPadding = compactMode ? size.height * 0.28 : size.height * 0.18;
    const availableTextWidth = Math.max(size.width - horizontalPadding * 2, 1);
    const availableTextHeight = Math.max(size.height - verticalPadding * 2, 1);
    let fontSize = clamp(
      Math.min(
        ((compactMode ? size.width * 1.08 : size.width * 1.52) / Math.max(safeText.length, 1)),
        size.height * (compactMode ? 0.3 : 0.42),
      ),
      minFontSize,
      maxFontSize,
    );

    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 ${fontSize}px "Segoe UI", Helvetica, Arial, sans-serif`;

    const measuredText = context.measureText(safeText);
    const measuredHeight =
      measuredText.actualBoundingBoxAscent + measuredText.actualBoundingBoxDescent || fontSize;
    const fitScale = Math.min(
      availableTextWidth / Math.max(measuredText.width, 1),
      availableTextHeight / Math.max(measuredHeight, 1),
      1,
    );

    if (fitScale < 1) {
      fontSize = Math.max(minFontSize, Math.floor(fontSize * fitScale));
      context.font = `800 ${fontSize}px "Segoe UI", Helvetica, Arial, sans-serif`;
    }

    context.fillText(safeText, size.width / 2, size.height / 2);

    // Leitura dos pixels do texto para descobrir onde as particulas devem existir.
    const pixelData = context.getImageData(0, 0, size.width, size.height).data;
    const sampleGap = compactMode
      ? clamp(Math.round(fontSize / 18), 7, 12)
      : clamp(Math.round(fontSize / 20), 6, 10);
    const sampledPoints: Array<{ x: number; y: number }> = [];

    for (let y = 0; y < size.height; y += sampleGap) {
      for (let x = 0; x < size.width; x += sampleGap) {
        const alpha = pixelData[(y * size.width + x) * 4 + 3];

        if (alpha > 140) {
          sampledPoints.push({ x, y });
        }
      }
    }

    const particleBudget = compactMode ? MOBILE_PARTICLE_BUDGET : DESKTOP_PARTICLE_BUDGET;
    const stride = Math.max(1, Math.ceil(sampledPoints.length / particleBudget));
    const previousLayout = lastLayoutRef.current;
    const canReuseParticles =
      previousLayout?.text !== safeText &&
      previousLayout?.width === size.width &&
      previousLayout?.height === size.height;
    const previousParticles = canReuseParticles ? particlesRef.current : [];
    const nextParticles: Particle[] = [];

    // Na troca de palavra, reaproveitamos as posicoes antigas para suavizar a reorganizacao.
    for (let index = 0; index < sampledPoints.length; index += stride) {
      const point = sampledPoints[index];
      const previous = previousParticles.length
        ? previousParticles[index % previousParticles.length]
        : undefined;
      const sizeValue = compactMode ? 1.55 + Math.random() * 0.45 : 1.8 + Math.random() * 0.65;

      nextParticles.push({
        x: previous?.x ?? point.x,
        y: previous?.y ?? point.y,
        baseX: point.x,
        baseY: point.y,
        vx: previous?.vx ?? 0,
        vy: previous?.vy ?? 0,
        size: sizeValue,
      });
    }

    particlesRef.current = nextParticles;
    lastLayoutRef.current = {
      width: size.width,
      height: size.height,
      text: safeText,
    };
    startAnimation();
  }, [size, text]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sprite = spriteRef.current;

    if (!canvas || !sprite || !size.width || !size.height) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    stepRef.current = () => {
      const particles = particlesRef.current;
      const pointer = pointerRef.current;
      let shouldContinue = false;

      context.clearRect(0, 0, size.width, size.height);

      // Fisica: repulsao perto do ponteiro e retorno gradual para a posicao base.
      for (const particle of particles) {
        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          const radiusSquared = pointer.radius * pointer.radius;

          if (distanceSquared < radiusSquared) {
            const distance = Math.sqrt(distanceSquared) || 1;
            const falloff = (pointer.radius - distance) / pointer.radius;
            const repulsion = falloff * falloff * REPULSION_FORCE;

            particle.vx += (dx / distance) * repulsion;
            particle.vy += (dy / distance) * repulsion;
          }
        }

        // Retorno com easing continuo para reconstruir as letras sem teleporte.
        particle.vx += (particle.baseX - particle.x) * RETURN_STRENGTH;
        particle.vy += (particle.baseY - particle.y) * RETURN_STRENGTH;
        particle.vx *= FRICTION;
        particle.vy *= FRICTION;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const deltaX = particle.baseX - particle.x;
        const deltaY = particle.baseY - particle.y;

        if (
          Math.abs(deltaX) > POSITION_EPSILON ||
          Math.abs(deltaY) > POSITION_EPSILON ||
          Math.abs(particle.vx) > VELOCITY_EPSILON ||
          Math.abs(particle.vy) > VELOCITY_EPSILON
        ) {
          shouldContinue = true;
        }

        // Render leve: usamos um sprite pequeno prerenderizado para evitar shadowBlur por particula.
        const diameter = particle.size * 2;
        context.drawImage(sprite, particle.x - particle.size, particle.y - particle.size, diameter, diameter);
      }

      if (shouldContinue) {
        startAnimation();
      }
    };

    startAnimation();

    return () => {
      stopAnimation();
      stepRef.current = null;
    };
  }, [size]);

  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, []);

  const updatePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerRef.current.x = event.nativeEvent.offsetX;
    pointerRef.current.y = event.nativeEvent.offsetY;
    pointerRef.current.active = true;
    startAnimation();
  };

  const deactivatePointer = () => {
    pointerRef.current.active = false;
    activePointerIdRef.current = null;
    startAnimation();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointer(event);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== 'mouse' && activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updatePointer(event);
  };

  const handlePointerUpOrCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    deactivatePointer();
  };

  return (
    <div className="particle-stage" ref={frameRef}>
      <canvas
        ref={canvasRef}
        className="particle-canvas"
        aria-label={`Texto ${text} desenhado com particulas interativas`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={deactivatePointer}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
      />
    </div>
  );
});
