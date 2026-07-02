/**
 * Debug session ingest (ae385d) — remove after verification.
 */
const DEBUG_ENDPOINT = 'http://127.0.0.1:7874/ingest/ec73ff5a-ae71-42e8-8767-29ef7fd05713';
const DEBUG_SESSION = 'ae385d';

/**
 * @param {string} location
 * @param {string} message
 * @param {Object} data
 * @param {string} hypothesisId
 * @param {string} [runId]
 */
export function debugIngest(location, message, data = {}, hypothesisId = '', runId = 'pre-fix') {
  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': DEBUG_SESSION,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION,
      location,
      message,
      data,
      hypothesisId,
      runId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
