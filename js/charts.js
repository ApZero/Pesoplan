/* =========================================================
   Fit Bee — gráficos (canvas nativo, sin librerías)
   ========================================================= */

/**
 * Regresión lineal simple sobre puntos {t (días desde el primero), y}.
 * Devuelve {slope, intercept} en unidades de y por día.
 */
function linearTrend(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumT = 0, sumY = 0, sumTT = 0, sumTY = 0;
  points.forEach((p) => {
    sumT += p.t; sumY += p.y; sumTT += p.t * p.t; sumTY += p.t * p.y;
  });
  const denom = n * sumTT - sumT * sumT;
  if (denom === 0) return null;
  const slope = (n * sumTY - sumT * sumY) / denom;
  const intercept = (sumY - slope * sumT) / n;
  return { slope, intercept };
}

/**
 * Estima la fecha en la que se alcanzará goalY, usando la tendencia
 * de los últimos puntos (hasta 30). Devuelve { date, daysAway } o null
 * si la tendencia no avanza hacia la meta o no hay datos suficientes.
 */
function estimateGoalDate(entries, goalY, todayDateStr) {
  if (!entries || entries.length < 2 || goalY == null) return null;
  const recent = entries.slice(-30);
  const first = strToDate(recent[0].date).getTime();
  const points = recent.map((e) => ({
    t: Math.round((strToDate(e.date).getTime() - first) / 86400000),
    y: e.value
  }));
  const trend = linearTrend(points);
  if (!trend || trend.slope === 0) return null;

  const lastPoint = points[points.length - 1];
  const lastDate = strToDate(recent[recent.length - 1].date);
  const currentVal = trend.slope * lastPoint.t + trend.intercept;

  const movingTowardGoal = (trend.slope < 0 && goalY < currentVal) || (trend.slope > 0 && goalY > currentVal);
  if (!movingTowardGoal) return null;

  const tGoal = (goalY - trend.intercept) / trend.slope;
  const daysAway = Math.round(tGoal - lastPoint.t);
  if (daysAway <= 0 || daysAway > 3650) return null;

  const goalDate = new Date(lastDate);
  goalDate.setDate(goalDate.getDate() + daysAway);
  return { date: goalDate, daysAway, weeklyRate: trend.slope * 7 };
}

function setupCanvasDPR(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth - 20;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w: cssWidth, h: cssHeight };
}

/**
 * Dibuja un gráfico de línea simple para una serie de peso/grasa/IMC
 * con línea de meta opcional y proyección punteada.
 */
function drawProgressChart(canvas, entries, opts = {}) {
  const cssHeight = 160;
  const { ctx, w, h } = setupCanvasDPR(canvas, cssHeight);
  ctx.clearRect(0, 0, w, h);

  const padL = 34, padR = 10, padT = 14, padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  if (!entries || entries.length === 0) {
    ctx.fillStyle = '#8C8474';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Todavía no hay registros', w / 2, h / 2);
    return;
  }

  const values = entries.map((e) => e.value);
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (opts.goal != null) {
    minY = Math.min(minY, opts.goal);
    maxY = Math.max(maxY, opts.goal);
  }
  const pad = (maxY - minY) * 0.15 || 1;
  minY -= pad; maxY += pad;

  const firstTime = strToDate(entries[0].date).getTime();
  const lastEntry = entries[entries.length - 1];
  const lastTime = strToDate(lastEntry.date).getTime();

  let maxT = Math.max(1, Math.round((lastTime - firstTime) / 86400000));

  // proyección hacia la meta (si corresponde)
  let projection = null;
  if (opts.showProjection && opts.goal != null) {
    projection = estimateGoalDate(entries, opts.goal);
    if (projection) {
      const projT = Math.round((projection.date.getTime() - firstTime) / 86400000);
      maxT = Math.max(maxT, projT);
    }
  }

  const xForT = (t) => padL + (t / maxT) * plotW;
  const yForV = (v) => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;

  // grid horizontal
  ctx.strokeStyle = '#DFD5C1';
  ctx.lineWidth = 1;
  ctx.font = '9.5px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8C8474';
  ctx.textAlign = 'right';
  const gridLines = 3;
  for (let i = 0; i <= gridLines; i++) {
    const v = minY + ((maxY - minY) * i) / gridLines;
    const y = yForV(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(1), padL - 6, y + 3);
  }

  // línea de meta
  if (opts.goal != null) {
    const gy = yForV(opts.goal);
    ctx.save();
    ctx.strokeStyle = '#D6A24A';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();
    ctx.restore();
  }

  // línea principal de datos
  ctx.strokeStyle = '#C46A3F';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  entries.forEach((e, i) => {
    const t = Math.round((strToDate(e.date).getTime() - firstTime) / 86400000);
    const x = xForT(t);
    const y = yForV(e.value);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // puntos
  ctx.fillStyle = '#A6512C';
  entries.forEach((e) => {
    const t = Math.round((strToDate(e.date).getTime() - firstTime) / 86400000);
    ctx.beginPath();
    ctx.arc(xForT(t), yForV(e.value), 2.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // marcadores de inicio de período: mismo tamaño que el punto de peso,
  // pero desplazados arriba para que se vean como algo separado, no
  // superpuesto (más fácil de distinguir de un vistazo)
  if (opts.periodDates && opts.periodDates.size) {
    ctx.fillStyle = '#DC3545';
    const dotOffset = 9;
    entries.forEach((e) => {
      if (!opts.periodDates.has(e.date)) return;
      const t = Math.round((strToDate(e.date).getTime() - firstTime) / 86400000);
      const y = Math.max(padT + 4, yForV(e.value) - dotOffset);
      ctx.beginPath();
      ctx.arc(xForT(t), y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // proyección punteada
  if (projection) {
    const lastT = Math.round((lastTime - firstTime) / 86400000);
    const projT = Math.round((projection.date.getTime() - firstTime) / 86400000);
    ctx.save();
    ctx.strokeStyle = '#6B7353';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xForT(lastT), yForV(lastEntry.value));
    ctx.lineTo(xForT(projT), yForV(opts.goal));
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#6B7353';
    ctx.beginPath();
    ctx.arc(xForT(projT), yForV(opts.goal), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // marca de "hoy" sobre el eje, si el gráfico se extiende más allá
  // (por la proyección) para que quede claro dónde termina lo real
  if (projection) {
    const lastT = Math.round((lastTime - firstTime) / 86400000);
    const xToday = xForT(lastT);
    ctx.save();
    ctx.strokeStyle = '#DFD5C1';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xToday, padT);
    ctx.lineTo(xToday, padT + plotH);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#8C8474';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('hoy', xToday, padT - 4);
  }

  // eje X: primera fecha y fecha del extremo derecho del gráfico
  // (si hay proyección, el extremo derecho es la fecha proyectada,
  // no la de hoy — mostrar "hoy" ahí sería engañoso)
  ctx.fillStyle = '#8C8474';
  ctx.font = '9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(formatShortDate(entries[0].date), padL, h - 4);
  ctx.textAlign = 'right';
  const rightLabelStr = projection ? dateToStr(projection.date) : lastEntry.date;
  ctx.fillText(formatShortDate(rightLabelStr), w - padR, h - 4);

  return { projection };
}

function formatShortDate(dateStr) {
  const d = strToDate(dateStr);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
