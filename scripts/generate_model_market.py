"""Partition the four model cohorts into mutually exclusive market cells."""
import json
from pathlib import Path

data = Path(__file__).resolve().parents[1] / "data"
models = json.loads((data / "metric-values.json").read_text())["m39"]["value"]
markets = ["US", "UK", "DE", "Other"]
weights = {
    "K6": [0.58, 0.20, 0.12, 0.10],
    "Bird Lite": [0.67, 0.16, 0.10, 0.07],
    "Bird Pro": [0.62, 0.19, 0.11, 0.08],
    "Hunt Pro": [0.71, 0.14, 0.09, 0.06],
}
active_skew = [1.04, 0.97, 0.93, 0.88]
subscriber_skew = [1.11, 0.95, 0.83, 0.78]


def partition(total, shares):
    exact = [total * weight / sum(shares) for weight in shares]
    values = [int(value) for value in exact]
    for index in sorted(range(len(values)), key=lambda i: exact[i] - values[i], reverse=True)[:total - sum(values)]:
        values[index] += 1
    return values


records = []
for model, summary in models.items():
    owners = partition(summary["owners"], weights[model])
    active = partition(round(summary["owners"] * summary["activeRate"]),
                       [owners[i] * active_skew[i] for i in range(4)])
    subscribers = partition(round(summary["owners"] * summary["subscriptionRate"]),
                            [owners[i] * subscriber_skew[i] for i in range(4)])
    for i, country in enumerate(markets):
        records.append({"country": country, "productLine": "Hunting" if model == "Hunt Pro" else "Bird",
                        "model": model, "owners": owners[i], "activeOwners": active[i],
                        "subscribedOwners": subscribers[i]})

artifact = {
    "classification": "entirely_synthetic",
    "asOf": "2026-09-24",
    "grain": "one primary-model attribution per observed owner, partitioned by market",
    "population": "66,000 owners with an attributed primary model; not all 82,400 eligible owners",
    "note": "Each model closes to the existing model cohort. Subscription rate uses subscribed owners / owners in the same market-model cell.",
    "records": records,
}
(data / "model-market.json").write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n")
print(f"PASS {len(records)} linked market-model cells")
