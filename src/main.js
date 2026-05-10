// WebGazer FPS / Latency Benchmark
// Measures wall-clock time between consecutive gaze listener callbacks,
// which represents one full forward-propagation cycle.

import webgazer from 'webgazer'

const MAX_LOG_ROWS = 200
const SPARKLINE_BUCKETS = 60  // seconds of history shown in chart

// --- State ---
const state = {
  running: false,
  predictions: [],   // { t: performance.now(), latencyMs, x, y }
  lastT: null,
  buckets: [],       // FPS per 1-second bucket
  bucketStart: null,
  bucketCount: 0,
}

// --- DOM refs ---
const btnStart   = document.getElementById('btn-start')
const btnStop    = document.getElementById('btn-stop')
const btnExport  = document.getElementById('btn-export')
const btnReset   = document.getElementById('btn-reset')
const statusBar  = document.getElementById('status-bar')
const gazeDot    = document.getElementById('gaze-dot')

const elFps    = document.getElementById('stat-fps')
const elMean   = document.getElementById('stat-mean')
const elMin    = document.getElementById('stat-min')
const elMax    = document.getElementById('stat-max')
const elP95    = document.getElementById('stat-p95')
const elCount  = document.getElementById('stat-count')

const logBody  = document.getElementById('log-body')
const logCount = document.getElementById('log-count')

const canvas   = document.getElementById('sparkline')
const ctx      = canvas.getContext('2d')

// --- Helpers ---

function setStatus(msg, cls = '') {
  statusBar.textContent = msg
  statusBar.className = cls
}

function fmt(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return '--'
  return n.toFixed(decimals)
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.ceil(p * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// --- Stats update ---

function updateStats() {
  const n = state.predictions.length
  elCount.textContent = n

  if (n < 2) return

  const latencies = state.predictions
    .map(p => p.latencyMs)
    .filter(l => l !== null)
  if (!latencies.length) return

  const sorted = [...latencies].sort((a, b) => a - b)
  const mean   = latencies.reduce((s, v) => s + v, 0) / latencies.length
  const min    = sorted[0]
  const max    = sorted[sorted.length - 1]
  const p95    = percentile(sorted, 0.95)

  elMean.textContent = fmt(mean)
  elMin.textContent  = fmt(min)
  elMax.textContent  = fmt(max)
  elP95.textContent  = fmt(p95)

  // Current FPS: count predictions in the last 1000ms
  const now = performance.now()
  const recent = state.predictions.filter(p => now - p.t < 1000).length
  elFps.textContent = recent.toString()
}

// --- Sparkline ---

function resizeCanvas() {
  const wrap = canvas.parentElement
  canvas.width  = wrap.clientWidth - 32
  canvas.height = 80
}

function drawSparkline() {
  const w = canvas.width
  const h = canvas.height
  const buckets = state.buckets.slice(-SPARKLINE_BUCKETS)

  ctx.clearRect(0, 0, w, h)

  if (buckets.length < 2) return

  const maxFps = Math.max(...buckets, 1)
  const step   = w / (SPARKLINE_BUCKETS - 1)

  // Grid line at maxFps/2
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1
  ctx.beginPath()
  const midY = h - (maxFps / 2 / maxFps) * h
  ctx.moveTo(0, midY)
  ctx.lineTo(w, midY)
  ctx.stroke()

  // Fill area
  ctx.beginPath()
  const startX = (SPARKLINE_BUCKETS - buckets.length) * step
  ctx.moveTo(startX, h)
  buckets.forEach((fps, i) => {
    const x = startX + i * step
    const y = h - (fps / maxFps) * h
    if (i === 0) ctx.lineTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.lineTo(startX + (buckets.length - 1) * step, h)
  ctx.closePath()
  ctx.fillStyle = 'rgba(74, 158, 255, 0.12)'
  ctx.fill()

  // Line
  ctx.beginPath()
  buckets.forEach((fps, i) => {
    const x = startX + i * step
    const y = h - (fps / maxFps) * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Max FPS label
  ctx.fillStyle = '#444'
  ctx.font = '10px Courier New'
  ctx.fillText(`${fmt(maxFps, 0)} fps max`, 4, 12)
}

// --- Bucket update (called every ~1 second) ---

let bucketTimer = null

function startBucketTimer() {
  bucketTimer = setInterval(() => {
    if (!state.running) return
    state.buckets.push(state.bucketCount)
    state.bucketCount = 0
    drawSparkline()
  }, 1000)
}

function stopBucketTimer() {
  clearInterval(bucketTimer)
  bucketTimer = null
}

// --- Log table ---

function appendLogRow(pred) {
  // Keep only last MAX_LOG_ROWS
  if (logBody.children.length >= MAX_LOG_ROWS) {
    logBody.removeChild(logBody.firstChild)
  }

  const tr = document.createElement('tr')
  const n  = state.predictions.length

  tr.innerHTML = `
    <td>${n}</td>
    <td>${fmt(pred.t, 1)}</td>
    <td>${pred.latencyMs !== null ? fmt(pred.latencyMs) : '--'}</td>
    <td>${pred.x !== null ? Math.round(pred.x) : '--'}</td>
    <td>${pred.y !== null ? Math.round(pred.y) : '--'}</td>
  `
  logBody.appendChild(tr)

  // Auto-scroll
  const wrap = document.getElementById('log-table-wrap')
  wrap.scrollTop = wrap.scrollHeight

  logCount.textContent = `${n} rows`
}

// --- WebGazer gaze listener ---

function onGaze(data, _elapsedTime) {
  if (!state.running) return

  const now = performance.now()
  const latencyMs = state.lastT !== null ? now - state.lastT : null
  state.lastT = now

  const pred = {
    t: now,
    latencyMs,
    x: data ? data.x : null,
    y: data ? data.y : null,
  }

  state.predictions.push(pred)
  state.bucketCount++

  // Move gaze dot
  if (data) {
    gazeDot.style.display = 'block'
    gazeDot.style.left = `${data.x}px`
    gazeDot.style.top  = `${data.y}px`
  }

  appendLogRow(pred)
  updateStats()
}

// --- Start / Stop ---

async function startWebGazer() {
  setStatus('Initializing WebGazer...', '')
  btnStart.disabled = true

  try {
    await webgazer
      .setGazeListener(onGaze)
      .setRegression('ridge')
      .saveDataAcrossSessions(false)
      .begin()

    // Hide the WebGazer face overlay video — we only want timing data
    // (webgazer adds its own DOM elements; hide them if they exist)
    const wgVideo = document.getElementById('webgazerVideoFeed')
    if (wgVideo) wgVideo.style.display = 'none'
    const wgCanvas = document.getElementById('webgazerFaceOverlay')
    if (wgCanvas) wgCanvas.style.display = 'none'
    const wgPredCanvas = document.getElementById('webgazerGazeDot')
    if (wgPredCanvas) wgPredCanvas.style.display = 'none'
    const wgFaceCanvas = document.getElementById('webgazerFaceFeedbackBox')
    if (wgFaceCanvas) wgFaceCanvas.style.display = 'none'

    state.running = true
    state.lastT = null
    state.bucketCount = 0
    state.bucketStart = performance.now()

    startBucketTimer()

    btnStop.disabled   = false
    btnExport.disabled = false
    btnReset.disabled  = false

    setStatus('Running — collecting predictions...', 'running')
  } catch (err) {
    console.error(err)
    setStatus(`Error: ${err.message}`, 'error')
    btnStart.disabled = false
  }
}

async function stopWebGazer() {
  state.running = false
  stopBucketTimer()
  gazeDot.style.display = 'none'

  try {
    webgazer.pause()
  } catch (_) {}

  btnStop.disabled  = true
  btnStart.disabled = false
  setStatus(`Stopped. ${state.predictions.length} predictions recorded.`, '')
}

function resetStats() {
  state.predictions = []
  state.lastT = null
  state.buckets = []
  state.bucketCount = 0

  elFps.textContent   = '--'
  elMean.textContent  = '--'
  elMin.textContent   = '--'
  elMax.textContent   = '--'
  elP95.textContent   = '--'
  elCount.textContent = '0'

  logBody.innerHTML = ''
  logCount.textContent = '0 rows'

  drawSparkline()
  setStatus('Stats reset. Collecting fresh...', state.running ? 'running' : '')
}

// --- CSV Export ---

function exportCsv() {
  const rows = [
    ['index', 'timestamp_ms', 'latency_ms', 'gaze_x_px', 'gaze_y_px'],
    ...state.predictions.map((p, i) => [
      i + 1,
      fmt(p.t, 3),
      p.latencyMs !== null ? fmt(p.latencyMs, 3) : '',
      p.x !== null ? Math.round(p.x) : '',
      p.y !== null ? Math.round(p.y) : '',
    ]),
  ]
  const csv  = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `webgazer_fps_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Summary export (for rebuttal numbers) ---

function logSummary() {
  const latencies = state.predictions
    .map(p => p.latencyMs)
    .filter(l => l !== null)
  if (!latencies.length) return

  const sorted  = [...latencies].sort((a, b) => a - b)
  const mean    = latencies.reduce((s, v) => s + v, 0) / latencies.length
  const p95     = percentile(sorted, 0.95)
  const p99     = percentile(sorted, 0.99)

  const fpsHistory  = state.buckets.filter(b => b > 0)
  const meanFps     = fpsHistory.length
    ? fpsHistory.reduce((s, v) => s + v, 0) / fpsHistory.length
    : null

  console.table({
    'Total predictions': state.predictions.length,
    'Mean latency (ms)': fmt(mean, 2),
    'P50 latency (ms)':  fmt(percentile(sorted, 0.5), 2),
    'P95 latency (ms)':  fmt(p95, 2),
    'P99 latency (ms)':  fmt(p99, 2),
    'Min latency (ms)':  fmt(sorted[0], 2),
    'Max latency (ms)':  fmt(sorted[sorted.length - 1], 2),
    'Mean FPS (1s buckets)': meanFps !== null ? fmt(meanFps, 1) : '--',
  })
}

// --- Init ---

window.addEventListener('resize', () => {
  resizeCanvas()
  drawSparkline()
})

btnStart.addEventListener('click', startWebGazer)
btnStop.addEventListener('click', stopWebGazer)
btnExport.addEventListener('click', exportCsv)
btnReset.addEventListener('click', resetStats)

// Expose summary helper to console for quick rebuttal numbers
window.webgazerSummary = logSummary

resizeCanvas()
drawSparkline()
