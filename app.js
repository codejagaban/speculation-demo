/**
 * Speculation Rules API Demo — Shared JavaScript
 *
 * This script handles:
 *  1. Speculation mode toggle (add/remove speculation rules dynamically)
 *  2. Tracking which pages have been prefetched/prerendered
 *  3. Measuring and displaying navigation timing
 *  4. Communicating activation type via sessionStorage
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGES = [
  { href: 'page-a.html', label: 'Products',       speculation: 'prerender' },
  { href: 'page-b.html', label: 'Technology',     speculation: 'prerender' },
  { href: 'page-c.html', label: 'About',          speculation: 'prefetch'  },
  { href: 'page-d.html', label: 'No Speculation', speculation: 'none'      },
];

// page-d.html is deliberately excluded from all speculation rules.
// It is the "control" page — always loaded as a standard cold navigation.

const STORAGE_KEY   = 'speculation_demo_mode';   // 'on' | 'off'
const PREFETCH_KEY  = 'prefetched_pages';         // JSON array of URLs
const PRERENDER_KEY = 'prerendered_pages';        // JSON array of URLs

// ─── Utility ──────────────────────────────────────────────────────────────────

function getMode() {
  return sessionStorage.getItem(STORAGE_KEY) ?? 'on';
}

function setMode(mode) {
  sessionStorage.setItem(STORAGE_KEY, mode);
}

function isSpeculationSupported() {
  return HTMLScriptElement.supports?.('speculationrules') ?? false;
}

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

// ─── Speculation Rules Management ────────────────────────────────────────────

const SPECULATION_SCRIPT_ID = 'speculation-rules-script';

/**
 * Injects a <script type="speculationrules"> tag that tells the browser to:
 *  - prerender page-a and page-b (highest confidence, will be rendered in background)
 *  - prefetch page-c            (fetches HTML but doesn't parse/render it)
 */
function enableSpeculationRules() {
  if (document.getElementById(SPECULATION_SCRIPT_ID)) return;

  const rules = {
    prerender: [
      {
        source: 'list',
        urls: ['page-a.html', 'page-b.html'],
        eagerness: 'eager'
      }
    ],
    prefetch: [
      {
        source: 'list',
        urls: ['page-c.html'],
        eagerness: 'eager'
      }
    ]
  };

  const script = document.createElement('script');
  script.id   = SPECULATION_SCRIPT_ID;
  script.type = 'speculationrules';
  script.text = JSON.stringify(rules, null, 2);
  document.head.appendChild(script);

  // After a short delay, mark nav links as prefetched/prerendered
  setTimeout(updateNavBadges, 1200);
}

/**
 * Removes the speculation rules script tag, cancelling any pending
 * prefetches/prerenders the browser hasn't committed to yet.
 */
function disableSpeculationRules() {
  const el = document.getElementById(SPECULATION_SCRIPT_ID);
  if (el) el.remove();
  clearNavBadges();
}

// ─── Navigation Badge Updates ─────────────────────────────────────────────────

function updateNavBadges() {
  if (!isSpeculationSupported() || getMode() !== 'on') return;

  // Pages we declared for prerender/prefetch
  const prerendered = ['page-a.html', 'page-b.html'];
  const prefetched  = ['page-c.html'];

  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (prerendered.includes(href)) {
      link.classList.remove('prefetched');
      link.classList.add('prerendered');
      link.title = 'Pre-rendered in background ✓';
    } else if (prefetched.includes(href)) {
      link.classList.remove('prerendered');
      link.classList.add('prefetched');
      link.title = 'Prefetched in background ✓';
    }
  });

  // Log to console for visibility
  console.groupCollapsed('[Speculation Rules] Active');
  console.log('%cPre-rendered:', 'color:#0891b2;font-weight:bold', prerendered);
  console.log('%cPrefetched:',   'color:#16a34a;font-weight:bold', prefetched);
  console.groupEnd();
}

function clearNavBadges() {
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.classList.remove('prefetched', 'prerendered');
    link.title = '';
  });
}

// ─── Navigation Timing ────────────────────────────────────────────────────────

/**
 * Uses the Navigation Timing API (PerformanceNavigationTiming) to
 * report how the current page was loaded and how long it took.
 *
 * Key fields from the MDN spec:
 *   activationStart  — time between prerender start and user activation (> 0 = was prerendered)
 *   deliveryType     — "navigational-prefetch" when HTML was served from prefetch cache
 *   transferSize     — 0 when no bytes were fetched over the network at activation time
 */
function getNavigationTiming() {
  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav) return null;

  return {
    type:            nav.type,            // 'navigate' | 'back_forward' | 'reload'
    ttfb:            nav.responseStart - nav.requestStart,
    domLoad:         nav.domContentLoadedEventEnd - nav.startTime,
    fullLoad:        nav.loadEventEnd - nav.startTime,
    transferSize:    nav.transferSize,
    activationStart: nav.activationStart ?? 0,
    // deliveryType is the authoritative prefetch signal per MDN:
    // "When a page is prefetched, its deliveryType will return 'navigational-prefetch'"
    deliveryType:    nav.deliveryType ?? ''
  };
}

/**
 * Canonical prerender detection from MDN:
 *   document.prerendering  → page is currently being prerendered (not yet shown)
 *   activationStart > 0    → page was prerendered and has since been activated
 */
function wasPrerendered() {
  const nav = performance.getEntriesByType('navigation')[0];
  return document.prerendering || (nav?.activationStart > 0);
}

/**
 * Canonical prefetch detection from MDN:
 *   deliveryType === "navigational-prefetch"
 *
 * NOTE: transferSize === 0 is NOT a reliable prefetch signal — it also fires for
 * HTTP-cached pages and prerendered pages. deliveryType is the correct check.
 */
function wasPrefetched() {
  const nav = performance.getEntriesByType('navigation')[0];
  return nav?.deliveryType === 'navigational-prefetch';
}

/**
 * Reads how we arrived at this page and returns a descriptor object.
 * Order matters: check prerender first, then prefetch, then standard.
 */
function getArrivalInfo() {
  if (wasPrerendered()) {
    return {
      type:  'prerender',
      label: 'Arrived via Pre-render',
      desc:  'This page was silently rendered in the background before you clicked. Navigation was instant.',
      badge: 'badge-blue',
      color: 'var(--accent-2)'
    };
  }

  // deliveryType === 'navigational-prefetch' is the authoritative MDN signal
  if (wasPrefetched()) {
    return {
      type:  'prefetch',
      label: 'Arrived via Prefetch',
      desc:  'The HTML was fetched in advance (deliveryType: "navigational-prefetch"). The browser skipped the network round-trip.',
      badge: 'badge-green',
      color: 'var(--success)'
    };
  }

  return {
    type:  'normal',
    label: 'Standard Navigation',
    desc:  'This page was fetched fresh when you clicked the link. No speculation rules were active.',
    badge: 'badge-gray',
    color: 'var(--text-muted)'
  };
}

// ─── Timing Display ───────────────────────────────────────────────────────────

/**
 * Renders the timing panel with context-aware labels.
 *
 * KEY DISTINCTION:
 *   For prerendered pages, PerformanceNavigationTiming metrics like
 *   "TTFB" and "DOM ready" reflect how long the BACKGROUND prerender took —
 *   NOT how long the user waited. The user's perceived wait is ~0ms.
 *
 *   For standard / prefetch pages, these metrics directly represent
 *   what the user waited for.
 */
function renderTimingPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // If on file://, speculation rules are silently ignored by the browser.
  // Inject a warning so the user knows why they might see cold-load numbers.
  if (window.location.protocol === 'file:') {
    const warn = document.createElement('div');
    warn.style.cssText = [
      'background:#fef9c3',
      'border:1px solid #fef08a',
      'border-radius:8px',
      'padding:12px 16px',
      'font-size:0.8rem',
      'color:#92400e',
      'margin-bottom:12px',
      'line-height:1.5'
    ].join(';');
    warn.innerHTML = `
      <strong>Speculation rules require HTTP/HTTPS.</strong>
      You are viewing this page via <code>file://</code>, so the browser
      will not prerender or prefetch any pages — all navigations are cold loads.
      Serve the folder with a local HTTP server to see the real difference:
      <br><br>
      <code style="background:#fef08a;padding:2px 6px;border-radius:4px;">
        npx serve .  &nbsp;or&nbsp;  python -m http.server 8080
      </code>
    `;
    container.parentNode.insertBefore(warn, container);
  }

  const render = () => {
    const nav     = performance.getEntriesByType('navigation')[0];
    const timing  = getNavigationTiming();
    const arrival = getArrivalInfo();

    if (!timing) {
      container.innerHTML = '<span class="timing-muted">Timing data not available.</span>';
      return;
    }

    // ── PRERENDERED ──────────────────────────────────────────────────────────
    // All timing fields in PerformanceNavigationTiming (TTFB, domLoad, fullLoad)
    // are measured from when the background prerender STARTED — not from your click.
    // They represent work the browser did silently; the user waited 0ms.
    //
    // The spec-correct detection signal (per MDN) is: activationStart > 0
    if (arrival.type === 'prerender') {
      const bgTtfb     = timing.ttfb.toFixed(1);
      const bgDom      = timing.domLoad.toFixed(1);
      const bgRender   = timing.fullLoad.toFixed(1);
      const activation = timing.activationStart.toFixed(1);

      container.innerHTML = `
        <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
            Detection signal (MDN spec)
          </span>
        </div>
        ${line('green',  `activationStart: <span class="timing-val">${activation} ms</span> <span class="timing-muted">— &gt; 0 confirms this page was prerendered (MDN: PerformanceNavigationTiming.activationStart)</span>`)}
        ${line('green',  `transferSize at activation: <span class="timing-val">0 bytes</span> <span class="timing-muted">— no network request fired when you clicked</span>`)}
        <div style="margin:10px 0;padding-top:10px;border-top:1px solid #e2e8f0;">
          <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
            Background work — measured from prerender start, NOT from your click
          </span>
        </div>
        ${line('blue',   `TTFB (background): <span class="timing-val">${bgTtfb} ms</span> <span class="timing-muted">— server responded during silent prerender</span>`)}
        ${line('blue',   `DOM ready (background): <span class="timing-val">${bgDom} ms</span> <span class="timing-muted">— parse &amp; render completed silently</span>`)}
        ${line('blue',   `Full load (background): <span class="timing-val">${bgRender} ms</span> <span class="timing-muted">— all resources loaded before your click</span>`)}
        <div style="margin:10px 0;padding-top:10px;border-top:1px solid #e2e8f0;">
          <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
            Your perceived wait
          </span>
        </div>
        ${line('green',  `Perceived load time: <span class="timing-val" style="font-size:1rem;">~0 ms</span> <span class="timing-muted">— page was fully rendered before you clicked</span>`)}
      `;
      return;
    }

    // ── PREFETCH ─────────────────────────────────────────────────────────────
    // Spec-correct detection signal (per MDN): deliveryType === "navigational-prefetch"
    // NOT transferSize === 0 (which is unreliable — also fires for HTTP-cached pages).
    // HTML arrived from the prefetch cache, but parse + render still run on click.
    if (arrival.type === 'prefetch') {
      container.innerHTML = `
        <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
            Detection signal (MDN spec)
          </span>
        </div>
        ${line('green',  `deliveryType: <span class="timing-val">"navigational-prefetch"</span> <span class="timing-muted">— MDN authoritative prefetch signal (PerformanceResourceTiming.deliveryType)</span>`)}
        ${line('green',  `transferSize: <span class="timing-val">0 bytes</span> <span class="timing-muted">— HTML served from prefetch cache, no network request on click</span>`)}
        ${line('green',  `activationStart: <span class="timing-val">0 ms</span> <span class="timing-muted">— not prerendered (page was not pre-rendered in background)</span>`)}
        <div style="margin:10px 0;padding-top:10px;border-top:1px solid #e2e8f0;">
          <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
            Your actual wait (parse &amp; render still run after your click)
          </span>
        </div>
        ${line('yellow', `TTFB: <span class="timing-val">${timing.ttfb.toFixed(1)} ms</span> <span class="timing-muted">— HTML read from in-memory cache</span>`)}
        ${line('yellow', `DOM ready: <span class="timing-val">${timing.domLoad.toFixed(1)} ms</span> <span class="timing-muted">— you waited for this</span>`)}
        ${line('yellow', `Full load: <span class="timing-val">${timing.fullLoad.toFixed(1)} ms</span> <span class="timing-muted">— you waited for this</span>`)}
      `;
      return;
    }

    // ── STANDARD / NO SPECULATION ────────────────────────────────────────────
    // deliveryType is empty string, activationStart is 0, transferSize > 0.
    // Every number below is something the user directly waited for.
    container.innerHTML = `
      <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #e2e8f0;">
        <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
          Detection signals (all confirm no speculation)
        </span>
      </div>
      ${line('yellow', `deliveryType: <span class="timing-val">"${timing.deliveryType || 'navigate'}"</span> <span class="timing-muted">— not "navigational-prefetch", so no prefetch cache was used</span>`)}
      ${line('yellow', `activationStart: <span class="timing-val">0 ms</span> <span class="timing-muted">— not prerendered</span>`)}
      ${line('yellow', `transferSize: <span class="timing-val">${timing.transferSize} bytes</span> <span class="timing-muted">— real bytes fetched over the network</span>`)}
      <div style="margin:10px 0;padding-top:10px;border-top:1px solid #e2e8f0;">
        <span style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
          Your actual wait (full cold fetch — everything happens after your click)
        </span>
      </div>
      ${line('yellow', `TTFB: <span class="timing-val">${timing.ttfb.toFixed(1)} ms</span> <span class="timing-muted">— waited for server response</span>`)}
      ${line('yellow', `DOM ready: <span class="timing-val">${timing.domLoad.toFixed(1)} ms</span> <span class="timing-muted">— waited for parse &amp; render</span>`)}
      ${line('yellow', `Full load: <span class="timing-val">${timing.fullLoad.toFixed(1)} ms</span> <span class="timing-muted">— waited for all resources</span>`)}
    `;
  };

  if (document.readyState === 'complete') {
    render();
  } else {
    window.addEventListener('load', render);
  }
}

/** Helper to render a single timing row */
function line(dot, text) {
  return `
    <div class="timing-line" style="color:#24292f;">
      <div class="timing-dot ${dot}"></div>
      <span>${text}</span>
    </div>
  `;
}

// ─── Arrival Banner ───────────────────────────────────────────────────────────

function showArrivalBanner(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const arrival = getArrivalInfo();
  el.className = `arrival-banner show ${arrival.type}`;
  el.innerHTML = `
    <strong>${arrival.label}:</strong>
    <span>${arrival.desc}</span>
  `;
}

// ─── Mode Toggle ──────────────────────────────────────────────────────────────

function initModeToggle() {
  const toggle = document.getElementById('speculation-toggle');
  if (!toggle) return;

  const currentMode = getMode();
  toggle.checked = currentMode === 'on';

  // Sync UI label
  updateToggleLabel(toggle.checked);

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    setMode(enabled ? 'on' : 'off');
    updateToggleLabel(enabled);

    if (enabled) {
      enableSpeculationRules();
      logEvent('Speculation Rules ENABLED', 'color:#34d399');
    } else {
      disableSpeculationRules();
      logEvent('Speculation Rules DISABLED', 'color:#f87171');
    }

    // Update the live status panel if it exists
    updateStatusPanel();
  });

  // Apply initial state
  if (currentMode === 'on') {
    enableSpeculationRules();
  }
}

function updateToggleLabel(enabled) {
  const label = document.querySelector('.toggle-label');
  if (label) {
    label.textContent = enabled ? 'Speculation: ON' : 'Speculation: OFF';
    label.style.color = enabled ? 'var(--success)' : 'var(--danger)';
  }
}

// ─── Status Panel (index page) ────────────────────────────────────────────────

function updateStatusPanel() {
  const supported = isSpeculationSupported();
  const mode      = getMode();

  const el = id => document.getElementById(id);

  setHTML('status-support', supported
    ? '<span class="status-badge badge-green">● Supported</span>'
    : '<span class="status-badge badge-red">✕ Not Supported</span>');

  setHTML('status-mode', mode === 'on'
    ? '<span class="status-badge badge-purple">● Active</span>'
    : '<span class="status-badge badge-gray">○ Inactive</span>');

  setHTML('status-prerender', mode === 'on' && supported
    ? '<span class="status-badge badge-blue">⚡ page-a.html, page-b.html</span>'
    : '<span class="status-badge badge-gray">—</span>');

  setHTML('status-prefetch', mode === 'on' && supported
    ? '<span class="status-badge badge-green">↓ page-c.html</span>'
    : '<span class="status-badge badge-gray">—</span>');
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ─── Console Logging ──────────────────────────────────────────────────────────

function logEvent(msg, style = 'color:#6366f1') {
  console.log(`%c[Speculation Demo] ${msg}`, `${style};font-weight:bold`);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Mark active nav link
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (link.getAttribute('href') === currentPage()) {
      link.classList.add('active');
    }
  });

  // Set up toggle
  initModeToggle();

  // Update status panel (home page only)
  updateStatusPanel();

  // Show arrival banner (inner pages)
  showArrivalBanner('arrival-banner');

  // Render timing panel (inner pages)
  renderTimingPanel('timing-display');

  // Log arrival
  const arrival = getArrivalInfo();
  logEvent(`Page loaded — ${arrival.label}`, arrival.type === 'prerender' ? 'color:#0891b2' : 'color:#475569');

  // If on file://, show a warning that speculation rules won't fire
  if (window.location.protocol === 'file:') {
    const fileNotice = document.getElementById('file-protocol-notice');
    if (fileNotice) fileNotice.style.display = 'flex';
  }

  // If browser doesn't support speculation rules, show a notice
  if (!isSpeculationSupported()) {
    const notice = document.getElementById('no-support-notice');
    if (notice) notice.style.display = 'flex';
  }
});
