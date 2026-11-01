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

# Extended exact checks and explanatory graphics, added for the expanded reading.
import math
from figure_tools import SVG, axes
assert F(2,3)*F(7,10)/(F(4,10)/3+F(2,3)*F(7,10)) == F(7,9)
assert F(1,3)/(F(1,8)+F(1,3)) == F(8,11)
assert F(11,12)/3 == F(11,36)
assert F(9,100)/(F(9,100)+F(45,1000)) == F(2,3)
prior_entropy=math.log2(3)
posterior_entropy=-sum(p*math.log2(p) for p in (1/3,2/3))
assert abs(prior_entropy-posterior_entropy-2/3)<1e-12
extended={
 'informed_standard_error':math.sqrt((2/3)*(1/3)/N),
 'observed_standardized_deviation':(results['protocols']['informed']['switch_rate']-2/3)/math.sqrt((2/3)*(1/3)/N),
 'entropy_prior_bits':prior_entropy, 'entropy_posterior_bits':posterior_entropy,
 'mutual_information_bits':prior_entropy-posterior_entropy,
 'hoeffding_sufficient_rounds_1pct_95pct':math.ceil(math.log(40)/(2*.01**2)),
 'selective_offer_a1_b01_switch':str(F(1,6)),
 'coupon_positive_crack_probability':str(F(2,13)),
 'perfect_confirmation_expected_cost':20+float(F(2,13))*100,
 'free_perfect_information_value':100*(1-float(F(2,13))),
 'beta_posterior_predictive_switch_after_H3':str(F(4,7))}
results['extended']=extended
(HERE/'results.json').write_text(json.dumps(results,indent=2)+'\n')

s=SVG('One placement, then one host action','Read terminal probability masses before conditioning on a named opening.',height=650)
s.box(35,275,200,115,'Player chooses 1',['Prize uniformly placed','Host knows the prize'])
rows=[(120,'Prize: door 1','Probability 1/3'),(305,'Prize: door 2','Probability 1/3'),(490,'Prize: door 3','Probability 1/3')]
for y,title,sub in rows:
 s.line(235,332,330,y+42,arrow=True);s.box(330,y,215,85,title,[sub])
for start,y,host,mass,action,col in [(162,110,'Host opens 2','Mass = 1/6','STAY wins','#8b6325'),(162,220,'Host opens 3','Mass = 1/6','STAY wins','#8b6325'),(347,350,'Host opens 3','Mass = 1/3','SWITCH wins','#116d86'),(532,505,'Host opens 2','Mass = 1/3','SWITCH wins','#116d86')]:
 s.line(545,start,655,y+40,arrow=True);s.box(655,y,300,90,host,[mass+' · '+action],fill='#fff',color=col)
s.text(35,625,'Condition on H3: retain masses 1/6 and 1/3; normalize by their sum, 1/2.',18)
s.write(HERE/'tree.svg')

s=SVG('The host rule changes a named-door posterior','Exact analytic probabilities · uniform prize prior · informed host',height=600)
xy=axes(s,95,140,800,340,0,1,0,1,[0,.25,.5,.75,1],[0,.25,.5,.75,1],'q = P(host opens door 3 | first choice correct)','Win probability')
s.path([xy(i/200,1/(1+i/200)) for i in range(201)],'#116e94',4)
s.path([xy(0,2/3),xy(1,2/3)],'#bb7a1d',3,True)
s.rect(465,155,405,75,'#fff');s.text(480,183,'Solid: switch win given H3',17,'#116e94');s.text(480,210,'Dashed: overall always-switch win',17,'#a86b17')
s.write(HERE/'host-bias.svg')

s=SVG('An offer is selected evidence','Expected counts out of 300 games · a = 1 · b = 0.1',height=560)
s.box(45,120,385,100,'100 initially correct',['Offer rate 100%','100 offers → staying wins'],fill='#fff6e5')
s.box(45,315,385,100,'200 initially wrong',['Offer rate 10%','20 offers → switching wins'],fill='#e9f6fb')
s.line(430,170,595,230,width=12,color='#c59a4e',arrow=True);s.line(430,365,595,280,width=4,color='#2784a4',arrow=True)
s.box(600,190,350,135,'120 offered games',['100 correct + 20 wrong','Switch win = 20 / 120 = 1/6','Remaining 180 games: no offer'])
s.text(45,495,'The offered sample has a different mixture from the original population.',19)
s.write(HERE/'selection.svg')
