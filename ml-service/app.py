"""
Cloud Cost Intelligence — ML Anomaly Detection Microservice

Receives metric data points, runs Isolation Forest, returns anomaly scores.
This is the entire ML service — ~60 lines of actual logic.
"""

from flask import Flask, request, jsonify
import numpy as np
from sklearn.ensemble import IsolationForest

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "IsolationForest"})


@app.route("/detect", methods=["POST"])
def detect_anomalies():
    data = request.json
    metrics = data.get("metrics", [])

    if len(metrics) < 10:
        return jsonify({
            "anomalies": [],
            "model_info": {"error": "Need at least 10 data points", "samples_used": len(metrics)},
        })

    feature_keys = ["cpu_utilization", "invocation_count", "network_in",
                    "network_out", "estimated_hourly_cost"]

    resource_groups: dict[str, list] = {}
    for m in metrics:
        rid = m.get("resource_id", "unknown")
        resource_groups.setdefault(rid, []).append(m)

    all_anomalies = []

    for resource_id, points in resource_groups.items():
        if len(points) < 5:
            continue

        features = []
        for p in points:
            row = [float(p.get(k, 0)) for k in feature_keys]
            features.append(row)

        X = np.array(features)

        contamination = min(0.1, max(0.01, 2.0 / len(points)))

        model = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=42,
        )
        model.fit(X)

        scores = model.decision_function(X)
        predictions = model.predict(X)

        min_score, max_score = scores.min(), scores.max()
        if max_score - min_score > 0:
            normalized = 1 - (scores - min_score) / (max_score - min_score)
        else:
            normalized = np.zeros_like(scores)

        latest_idx = len(points) - 1
        latest_point = points[latest_idx]
        latest_score = float(normalized[latest_idx])
        is_anomaly = bool(predictions[latest_idx] == -1)

        if is_anomaly or latest_score > 0.6:
            contributing = []
            for i, key in enumerate(feature_keys):
                val = float(X[latest_idx, i])
                col_mean = float(X[:, i].mean())
                col_std = float(X[:, i].std()) if X[:, i].std() > 0 else 1.0
                if abs(val - col_mean) > 1.5 * col_std:
                    contributing.append(f"{key}: {val:.2f} (avg: {col_mean:.2f})")

            anomaly_type = _classify_anomaly(latest_point, X, latest_idx)

            all_anomalies.append({
                "resource_id": resource_id,
                "anomaly_score": round(latest_score, 4),
                "is_anomaly": is_anomaly,
                "anomaly_type": anomaly_type,
                "contributing_factors": contributing,
                "latest_metrics": {k: float(latest_point.get(k, 0)) for k in feature_keys},
            })

    return jsonify({
        "anomalies": all_anomalies,
        "model_info": {
            "samples_used": len(metrics),
            "resources_analyzed": len(resource_groups),
            "contamination": contamination if resource_groups else 0.1,
        },
    })


def _classify_anomaly(point: dict, X: np.ndarray, idx: int) -> str:
    cpu = float(point.get("cpu_utilization", 50))
    invocations = float(point.get("invocation_count", 0))
    avg_invocations = float(X[:, 1].mean()) if X.shape[0] > 0 else 0
    cost = float(point.get("estimated_hourly_cost", 0))
    avg_cost = float(X[:, 4].mean()) if X.shape[0] > 0 else 0

    if cpu < 5:
        return "idle_instance"
    if avg_invocations > 0 and invocations > avg_invocations * 5:
        return "runaway_function"
    if avg_cost > 0 and cost > avg_cost * 3:
        return "cost_spike"
    return "usage_anomaly"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
