// 可信度派生：把 predictionVsActual 转成 rolling MAE、残差序列、置信度分桶
import type { Analytics } from "./analytics";

export interface Credibility {
  n: number;
  mae: number;
  rmse: number;
  bias: number; // mean(predicted - actual)，>0 表示孪生系统性高估
  rollingMae: { t: number; mae: number }[]; // 窗口 MAE 随时间
  residuals: { t: number; residual: number }[]; // predicted - actual
  confidenceBuckets: { label: string; low: number; high: number; count: number; appliedCount: number }[];
  calibration: { label: string; expected: number; observed: number; count: number }[];
}

export function deriveCredibility(a: Analytics, decisionGainPct?: number[]): Credibility {
  const pv = a.predictionVsActual;
  const n = pv.length;
  const errs = pv.map((p) => p.predictedChosen - p.actual);
  const absErrs = errs.map(Math.abs);
  const mae = n ? absErrs.reduce((s, x) => s + x, 0) / n : 0;
  const rmse = n ? Math.sqrt(errs.reduce((s, x) => s + x * x, 0) / n) : 0;
  const bias = n ? errs.reduce((s, x) => s + x, 0) / n : 0;

  // 按 t 排序后做滚动窗口 MAE（窗口 W 次决策）
  const W = 20;
  const sorted = pv.slice().sort((x, y) => x.t - y.t);
  const rollingMae: { t: number; mae: number }[] = [];
  const residuals = sorted.map((p) => ({ t: p.t, residual: p.predictedChosen - p.actual }));
  for (let i = 0; i < sorted.length; i++) {
    const from = Math.max(0, i - W + 1);
    const slice = sorted.slice(from, i + 1);
    const m = slice.reduce((s, p) => s + Math.abs(p.predictedChosen - p.actual), 0) / slice.length;
    rollingMae.push({ t: sorted[i].t, mae: +m.toFixed(2) });
  }

  // 置信度桶 —— 从决策的 gain_pct（孪生认为"选这条比另一条快百分之多少"）
  // 低 gain → 低置信（孪生也没把握）；高 gain → 高置信
  const gains = (decisionGainPct ?? []).map((g) => Math.abs(g));
  const bucketDefs: { label: string; low: number; high: number }[] = [
    { label: "< 2%", low: 0, high: 2 },
    { label: "2–5%", low: 2, high: 5 },
    { label: "5–10%", low: 5, high: 10 },
    { label: "10–20%", low: 10, high: 20 },
    { label: "≥ 20%", low: 20, high: Infinity },
  ];
  const confidenceBuckets = bucketDefs.map((b) => ({
    ...b,
    count: gains.filter((g) => g >= b.low && g < b.high).length,
    appliedCount: 0,
  }));

  // 校准：把 predicted RCT 按绝对误差比例分桶，统计实际落在 ±10% 内的比例
  const calibBucketsDef: { label: string; low: number; high: number }[] = [
    { label: "< 100s", low: 0, high: 100 },
    { label: "100–200s", low: 100, high: 200 },
    { label: "200–400s", low: 200, high: 400 },
    { label: "≥ 400s", low: 400, high: Infinity },
  ];
  const calibration = calibBucketsDef.map((b) => {
    const inBucket = pv.filter((p) => p.predictedChosen >= b.low && p.predictedChosen < b.high);
    const hit = inBucket.filter((p) => {
      const tol = Math.max(20, 0.1 * p.predictedChosen); // ±10% 或 ±20s
      return Math.abs(p.predictedChosen - p.actual) <= tol;
    }).length;
    return {
      label: b.label,
      expected: 100,
      observed: inBucket.length ? +((hit / inBucket.length) * 100).toFixed(1) : 0,
      count: inBucket.length,
    };
  });

  return { n, mae, rmse, bias, rollingMae, residuals, confidenceBuckets, calibration };
}
