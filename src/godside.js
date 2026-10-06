import { getGodsideAppConfig } from './storage.js';

const KEY_GUIDE = [
  ['Google Maps', 'Adds photorealistic 3D and place search. Google requires billing. Photorealistic 3D currently includes 1,000 billable tile events/month; further tile events can be billed. Its published daily root-tile quota is not a monthly spend cap, so leave this key empty for a guaranteed $0 baseline.'],
  ['OpenAI', 'The upstream local app can use this for voice control and AI summaries. OpenAI API usage is billed. The key stays server-side, but hosted Cloudflare voice is not connected yet, so saving a key there will not turn voice on.'],
  ['AISStream', 'AISStream advertises free access, but its public docs do not establish formal service/data terms. This Mulch Garden integration saves the key but does not yet connect it to an account-isolated live stream.'],
  ['NASA FIRMS', 'A free NASA map key authenticates active-fire detections and has request limits. The hosted Cloudflare fire route is not connected yet; saving this key alone will not show fires there.'],
  ['TomTom', 'A TomTom key can add live traffic instead of simulation in the local app. Its free plan has a finite request allowance and paid plans can charge. The hosted Cloudflare page currently uses the no-key simulation; saving a TomTom key alone will not enable live flow.'],
  ['Cesium ion', 'Adds Cesium-hosted imagery and terrain, including Google 3D. Community is free only for eligible individual personal/non-commercial use, with finite quotas. Confirm with Cesium before using one token in a multi-user website; commercial or external use may require a paid plan.'],
  ['OpenSky', 'Optional OpenSky credentials are for authenticated polling in the local companion. The hosted no-key flight layer uses the public ADSB.lol regional feed instead; saving an OpenSky key does not currently change that hosted route. OpenSky use is restricted to research/non-commercial purposes unless the provider grants permission.'],
  ['Launch Library', 'A token is optional: the public launch feed works without one and currently permits 15 unauthenticated requests/hour. The hosted route caches it for 15 minutes and does not use a saved token.'],
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
          <p><strong>Start keyless:</strong> the hosted baseline uses Esri/OpenStreetMap imagery, a built-in traffic simulation, and public earthquake, satellite, aircraft, launch, and cyclone feeds. Turn on only the layers you want; they do not all start polling just because the page opened. Public services can impose rate limits, attribution, personal-use, or other terms. Some other public feeds work only in the local companion; the section below calls those out.</p>
          <ul>${guideItems(KEY_GUIDE)}</ul>
          <p>With no keys entered, the keyless globe and public feeds remain available. No provider is guaranteed free forever: public sources can have fair-use, attribution, non-commercial, or rate-limit conditions. Provider charges, if you add an optional paid key, go to that provider’s account—not Cloudflare.</p>
        </div>
      </details>
      <details class="godside-guide-section">
        <summary><span>How it works</span><span class="godside-guide-subtitle">A quick first-time tour of the globe</span></summary>
        <div class="godside-guide-content">
          <ul>
            <li><strong>Move around:</strong> drag the globe to turn it, scroll to zoom, and use the place search to jump to a location.</li>
            <li><strong>Choose what you see:</strong> use the left-side data/layer controls to show or hide feeds such as aircraft, ships, satellites, weather, or fires. Open a panel’s heading to expand it; collapse it when you want more map space. A visible control does not mean its hosted data route is connected yet; check the section below.</li>
            <li><strong>Adjust the view:</strong> use the right-side controls for map appearance, display options, and additional context. On a narrow screen, the side panels stack and can be scrolled.</li>
            <li><strong>Try it keyless first:</strong> public feeds and the globe are available without entering a key. A provider key adds only the service named beside it in POWER UP.</li>
            <li><strong>Keep CCTV on your terms:</strong> the hosted camera feed is not connected and loads no frames. In the local companion, CCTV starts off and only fetches a nearby set when you enable it; it does not fetch every catalog frame.</li>
            <li><strong>Use voice (local app only for now):</strong> the local companion can use your OpenAI key from POWER UP with browser microphone permission. Cloudflare-hosted voice is not wired yet. OpenAI usage can be billed.</li>
            <li><strong>Your keys:</strong> keys entered in POWER UP are saved encrypted to your signed-in Mulch Garden account. They are not shown again in the page or shared with another member. Google Maps and Cesium ion keys are used in your browser; server-side keys stay on the server.</li>
          </ul>
        </div>
      </details>
      <details class="godside-guide-section godside-guide-section-wide">
        <summary><span>Free vs. keyed data</span><span class="godside-guide-subtitle">What works without a key, what needs one, and why</span></summary>
        <div class="godside-guide-content">
          <p><strong>Works in the hosted page without a personal key</strong></p>
          <ul>
            <li><strong>Globe imagery and basic roads:</strong> Esri and OpenStreetMap/OpenFreeMap provide the no-key map background and road layer. Availability and fair-use terms belong to those services.</li>
            <li><strong>Built-in overlays:</strong> data centers, submarine cables, and dams ship as static app data. They need no provider key, though opening a large overlay can download a sizeable site asset.</li>
            <li><strong>Browser-sourced layers:</strong> NASA GIBS recent imagery and mapped ALPR cameras use public third-party imagery/tiles when you enable them. Mapped installations can fall back to OpenStreetMap tiles and bundled names; exact Overpass and Google Places searches are not hosted. These sources remain subject to their own coverage, browser access, and terms.</li>
            <li><strong>Traffic fallback:</strong> the layer can show its built-in OpenStreetMap/simulated fallback without TomTom. TomTom live flow is not silently enabled.</li>
            <li><strong>Earthquakes:</strong> the app reads the public USGS earthquake feed directly in the browser. No Mulch Garden data-proxy request or provider key is needed, but availability depends on USGS.</li>
            <li><strong>Satellites:</strong> CelesTrak TLE catalogs are public and need no key. The hosted route caches them for six hours; the optional dense Starlink catalog is only requested when selected.</li>
            <li><strong>Aircraft:</strong> the hosted civilian and military layers use public ADSB.lol feeds without a personal key. Civil aircraft are limited to a 250-nautical-mile area around the current globe view and cached briefly.</li>
            <li><strong>Launches:</strong> Launch Library’s public feed works without a token and is cached for 15 minutes. Its unauthenticated rate limit still applies.</li>
            <li><strong>Cyclone advisories:</strong> public NOAA/NHC active-storm positions and advisories are cached for five minutes. The hosted route does not include forecast cones or tracks.</li>
            <li><strong>Usage still counts:</strong> Cloudflare Free (checked October 2026) shares 100,000 Worker/Pages Function requests per day, not per month. An active flight layer can poll twice a minute per viewer; upstream caching reduces provider calls but not every site request. Keep unused layers off. Free-limit exhaustion can make the feed unavailable; it does not automatically enroll you in a paid plan.</li>
          </ul>
          <p><strong>Public/no-key sources that are not all wired into the hosted app yet</strong></p>
          <ul>
            <li><strong>Weather radar, wind, transit, bikeshare, fire perimeters, directions, radio, and CCTV:</strong> the local app has routes for these, but Cloudflare does not yet provide equivalent safe, bounded routes. A source being free or public does not make its hosted feed available. CCTV remains off and no hosted camera frames are fetched.</li>
            <li><strong>Local ADS-B:</strong> this depends on the visitor's own receiver hardware and browser device access; it is not a hosted public aircraft feed. Use the keyless Live Flights layer for public regional aircraft instead.</li>
            <li><strong>Other public overlays:</strong> a layer that reads a source directly in the browser may need no provider key, but its availability still depends on that source’s browser access and terms. An unavailable label means its hosted path needs more work, not that you should buy a key.</li>
          </ul>
          <p><strong>A personal key is required by these providers; a saved key does not automatically connect an unfinished hosted feed</strong></p>
          <ul>
            <li><strong>Google Maps:</strong> Google Photorealistic 3D and Google Places require a Google key; Google requires billing for Map Tiles. Leave it empty for the strict $0 baseline.</li>
            <li><strong>Cesium ion:</strong> a token authenticates Cesium-hosted terrain and imagery. Community use has eligibility rules and quotas; it is not a promise of unlimited or multi-user commercial use.</li>
            <li><strong>TomTom:</strong> its key authenticates live traffic flow/incidents. The no-key simulation works hosted, but the hosted live route is not connected; a TomTom free quota is finite and can change.</li>
            <li><strong>NASA FIRMS:</strong> a free map key authenticates active-fire data and has request limits. The hosted fire feed is not connected yet.</li>
            <li><strong>AISStream:</strong> its key authenticates a live vessel stream. It advertises free access, but review its terms and limits; the hosted stream is not connected yet.</li>
            <li><strong>OpenAI:</strong> its key is required for voice and AI summaries; API usage can be billed. Hosted voice is not connected yet. It is not needed for the map or public feeds.</li>
          </ul>
          <p><strong>Optional, not required for the hosted keyless baseline:</strong> OpenSky credentials can be used by the local companion for authenticated flight data; the hosted aircraft layer uses ADSB.lol instead. A Launch Library token is also optional. Public feeds can throttle or go offline, and optional keys never make Cloudflare pay a provider’s bill.</p>
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
