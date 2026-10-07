import React from 'react';
import {AcmeDemo} from './acme/Demo';
import {DemoProps} from './types';

// THE registry: one line per product. The Demo component is looked up by the key used in src/products.json, which holds
// the rest (narration scripts, default music track, "vertical": true if the product has a phone cut).
// Root.tsx reads both; scripts/render.mjs and scripts/stills.mjs read products.json.
export const DEMOS: Record<string, React.FC<DemoProps>> = {
  Acme: AcmeDemo,
};
