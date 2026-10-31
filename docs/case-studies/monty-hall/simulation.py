"""Reproducible Monty Hall protocols; standard library only. Synthetic data."""
from fractions import Fraction as F
from pathlib import Path
import json
import random

HERE = Path(__file__).resolve().parent
N = 100_000

def exact(informed=True, q=F(1, 2)):
    total = stay = switch = F(0)
    h3 = c1h3 = F(0)
    for prize in range(3):
        options = [d for d in range(3) if d != 0 and (not informed or d != prize)]
        weights = ([1-q, q] if informed and prize == 0 else [F(1, len(options))]*len(options))
        for opened, weight in zip(options, weights):
            mass = F(1, 3)*weight
            if opened == prize:
                continue
            other = next(d for d in range(3) if d not in (0, opened))
            total += mass
            stay += mass*(prize == 0)
            switch += mass*(prize == other)
            if opened == 2:
                h3 += mass
                c1h3 += mass*(prize == 0)
    return total, stay/total, switch/total, c1h3/h3

assert exact(True)[:3] == (F(1), F(1, 3), F(2, 3))
assert exact(False)[:3] == (F(2, 3), F(1, 2), F(1, 2))
for q in (F(0), F(1, 5), F(1, 2), F(1)):
    assert exact(True, q)[3] == q/(1+q)
assert F(9, 1000)/(F(9, 1000)+F(495, 10000)) == F(2, 13)

rng = random.Random(446)
results = {'seed':446, 'trials_per_protocol':N, 'synthetic':True, 'protocols':{}}
for informed in (True, False):
    retained = stay = switch = 0
    for _ in range(N):
        prize, choice = rng.randrange(3), rng.randrange(3)
        options = [d for d in range(3) if d != choice and (not informed or d != prize)]
        opened = rng.choice(options)
        if opened == prize:
            continue
        other = next(d for d in range(3) if d not in (choice, opened))
        retained += 1
        stay += choice == prize
        switch += other == prize
    assert stay + switch == retained
    predicted = exact(informed)
    assert abs(switch/retained - float(predicted[2])) < .01
    results['protocols']['informed' if informed else 'uninformed'] = {
        'retained':retained, 'discarded':N-retained, 'stay_wins':stay,
        'switch_wins':switch, 'stay_rate':stay/retained, 'switch_rate':switch/retained,
        'exact_stay':str(predicted[1]), 'exact_switch':str(predicted[2])}
(HERE/'results.json').write_text(json.dumps(results, indent=2)+'\n')
# Exact coordinates, direct SVG: no plotting dependency.
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="470" viewBox="0 0 900 470" role="img" aria-labelledby="title desc"><title id="title">Monty Hall protocol comparison</title><desc id="desc">Four simulated win rates with exact reference markers. Uninformed-host rates are conditional on revealing no prize.</desc><rect width="900" height="470" fill="white"/><g font-family="Arial,sans-serif" fill="#183345"><text x="30" y="37" font-size="25">Host behavior changes conditional win rates</text><text x="30" y="68" font-size="17">100,000 synthetic rounds per protocol · seed 446</text>']
for k in range(6):
    x = 270+k*100
    svg.append(f'<path d="M{x} 105V375" stroke="#e1e7ed"/><text x="{x}" y="402" text-anchor="middle" font-size="16">{k*20}%</text>')
for i, (protocol, action) in enumerate((('informed','stay'),('informed','switch'),('uninformed','stay'),('uninformed','switch'))):
    r = results['protocols'][protocol]; y=120+i*65
    rate=r[action+'_rate']; truth=float(F(r['exact_'+action])); x=270+500*truth
    svg.append(f'<text x="25" y="{y+23}" font-size="18">{protocol.title()} · {action}</text><rect x="270" y="{y}" width="{500*rate}" height="34" fill="{"#237aa1" if action=="switch" else "#85a9b8"}"/><path d="M{x} {y-5}V{y+39}" stroke="#111" stroke-width="3"/><text x="{max(270+500*rate,x)+12}" y="{y+23}" font-size="17">{rate:.2%}</text>')
svg.append('<text x="30" y="444" font-size="17">Bars: simulation · black markers: exact probability · losing-door reveals only</text></g></svg>')
(HERE/'probabilities.svg').write_text(''.join(svg))
print(json.dumps(results, indent=2))
