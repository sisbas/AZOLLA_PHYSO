"""Runnable mini package entrypoint for Azolla experiment analysis.

Usage:
  python -m src.run_mini_package --data data/excel/azolla_experiment.csv --out reports
"""

from __future__ import annotations

import argparse
from pathlib import Path
import json
import numpy as np
import pandas as pd
from scipy import stats


def _parse_br(value: str) -> float:
    if pd.isna(value):
        return np.nan
    s = str(value).strip().lower()
    if s in {"yok", "none", "nan", ""}:
        return 0.0
    if "10^-7" in s:
        return 1e-7
    if "10^-8" in s:
        return 1e-8
    if "10^-9" in s:
        return 1e-9
    try:
        return float(s)
    except ValueError:
        return np.nan


def load_experiment_table(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].astype(str).str.replace(",", ".", regex=False)

    numeric_cols = [
        "Gd (ppm)", "Başlangıç Azolla (g)", "Net Hasat Ağırlığı (g)", "Klorofil Numune Ağırlığı (g)",
        "Abs470", "Abs646", "Abs663", "Klorofil a", "Klorofil b", "Toplam Klorofil", "Karotenoid",
        "Mutlak Büyüme (g)", "Büyüme Katsayısı (Son/İlk)", "Büyüme (%)", "RGR (g g⁻¹ gün⁻¹)"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["BR_M"] = df["BR (M)"].apply(_parse_br)
    df["Gd_cat"] = np.where(df["Gd (ppm)"].fillna(0) > 0, "Gd_var", "Gd_yok")
    df["BR_cat"] = df["BR_M"].map({0.0: "BR_yok", 1e-7: "BR_1e-7", 1e-8: "BR_1e-8", 1e-9: "BR_1e-9"})
    return df


def run_anova(df: pd.DataFrame, target: str) -> pd.DataFrame:
    d = df.dropna(subset=[target, "Grup Kodu"]).copy()
    groups = [g[target].dropna().values for _, g in d.groupby("Grup Kodu") if len(g[target].dropna()) > 0]
    labels = [str(k) for k, g in d.groupby("Grup Kodu") if len(g[target].dropna()) > 0]
    if len(groups) >= 2:
        f_stat, p_val = stats.f_oneway(*groups)
    else:
        f_stat, p_val = np.nan, np.nan
    return pd.DataFrame({"metric": [target], "test": ["one_way_anova_by_group"], "f_stat": [f_stat], "p_value": [p_val], "n_groups": [len(labels)]})


def compare_br_under_gd(df: pd.DataFrame, target: str) -> pd.DataFrame:
    d = df[(df["Gd_cat"] == "Gd_var") & (~df["BR_cat"].isna())].copy()
    ref = d[d["BR_cat"] == "BR_yok"][target].dropna()
    rows = []
    for br in ["BR_1e-7", "BR_1e-8", "BR_1e-9"]:
        cur = d[d["BR_cat"] == br][target].dropna()
        if len(ref) > 1 and len(cur) > 1:
            t, p = stats.ttest_ind(cur, ref, equal_var=False, nan_policy="omit")
            rows.append({"comparison": f"{br} vs BR_yok", "mean_diff": float(cur.mean() - ref.mean()), "p_value": float(p), "t_stat": float(t)})
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Azolla mini analysis package")
    parser.add_argument("--data", required=True, help="CSV path")
    parser.add_argument("--out", default="reports", help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = load_experiment_table(Path(args.data))

    summary = df.groupby(["Gd_cat", "BR_cat"])[["RGR (g g⁻¹ gün⁻¹)", "Toplam Klorofil", "Karotenoid", "Mutlak Büyüme (g)"]].agg(["mean", "std", "count"])
    summary.to_csv(out_dir / "group_summary.csv")

    anova_rgr = run_anova(df, "RGR (g g⁻¹ gün⁻¹)")
    anova_chl = run_anova(df, "Toplam Klorofil")
    anova_rgr.to_csv(out_dir / "anova_rgr.csv")
    anova_chl.to_csv(out_dir / "anova_total_chlorophyll.csv")

    gd_cmp = compare_br_under_gd(df, "RGR (g g⁻¹ gün⁻¹)")
    gd_cmp.to_csv(out_dir / "gd_br_pairwise_rgr.csv", index=False)

    report = {
        "n_rows": int(len(df)),
        "groups": sorted([str(x) for x in df["Grup Kodu"].dropna().unique()]),
        "outputs": [
            "group_summary.csv",
            "anova_rgr.csv",
            "anova_total_chlorophyll.csv",
            "gd_br_pairwise_rgr.csv",
        ],
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Done. Outputs written to: {out_dir}")


if __name__ == "__main__":
    main()
