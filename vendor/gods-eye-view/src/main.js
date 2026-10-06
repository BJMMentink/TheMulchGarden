import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { loadStandaloneRuntimeSettings } from './standalone/runtimeSettings.js';

let application;

async function initializeApplication() {
  try {
    const loaderStatus = document.querySelector(
      '#loading-screen .loader-status',
    );
    if (loaderStatus)
      loaderStatus.textContent = 'Loading your saved settings...';
    const { keys, warning } = await loadStandaloneRuntimeSettings();
    if (warning) {
      console.warn(`[God’s Eye] ${warning}`);
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = warning;
        toast.classList.add('visible');
        window.setTimeout(() => toast.classList.remove('visible'), 9000);
      }
    }
    application = createStandaloneApplication({
      googleApiKey: keys.googleMapsApiKey,
      cesiumToken: keys.cesiumIonToken,
      allowQaRegistration: import.meta.env.DEV,
    });
    await application.start();
  } catch (error) {
    console.error("God's Eye View initialization failed:", error);
    const loaderStatus = document.querySelector(
      '#loading-screen .loader-status',
    );
    if (loaderStatus) {
      loaderStatus.textContent = `Error: ${describeError(error)}`;
      loaderStatus.style.color = '#ff4444';
    }
  }
}

void initializeApplication();

export { application };
