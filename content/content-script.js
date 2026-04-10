/**
 * FC26 Copilot — Content script
 *
 * Bridge between background service worker and page-injected script.
 * Runs in the content script context (isolated world) on the EA web app.
 */

const MESSAGE_REQUEST = 'FC26_COPILOT_REQUEST';
const MESSAGE_RESPONSE = 'FC26_COPILOT_RESPONSE';
const SESSION_UPDATE = 'FC26_COPILOT_SESSION';
const REQUEST_TIMEOUT = 30_000;

/**
 * Inject the page script into the EA web app's page context
 */
function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/page-inject.js');
  script.type = 'module';
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  console.log('[FC26 Copilot] Page script injected');
}

/**
 * Send a request to the page script and wait for response
 * @param {string} method - EA API method name
 * @param {Object} params - method parameters
 * @returns {Promise<*>} result from page script
 */
function callPageScript(method, params) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    const handler = (event) => {
      if (
        event.source !== window ||
        event.data?.type !== MESSAGE_RESPONSE ||
        event.data?.requestId !== requestId
      ) {
        return;
      }

      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (event.data.error) {
        const err = new Error(event.data.error);
        err.status = event.data.errorCode || null;
        reject(err);
      } else {
        resolve(event.data.result);
      }
    };

    window.addEventListener('message', handler);

    window.postMessage(
      {
        type: MESSAGE_REQUEST,
        requestId,
        method,
        params: params || {},
      },
      '*'
    );

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Request timeout after ${REQUEST_TIMEOUT}ms for method: ${method}`));
    }, REQUEST_TIMEOUT);
  });
}

/**
 * Listen for session credential updates from the page script
 */
function listenForSessionUpdates() {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== SESSION_UPDATE) return;

    const { sessionId, phishingToken } = event.data;
    if (sessionId || phishingToken) {
      chrome.runtime.sendMessage({
        action: 'sessionUpdate',
        sessionId,
        phishingToken,
      });
    }
  });
}

/**
 * Listen for requests from the background service worker
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'callEA') return false;

  callPageScript(message.method, message.params)
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) => sendResponse({ success: false, error: error.message, errorCode: error.status || null }));

  // Return true to indicate async response
  return true;
});

// Notify background that content script is ready
chrome.runtime.sendMessage({ action: 'contentScriptReady' });

// Initialize
injectPageScript();
listenForSessionUpdates();

console.log('[FC26 Copilot] Content script initialized');
