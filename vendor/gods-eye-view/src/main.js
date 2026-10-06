import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';

let application;

async function initializeApplication() {
  try {
    const response = await fetch('/api/godside/runtime', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to open God’s Eye View.' : 'Could not load your provider settings.');
    const { keys = {} } = await response.json();
    application = createStandaloneApplication({
      googleApiKey: keys.googleMapsApiKey,
      cesiumToken: keys.cesiumIonToken,
      allowQaRegistration: import.meta.env.DEV,
    });
    await application.start();
  } catch (error) {
    console.error("God's Eye View initialization failed:", error);
    const loaderStatus = document.querySelector('#loading-screen .loader-status');
    if (loaderStatus) {
      loaderStatus.textContent = `Error: ${describeError(error)}`;
      loaderStatus.style.color = '#ff4444';
    }
  }
}

void initializeApplication();

export { application };
