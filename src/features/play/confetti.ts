interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  square: boolean;
}

/** A lightweight 2D-canvas confetti burst; resolves when the last particle is gone. */
export function confetti(
  canvas: HTMLCanvasElement,
  colors: readonly string[],
  duration = 2600,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);

  const palette =
    colors.length > 0 ? colors : ["#e8435a", "#f6a35c", "#ffd57e", "#4caf50", "#1e88e5"];
  const count = Math.round(Math.min(220, (width * height) / 5000));
  const particles: Particle[] = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3) + (Math.random() - 0.5) * 0.7;
    const speed = (0.75 + Math.random() * 0.55) * Math.sqrt(Math.max(width, height)) * 0.62;
    return {
      x: fromLeft ? -10 : width + 10,
      y: height * (0.55 + Math.random() * 0.3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 7,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: palette[i % palette.length]!,
      square: Math.random() > 0.4,
    };
  });

  return new Promise((resolve) => {
    const startTime = performance.now();
    let previous = startTime;
    const frame = (now: number) => {
      const dt = Math.min(2.5, (now - previous) / 16.67);
      previous = now;
      const t = (now - startTime) / duration;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
      for (const p of particles) {
        p.vy += 0.32 * dt;
        p.vx *= 0.992 ** dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.square) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        else ctx.fillRect(-p.size / 2, -p.size / 5, p.size, p.size / 2.5);
        ctx.restore();
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, width, height);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
