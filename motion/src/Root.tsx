import React from 'react';
import {Composition} from 'remotion';
import PRODUCTS from './products.json';
import {DEMOS} from './products';
import {TIMELINES} from './timelines';
import {DemoProps, timelineOf} from './types';
import {Studio, studioDefaults, studioMetadata} from './studio/Studio';

// One composition per narration timeline (src/timelines/<tag>.json), with the id "<Product>-<tag>". The timeline's
// "script" picks the product through src/products.json, which scripts/render.mjs reads too. Theme and music are props:
//   npx remotion render src/index.ts Acme-acme out/x.mp4 --props='{"tag":"acme","theme":"dark","music":"music/my-track.mp3"}'
type ProductMeta = {scripts: string[]; music: string | null; vertical?: boolean};
const META = PRODUCTS as Record<string, ProductMeta>;
const productOf = (script: string) => Object.keys(META).find((p) => META[p].scripts.includes(script));

export const RemotionRoot: React.FC = () => (
  <>
    {Object.keys(TIMELINES).map((tag) => {
      const tl = timelineOf(tag);
      const product = tl.script ? productOf(tl.script) : undefined;
      if (!product) throw new Error(`timeline "${tag}" uses script "${tl.script}", which no product in src/products.json lists`);
      const Demo = DEMOS[product];
      if (!Demo) throw new Error(`product "${product}" is in src/products.json but has no Demo in src/products.ts`);
      const defaults: DemoProps = {tag, theme: 'light', music: META[product].music};
      // Products that support it also get a vertical (9:16) cut for phones: "<Product>-<tag>-vertical".
      return (
        <React.Fragment key={tag}>
          <Composition id={`${product}-${tag}`} component={Demo} durationInFrames={tl.total} fps={tl.fps} width={1920} height={1080}
            defaultProps={defaults} />
          {META[product].vertical && (
            <Composition id={`${product}-${tag}-vertical`} component={Demo} durationInFrames={tl.total} fps={tl.fps} width={1080} height={1920}
              defaultProps={{...defaults, format: 'vertical' as const}} />
          )}
        </React.Fragment>
      );
    })}
    {/* Studio mode: a real screen capture composed by the pipeline (node pipeline.mjs <project> --mode=studio passes all props). */}
    <Composition id="Studio" component={Studio} durationInFrames={studioDefaults.total} fps={30} width={1920} height={1080}
      defaultProps={studioDefaults} calculateMetadata={studioMetadata} />
  </>
);
