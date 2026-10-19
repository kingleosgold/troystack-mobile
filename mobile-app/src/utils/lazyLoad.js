// Metro's inline requires only defer named imports. A default or namespace
// import still loads its module when App.js loads, so the heavy ones go
// through these helpers and load the first time the app reads or renders them.

// The module's default export, or the module itself when it has none.
const defaultOf = (mod) => (mod && mod.__esModule ? mod.default : mod);

// Stands in for `import * as X from '...'`. The module loads on the first
// property read, like X.launchImageLibraryAsync or X.documentDirectory.
export function lazyModule(load) {
  let mod;
  return new Proxy({}, {
    get(_target, key) {
      if (!mod) mod = load();
      return mod[key];
    },
  });
}

// Stands in for `import X from '...'` when X is a component. It loads on the
// first render and passes a ref through, which ViewShot's capture needs.
export function lazyComponent(React, load) {
  let Loaded;
  const Lazy = React.forwardRef((props, ref) => {
    if (!Loaded) Loaded = defaultOf(load());
    return React.createElement(Loaded, ref ? { ...props, ref } : props);
  });
  return Lazy;
}
