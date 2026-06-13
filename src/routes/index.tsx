import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Activity, Mic, Plus, Save, Sparkles, Trash2, Waves } from "lucide-react";

import { Visualizer, type Style } from "@/components/visualizer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sonescape — Live Music Visualizer" },
      {
        name: "description",
        content:
          "Capture desktop audio and render it as neon bars, retro wave, or liquid orbs in a dark, glowing studio.",
      },
      { property: "og:title", content: "Sonescape — Live Music Visualizer" },
      {
        property: "og:description",
        content: "A dark-mode visualizer studio for your live audio.",
      },
    ],
  }),
  component: Dashboard,
});

interface Preset {
  id: string;
  name: string;
  style: Style;
  sensitivity: number;
  smoothing: number;
  accent: string;
}

const STYLE_LABEL: Record<Style, string> = {
  "neon-bars": "Neon Bars",
  "retro-wave": "Retro Wave",
  "liquid-orbs": "Liquid Orbs",
};

const INITIAL_PRESETS: Preset[] = [
  { id: "p1", name: "Midnight Pulse", style: "neon-bars", sensitivity: 65, smoothing: 55, accent: "oklch(0.78 0.19 195)" },
  { id: "p2", name: "Sunset Drive", style: "retro-wave", sensitivity: 72, smoothing: 40, accent: "oklch(0.72 0.24 30)" },
  { id: "p3", name: "Aurora Bloom", style: "liquid-orbs", sensitivity: 58, smoothing: 70, accent: "oklch(0.72 0.22 330)" },
];

function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<Style>("neon-bars");
  const [sensitivity, setSensitivity] = useState(60);
  const [smoothing, setSmoothing] = useState(55);
  const [capturing, setCapturing] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(INITIAL_PRESETS);
  const [activePreset, setActivePreset] = useState<string>("p1");

  useEffect(() => { setMounted(true); }, []);

  const handleCapture = () => {
    setCapturing((c) => !c);
    toast(capturing ? "Audio capture stopped" : "Listening to desktop audio");
  };

  const savePreset = () => {
    const name = `Preset ${presets.length + 1}`;
    const p: Preset = {
      id: `p${Date.now()}`,
      name,
      style,
      sensitivity,
      smoothing,
      accent: "oklch(0.78 0.19 195)",
    };
    setPresets((prev) => [p, ...prev]);
    setActivePreset(p.id);
    toast.success(`Saved "${name}"`);
  };

  const applyPreset = (p: Preset) => {
    setStyle(p.style);
    setSensitivity(p.sensitivity);
    setSmoothing(p.smoothing);
    setActivePreset(p.id);
  };

  const removePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen w-full text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full border-b border-border/60 bg-card/40 px-6 py-6 backdrop-blur-xl lg:w-80 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-neon glow-ring">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Sonescape</h1>
              <p className="text-xs text-muted-foreground">Visualizer Studio</p>
            </div>
          </div>

          <Separator className="my-6 bg-border/60" />

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Preset Themes
            </h2>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={savePreset}
              aria-label="Save current as preset"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ul className="space-y-2">
            {presets.map((p) => {
              const active = p.id === activePreset;
              return (
                <li key={p.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => applyPreset(p)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && applyPreset(p)}
                    className={`group w-full rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_24px_oklch(0.78_0.19_195/0.25)]"
                        : "border-border/60 bg-card/40 hover:border-primary/40 hover:bg-card/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: p.accent, boxShadow: `0 0 10px ${p.accent}` }}
                        />
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePreset(p.id);
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{STYLE_LABEL[p.style]}</span>
                      <span>·</span>
                      <span>S {p.sensitivity}</span>
                      <span>·</span>
                      <span>Sm {p.smoothing}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <Separator className="my-6 bg-border/60" />

          <Button
            variant="outline"
            className="w-full border-border/60 bg-card/40"
            onClick={savePreset}
          >
            <Save className="mr-2 h-4 w-4" /> Save current theme
          </Button>
        </aside>

        {/* Main */}
        <main className="flex-1 px-6 py-8 lg:px-10">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Live Session
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">
                Tonight's <span className="text-gradient-neon">visualizer</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5 border-border/60 bg-card/40 text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    capturing ? "bg-neon animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                {capturing ? "Capturing" : "Idle"}
              </Badge>
              <Badge variant="outline" className="gap-1.5 border-border/60 bg-card/40 text-xs">
                <Activity className="h-3 w-3" /> 60 fps
              </Badge>
            </div>
          </header>

          {/* Canvas */}
          <section
            className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border/60 bg-black"
            style={{
              boxShadow:
                "inset 0 0 80px oklch(0.78 0.19 195 / 0.08), 0 30px 80px -20px oklch(0 0 0 / 0.7)",
            }}
          >
            {/* drifting grid */}
            <div
              className="pointer-events-none absolute inset-0 opacity-30 animate-grid-drift"
              style={{
                backgroundImage:
                  "linear-gradient(oklch(0.78 0.19 195 / 0.15) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.24 330 / 0.12) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <Visualizer
              style={style}
              sensitivity={sensitivity}
              smoothing={smoothing}
              active={capturing}
            />
            {!capturing && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-border/60 bg-background/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
                  Preview · click capture to go live
                </div>
              </div>
            )}
          </section>

          {/* Controls */}
          <section className="mt-6 grid gap-4 lg:grid-cols-[auto_1fr_1fr_1fr]">
            <Button
              onClick={handleCapture}
              size="lg"
              className={`h-14 rounded-xl px-6 text-sm font-semibold tracking-wide bg-gradient-neon text-primary-foreground border-0 hover:opacity-95 ${
                capturing ? "animate-pulse-glow" : "glow-ring"
              }`}
            >
              <Mic className="mr-2 h-4 w-4" />
              {capturing ? "Stop Capture" : "Capture Desktop Audio"}
            </Button>

            <ControlCard label="Visualizer Style" icon={<Waves className="h-3.5 w-3.5" />}>
              <Select value={style} onValueChange={(v) => setStyle(v as Style)}>
                <SelectTrigger className="h-9 border-border/60 bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neon-bars">Neon Bars</SelectItem>
                  <SelectItem value="retro-wave">Retro Wave</SelectItem>
                  <SelectItem value="liquid-orbs">Liquid Orbs</SelectItem>
                </SelectContent>
              </Select>
            </ControlCard>

            <ControlCard
              label="Sensitivity"
              value={`${sensitivity}`}
              icon={<Activity className="h-3.5 w-3.5" />}
            >
              <Slider
                value={[sensitivity]}
                onValueChange={(v) => setSensitivity(v[0])}
                min={0}
                max={100}
                step={1}
              />
            </ControlCard>

            <ControlCard
              label="Smoothing"
              value={`${smoothing}`}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              <Slider
                value={[smoothing]}
                onValueChange={(v) => setSmoothing(v[0])}
                min={0}
                max={100}
                step={1}
              />
            </ControlCard>
          </section>
        </main>
      </div>
    </div>
  );
}

function ControlCard({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {value && <span className="font-mono text-neon">{value}</span>}
      </div>
      {children}
    </div>
  );
}
