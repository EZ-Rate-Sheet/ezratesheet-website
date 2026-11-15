/*
 * EZ Rate Sheet marketing site analytics (GA4, consent-gated).
 *
 * - Google Analytics loads only after the visitor accepts.
 * - Consent is shared with the EZRS app (same origin) via localStorage key
 *   `ezrs.analytics.consent.v1` = {choice: "accepted"|"declined", at: <ms>}, valid 180 days.
 * - Page views are sent manually with query strings and fragments stripped
 *   (only utm_* campaign params are kept), so no personal data reaches GA.
 * - Tracks CTA clicks (Apply / Submit a Deal / Start Free Trial / Book a Call / Watch Demo).
 *   Application-start and submission events are handled by the EZRS app, not here.
 * - Any element with [data-ezrs-consent-open] reopens the banner so visitors can withdraw.
 */
(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-1C5C273R05';
  var STORAGE_KEY = 'ezrs.analytics.consent.v1';
  var MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  var KEEP_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  var gaLoaded = false;
  var banner = null;

  // ---------- consent storage ----------
  function readConsent() {
    try {
      var c = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!c || (c.choice !== 'accepted' && c.choice !== 'declined') || typeof c.at !== 'number') return null;
      if (Date.now() - c.at > MAX_AGE_MS) return null;
      return c.choice;
    } catch (e) {
      return null;
    }
  }

  function writeConsent(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice: choice, at: Date.now() }));
    } catch (e) { /* storage blocked: choice applies to this page view only */ }
  }

  // ---------- URL sanitizing ----------
  function cleanUrl(href) {
    try {
      var u = new URL(href, location.href);
      var kept = new URLSearchParams();
      KEEP_PARAMS.forEach(function (k) {
        if (u.searchParams.has(k)) kept.set(k, u.searchParams.get(k));
      });
      var qs = kept.toString();
      return u.origin + u.pathname + (qs ? '?' + qs : '');
    } catch (e) {
      return location.origin + location.pathname;
    }
  }

  function cleanPath(href) {
    try {
      var u = new URL(href, location.href);
      return u.origin === location.origin ? u.pathname : u.origin + u.pathname;
    } catch (e) {
      return '';
    }
  }

  // ---------- GA ----------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function loadGA() {
    window['ga-disable-' + MEASUREMENT_ID] = false;
    if (gaLoaded) return;
    gaLoaded = true;

    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: cleanUrl(location.href),
      page_referrer: document.referrer ? cleanUrl(document.referrer) : ''
    });
    gtag('event', 'page_view', {
      page_location: cleanUrl(location.href),
      page_referrer: document.referrer ? cleanUrl(document.referrer) : '',
      page_title: document.title
    });

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(s);
  }

  function stopGA() {
    window['ga-disable-' + MEASUREMENT_ID] = true;
    if (gaLoaded) gtag('consent', 'update', { analytics_storage: 'denied' });
    // Remove GA cookies already set on this domain
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0 || name === '_gid' || name === '_gat') {
        var host = location.hostname;
        var domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
        domains.forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  function applyChoice(choice) {
    if (choice === 'accepted') loadGA();
    else stopGA();
  }

  // ---------- CTA click tracking ----------
  function ctaType(a) {
    var href = (a.getAttribute('href') || '').toLowerCase();
    var text = (a.textContent || '').trim().toLowerCase();
    if (/submit (a )?deal/.test(text) || /submit-deal|submit_deal/.test(href)) return 'submit_deal';
    if (/\bapply\b/.test(text) || /\/apply(\/|$)|#apply/.test(href)) return 'apply';
    if (/\/app\/register|\/signup/.test(href)) return 'start_trial';
    if (/book(-onboarding|-launch-training)?(\.html)?$|#book-a-call/.test(href)) return 'book_call';
    if (/watch-demo/.test(href)) return 'watch_demo';
    return null;
  }

  document.addEventListener('click', function (e) {
    if (!gaLoaded || window['ga-disable-' + MEASUREMENT_ID]) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var type = ctaType(a);
    if (!type) return;
    gtag('event', 'cta_click', {
      cta_type: type,
      cta_text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      link_url: cleanPath(a.href),
      page_location: cleanUrl(location.href),
      transport_type: 'beacon'
    });
  }, true);

  // ---------- banner ----------
  var CSS = '' +
    '.ezrs-consent{position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:420px;' +
    'background:#2a2030;color:#faf8fa;border:1px solid rgba(232,221,233,.25);border-radius:12px;' +
    'box-shadow:0 12px 32px rgba(0,0,0,.3);padding:18px 20px;font-family:"DM Sans","Helvetica Neue",sans-serif;' +
    'font-size:14px;line-height:1.55}' +
    '.ezrs-consent p{margin:0 0 14px;color:rgba(250,248,250,.85)}' +
    '.ezrs-consent a{color:#e8dde9;text-decoration:underline}' +
    '.ezrs-consent__actions{display:flex;gap:8px;flex-wrap:wrap}' +
    '.ezrs-consent button{font:inherit;font-weight:600;border-radius:8px;padding:8px 16px;cursor:pointer;' +
    'border:1px solid rgba(232,221,233,.4);background:transparent;color:#faf8fa}' +
    '.ezrs-consent button:hover{border-color:rgba(232,221,233,.8)}' +
    '.ezrs-consent .ezrs-consent__accept{background:#6B4C6E;border-color:#6B4C6E}' +
    '.ezrs-consent .ezrs-consent__accept:hover{background:#5a3d5d}' +
    '.ezrs-consent-link{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-decoration:inherit}' +
    '@media (max-width:520px){.ezrs-consent{left:12px;right:12px;bottom:12px;max-width:none}}';

  function injectStyles() {
    if (document.getElementById('ezrs-consent-style')) return;
    var st = document.createElement('style');
    st.id = 'ezrs-consent-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function policyHref() {
    return '/pages/cookies';
  }

  function hideBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  function showBanner() {
    injectStyles();
    hideBanner();
    var current = readConsent();
    banner = document.createElement('div');
    banner.className = 'ezrs-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Analytics cookie preferences');
    banner.innerHTML =
      '<p>We use Google Analytics cookies to understand how visitors use our site. ' +
      'No personal information is collected. ' +
      (current ? 'You currently have analytics <strong>' + current + '</strong>. ' : '') +
      '<a href="' + policyHref() + '">Cookie Policy</a></p>' +
      '<div class="ezrs-consent__actions">' +
      '<button type="button" class="ezrs-consent__accept">Accept analytics</button>' +
      '<button type="button" class="ezrs-consent__decline">Decline</button>' +
      '</div>';
    banner.querySelector('.ezrs-consent__accept').addEventListener('click', function () {
      writeConsent('accepted'); applyChoice('accepted'); hideBanner();
    });
    banner.querySelector('.ezrs-consent__decline').addEventListener('click', function () {
      writeConsent('declined'); applyChoice('declined'); hideBanner();
    });
    document.body.appendChild(banner);
  }

  // "Cookie settings" link next to the footer's legal links
  function addFooterLink() {
    if (document.querySelector('footer [data-ezrs-consent-open]')) return;
    var policy = document.querySelector('footer a[href*="cookies"]');
    var container = policy ? policy.parentNode : document.querySelector('.footer-legal');
    if (!container) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ezrs-consent-link';
    btn.setAttribute('data-ezrs-consent-open', '');
    btn.textContent = 'Cookie Settings';
    if (container.tagName === 'LI' && container.parentNode) {
      var li = document.createElement('li');
      li.appendChild(btn);
      container.parentNode.insertBefore(li, container.nextSibling);
    } else {
      if (container.classList && container.classList.contains('footer-legal')) {
        var dot = document.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = '·';
        container.appendChild(dot);
      }
      container.appendChild(btn);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-ezrs-consent-open]');
    if (!t) return;
    e.preventDefault();
    showBanner();
  });

  // Keep tabs (and the EZRS app) in sync
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY) return;
    var choice = readConsent();
    if (choice) { applyChoice(choice); hideBanner(); }
  });

  function init() {
    injectStyles();
    addFooterLink();
    var choice = readConsent();
    if (choice) applyChoice(choice);
    else showBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
