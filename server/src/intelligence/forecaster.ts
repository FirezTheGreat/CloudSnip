/**
 * Forecaster
 *
 * Implements Double Exponential Smoothing (Holt's Method) for cost
 * and usage prediction, plus growth trend detection.
 *
 * Formulas:
 *   Level:  L_t = α × Y_t + (1 - α)(L_{t-1} + T_{t-1})
 *   Trend:  T_t = β × (L_t - L_{t-1}) + (1 - β) × T_{t-1}
 *   Forecast: F_{t+m} = L_t + m × T_t
 */

export interface ForecastPoint {
  ds: Date;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface ForecastResult {
  forecast: ForecastPoint[];
  projectedEomCost: number;
  next24hCost: number;
  next7dCost: number;
  trend: "increasing" | "decreasing" | "flat";
  growthRate: number;            // % change per day
  confidenceInterval: [number, number];  // 7-day lower/upper monthly projection
  method: string;
}

/**
 * Double Exponential Smoothing (Holt's Method)
 *
 * @param series  Array of { ds: Date, y: number } time-ordered observations
 * @param alpha   Level smoothing factor (0..1), default 0.3
 * @param beta    Trend smoothing factor (0..1), default 0.1
 * @param periods Number of periods to forecast
 */
export function holtForecast(
  series: Array<{ ds: Date; y: number }>,
  periods: number = 168,
  alpha: number = 0.3,
  beta: number = 0.1
): ForecastPoint[] {
  if (series.length < 2) return [];

  // Determine time step (ms between consecutive points)
  const timeStepMs = series.length > 1
    ? (series[series.length - 1].ds.getTime() - series[0].ds.getTime()) / (series.length - 1)
    : 3600_000; // default 1 hour

  // Initialize level and trend
  let L = series[0].y;
  let T = series[1].y - series[0].y;

  // Train on historical data
  const residuals: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const Y = series[i].y;
    const L_prev = L;
    L = alpha * Y + (1 - alpha) * (L_prev + T);
    T = beta * (L - L_prev) + (1 - beta) * T;
    residuals.push(Math.abs(Y - (L_prev + T)));
  }

  // Compute residual standard deviation for confidence intervals
  const residualMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const residualStd = Math.sqrt(
    residuals.reduce((sum, r) => sum + (r - residualMean) ** 2, 0) / residuals.length
  );

  // Generate forecast
  const lastTime = series[series.length - 1].ds.getTime();
  const forecast: ForecastPoint[] = [];

  for (let m = 1; m <= periods; m++) {
    const predicted = L + m * T;
    const yhat = Math.max(0, predicted);
    // Confidence interval widens linearly with forecast horizon
    const margin = 1.96 * residualStd * Math.sqrt(m);

    forecast.push({
      ds: new Date(lastTime + m * timeStepMs),
      yhat: Number(yhat.toFixed(6)),
      yhat_lower: Number(Math.max(0, yhat - margin).toFixed(6)),
      yhat_upper: Number((yhat + margin).toFixed(6)),
    });
  }

  return forecast;
}

/**
 * Detect growth trend using simple linear regression slope.
 * Returns daily growth rate as a percentage.
 */
export function detectGrowthRate(series: Array<{ ds: Date; y: number }>): number {
  if (series.length < 3) return 0;

  const n = series.length;
  const startTime = series[0].ds.getTime();

  // Convert timestamps to days-since-start
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const point of series) {
    const x = (point.ds.getTime() - startTime) / (24 * 3600_000); // days
    const y = point.y;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgY = sumY / n;

  // Growth rate as % per day
  if (avgY === 0) return 0;
  return (slope / avgY) * 100;
}

/**
 * Determine trend direction from growth rate.
 */
export function trendDirection(growthRatePerDay: number): "increasing" | "decreasing" | "flat" {
  if (growthRatePerDay > 2)  return "increasing";
  if (growthRatePerDay < -2) return "decreasing";
  return "flat";
}

/**
 * Full forecast pipeline for a cost time series.
 */
export function generateForecast(
  historicalData: Array<{ ds: Date; y: number }>,
  periods: number = 168
): ForecastResult {
  const forecast = holtForecast(historicalData, periods);
  const growthRate = detectGrowthRate(historicalData);
  const trend = trendDirection(growthRate);

  // Calculate aggregated cost projections
  const next24h = forecast.slice(0, 24).reduce((sum, f) => sum + f.yhat, 0);
  const next7d = forecast.slice(0, 168).reduce((sum, f) => sum + f.yhat, 0);

  // EOM projection: extrapolate current monthly spend
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const hoursRemaining = daysRemaining * 24;

  const recentHourlyCost = historicalData.length > 0
    ? historicalData.slice(-24).reduce((s, d) => s + d.y, 0) / Math.min(24, historicalData.length)
    : 0;
  const spentSoFar = recentHourlyCost * dayOfMonth * 24;
  const projectedEom = spentSoFar + (forecast.slice(0, hoursRemaining).reduce((s, f) => s + f.yhat, 0));

  // Confidence interval for 7-day projection
  const lower7d = forecast.slice(0, 168).reduce((s, f) => s + f.yhat_lower, 0);
  const upper7d = forecast.slice(0, 168).reduce((s, f) => s + f.yhat_upper, 0);

  return {
    forecast,
    projectedEomCost: Number(projectedEom.toFixed(2)),
    next24hCost: Number(next24h.toFixed(4)),
    next7dCost: Number(next7d.toFixed(4)),
    trend,
    growthRate: Number(growthRate.toFixed(2)),
    confidenceInterval: [Number(lower7d.toFixed(2)), Number(upper7d.toFixed(2))],
    method: "holt_double_exponential_smoothing",
  };
}
