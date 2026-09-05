import './app.css';
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app'),
});

export default app;

// PWA: registra el service worker (cache-first para estáticos)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('SW no registrado:', err);
    });
  });
}
