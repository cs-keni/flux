// GpuProfiler — DEV-only per-pass GPU timing for the Phase 6 WebGPU spike (T1).
//
// Answers the single T1 question: "where does the frame budget actually go?"
// before anyone assumes it's the Jacobi pressure solve. Uses
// EXT_disjoint_timer_query_webgl2 (TIME_ELAPSED) to measure real GPU time per
// pass group, not CPU-side GL-call time (which is meaningless for an async API).
//
// Throwaway spike instrumentation — attached only under import.meta.env.DEV in
// main.ts, so it (and every begin/end call site) is tree-shaken from prod.
//
// Design notes:
//  - TIME_ELAPSED queries cannot nest and only one can be active at a time. The
//    9 passes run strictly sequentially, so a single active query is correct.
//  - Query results resolve asynchronously (some frames later). We ring-buffer
//    each frame's markers and read them RESULT_LATENCY frames afterward so
//    polling never stalls the GPU pipeline (the exact stall we're hunting).
//  - GPU_DISJOINT_EXT invalidates a whole batch (context switch, power event);
//    disjoint samples are discarded, not recorded as bogus fast/slow numbers.
//  - On WSL2/ANGLE and many weak GPUs the timer ext is disabled. `supported` is
//    then false and only the CPU wall-clock samples (readback stall) populate.

const MAX_SAMPLES = 300;    // rolling window per label (~5s at 60fps)
const RESULT_LATENCY = 4;   // frames to let a query resolve before reading

interface Marker {
  label: string;
  query: WebGLQuery;
}

export interface PassReport {
  label: string;
  n: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface ProfileReport {
  supported: boolean;          // GPU timer queries available on this device
  gpu: PassReport[];           // per-pass GPU time, first-seen order
  gpuTotalMean: number;        // sum of per-pass means (approx frame GPU cost)
  cpu: PassReport[];           // CPU wall-clock samples (e.g. readback stalls)
}

export class GpuProfiler {
  readonly supported: boolean;

  private gl: WebGL2RenderingContext;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;

  // Query object pool — reused so per-frame allocation never shows up as churn.
  private pool: WebGLQuery[] = [];
  private inFlight: Marker[][] = [];
  private current: Marker[] = [];
  private active: WebGLQuery | null = null;

  private gpuSamples = new Map<string, number[]>();
  private cpuSamples = new Map<string, number[]>();
  private gpuOrder: string[] = [];   // preserve first-seen pass order for report
  private cpuOrder: string[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as
      | { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
      | null;
    this.supported = !!this.ext;
  }

  // Call once at the top of each frame's step().
  frameStart(): void {
    this.current = [];
  }

  // Bracket a pass group. begin() → end() must not overlap another begin().
  begin(label: string): void {
    if (!this.ext || this.active) return;
    const q = this.pool.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
    this.current.push({ label, query: q });
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.active = null;
  }

  // Call once at the end of each frame's render(). Enqueues this frame's markers
  // and collects the oldest resolved batch.
  frameEnd(): void {
    if (!this.ext) return;
    if (this.current.length) this.inFlight.push(this.current);
    this.current = [];
    if (this.inFlight.length > RESULT_LATENCY) {
      this.collect(this.inFlight.shift()!);
    }
  }

  // Record a CPU wall-clock duration (e.g. a sync readPixels stall). Always
  // available, independent of the timer extension — this feeds the async-
  // readback payoff question (TODOS.md).
  sampleCpu(label: string, ms: number): void {
    this.record(this.cpuSamples, this.cpuOrder, label, ms);
  }

  private collect(batch: Marker[]): void {
    const gl = this.gl;
    const ext = this.ext!;
    // Queries in a batch complete in submission order, so the last one gating
    // availability means the whole batch is ready.
    const last = batch[batch.length - 1].query;
    if (!gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE)) {
      this.inFlight.unshift(batch); // not ready yet — wait another frame
      return;
    }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (const m of batch) {
      if (!disjoint) {
        const ns = gl.getQueryParameter(m.query, gl.QUERY_RESULT) as number;
        this.record(this.gpuSamples, this.gpuOrder, m.label, ns / 1e6);
      }
      this.pool.push(m.query); // recycle
    }
  }

  private record(
    store: Map<string, number[]>,
    order: string[],
    label: string,
    ms: number,
  ): void {
    let arr = store.get(label);
    if (!arr) {
      arr = [];
      store.set(label, arr);
      order.push(label);
    }
    arr.push(ms);
    if (arr.length > MAX_SAMPLES) arr.shift();
  }

  reset(): void {
    this.gpuSamples.clear();
    this.cpuSamples.clear();
    this.gpuOrder = [];
    this.cpuOrder = [];
  }

  report(): ProfileReport {
    const gpu = this.gpuOrder
      .map((l) => summarize(l, this.gpuSamples.get(l)))
      .filter((r): r is PassReport => r !== null);
    const cpu = this.cpuOrder
      .map((l) => summarize(l, this.cpuSamples.get(l)))
      .filter((r): r is PassReport => r !== null);
    const gpuTotalMean = gpu.reduce((sum, r) => sum + r.mean, 0);
    return { supported: this.supported, gpu, gpuTotalMean, cpu };
  }
}

function summarize(label: string, samples: number[] | undefined): PassReport | null {
  if (!samples || samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    label,
    n: sorted.length,
    mean,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

// Nearest-rank percentile on an already-sorted array.
function percentile(sorted: number[], q: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}
