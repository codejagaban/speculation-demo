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
 */
function getNavigationTiming() {
  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav) return null;

  return {
    type:          nav.type,                    // 'navigate' | 'prerender' | 'back_forward'
    ttfb:          nav.responseStart - nav.requestStart,
    domLoad:       nav.domContentLoadedEventEnd - nav.startTime,
    fullLoad:      nav.loadEventEnd - nav.startTime,
    transferSize:  nav.transferSize,            // 0 if served from prerender cache
    activationType: document.prerendering
      ? 'prerendering'
      : performance.getEntriesByType('navigation')[0]?.activationStart > 0
        ? 'prerendered-activation'
        : null
  };
}

/**
 * Detects if this page was activated from a prerender using the
 * PerformanceNavigationTiming.activationStart property.
 */
function wasPrerendered() {
  const nav = performance.getEntriesByType('navigation')[0];
  return nav?.activationStart > 0;
}

/**
 * Reads how we arrived at this page and returns a descriptor object.
 */
function getArrivalInfo() {
  const nav = performance.getEntriesByType('navigation')[0];
  const prerendered = wasPrerendered();

  if (prerendered) {
    return {
      type:  'prerender',
      label: 'Arrived via Pre-render',
      desc:  'This page was silently rendered in the background before you clicked. Navigation was instant.',
      badge: 'badge-blue',
      color: 'var(--accent-2)'
    };
  }

  if (nav?.transferSize === 0 && nav?.type === 'navigate') {
    return {
      type:  'prefetch',
      label: 'Arrived via Prefetch',
      desc:  'The HTML for this page was fetched in advance. The browser skipped the network round-trip.',
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

function renderTimingPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Wait for load event to ensure all timing data is available
  const render = () => {
    const timing  = getNavigationTiming();
    const arrival = getArrivalInfo();

    if (!timing) {
      container.innerHTML = '<span class="timing-muted">Timing data not available.</span>';
      return;
    }

    const lines = [
      {
        dot: arrival.type === 'prerender' ? 'blue' : arrival.type === 'prefetch' ? 'green' : 'yellow',
        text: `Activation type: <span class="timing-val">${arrival.label}</span>`
      },
      {
        dot: 'purple',
        text: `Nav type (PerformanceNavigationTiming): <span class="timing-val">${timing.type}</span>`
      },
      {
        dot: timing.ttfb < 5 ? 'green' : 'yellow',
        text: `TTFB: <span class="timing-val">${timing.ttfb.toFixed(1)} ms</span> <span class="timing-muted">(time to first byte)</span>`
      },
      {
        dot: timing.domLoad < 50 ? 'green' : 'yellow',
        text: `DOM ready: <span class="timing-val">${timing.domLoad.toFixed(1)} ms</span>`
      },
      {
        dot: 'blue',
        text: `Full load: <span class="timing-val">${timing.fullLoad.toFixed(1)} ms</span>`
      },
      {
        dot: timing.transferSize === 0 ? 'green' : 'yellow',
        text: `Transfer size: <span class="timing-val">${timing.transferSize === 0 ? '0 bytes (cache hit ✓)' : timing.transferSize + ' bytes'}</span>`
      }
    ];

    container.innerHTML = lines.map(l => `
      <div class="timing-line" style="color:#24292f;">
        <div class="timing-dot ${l.dot}"></div>
        <span>${l.text}</span>
      </div>
    `).join('');
  };

  if (document.readyState === 'complete') {
    render();
  } else {
    window.addEventListener('load', render);
  }
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

  // If browser doesn't support speculation rules, show a notice
  if (!isSpeculationSupported()) {
    const notice = document.getElementById('no-support-notice');
    if (notice) notice.style.display = 'flex';
  }
});
