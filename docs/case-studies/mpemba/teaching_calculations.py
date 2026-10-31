"""Reproduce the Mpemba reading's synthetic figures and numerical checks.

Run from any directory with Python, NumPy, SciPy and Matplotlib installed:
    python docs/case-studies/mpemba/teaching_calculations.py

No experimental measurements are included or fitted. The three-state generator
is deliberately constructed to remove the hot preparation's slow mode; it is
not a microscopic model of freezing water. Temperatures and time in that model
are dimensionless, with k_B = 1.
"""

from pathlib import Path
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.linalg import expm
from scipy.optimize import brentq

OUT = Path(__file__).resolve().parent
HOT, WARM, INK = "#c85136", "#176d9e", "#183345"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.labelcolor": INK, "text.color": INK, "axes.titleweight": "bold",
    "svg.fonttype": "none", "savefig.facecolor": "white",
})


def save(fig, name):
    fig.savefig(OUT / f"{name}.svg", bbox_inches="tight")
    plt.close(fig)


def cooling(T0, t, bath=-20.0, tau=600.0):
    return bath + (T0 - bath) * np.exp(-np.asarray(t) / tau)


def reach(T0, target, bath=-20.0, tau=600.0):
    return float(tau * np.log((T0 - bath) / (target - bath)))


def water_illustrations():
    t = np.linspace(0, 1800, 601)
    fig, ax = plt.subplots(figsize=(9, 4.9), layout="constrained")
    for T0, color, label in [(80, HOT, "Initially 80 °C"), (35, WARM, "Initially 35 °C")]:
        ax.plot(t / 60, cooling(T0, t), color=color, lw=2.5, label=label)
        zero = reach(T0, 0)
        ax.scatter(zero / 60, 0, color=color, zorder=4)
    ax.axhline(0, color="#697c88", lw=1, ls="--", label="0 °C endpoint")
    ax.axhline(-20, color="#adb8bf", lw=1, ls=":", label="Bath: −20 °C")
    ax.set(xlabel="Time (min)", ylabel="Single-temperature model (°C)",
           title="Same Newton cooling law: the curves cannot cross", xlim=(0, 30))
    ax.legend(frameon=False, loc="upper right")
    ax.text(.02, .04, "Synthetic calculation · τ = 600 s · no phase change modeled",
            transform=ax.transAxes, fontsize=10)
    save(fig, "01-newton-cooling")

    fig, ax = plt.subplots(figsize=(9, 5.3), layout="constrained")
    values = {}
    for T0, nucleation, color, name in [(80, -2, HOT, "Hot"), (35, -15, WARM, "Warm")]:
        onset = reach(T0, nucleation)
        ts = np.linspace(0, onset, 450)
        ax.plot(ts / 60, cooling(T0, ts), lw=2.5, color=color, label=f"{name}: assumed onset at {nucleation} °C")
        zero = reach(T0, 0)
        ax.scatter(zero / 60, 0, s=50, facecolor="white", edgecolor=color, zorder=4)
        ax.scatter(onset / 60, nucleation, s=140, marker="*", color=color, zorder=4)
        ax.annotate(f"{name} onset: {onset / 60:.2f} min", (onset / 60, nucleation),
                    xytext=(-105, 15 if name == "Hot" else 20),
                    textcoords="offset points", color=color, fontsize=10)
        values[name.lower()] = {"initial_C": T0, "assumed_nucleation_C": nucleation,
                                "zero_crossing_s": zero, "nucleation_onset_s": onset}
    ax.axhline(0, color="#697c88", lw=1, ls="--")
    ax.set(xlabel="Time (min)", ylabel="Liquid temperature before nucleation (°C)",
           title="Changing the endpoint can reverse the ranking", xlim=(0, 28), ylim=(-23, 85))
    ax.legend(frameon=False, loc="upper right", fontsize=10)
    ax.text(.02, .04, "Open circles: 0 °C · stars: assumed nucleation · curves stop at onset",
            transform=ax.transAxes, fontsize=9.5)
    save(fig, "02-supercooling-endpoints")
    assert values["hot"]["zero_crossing_s"] > values["warm"]["zero_crossing_s"]
    assert values["hot"]["nucleation_onset_s"] < values["warm"]["nucleation_onset_s"]
    return values


def markov_illustration():
    energy = np.array([0.0, 0.3, 8.3])

    def boltzmann(T):
        p = np.exp(-energy / T)
        return p / p.sum()

    pi = boltzmann(1.0)
    root = np.sqrt(pi)
    # In symmetric coordinates the prescribed hot displacement is a fast
    # eigenvector. Complete an orthonormal basis with the stationary mode.
    u_fast = (boltzmann(10.0) - pi) / root
    u_fast /= np.linalg.norm(u_fast)
    u_slow = np.cross(root, u_fast)
    u_slow /= np.linalg.norm(u_slow)
    S = -np.outer(u_slow, u_slow) - 10.0 * np.outer(u_fast, u_fast)
    R = np.diag(root) @ S @ np.diag(1.0 / root)

    offdiag = R.copy()
    np.fill_diagonal(offdiag, 0)
    assert offdiag.min() >= -1e-13
    assert np.max(np.abs(R.sum(axis=0))) < 1e-12
    assert np.max(np.abs(R @ pi)) < 1e-12
    flux = R * pi[None, :]
    assert np.max(np.abs(flux - flux.T)) < 1e-12
    assert np.allclose(np.linalg.eigvalsh(S), [-10, -1, 0], atol=1e-12)

    def state(T, t):
        d = (boltzmann(T) - pi) / root
        return pi + root * (u_slow * (u_slow @ d) * np.exp(-t)
                            + u_fast * (u_fast @ d) * np.exp(-10 * t))

    def tv(T, t):
        return float(.5 * np.abs(state(T, t) - pi).sum())

    times = np.linspace(0, 9, 901)
    summary = {}
    for name, T in [("warm", 2.0), ("hot", 10.0)]:
        states = np.array([state(T, t) for t in times])
        assert states.min() > -1e-12
        assert np.max(np.abs(states.sum(axis=1) - 1)) < 1e-12
        for t in [0, .1, 1, 5]:
            assert np.allclose(state(T, t), expm(R * t) @ boltzmann(T), atol=1e-12)
        distance = .5 * np.abs(states - pi).sum(axis=1)
        divergence = np.sum(states * np.log(states / pi), axis=1)
        assert np.max(np.diff(distance)) < 1e-12
        assert np.max(np.diff(divergence)) < 1e-12
        summary[name] = {
            "initial_temperature": T, "initial_distribution": boltzmann(T).tolist(),
            "initial_TV": tv(T, 0),
            "slow_mode_coefficient": float(u_slow @ ((boltzmann(T) - pi) / root)),
            "time_to_TV_1e-4": float(brentq(lambda t: tv(T, t) - 1e-4, 0, 20)),
        }
    assert summary["hot"]["initial_TV"] > summary["warm"]["initial_TV"]
    assert summary["hot"]["time_to_TV_1e-4"] < summary["warm"]["time_to_TV_1e-4"]
    assert abs(summary["hot"]["slow_mode_coefficient"]) < 1e-12

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.8), layout="constrained")
    for T, color, name in [(2, WARM, "Warm: Tᵢ = 2"), (10, HOT, "Hot: Tᵢ = 10")]:
        distance = np.array([tv(T, t) for t in times])
        shown = np.where(distance >= 1e-8, distance, np.nan)
        axes[0].semilogy(times, shown, color=color, lw=2.5, label=name)
    axes[0].axhline(1e-4, color="#697c88", ls="--", lw=1, label="Common tolerance: 10⁻⁴")
    axes[0].set(xlabel="Dimensionless time", ylabel="Total variation distance to equilibrium",
                title="A farther preparation arrives sooner", ylim=(1e-8, 1), xlim=(0, 9))
    axes[0].legend(frameon=False, fontsize=9)
    temperatures = np.linspace(1, 18, 400)
    coefficient = np.array([u_slow @ ((boltzmann(T) - pi) / root) for T in temperatures])
    axes[1].plot(temperatures, coefficient, color=INK, lw=2.5)
    axes[1].axhline(0, color="#697c88", lw=1)
    axes[1].scatter([2, 10], [summary["warm"]["slow_mode_coefficient"],
                            summary["hot"]["slow_mode_coefficient"]], c=[WARM, HOT], zorder=4)
    axes[1].annotate("Hot preparation:\nslow mode absent", (10, 0), xytext=(.52, .20),
                    textcoords="axes fraction", arrowprops={"arrowstyle": "->", "color": HOT},
                    fontsize=9, color=HOT)
    axes[1].set(xlabel="Initial preparation temperature Tᵢ (bath Tᵦ = 1)",
                ylabel="Signed slow-mode coefficient c₂", title="What changes is mode amplitude")
    save(fig, "03-markov-relaxation")

    return {"energies": energy.tolist(), "bath_temperature": 1.0,
            "generator_column_convention": "dp/dt = R p; R_ij is rate from j to i",
            "generator": R.tolist(), "eigenvalues": [-10.0, -1.0, 0.0],
            "equilibrium": pi.tolist(), "preparations": summary,
            "checks": ["nonnegative transition rates", "zero column sums", "stationarity",
                       "detailed balance", "normalized positive probabilities",
                       "independent matrix exponential agreement", "TV and KL contraction",
                       "farther hot initial state reaches the same tolerance first"],
            "scope": "Deliberately constructed synthetic model; no experimental data fitted"}


def main():
    result = {
        "scope": "Original classroom calculations, not measurements or water-model validation",
        "water": water_illustrations(), "markov": markov_illustration(),
        "energy": {"water_mass_kg": .25, "assumed_cp_J_kgK": 4180,
                   "extra_energy_80_vs_35_J": .25 * 4180 * (80 - 35),
                   "assumed_fusion_heat_J_kg": 334000, "fusion_energy_J": .25 * 334000},
        "restrained_bar": {"assumed_E_Pa": 70e9, "assumed_alpha_1_K": 23e-6,
                           "temperature_rise_K": 50,
                           "stress_Pa_tension_positive": -70e9 * 23e-6 * 50},
    }
    target = OUT / "calculations.json"
    temporary = target.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(result, indent=2) + "\n")
    temporary.replace(target)
    print(json.dumps({"water": result["water"], "markov_preparations": result["markov"]["preparations"],
                      "restrained_stress_MPa": result["restrained_bar"]["stress_Pa_tension_positive"] / 1e6}, indent=2))


if __name__ == "__main__":
    main()
