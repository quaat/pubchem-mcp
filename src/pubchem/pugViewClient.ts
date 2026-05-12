import { PugRestClient } from './pugRestClient.js';

/**
 * PUG-View shares the same request pipeline as PUG-REST. A nominal subclass
 * keeps the service layer's intent (annotation lookups) explicit at call sites.
 */
export class PugViewClient extends PugRestClient {}
