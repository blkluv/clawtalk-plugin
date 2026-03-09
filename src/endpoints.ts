/**
 * Re-export from SDK. All endpoint definitions now live in the SDK.
 * @deprecated Import from './lib/clawtalk-sdk/index.js' instead.
 */

export type { Endpoint, HttpMethod } from './lib/clawtalk-sdk/endpoints.js';
export {
  ENDPOINTS,
  IMPLEMENTED_ENDPOINTS,
  READ_ENDPOINTS,
  resolve,
  UNIMPLEMENTED_ENDPOINTS,
} from './lib/clawtalk-sdk/endpoints.js';
