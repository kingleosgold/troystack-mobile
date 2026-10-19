// Run with: node --test mobile-app/src/utils/lazyLoad.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lazyModule, lazyComponent } from './lazyLoad.js';

test('a lazy module loads on the first read and only once', () => {
  let loads = 0;
  const mod = lazyModule(() => { loads += 1; return { documentDirectory: 'file:///docs/', shareAsync: () => 'shared' }; });
  assert.equal(loads, 0);
  assert.equal(mod.documentDirectory, 'file:///docs/');
  assert.equal(mod.shareAsync(), 'shared');
  assert.equal(loads, 1);
});

// A stand-in for React's forwardRef and createElement, enough to call the
// render function and see what it renders.
const FakeReact = {
  forwardRef: (render) => ({ render }),
  createElement: (type, props) => ({ type, props }),
};

test('a lazy component loads on the first render and renders the default export', () => {
  let loads = 0;
  const ViewShot = function ViewShot() {};
  const Lazy = lazyComponent(FakeReact, () => { loads += 1; return { __esModule: true, default: ViewShot }; });
  assert.equal(loads, 0);
  const first = Lazy.render({ options: { format: 'png' } }, null);
  assert.equal(first.type, ViewShot);
  assert.deepEqual(first.props, { options: { format: 'png' } });
  Lazy.render({}, null);
  assert.equal(loads, 1);
});

test('a lazy component passes its ref through so capture still works', () => {
  const ref = { current: null };
  const Lazy = lazyComponent(FakeReact, () => function Card() {});
  assert.equal(Lazy.render({ a: 1 }, ref).props.ref, ref);
});
