import { getGodsideAppConfig } from './storage.js';

const KEY_GUIDE = [
  ['Google Maps', 'Adds photorealistic 3D and place search. Google requires billing. Photorealistic 3D currently includes 1,000 billable tile events/month; further tile events can be billed. Its published daily root-tile quota is not a monthly spend cap, so leave this key empty for a guaranteed $0 baseline.'],
  ['OpenAI', 'Adds voice control and AI summaries. OpenAI API usage is billed. The key is used server-side for your account; the browser microphone permission is also needed for voice.'],
  ['AISStream', 'AISStream advertises free access, but its public docs do not establish formal service/data terms. This Mulch Garden integration saves the key but does not yet connect it to an account-isolated live stream.'],
  ['NASA FIRMS', 'Adds NASA active-fire detections. NASA issues free map keys with a current 5,000-transaction/10-minute limit; God’s Eye caches this layer for 30 minutes.'],
  ['TomTom', 'Adds live traffic instead of the built-in simulation. The current no-card free plan includes 200,000 Traffic Flow & Incidents vector-tile requests/month; over-limit requests return 429. Paid plans can charge.'],
  ['Cesium ion', 'Adds Cesium-hosted imagery and terrain, including Google 3D. Community is free only for eligible individual personal/non-commercial use, with finite quotas. Confirm with Cesium before using one token in a multi-user website; commercial or external use may require a paid plan.'],
  ['OpenSky', 'Adds authenticated flight polling, but OpenSky is for research and non-commercial use. Operational/commercial use may require written permission; anonymous data works without this key.'],
  ['Launch Library', 'A token is optional: the launch feed currently permits 15 free unauthenticated requests/hour. Higher access may require supporting the provider.'],
];

function guideItems(items) {
  return items.map(([title, description]) => `<li><strong>${title}.</strong> ${description}</li>`).join('');
}

export function renderGodsidePanel() {
  return `<main class="godside-page">
    <iframe class="godside-globe-frame" data-godside-globe title="God’s Eye View" loading="eager" allow="microphone" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"></iframe>
    <p class="godside-app-message" data-godside-app-message role="status" aria-live="polite" hidden></p>
    <section class="godside-guide" aria-label="God’s Eye help">
      <details class="godside-guide-section">
        <summary><span>Keys</span><span class="godside-guide-subtitle">What each key unlocks and what to know first</span></summary>
        <div class="godside-guide-content">
          <p>Open God’s Eye’s own <strong>POWER UP</strong> control to enter a key. Only add services you want. Free plans have quotas and terms; Google requires billing, and OpenAI is usage-billed. Google’s daily tile quota is not a monthly spending cap. For the strict $0 baseline, leave Google and OpenAI keys empty; check each provider’s current terms before enabling a paid or metered service.</p>
          <p><strong>Free to try without provider keys:</strong> the current keyless defaults include Esri/OSM globe maps, NOAA weather, USGS earthquakes, CelesTrak satellites, public flight feeds, and simulated traffic. The local companion also supports public camera catalogs. These do not require a paid key in this app, but public services can impose rate limits, attribution, personal-use, or other terms. Open-Meteo is used by the local companion for some cockpit weather and is free without a key only for non-commercial use, currently capped at 10,000 calls/day. NASA FIRMS and TomTom are optional free-with-limits keys; they are not needed for the basic globe.</p>
          <ul>${guideItems(KEY_GUIDE)}</ul>
          <p>With no keys entered, the keyless globe and public feeds remain available. No provider is guaranteed free forever: public sources can have fair-use, attribution, non-commercial, or rate-limit conditions. Provider charges, if you add an optional paid key, go to that provider’s account—not Cloudflare.</p>
        </div>
      </details>
      <details class="godside-guide-section">
        <summary><span>How it works</span><span class="godside-guide-subtitle">A quick first-time tour of the globe</span></summary>
        <div class="godside-guide-content">
          <ul>
            <li><strong>Move around:</strong> drag the globe to turn it, scroll to zoom, and use the place search to jump to a location.</li>
            <li><strong>Choose what you see:</strong> use the left-side data/layer controls to show or hide feeds such as aircraft, ships, satellites, weather, or fires. Open a panel’s heading to expand it; collapse it when you want more map space.</li>
            <li><strong>Adjust the view:</strong> use the right-side controls for map appearance, display options, and additional context. On a narrow screen, the side panels stack and can be scrolled.</li>
            <li><strong>Try it keyless first:</strong> public feeds and the globe are available without entering a key. A provider key adds only the service named beside it in POWER UP.</li>
            <li><strong>Keep CCTV on your terms:</strong> camera loading starts only after you turn CCTV on. The layer selects a small nearby set; it does not download every frame in the catalog. Auto-hop starts off, and live-video concurrency is capped.</li>
            <li><strong>Use voice (optional):</strong> add your own OpenAI key in POWER UP, then choose the voice control and allow microphone access when your browser asks. Voice/API usage may be billed by the provider.</li>
            <li><strong>Your keys:</strong> keys entered in POWER UP are saved encrypted to your signed-in Mulch Garden account. They are not shown again in the page or shared with another member. Google Maps and Cesium ion keys are used in your browser; server-side keys stay on the server.</li>
          </ul>
        </div>
      </details>
    </section>
  </main>`;
}

async function configureGodsideFrame(section, role) {
  const frame = section.querySelector('[data-godside-globe]');
  const message = section.querySelector('[data-godside-app-message]');
  if (!frame || !['user', 'admin'].includes(role)) return;
  try {
    const config = await getGodsideAppConfig();
    if (!config.available || !config.url) throw new Error(config.message || 'God’s Eye could not be opened. Please refresh and try again.');
    frame.src = config.url;
  } catch (error) {
    if (message) {
      message.hidden = false;
      message.textContent = error.message || 'God’s Eye could not be opened. Please refresh and try again.';
    }
  }
}

export function activateGodsidePanel(section, role) {
  if (!section || section.dataset.godsideStarted) return;
  section.dataset.godsideStarted = 'true';
  void configureGodsideFrame(section, role);
}
