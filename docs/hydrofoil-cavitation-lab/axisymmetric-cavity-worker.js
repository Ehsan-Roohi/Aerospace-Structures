'use strict';
importScripts('axisymmetric.js', 'axisymmetric-cavity.js');
self.onmessage = function (event) {
  let iterator;
  try { iterator = self.AxisymmetricCavity.iterate(event.data); }
  catch (error) { self.postMessage({type:'error', message:error.message}); return; }
  function advance() {
    try {
      const next = iterator.next();
      if (next.done) self.postMessage({type:'result', result:next.value});
      else { self.postMessage({type:'progress', row:next.value}); setTimeout(advance, 0); }
    } catch (error) { self.postMessage({type:'error', message:error.message}); }
  }
  advance();
};
