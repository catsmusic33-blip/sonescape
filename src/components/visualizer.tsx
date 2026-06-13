import { useEffect, useRef, useState, useCallback } from "react";

type Style = "neon-bars" | "retro-wave" | "liquid-orbs" | "neon-particle-storm";

interface Props {
  style: Style;
  sensitivity: number;
  smoothing: number;
  active: boolean;
  onCaptureChange?: (capturing: boolean) => void;
}

const PARTICLE_COUNT = 120;
const BEAT_THRESHOLD = 0.12;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseSpeed: number;
  hue: number;
  band: number; // index into the frequency buffer
}

/**
 * Captures desktop/loopback audio in Electron via getDisplayMedia. The main
 * process intercepts the request with setDisplayMediaRequestHandler and
 * supplies the source + audio:"loopback", so the renderer just calls
 * getDisplayMedia (NOT getUserMedia, which would request the webcam/mic).
 * The video track is dropped immediately; we only read audio.
 *
 * getDisplayMedia must run from a user gesture, so this is exposed as start().
 */
function useAudioCapture(fftSize: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    dataRef.current = null;
    setCapturing(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });

      // Drop the video track — only audio is needed, and an open video
      // track holds a capture indicator on.
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setError(
          "Captured the screen but no audio track came through. Make sure something is playing, then try again.",
        );
        return;
      }

      const track = audioTracks[0];
      const settings = track.getSettings();
      console.info("[visualizer] audio capture started", {
        label: track.label,
        muted: track.muted,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      ctxRef.current = audioCtx;
      analyserRef.current = analyser;
      streamRef.current = stream;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);

      track.addEventListener("ended", () => {
        console.info("[visualizer] audio track ended — stopping capture");
        stop();
      });

      setCapturing(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[visualizer] audio initialization failure:", e);
      setError(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fftSize, stop]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, capturing, error, analyserRef, dataRef };
}

export function Visualizer({
  style,
  sensitivity,
  smoothing,
  active,
  onCaptureChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);
  const barsRef = useRef<number[]>(Array.from({ length: 64 }, () => 0));

  // Particle-storm state (persists across frames).
  const particlesRef = useRef<Particle[]>([]);
  const lastEnergyRef = useRef(0);
  const burstRef = useRef(0);

  // Debug level meter.
  const levelRef = useRef(0);
  const [meterLevel, setMeterLevel] = useState(0);

  const FFT_SIZE = 512;
  const { start, stop, capturing, error, analyserRef, dataRef } =
    useAudioCapture(FFT_SIZE);

  // Report capture state up to the dashboard.
  useEffect(() => {
    onCaptureChange?.(capturing);
  }, [capturing, onCaptureChange]);

  // Mirror peak level into state ~10x/sec for the meter.
  useEffect(() => {
    if (!capturing) {
      setMeterLevel(0);
      return;
    }
    const id = window.setInterval(() => setMeterLevel(levelRef.current), 100);
    return () => window.clearInterval(id);
  }, [capturing]);

  const seedParticles = (W: number, H: number) => {
    const temp: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 50;
      temp.push({
        x: W / 2 + Math.cos(angle) * distance,
        y: H / 2 + Math.sin(angle) * distance,
        vx: Math.cos(angle) * (Math.random() * 0.8 + 0.2),
        vy: Math.sin(angle) * (Math.random() * 0.8 + 0.2),
        radius: Math.random() * 2 + 1,
        baseSpeed: Math.random() * 0.5 + 0.2,
        hue: 180 + (i / PARTICLE_COUNT) * 120,
        band: Math.floor((i / PARTICLE_COUNT) * 60),
      });
    }
    particlesRef.current = temp;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      tRef.current += 0.016;
      const t = tRef.current;

      const sens = sensitivity / 50;
      const sm = Math.max(0.05, Math.min(0.95, smoothing / 100));

      const analyser = analyserRef.current;
      const data = dataRef.current;
      const n = barsRef.current.length;

      let targetBars: number[];

      if (capturing && analyser && data) {
        analyser.getByteFrequencyData(data);
        const bins = data.length;

        let peak = 0;
        for (let b = 0; b < bins; b++) if (data[b] > peak) peak = data[b];
        levelRef.current = peak / 255;

        targetBars = barsRef.current.map((_, i) => {
          const frac = i / (n - 1);
          const lo = Math.floor(Math.pow(frac, 1.7) * (bins - 1));
          const hi = Math.min(
            bins - 1,
            Math.floor(Math.pow((i + 1) / (n - 1), 1.7) * (bins - 1)),
          );
          let sum = 0;
          let count = 0;
          for (let b = lo; b <= Math.max(lo, hi); b++) {
            sum += data[b];
            count++;
          }
          const avg = count > 0 ? sum / count / 255 : 0;
          return Math.max(0, Math.min(1, avg * sens * (active ? 1 : 0.25)));
        });
      } else {
        targetBars = barsRef.current.map((_, i) => {
          const base =
            Math.sin(t * 2 + i * 0.25) * 0.4 +
            Math.sin(t * 5 + i * 0.6) * 0.3 +
            Math.sin(t * 0.7 + i * 0.1) * 0.3;
          const v = (base + 1) / 2;
          return Math.max(0, Math.min(1, v * sens * (active ? 1 : 0.25)));
        });
      }

      barsRef.current = barsRef.current.map(
        (v, i) => v * sm + targetBars[i] * (1 - sm),
      );

      // Overall energy from the smoothed bars (works for real + synthetic).
      const energy =
        barsRef.current.reduce((a, b) => a + b, 0) / barsRef.current.length;

      if (style === "neon-particle-storm") {
        if (particlesRef.current.length !== PARTICLE_COUNT) seedParticles(W, H);

        // Beat detection.
        const delta = energy - lastEnergyRef.current;
        if (delta > BEAT_THRESHOLD) burstRef.current = 1.0;
        else burstRef.current *= 0.92;
        lastEnergyRef.current = energy;

        ctx.fillStyle = "rgba(10, 10, 12, 0.25)";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "lighter";

        const cx = W / 2;
        const cy = H / 2;
        const burst = burstRef.current;

        for (const p of particlesRef.current) {
          const bandVal = barsRef.current[p.band % n] || 0;
          const speed = p.baseSpeed + energy * 2 + bandVal * 3;
          p.x += p.vx * speed;
          p.y += p.vy * speed;

          if (burst > 0.05) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            p.x += (dx / dist) * burst * 12;
            p.y += (dy / dist) * burst * 12;
          }

          if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
            const a = Math.random() * Math.PI * 2;
            p.x = cx + Math.cos(a) * 20;
            p.y = cy + Math.sin(a) * 20;
          }

          const renderRadius = p.radius + bandVal * 4 + burst * 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, renderRadius, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${0.4 + bandVal * 0.6})`;
          ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, W, H);

      if (style === "neon-bars") {
        const gap = 4;
        const bw = (W - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          const v = barsRef.current[i];
          const h = v * H * 0.85;
          const x = i * (bw + gap);
          const y = (H - h) / 2;
          const grad = ctx.createLinearGradient(0, y, 0, y + h);
          grad.addColorStop(0, "oklch(0.82 0.2 195)");
          grad.addColorStop(1, "oklch(0.72 0.24 330)");
          ctx.fillStyle = grad;
          ctx.shadowColor = "oklch(0.78 0.2 195 / 0.8)";
          ctx.shadowBlur = 18;
          ctx.fillRect(x, y, bw, h);
        }
        ctx.shadowBlur = 0;
      } else if (style === "retro-wave") {
        const horizon = H * 0.55;
        ctx.strokeStyle = "oklch(0.72 0.24 330 / 0.6)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 18; i++) {
          const p = i / 17;
          const y = horizon + Math.pow(p, 1.6) * (H - horizon);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        for (let i = -10; i <= 10; i++) {
          ctx.beginPath();
          ctx.moveTo(W / 2 + i * 30, horizon);
          ctx.lineTo(W / 2 + i * (W / 4), H);
          ctx.stroke();
        }
        const sunR = Math.min(W, H) * 0.18;
        const sunY = horizon - sunR * 0.4;
        const sunG = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
        sunG.addColorStop(0, "oklch(0.85 0.2 60)");
        sunG.addColorStop(1, "oklch(0.6 0.24 0)");
        ctx.fillStyle = sunG;
        ctx.beginPath();
        ctx.arc(W / 2, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "oklch(0.85 0.2 195)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "oklch(0.85 0.2 195 / 0.9)";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        barsRef.current.forEach((v, i) => {
          const x = (i / (barsRef.current.length - 1)) * W;
          const y = horizon - 20 - v * 80;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // liquid orbs
        const orbs = 6;
        for (let i = 0; i < orbs; i++) {
          const v = barsRef.current[i * 8] || 0;
          const angle = (i / orbs) * Math.PI * 2 + t * 0.4;
          const r = Math.min(W, H) * (0.18 + v * 0.18);
          const ox = W / 2 + Math.cos(angle) * (Math.min(W, H) * 0.22);
          const oy = H / 2 + Math.sin(angle) * (Math.min(W, H) * 0.22);
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
          const hue = i % 2 === 0 ? "195" : "330";
          g.addColorStop(0, `oklch(0.85 0.22 ${hue} / 0.9)`);
          g.addColorStop(1, `oklch(0.4 0.2 ${hue} / 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [style, sensitivity, smoothing, active, capturing, analyserRef, dataRef]);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full rounded-2xl"
        aria-label="Audio visualizer canvas"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
        {capturing && (
          <div className="pointer-events-none flex w-56 items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-white backdrop-blur">
            <span className="text-xs tabular-nums opacity-70">lvl</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{
                  width: `${Math.round(meterLevel * 100)}%`,
                  background:
                    meterLevel > 0.01
                      ? "oklch(0.82 0.2 195)"
                      : "oklch(0.6 0.24 25)",
                }}
              />
            </div>
            <span className="w-8 text-right text-xs tabular-nums opacity-70">
              {Math.round(meterLevel * 100)}
            </span>
          </div>
        )}
        {error && (
          <div className="pointer-events-auto rounded-lg bg-black/70 px-3 py-2 text-sm text-red-300 backdrop-blur">
            {error}
          </div>
        )}
        <button
          onClick={capturing ? stop : start}
          className="pointer-events-auto rounded-full bg-white/10 px-6 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
        >
          {capturing ? "Stop" : "Capture audio"}
        </button>
      </div>
    </div>
  );
}

export type { Style };
