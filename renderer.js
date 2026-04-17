/* ============================================================
   LCARS Whiteboard — renderer.js
   Drawing engine: world-coord strokes, pan/zoom, PDF support,
   all export formats.
   ============================================================ */

'use strict';

// PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    './node_modules/pdfjs-dist/build/pdf.worker.min.js';
}

// ============================================================
// State
// ============================================================

const state = {
  tool:        'pen',
  color:       '#000000',
  lineWidth:   3,
  zoom:        1,
  panX:        0,
  panY:        0,
  isDrawing:   false,
  isPanning:   false,
  lastPanX:    0,
  lastPanY:    0,
  strokes:     [],
  undoStack:   [],
  currentStroke: null,
  bgImage:     null,       // HTMLImageElement for whiteboard bg
  bgDataURL:   null,       // stored for JSON save
  mode:        'whiteboard',
  pdfDoc:      null,
  currentPage: 1,
  totalPages:  0,
  pdfStrokes:  {},         // pageNum (1-based) → strokes[]
};

// ============================================================
// DOM references
// ============================================================

const startScreen  = document.getElementById('start-screen');
const appEl        = document.getElementById('app');
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');

// bg-canvas is created programmatically and prepended
const bgCanvas     = document.createElement('canvas');
bgCanvas.id        = 'bg-canvas';
const bgCtx        = bgCanvas.getContext('2d');
canvas.parentElement
  ? canvas.parentElement.insertBefore(bgCanvas, canvas)
  : document.querySelector('.lcars-canvas-area').prepend(bgCanvas);

// Toolbar elements
const penBtn             = document.getElementById('pen-btn');
const eraserBtn          = document.getElementById('eraser-btn');
const colorPicker        = document.getElementById('color-picker');
const strokeWidthInput   = document.getElementById('stroke-width');
const zoomOutBtn         = document.getElementById('zoom-out');
const zoomInBtn          = document.getElementById('zoom-in');
const zoomDisplay        = document.getElementById('zoom-display');

const fileImageInput     = document.getElementById('file-image-input');
const importImageBtn     = document.getElementById('import-image-btn');
const screenshotBtn      = document.getElementById('screenshot-btn');
const fileJsonInput      = document.getElementById('file-json-input');
const openJsonBtn        = document.getElementById('open-json-btn');
const filePdfInput       = document.getElementById('file-pdf-input');
const loadPdfBtn         = document.getElementById('load-pdf-btn');
const prevPageBtn        = document.getElementById('prev-page-btn');
const nextPageBtn        = document.getElementById('next-page-btn');
const pageLabel          = document.getElementById('page-label');

const exportPngBtn       = document.getElementById('export-png-btn');
const exportSvgBtn       = document.getElementById('export-svg-btn');
const exportWbPdfBtn     = document.getElementById('export-wb-pdf-btn');
const exportAnnotPdfBtn  = document.getElementById('export-annotated-pdf-btn');
const saveJsonBtn        = document.getElementById('save-json-btn');
const undoBtn            = document.getElementById('undo-btn');
const clearBtn           = document.getElementById('clear-btn');
const backBtn            = document.getElementById('back-btn');

const modeWhiteboardBtn  = document.getElementById('mode-whiteboard');
const modePdfBtn         = document.getElementById('mode-pdf');

const statusText         = document.getElementById('status-text');

// ============================================================
// Resize
// ============================================================

function resizeCanvas() {
  const container = document.querySelector('.lcars-canvas-area');
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width   = w;  canvas.height   = h;
  bgCanvas.width = w;  bgCanvas.height = h;
  redrawBg();
  redraw();
}

window.addEventListener('resize', resizeCanvas);

// ============================================================
// Coordinate helpers
// ============================================================

function screenToWorld(sx, sy) {
  return {
    x: (sx - state.panX) / state.zoom,
    y: (sy - state.panY) / state.zoom,
  };
}

function applyTransform(c) {
  c.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
}

// ============================================================
// Redraw
// ============================================================

function redrawBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  if (!state.bgImage) return;
  bgCtx.save();
  applyTransform(bgCtx);
  bgCtx.drawImage(state.bgImage, 0, 0);
  bgCtx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.strokes.length === 0) return;

  ctx.save();
  applyTransform(ctx);

  for (const stroke of state.strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.strokeStyle  = stroke.color;
    ctx.lineWidth    = stroke.lineWidth;
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// ============================================================
// Background image
// ============================================================

function loadBackgroundImage(dataURL) {
  const img = new Image();
  img.onload = () => {
    state.bgImage   = img;
    state.bgDataURL = dataURL;
    redrawBg();
  };
  img.src = dataURL;
}

// ============================================================
// Drawing events
// ============================================================

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top,
    };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDraw(e) {
  if (e.button === 1 || e.button === 2) return; // middle/right → pan
  const pos = getPos(e);
  const world = screenToWorld(pos.x, pos.y);
  state.isDrawing    = true;
  state.currentStroke = {
    tool:      state.tool,
    color:     state.color,
    lineWidth: state.lineWidth,
    points:    [world],
  };
  e.preventDefault();
}

function continueDraw(e) {
  if (!state.isDrawing || !state.currentStroke) return;
  const pos = getPos(e);
  const world = screenToWorld(pos.x, pos.y);
  state.currentStroke.points.push(world);

  // Live preview
  ctx.save();
  applyTransform(ctx);
  ctx.beginPath();
  const pts = state.currentStroke.points;
  ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
  ctx.lineTo(world.x, world.y);
  ctx.strokeStyle = state.currentStroke.color;
  ctx.lineWidth   = state.currentStroke.lineWidth;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  if (state.currentStroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  e.preventDefault();
}

function endDraw() {
  if (!state.isDrawing || !state.currentStroke) return;
  state.isDrawing = false;
  if (state.currentStroke.points.length >= 2) {
    state.strokes.push(state.currentStroke);
    state.undoStack = []; // clear redo on new stroke
  }
  state.currentStroke = null;
  redraw();
}

// Pan via middle-mouse or right-click drag
let panActive = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

function startPan(e) {
  if (e.button !== 1 && e.button !== 2) return;
  panActive    = true;
  panStartX    = e.clientX;
  panStartY    = e.clientY;
  panStartPanX = state.panX;
  panStartPanY = state.panY;
  canvas.style.cursor = 'grabbing';
  e.preventDefault();
}

function continuePan(e) {
  if (!panActive) return;
  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;
  state.panX = panStartPanX + dx;
  state.panY = panStartPanY + dy;
  redrawBg();
  redraw();
  e.preventDefault();
}

function endPan() {
  if (!panActive) return;
  panActive = false;
  canvas.style.cursor = state.tool === 'eraser' ? 'cell' : 'crosshair';
}

canvas.addEventListener('mousedown',  (e) => { startDraw(e); startPan(e); });
canvas.addEventListener('mousemove',  (e) => { continueDraw(e); continuePan(e); });
canvas.addEventListener('mouseup',    ()  => { endDraw(); endPan(); });
canvas.addEventListener('mouseleave', ()  => { endDraw(); endPan(); });

canvas.addEventListener('touchstart', startDraw,    { passive: false });
canvas.addEventListener('touchmove',  continueDraw, { passive: false });
canvas.addEventListener('touchend',   endDraw);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// Zoom
// ============================================================

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect   = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.min(20, Math.max(0.05, state.zoom * factor));
  state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
  state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  updateZoomDisplay();
  redrawBg();
  redraw();
}, { passive: false });

zoomInBtn.addEventListener('click', () => {
  state.zoom = Math.min(20, state.zoom * 1.25);
  updateZoomDisplay();
  redrawBg();
  redraw();
});

zoomOutBtn.addEventListener('click', () => {
  state.zoom = Math.max(0.05, state.zoom / 1.25);
  updateZoomDisplay();
  redrawBg();
  redraw();
});

function updateZoomDisplay() {
  zoomDisplay.textContent = Math.round(state.zoom * 100) + '%';
  updateStatus();
}

// ============================================================
// Tool selection
// ============================================================

function setActiveTool(toolName) {
  state.tool = toolName;
  penBtn.classList.toggle('active-tool',    toolName === 'pen');
  eraserBtn.classList.toggle('active-tool', toolName === 'eraser');
  canvas.style.cursor = toolName === 'eraser' ? 'cell' : 'crosshair';
  updateStatus();
}

penBtn.addEventListener('click',    () => setActiveTool('pen'));
eraserBtn.addEventListener('click', () => setActiveTool('eraser'));

// ============================================================
// Color
// ============================================================

colorPicker.addEventListener('input', (e) => {
  state.color = e.target.value;
  document.querySelectorAll('.lcars-swatch').forEach(s => s.classList.remove('active-swatch'));
  updateStatus();
});

document.querySelectorAll('.lcars-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    state.color = swatch.dataset.color;
    colorPicker.value = state.color;
    document.querySelectorAll('.lcars-swatch').forEach(s => s.classList.remove('active-swatch'));
    swatch.classList.add('active-swatch');
    updateStatus();
  });
});

// ============================================================
// Stroke width
// ============================================================

strokeWidthInput.addEventListener('input', () => {
  state.lineWidth = parseInt(strokeWidthInput.value, 10);
});

// ============================================================
// Undo / Clear
// ============================================================

undoBtn.addEventListener('click', () => {
  if (state.strokes.length === 0) return;
  state.undoStack.push(state.strokes.pop());
  redraw();
});

clearBtn.addEventListener('click', () => {
  state.strokes    = [];
  state.undoStack  = [];
  state.bgImage    = null;
  state.bgDataURL  = null;
  redrawBg();
  redraw();
});

// Keyboard undo
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    undoBtn.click();
    e.preventDefault();
  }
  // Arrow key PDF navigation
  if (state.mode === 'pdf') {
    if (e.key === 'ArrowLeft')  prevPageBtn.click();
    if (e.key === 'ArrowRight') nextPageBtn.click();
  }
});

// ============================================================
// Status line
// ============================================================

function updateStatus() {
  const tool  = state.tool === 'pen' ? 'PEN' : 'ERASER';
  const color = state.tool === 'pen' ? state.color.toUpperCase() : '—';
  const zoom  = Math.round(state.zoom * 100) + '%';
  const page  = state.mode === 'pdf' ? ` · P${state.currentPage}` : '';
  if (statusText) statusText.textContent = `${tool} · ${color} · ${zoom}${page}`;
}

// ============================================================
// Start screen → App
// ============================================================

function showApp() {
  startScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  requestAnimationFrame(() => {
    resizeCanvas();
    updateStatus();
  });
}

function showStartScreen() {
  appEl.classList.add('hidden');
  startScreen.classList.remove('hidden');
  // Reset state
  state.strokes     = [];
  state.undoStack   = [];
  state.bgImage     = null;
  state.bgDataURL   = null;
  state.pdfDoc      = null;
  state.pdfStrokes  = {};
  state.currentPage = 1;
  state.totalPages  = 0;
  state.zoom        = 1;
  state.panX        = 0;
  state.panY        = 0;
  appEl.classList.remove('mode-pdf');
}

function setMode(modeName) {
  state.mode = modeName;
  const wbImport  = document.getElementById('wb-import-controls');
  const pdfCtrl   = document.getElementById('pdf-controls');
  const wbPdfBtn  = document.getElementById('export-wb-pdf-btn');
  const annotBtn  = document.getElementById('export-annotated-pdf-btn');

  if (modeName === 'pdf') {
    if (wbImport)  wbImport.style.display  = 'none';
    if (wbPdfBtn)  wbPdfBtn.style.display  = 'none';
    appEl.classList.add('mode-pdf');
  } else {
    if (wbImport)  wbImport.style.display  = '';
    if (wbPdfBtn)  wbPdfBtn.style.display  = '';
    appEl.classList.remove('mode-pdf');
  }
}

modeWhiteboardBtn.addEventListener('click', () => {
  setMode('whiteboard');
  showApp();
});

modePdfBtn.addEventListener('click', () => {
  setMode('pdf');
  showApp();
});

backBtn.addEventListener('click', showStartScreen);

// ============================================================
// Import image
// ============================================================

importImageBtn.addEventListener('click', () => fileImageInput.click());
loadPdfBtn.addEventListener('click',     () => filePdfInput.click());
openJsonBtn.addEventListener('click',    () => fileJsonInput.click());

fileImageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => loadBackgroundImage(ev.target.result);
  reader.readAsDataURL(file);
  e.target.value = '';
});

// ============================================================
// Screenshot
// ============================================================

screenshotBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video  = document.createElement('video');
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      const tmp    = document.createElement('canvas');
      tmp.width    = video.videoWidth;
      tmp.height   = video.videoHeight;
      const tctx   = tmp.getContext('2d');
      tctx.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      loadBackgroundImage(tmp.toDataURL('image/png'));
    };
  } catch (err) {
    console.error('Screenshot failed:', err);
  }
});

// ============================================================
// PDF loading
// ============================================================

async function loadPDF(file) {
  const buf = await file.arrayBuffer();
  state.pdfDoc      = await pdfjsLib.getDocument({ data: buf }).promise;
  state.totalPages  = state.pdfDoc.numPages;
  state.currentPage = 1;
  state.pdfStrokes  = {};
  state.strokes     = [];
  state.undoStack   = [];
  state.bgImage     = null;
  state.bgDataURL   = null;
  await renderPdfPage(1);
}

async function renderPdfPage(pageNum) {
  const page     = await state.pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  const tmp      = document.createElement('canvas');
  tmp.width      = viewport.width;
  tmp.height     = viewport.height;
  const tctx     = tmp.getContext('2d');
  await page.render({ canvasContext: tctx, viewport }).promise;
  loadBackgroundImage(tmp.toDataURL('image/png'));
  pageLabel.textContent = `${pageNum} / ${state.totalPages}`;
  updateStatus();
}

async function switchToPdfPage(newPage) {
  if (!state.pdfDoc) return;
  if (newPage < 1 || newPage > state.totalPages) return;
  // Save current page strokes
  state.pdfStrokes[state.currentPage] = [...state.strokes];
  // Load new page
  state.currentPage = newPage;
  state.strokes     = state.pdfStrokes[newPage] ? [...state.pdfStrokes[newPage]] : [];
  state.undoStack   = [];
  state.zoom        = 1;
  state.panX        = 0;
  state.panY        = 0;
  await renderPdfPage(newPage);
  redraw();
}

filePdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadPDF(file);
  e.target.value = '';
});

prevPageBtn.addEventListener('click', () => switchToPdfPage(state.currentPage - 1));
nextPageBtn.addEventListener('click', () => switchToPdfPage(state.currentPage + 1));

// ============================================================
// Composite helper (bg + strokes merged onto one canvas)
// ============================================================

function compositeCanvas() {
  const tmp    = document.createElement('canvas');
  tmp.width    = canvas.width;
  tmp.height   = canvas.height;
  const tctx   = tmp.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, tmp.width, tmp.height);
  tctx.drawImage(bgCanvas, 0, 0);
  tctx.drawImage(canvas,   0, 0);
  return tmp;
}

// ============================================================
// Export: PNG
// ============================================================

exportPngBtn.addEventListener('click', () => {
  const tmp = compositeCanvas();
  tmp.toBlob(blob => {
    downloadBlob(blob, 'lcars-whiteboard.png');
  }, 'image/png');
});

// ============================================================
// Export: SVG
// ============================================================

exportSvgBtn.addEventListener('click', () => {
  const w = canvas.width;
  const h = canvas.height;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n`;
  svg += `<rect width="${w}" height="${h}" fill="white"/>\n`;

  if (state.bgDataURL) {
    svg += `<image href="${state.bgDataURL}" x="${state.panX}" y="${state.panY}" ` +
           `width="${(state.bgImage ? state.bgImage.naturalWidth : w) * state.zoom}" ` +
           `height="${(state.bgImage ? state.bgImage.naturalHeight : h) * state.zoom}"/>\n`;
  }

  for (const stroke of state.strokes) {
    if (stroke.points.length < 2) continue;
    const pts = stroke.points.map(p => {
      const sx = p.x * state.zoom + state.panX;
      const sy = p.y * state.zoom + state.panY;
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    }).join(' ');
    const op = stroke.tool === 'eraser' ? ' opacity="0"' : '';
    svg += `<polyline points="${pts}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth * state.zoom}" ` +
           `fill="none" stroke-linecap="round" stroke-linejoin="round"${op}/>\n`;
  }

  svg += `</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  downloadBlob(blob, 'lcars-whiteboard.svg');
});

// ============================================================
// Export: PDF (whiteboard — single page snapshot)
// ============================================================

exportWbPdfBtn.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const tmp     = compositeCanvas();
  const dataURL = tmp.toDataURL('image/png');
  const pdf     = new jsPDF({
    orientation: tmp.width > tmp.height ? 'landscape' : 'portrait',
    unit:        'px',
    format:      [tmp.width, tmp.height],
  });
  pdf.addImage(dataURL, 'PNG', 0, 0, tmp.width, tmp.height);
  pdf.save('lcars-whiteboard.pdf');
});

// ============================================================
// Export: PDF★ (annotated — renders each PDF page with strokes)
// ============================================================

exportAnnotPdfBtn.addEventListener('click', async () => {
  if (!state.pdfDoc) {
    alert('No PDF loaded.');
    return;
  }

  // Save current page
  state.pdfStrokes[state.currentPage] = [...state.strokes];

  const { jsPDF } = window.jspdf;
  const SCALE = 2;
  let pdf = null;

  for (let pg = 1; pg <= state.totalPages; pg++) {
    const page     = await state.pdfDoc.getPage(pg);
    const viewport = page.getViewport({ scale: SCALE });
    const tmp      = document.createElement('canvas');
    tmp.width      = viewport.width;
    tmp.height     = viewport.height;
    const tctx     = tmp.getContext('2d');

    // Render PDF page
    await page.render({ canvasContext: tctx, viewport }).promise;

    // Draw this page's strokes
    const pgStrokes = state.pdfStrokes[pg] || [];
    tctx.save();
    tctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    for (const stroke of pgStrokes) {
      if (stroke.points.length < 2) continue;
      tctx.beginPath();
      tctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        tctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      tctx.strokeStyle = stroke.color;
      tctx.lineWidth   = stroke.lineWidth;
      tctx.lineCap     = 'round';
      tctx.lineJoin    = 'round';
      if (stroke.tool === 'eraser') {
        tctx.globalCompositeOperation = 'destination-out';
      } else {
        tctx.globalCompositeOperation = 'source-over';
      }
      tctx.stroke();
    }
    tctx.globalCompositeOperation = 'source-over';
    tctx.restore();

    const pageDataURL = tmp.toDataURL('image/png');

    if (!pdf) {
      pdf = new jsPDF({
        orientation: tmp.width > tmp.height ? 'landscape' : 'portrait',
        unit:        'px',
        format:      [tmp.width, tmp.height],
      });
    } else {
      pdf.addPage([tmp.width, tmp.height],
        tmp.width > tmp.height ? 'landscape' : 'portrait');
    }
    pdf.addImage(pageDataURL, 'PNG', 0, 0, tmp.width, tmp.height);
  }

  if (pdf) pdf.save('lcars-annotated.pdf');
});

// ============================================================
// Save / Load JSON
// ============================================================

saveJsonBtn.addEventListener('click', () => {
  let data;
  if (state.mode === 'whiteboard') {
    data = {
      mode:         'whiteboard',
      strokes:      state.strokes,
      zoom:         state.zoom,
      panX:         state.panX,
      panY:         state.panY,
      bgImageDataURL: state.bgDataURL || null,
    };
  } else {
    // Save current page before export
    state.pdfStrokes[state.currentPage] = [...state.strokes];
    data = {
      mode:        'pdf',
      pdfStrokes:  state.pdfStrokes,
      totalPages:  state.totalPages,
      currentPage: state.currentPage,
      zoom:        state.zoom,
      panX:        state.panX,
      panY:        state.panY,
    };
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'lcars-whiteboard.json');
});

fileJsonInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.mode === 'pdf') {
        state.mode       = 'pdf';
        state.pdfStrokes = data.pdfStrokes || {};
        state.totalPages = data.totalPages || 0;
        state.currentPage = data.currentPage || 1;
        state.strokes    = state.pdfStrokes[state.currentPage] || [];
        state.zoom       = data.zoom  || 1;
        state.panX       = data.panX  || 0;
        state.panY       = data.panY  || 0;
        appEl.classList.add('mode-pdf');
        pageLabel.textContent = `${state.currentPage} / ${state.totalPages}`;
      } else {
        state.mode    = 'whiteboard';
        state.strokes = data.strokes || [];
        state.zoom    = data.zoom    || 1;
        state.panX    = data.panX    || 0;
        state.panY    = data.panY    || 0;
        appEl.classList.remove('mode-pdf');
        if (data.bgImageDataURL) {
          loadBackgroundImage(data.bgImageDataURL);
        } else {
          state.bgImage   = null;
          state.bgDataURL = null;
          redrawBg();
        }
      }
      updateZoomDisplay();
      redraw();
      updateStatus();
    } catch (err) {
      console.error('Failed to load JSON:', err);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ============================================================
// Download helper
// ============================================================

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ============================================================
// Init
// ============================================================

requestAnimationFrame(() => {
  resizeCanvas();
  updateStatus();
});
