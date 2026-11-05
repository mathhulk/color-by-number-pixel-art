import { Slider } from "@base-ui/react/slider";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ReplayPlayer } from "@/lib/replay";
import type { SceneView } from "@/render/types";
import { useReducedMotion } from "@/state/hooks";
import { IconButton, SegmentedControl } from "@/ui";

import styles from "./ReplayBar.module.css";

const SPEEDS = ["0.5", "1", "2", "4", "8"] as const;
type Speed = (typeof SPEEDS)[number];

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

interface ReplayBarProps {
  player: ReplayPlayer;
  view: SceneView | null;
  onExit: () => void;
}

/**
 * Playback controls for a replay: play/pause, step, scrub through every fill
 * and change the speed. At 1× a replay lasts about 20 seconds (4–60 fills per
 * second), so small and huge designs both feel right.
 */
export function ReplayBar({ player, view, onExit }: ReplayBarProps) {
  const length = player.length;
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState(player.position);
  const [playing, setPlaying] = useState(!reducedMotion && length > 0);
  const [speed, setSpeed] = useState<Speed>("1");
  const exact = useRef(player.position);
  const baseRate = Math.min(60, Math.max(4, length / 20));

  const seek = useCallback(
    (to: number) => {
      const changed = player.seek(to);
      exact.current = player.position;
      if (changed.length > 0) view?.updateSlots(changed);
      view?.setCursor(player.lastSlot);
      setPosition(player.position);
    },
    [player, view],
  );

  // Playing from the very end starts over.
  const togglePlay = useCallback(() => {
    if (!playing && player.position >= length) seek(0);
    setPlaying(!playing);
  }, [playing, player, length, seek]);

  // Playback loop.
  useEffect(() => {
    if (!playing) return;
    const clock = { raf: 0, last: performance.now() };
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - clock.last) / 1000);
      clock.last = now;
      exact.current = Math.min(length, exact.current + dt * baseRate * Number(speed));
      const changed = player.seek(Math.floor(exact.current));
      if (changed.length > 0) {
        view?.updateSlots(changed);
        view?.setCursor(player.lastSlot);
        setPosition(player.position);
      }
      if (player.position >= length) {
        setPlaying(false);
        view?.setCursor(-1);
        return;
      }
      clock.raf = requestAnimationFrame(tick);
    };
    clock.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(clock.raf);
  }, [playing, speed, baseRate, length, player, view, seek]);

  // Keyboard: space play/pause, arrows step, Home/End jump, Escape exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case ",":
          e.preventDefault();
          setPlaying(false);
          seek(player.position - (e.shiftKey ? 10 : 1));
          break;
        case "ArrowRight":
        case ".":
          e.preventDefault();
          setPlaying(false);
          seek(player.position + (e.shiftKey ? 10 : 1));
          break;
        case "Home":
          e.preventDefault();
          seek(0);
          break;
        case "End":
          e.preventDefault();
          seek(length);
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, length, seek, onExit, togglePlay]);

  const time = position > 0 ? player.track.time[position - 1]! : Number.NaN;
  const reconstructed = position > 0 && position <= player.track.reconstructed;

  return (
    <section className={styles.bar} aria-label="Replay">
      <Slider.Root
        className={styles.scrubber}
        value={position}
        min={0}
        max={Math.max(1, length)}
        step={1}
        onValueChange={(v) => {
          setPlaying(false);
          seek(Array.isArray(v) ? (v[0] ?? 0) : v);
        }}
      >
        <Slider.Control className={styles.control}>
          <Slider.Track className={styles.track}>
            <Slider.Indicator className={styles.indicator} />
            <Slider.Thumb
              className={styles.thumb}
              aria-label="Replay position"
              getAriaValueText={(_, v) => `Fill ${v} of ${length}`}
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>

      <div className={styles.row}>
        <div className={styles.buttons}>
          <IconButton
            label="Back to start"
            shortcut="Home"
            icon={<SkipBack />}
            onClick={() => seek(0)}
          />
          <IconButton
            label="Previous fill"
            shortcut="←"
            icon={<StepBack />}
            onClick={() => {
              setPlaying(false);
              seek(position - 1);
            }}
            disabled={position === 0}
          />
          <IconButton
            label={playing ? "Pause" : "Play"}
            shortcut="Space"
            icon={playing ? <Pause /> : <Play />}
            variant="primary"
            onClick={togglePlay}
            disabled={length === 0}
          />
          <IconButton
            label="Next fill"
            shortcut="→"
            icon={<StepForward />}
            onClick={() => {
              setPlaying(false);
              seek(position + 1);
            }}
            disabled={position >= length}
          />
          <IconButton
            label="Jump to end"
            shortcut="End"
            icon={<SkipForward />}
            onClick={() => seek(length)}
          />
        </div>

        <div className={styles.meta} aria-live="off">
          <span className={styles.count}>
            Fill {position.toLocaleString()} <span>of {length.toLocaleString()}</span>
          </span>
          <span className={styles.time}>
            {reconstructed
              ? "Before recording started"
              : Number.isFinite(time)
                ? timeFormat.format(time)
                : " "}
          </span>
        </div>

        <div className={styles.end}>
          <SegmentedControl<Speed>
            label="Speed"
            value={speed}
            onChange={setSpeed}
            options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
            className={styles.speed}
          />
          <IconButton label="Exit replay" shortcut="Esc" icon={<X />} onClick={onExit} />
        </div>
      </div>
    </section>
  );
}
