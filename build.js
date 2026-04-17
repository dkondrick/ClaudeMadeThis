#!/usr/bin/env node
/* ============================================================
   build.js — Produces a standalone dist/index.html (no external deps)
   Inlines pdfjs, jspdf, and renderer.js with no external deps.
   ============================================================ */

const fs   = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);

// Read sources
const css      = fs.readFileSync(path.join(root, 'styles.css'),    'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'),   'utf8');
const jspdf    = fs.readFileSync(path.join(root, 'node_modules/jspdf/dist/jspdf.umd.min.js'), 'utf8');
const pdfjs    = fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/build/pdf.min.js'), 'utf8');
const worker   = fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'), 'utf8');

// Patch renderer: replace workerSrc file path with inline Blob URL
const workerSetup = `(function(){
  if (typeof pdfjsLib !== 'undefined') {
    var blob = new Blob([${JSON.stringify(worker)}], { type: 'application/javascript' });
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  }
})();`;

const patched = renderer.replace(
  `if (typeof pdfjsLib !== 'undefined') {\n  pdfjsLib.GlobalWorkerOptions.workerSrc =\n    './node_modules/pdfjs-dist/build/pdf.worker.min.js';\n}`,
  workerSetup
);

// Read the HTML template and inline everything
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LCARS WHITEBOARD</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Antonio:wght@400;700&display=swap" rel="stylesheet">
  <style>
${css}
  </style>
</head>
<body>

  <!-- =====================================================
       START SCREEN
       ===================================================== -->
  <div id="start-screen">

    <div class="lcars-top-bar">
      <div class="lcars-elbow-tl"></div>
      <div class="lcars-top-title">
        LCARS WHITEBOARD
        <span class="lcars-version">v1.0</span>
      </div>
      <div class="lcars-top-bar-fill"></div>
    </div>

    <div class="lcars-start-body">

      <div class="lcars-left-bar">
        <div class="lcars-seg" style="background:var(--lcars-orange);flex:3"></div>
        <div class="lcars-seg" style="background:var(--lcars-purple);flex:1"></div>
        <div class="lcars-seg" style="background:var(--lcars-blue);flex:4"></div>
        <div class="lcars-seg" style="background:var(--lcars-red);flex:1"></div>
        <div class="lcars-seg" style="background:var(--lcars-orange);flex:2"></div>
        <div class="lcars-seg" style="background:var(--lcars-lblue);flex:1"></div>
        <div class="lcars-seg" style="background:var(--lcars-purple);flex:3"></div>
      </div>

      <div class="lcars-start-center">
        <div class="lcars-start-status">SELECT OPERATING MODE</div>

        <div class="lcars-mode-cards">
          <button id="mode-whiteboard" class="lcars-mode-btn lcars-mode-btn--orange">
            <span class="lcars-mode-icon">✏</span>
            <span class="lcars-mode-label">WHITEBOARD</span>
            <span class="lcars-mode-sub">FREEHAND DRAWING</span>
          </button>
          <button id="mode-pdf" class="lcars-mode-btn lcars-mode-btn--purple">
            <span class="lcars-mode-icon">📄</span>
            <span class="lcars-mode-label">PDF ANNOTATOR</span>
            <span class="lcars-mode-sub">DOCUMENT MARKUP</span>
          </button>
        </div>

        <div class="lcars-start-footer">
          <div class="lcars-blink-dot"></div>
          <span>SYSTEM READY</span>
          <div class="lcars-seg-row">
            <div class="lcars-micro-seg" style="background:var(--lcars-orange)"></div>
            <div class="lcars-micro-seg" style="background:var(--lcars-blue)"></div>
            <div class="lcars-micro-seg" style="background:var(--lcars-purple)"></div>
          </div>
        </div>
      </div>

      <div class="lcars-right-bar">
        <div class="lcars-seg" style="background:var(--lcars-blue);flex:2"></div>
        <div class="lcars-seg" style="background:var(--lcars-lblue);flex:1"></div>
        <div class="lcars-seg" style="background:var(--lcars-purple);flex:3"></div>
        <div class="lcars-seg" style="background:var(--lcars-red);flex:1"></div>
        <div class="lcars-seg" style="background:var(--lcars-orange);flex:4"></div>
        <div class="lcars-seg" style="background:var(--lcars-blue);flex:1"></div>
        <div class="lcars-seg" style="background:var(--lcars-tan);flex:2"></div>
      </div>

    </div>

    <div class="lcars-bottom-bar">
      <div class="lcars-bottom-bar-fill"></div>
      <div class="lcars-elbow-br"></div>
    </div>

  </div>


  <!-- =====================================================
       APP SCREEN
       ===================================================== -->
  <div id="app" class="hidden">

    <header class="lcars-app-topbar">
      <div class="lcars-elbow-tl-sm"></div>
      <div class="lcars-topbar-center">
        <span class="lcars-topbar-label">LCARS WHITEBOARD</span>
        <div class="lcars-zoom-group">
          <button id="zoom-out" class="lcars-btn lcars-btn--blue lcars-btn--sm">&#8722;</button>
          <span id="zoom-display" class="lcars-zoom-display">100%</span>
          <button id="zoom-in"  class="lcars-btn lcars-btn--blue lcars-btn--sm">+</button>
        </div>
      </div>
      <div class="lcars-topbar-right-cap"></div>
    </header>

    <aside class="lcars-sidebar">

      <div class="lcars-sidebar-top-strip"></div>

      <div class="lcars-sidebar-group">
        <div class="lcars-group-label">TOOLS</div>
        <button id="pen-btn"    class="lcars-btn lcars-btn--orange lcars-btn--wide active-tool">PEN</button>
        <button id="eraser-btn" class="lcars-btn lcars-btn--blue   lcars-btn--wide">ERASER</button>
      </div>

      <div class="lcars-sidebar-divider" style="background:var(--lcars-orange)"></div>

      <div class="lcars-sidebar-group">
        <div class="lcars-group-label">COLOR</div>
        <div class="lcars-color-swatches">
          <button class="lcars-swatch active-swatch" style="background:#000000" data-color="#000000" title="Black"></button>
          <button class="lcars-swatch" style="background:#ffffff;border-color:#555" data-color="#ffffff" title="White"></button>
          <button class="lcars-swatch" style="background:#FF9900" data-color="#FF9900" title="LCARS Orange"></button>
          <button class="lcars-swatch" style="background:#9999FF" data-color="#9999FF" title="LCARS Blue"></button>
          <button class="lcars-swatch" style="background:#CC88FF" data-color="#CC88FF" title="LCARS Purple"></button>
          <button class="lcars-swatch" style="background:#FF6666" data-color="#FF6666" title="LCARS Red"></button>
          <button class="lcars-swatch" style="background:#99CCFF" data-color="#99CCFF" title="LCARS Lt Blue"></button>
          <button class="lcars-swatch" style="background:#FFCC99" data-color="#FFCC99" title="LCARS Tan"></button>
        </div>
        <label class="lcars-color-custom-label" for="color-picker">
          CUSTOM
          <input type="color" id="color-picker" value="#000000">
        </label>
      </div>

      <div class="lcars-sidebar-divider" style="background:var(--lcars-purple)"></div>

      <div class="lcars-sidebar-group">
        <div class="lcars-group-label">STROKE WIDTH</div>
        <input type="range" id="stroke-width" class="lcars-slider" min="1" max="40" value="3">
      </div>

      <div class="lcars-sidebar-divider" style="background:var(--lcars-blue)"></div>

      <div id="wb-import-controls" class="lcars-sidebar-group">
        <div class="lcars-group-label">IMPORT</div>
        <button id="import-image-btn" class="lcars-btn lcars-btn--orange lcars-btn--wide">IMAGE</button>
        <button id="screenshot-btn" class="lcars-btn lcars-btn--blue lcars-btn--wide">SCREENSHOT</button>
      </div>

      <div class="lcars-sidebar-divider" style="background:var(--lcars-red)"></div>

      <div id="pdf-controls" class="lcars-sidebar-group">
        <div class="lcars-group-label">PDF</div>
        <button id="load-pdf-btn" class="lcars-btn lcars-btn--orange lcars-btn--wide">LOAD PDF</button>
        <div class="lcars-page-nav">
          <button id="prev-page-btn" class="lcars-btn lcars-btn--blue lcars-btn--half">&#8592;</button>
          <span id="page-label" class="lcars-page-label">1 / 1</span>
          <button id="next-page-btn" class="lcars-btn lcars-btn--blue lcars-btn--half">&#8594;</button>
        </div>
      </div>

      <div class="lcars-sidebar-group">
        <button id="open-json-btn" class="lcars-btn lcars-btn--purple lcars-btn--wide">OPEN JSON</button>
      </div>

      <div class="lcars-sidebar-spacer"></div>

      <div class="lcars-sidebar-status">
        <div class="lcars-blink-dot"></div>
        <span id="status-text">PEN &#xB7; #000000 &#xB7; 100%</span>
      </div>

      <div class="lcars-sidebar-bottom-cap"></div>

    </aside>

    <main class="lcars-canvas-area">
      <canvas id="canvas"></canvas>
    </main>

    <footer class="lcars-bottom-toolbar">
      <div class="lcars-bottom-left-cap"></div>
      <div class="lcars-export-group">
        <button id="export-png-btn"           class="lcars-btn lcars-btn--orange">PNG</button>
        <button id="export-svg-btn"           class="lcars-btn lcars-btn--orange">SVG</button>
        <button id="export-wb-pdf-btn"        class="lcars-btn lcars-btn--orange">PDF</button>
        <button id="export-annotated-pdf-btn" class="lcars-btn lcars-btn--purple">PDF&#x2605;</button>
      </div>
      <div class="lcars-bottom-divider"></div>
      <div class="lcars-action-group">
        <button id="save-json-btn" class="lcars-btn lcars-btn--blue">SAVE</button>
        <button id="undo-btn"      class="lcars-btn lcars-btn--blue">UNDO</button>
        <button id="clear-btn"     class="lcars-btn lcars-btn--red">CLEAR</button>
        <button id="back-btn"      class="lcars-btn lcars-btn--purple">&#x2962; HOME</button>
      </div>
      <div class="lcars-bottom-right-cap"></div>
    </footer>

    <!-- Hidden file inputs — triggered via JS .click() -->
    <input type="file" id="file-image-input" accept="image/*">
    <input type="file" id="file-pdf-input"   accept="application/pdf">
    <input type="file" id="file-json-input"  accept=".json">

  </div>

  <script>
${pdfjs}
  </script>
  <script>
${jspdf}
  </script>
  <script>
${patched}
  </script>
</body>
</html>`;

const outPath = path.join(dist, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');
// Keep whiteboard.html alias for backwards compat
fs.writeFileSync(path.join(dist, 'whiteboard.html'), html, 'utf8');
const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
console.log(`Built: ${outPath} (${size} MB)`);
