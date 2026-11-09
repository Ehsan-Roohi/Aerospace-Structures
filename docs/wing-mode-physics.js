/* Explain existing mode animations. Does not alter the structural solver or modal data. */
(() => {
  'use strict';
  const textFor = (label, fullScale) => {
    const twist = /twist|torsion|^T\d/i.test(label);
    const higher = /(?:bend(?:ing)?\s*|^B)[2-9]/i.test(label);
    if (twist) return ['Torsional mode', 'The cross-sections rotate about the wing reference axis. Torsional stiffness resists this rotation; distributed rotational inertia carries it through equilibrium. Watch the leading and trailing edges: they move in opposite vertical directions during twist. Higher torsional modes can reverse rotation direction along the span.'];
    if (higher) return ['Higher bending mode', 'The wing still bends, but different span regions can move in opposite directions at the same instant. An internal node is a location with zero transverse motion in this particular mode; it is not another support. In a standard cantilever, the second bending mode has one internal displacement node. The computed shape, mass distribution and boundary conditions determine its actual position.'];
    if (fullScale) return ['First bending mode', 'The outboard wing bends away from equilibrium. Its displacement is fixed at the fuselage fitting; bending rotation there is either restrained by a spring representing centre-section flexibility, or clamped, according to the selected support model. Elastic curvature provides restoring moments and mass supplies inertia. Follow the computed shape rather than assuming every root rotation is zero.'];
    return ['First bending mode', 'The wing bends away from equilibrium while the clamped root stays fixed. In the usual first cantilever bending mode, the span moves to the same side together. Elastic curvature creates restoring bending moments; the wing mass carries the motion past equilibrium, so it bends back to the other side.'];
  };
  function install() {
    const players = ['modeplayer', 'mModePlayer'].map(id => document.getElementById(id)).filter(Boolean);
    if (!players.length) return;
    const style = document.createElement('style');
    style.textContent = '.wm-physics{box-sizing:border-box;width:min(700px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:85vh;overflow:auto;border:1px solid #64748b;border-radius:12px;padding:22px;background:var(--panel,#fff);color:var(--fg,#16263a);font:16px/1.55 system-ui,sans-serif}.wm-physics::backdrop{background:rgb(0 0 0/.45)}.wm-physics h2{font-size:22px;margin:0 0 8px}.wm-physics h3{font-size:17px;margin:14px 0 5px}.wm-physics p{margin:5px 0 12px}.wm-physics .wm-equation{font-family:Cambria,"Times New Roman",serif;font-size:20px;text-align:center;margin:14px 0}.wm-physics button{font:inherit;padding:6px 12px;cursor:pointer}.wm-physics header{display:flex;justify-content:space-between;gap:16px;align-items:start}#modeplayer,#mModePlayer{flex-wrap:wrap;max-width:calc(100% - 24px)}#modeplayer .seg,#mModePlayer .seg{flex-wrap:wrap}.modeplayer .wm-help{font:600 12px/1.2 system-ui,sans-serif;white-space:nowrap;padding:6px 8px}';
    document.head.append(style);
    const dialog = document.createElement('dialog');
    dialog.className = 'wm-physics'; dialog.setAttribute('aria-labelledby','wm-physics-title');
    dialog.innerHTML = '<header><h2 id="wm-physics-title">Why does this mode exist?</h2><button type="button" aria-label="Close mode explanation">Close</button></header><p class="wm-selected"></p><h3 class="wm-family"></h3><p class="wm-observe"></p><h3>Why it oscillates</h3><p>Deforming the wing stores elastic strain energy. Internal forces push it toward equilibrium. Its mass has inertia, so it passes through equilibrium. Energy exchanges between elastic and kinetic forms. Real damping gradually removes energy; the displayed free-mode animation repeats to reveal the shape.</p><h3>Where the frequency comes from</h3><div class="wm-equation" role="math" aria-label="K phi equals omega squared M phi">Kφ = ω²Mφ &nbsp;;&nbsp; f = ω/(2π)</div><p>K is the stiffness matrix; M is the mass matrix; φ is a mode-shape vector; ω is that mode\'s angular frequency [rad/s]; f is frequency [Hz]. For a pure mode, all points share that frequency while keeping their relative displacement pattern. Use K and M after imposing the model\'s support constraints; any elastic root or joint springs remain in K.</p><details><summary>From the mass–spring equation to a wing mode</summary><p>Write the unforced, undamped system as Mq̈ + Kq = 0, where q contains nodal translations and rotations. Insert q(t) = Aφ cos(ωt): acceleration is −ω²q. The equation becomes (K − ω²M)φ = 0. Only particular frequencies allow a nonzero shape. For that shape, ω² = (φᵀKφ)/(φᵀMφ): modal stiffness divided by modal inertia. A is an arbitrary amplitude scale.</p></details><details><summary>Will every mode appear in a real test?</summary><p>A real release or time-varying load usually excites a combination of modes. Where and how you apply the input determines which shapes participate. Excitation near a natural frequency can amplify that mode, but damping and the spatial loading pattern also matter. A mode existing does not mean it is strongly excited in every experiment.</p></details><h3>What to look for</h3><p>Compare Bend 1, Bend 2 and Twist 1. Follow the same span location through half a cycle. Locate any points that stay still and distinguish a shape node from a restrained support. A support imposes a constraint; a modal node follows from the computed shape. More elastic stiffness at fixed mass tends to raise a mode\'s frequency; more participating mass at fixed stiffness tends to lower it. Geometry changes can affect both.</p><p><b>Read the animation as a shape:</b> amplitude is scaled for visibility, not a predicted flight deflection. Playback uses a separate viewing rate, normally much slower than the physical frequency; read the Hz label for the computed frequency. Reduced-motion settings may hold the shape still. A natural mode is not a static lift deflection or a forced-response amplitude. This app reports uncoupled beam bending/torsion modes, not a coupled flutter calculation. Mode numbers are within each family, not a single globally sorted spectrum.</p>';
    document.body.append(dialog);
    const close = dialog.querySelector('button'); let trigger = null;
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => trigger?.focus());
    players.forEach(player => {
      if (player.querySelector('.wm-help')) return;
      const button = document.createElement('button'); button.type='button';button.className='wm-help';button.textContent='Why this mode?';button.setAttribute('aria-haspopup','dialog');
      button.addEventListener('click', () => {
        const selected = player.querySelector('[aria-pressed="true"]');
        const label = selected?.textContent?.trim() || 'Selected natural mode';
        const [family, observation] = textFor(label, player.id === 'mModePlayer');
        dialog.querySelector('.wm-selected').textContent = label;
        dialog.querySelector('.wm-family').textContent = family;
        dialog.querySelector('.wm-observe').textContent = observation;
        trigger=button;dialog.showModal();dialog.scrollTop=0;close.focus();
      });
      player.append(button);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();

