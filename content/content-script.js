/**
 * FC26 Copilot — Content script
 */

const MESSAGE_REQUEST = 'FC26_COPILOT_REQUEST';
const MESSAGE_RESPONSE = 'FC26_COPILOT_RESPONSE';
const SESSION_UPDATE = 'FC26_COPILOT_SESSION';
const SESSION_RESTORE = 'FC26_COPILOT_RESTORE';
const REQUEST_TIMEOUT = 120_000;

function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/page-inject.js');
  script.type = 'module';
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  console.log('[FC26 Copilot] Page script injected');
}

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

function listenForSessionUpdates() {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== SESSION_UPDATE) return;

    const { sessionId, phishingToken, eaBaseUrl } = event.data;
    if (sessionId || phishingToken || eaBaseUrl) {
      chrome.runtime.sendMessage({
        action: 'sessionUpdate',
        sessionId,
        phishingToken,
        eaBaseUrl,
      });
    }
  });
}

function restoreSessionFromBackground() {
  chrome.runtime.sendMessage({ action: 'getSessionRestore' }, (response) => {
    const payload = response?.payload;
    if (!payload) return;
    window.postMessage({ type: SESSION_RESTORE, ...payload }, '*');
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'callEA') {
    callPageScript(message.method, message.params)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message, errorCode: error.status || null })
      );
    return true;
  }

  if (message.action === 'callDOM') {
    callPageScript(`dom.${message.method}`, message.params)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message, data: error.data || null }));
    return true;
  }

  return false;
});

chrome.runtime.sendMessage({ action: 'contentScriptReady' });
injectPageScript();
listenForSessionUpdates();
setTimeout(restoreSessionFromBackground, 500);

console.log('[FC26 Copilot] Content script initialized');
