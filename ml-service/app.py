"""
Cloud Cost Intelligence — ML Anomaly Detection & Forecasting Microservice

- Persistent Isolation Forest models per resource (saved/loaded via joblib)
- Prophet-based cost forecasting
- Training endpoint for explicit retraining
"""

import os
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib
import threading

app = Flask(__name__)

MODEL_DIR = os.environ.get("MODEL_DIR", "/app/models")
os.makedirs(MODEL_DIR, exist_ok=True)

_models: dict[str, dict] = {}
_model_lock = threading.Lock()

FEATURE_KEYS = [
    "cpu_utilization", "invocation_count", "network_in",
    "network_out", "estimated_hourly_cost",
]


def _model_path(resource_id: str) -> str:
    safe_id = resource_id.replace("/", "_").replace("\\", "_")
    return os.path.join(MODEL_DIR, f"iforest_{safe_id}.joblib")


def _load_model(resource_id: str) -> dict | None:
    with _model_lock:
        if resource_id in _models:
            return _models[resource_id]
    path = _model_path(resource_id)
    if os.path.exists(path):
        try:
            data = joblib.load(path)
            with _model_lock:
                _models[resource_id] = data
            return data
        except Exception:
            pass
    return None


def _save_model(resource_id: str, model: IsolationForest, sample_count: int):
    data = {
        "model": model,
        "trained_at": datetime.utcnow().isoformat(),
        "sample_count": sample_count,
    }
    with _model_lock:
        _models[resource_id] = data
    try:
        joblib.dump(data, _model_path(resource_id))
    except Exception:
        pass


@app.route("/health", methods=["GET"])
def health():
    with _model_lock:
        model_count = len(_models)
    return jsonify({
        "status": "ok",
        "model": "IsolationForest (persistent) + Prophet forecasting",
        "loaded_models": model_count,
    })


@app.route("/models", methods=["GET"])
def list_models():
    with _model_lock:
        info = {}
        for rid, data in _models.items():
            info[rid] = {
                "trained_at": data.get("trained_at"),
                "sample_count": data.get("sample_count", 0),
            }
    return jsonify({"models": info})


@app.route("/train", methods=["POST"])
def train():
    data = request.json
    metrics = data.get("metrics", [])
    if len(metrics) < 8:
        return jsonify({"error": "Need at least 8 data points"}), 400

    resource_groups: dict[str, list] = {}
    for m in metrics:
        rid = m.get("resource_id", "unknown")
        resource_groups.setdefault(rid, []).append(m)

    trained = []
    for resource_id, points in resource_groups.items():
        if len(points) < 5:
            continue
        X = np.array([[float(p.get(k, 0)) for k in FEATURE_KEYS] for p in points])
        contamination = min(0.1, max(0.01, 2.0 / len(points)))
        model = IsolationForest(n_estimators=100, contamination=contamination, random_state=42)
        model.fit(X)
        _save_model(resource_id, model, len(points))
        trained.append(resource_id)

    return jsonify({"trained": trained, "count": len(trained)})


@app.route("/detect", methods=["POST"])
def detect_anomalies():
    data = request.json
    metrics = data.get("metrics", [])

    if len(metrics) < 8:
        return jsonify({
            "anomalies": [],
            "model_info": {"error": "Need at least 8 data points", "samples_used": len(metrics)},
        })

    resource_groups: dict[str, list] = {}
    for m in metrics:
        rid = m.get("resource_id", "unknown")
        resource_groups.setdefault(rid, []).append(m)

    all_anomalies = []
    models_used = 0
    models_trained = 0

    for resource_id, points in resource_groups.items():
        if len(points) < 5:
            continue

        resource_type = (points[0].get("resource_type") or "unknown").lower()
        X = np.array([[float(p.get(k, 0)) for k in FEATURE_KEYS] for p in points])

        existing = _load_model(resource_id)
        if existing and existing.get("model") is not None:
            model = existing["model"]
            models_used += 1
        else:
            contamination = min(0.1, max(0.01, 2.0 / len(points)))
            model = IsolationForest(n_estimators=100, contamination=contamination, random_state=42)
            model.fit(X)
            _save_model(resource_id, model, len(points))
            models_trained += 1

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
            for i, key in enumerate(FEATURE_KEYS):
                val = float(X[latest_idx, i])
                col_mean = float(X[:, i].mean())
                col_std = float(X[:, i].std()) if X[:, i].std() > 0 else 1.0
                if abs(val - col_mean) > 1.5 * col_std:
                    contributing.append(f"{key}: {val:.2f} (avg: {col_mean:.2f})")

            anomaly_type = _classify_anomaly(latest_point, X, latest_idx, resource_type)

            all_anomalies.append({
                "resource_id": resource_id,
                "anomaly_score": round(latest_score, 4),
                "is_anomaly": is_anomaly,
                "anomaly_type": anomaly_type,
                "contributing_factors": contributing,
                "latest_metrics": {k: float(latest_point.get(k, 0)) for k in FEATURE_KEYS},
            })

        if len(points) >= 20 and (not existing or existing.get("sample_count", 0) < len(points)):
            contamination = min(0.1, max(0.01, 2.0 / len(points)))
            fresh = IsolationForest(n_estimators=100, contamination=contamination, random_state=42)
            fresh.fit(X)
            _save_model(resource_id, fresh, len(points))

    return jsonify({
        "anomalies": all_anomalies,
        "model_info": {
            "samples_used": len(metrics),
            "resources_analyzed": len(resource_groups),
            "models_reused": models_used,
            "models_newly_trained": models_trained,
        },
    })


@app.route("/forecast", methods=["POST"])
def forecast():
    data = request.json
    history = data.get("history", [])
    periods = data.get("periods", 168)

    if len(history) < 6:
        return jsonify({"forecast": [], "message": "Need at least 6 historical points"})

    try:
        from prophet import Prophet
        import pandas as pd

        df = pd.DataFrame(history)
        df["ds"] = pd.to_datetime(df["ds"])
        df = df.sort_values("ds").reset_index(drop=True)

        m = Prophet(
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10,
            daily_seasonality=True,
            weekly_seasonality=True,
        )
        m.fit(df)

        future = m.make_future_dataframe(periods=periods, freq="h")
        fc = m.predict(future)

        forecast_rows = fc.tail(periods)[["ds", "yhat", "yhat_lower", "yhat_upper"]].to_dict("records")
        for row in forecast_rows:
            row["ds"] = row["ds"].isoformat()
            row["yhat"] = round(max(0, row["yhat"]), 6)
            row["yhat_lower"] = round(max(0, row["yhat_lower"]), 6)
            row["yhat_upper"] = round(max(0, row["yhat_upper"]), 6)

        return jsonify({"forecast": forecast_rows, "method": "prophet"})

    except ImportError:
        values = [float(h.get("y", 0)) for h in history]
        n = len(values)
        avg_val = sum(values) / n
        trend = (values[-1] - values[0]) / n if n > 1 else 0

        last_ds = history[-1].get("ds", datetime.utcnow().isoformat())
        try:
            last_time = datetime.fromisoformat(last_ds.replace("Z", "+00:00"))
        except Exception:
            last_time = datetime.utcnow()

        forecast_rows = []
        for i in range(1, periods + 1):
            ds = last_time + timedelta(hours=i)
            predicted = max(0, avg_val + trend * i)
            forecast_rows.append({
                "ds": ds.isoformat(),
                "yhat": round(predicted, 6),
                "yhat_lower": round(max(0, predicted * 0.7), 6),
                "yhat_upper": round(predicted * 1.3, 6),
            })

        return jsonify({"forecast": forecast_rows, "method": "linear_fallback"})


def _classify_anomaly(point: dict, X: np.ndarray, idx: int, resource_type: str) -> str:
    cpu = float(point.get("cpu_utilization", 50))
    invocations = float(point.get("invocation_count", 0))
    avg_invocations = float(X[:, 1].mean()) if X.shape[0] > 0 else 0
    cost = float(point.get("estimated_hourly_cost", 0))
    avg_cost = float(X[:, 4].mean()) if X.shape[0] > 0 else 0
    network_in = float(point.get("network_in", 0))
    network_out = float(point.get("network_out", 0))
    avg_network_in = float(X[:, 2].mean()) if X.shape[0] > 0 else 0
    avg_network_out = float(X[:, 3].mean()) if X.shape[0] > 0 else 0

    # Idle compute instance: CPU below 5%
    if resource_type == "compute" and cpu < 5:
        return "idle_instance"

    # Runaway function: invocation count 5× the average
    if resource_type == "cloud_function" and avg_invocations > 0 and invocations > avg_invocations * 5:
        return "runaway_function"

    # Traffic spike: network 5× the average (on compute or any resource)
    net_spike_in  = avg_network_in  > 0 and network_in  > avg_network_in  * 5
    net_spike_out = avg_network_out > 0 and network_out > avg_network_out * 5
    if resource_type == "compute" and (net_spike_in or net_spike_out):
        return "traffic_spike"

    # Cost spike: cost 3× the average
    if avg_cost > 0 and cost > avg_cost * 3:
        return "cost_spike"

    # Unused volume: disk resource type with no CPU/network usage
    if resource_type == "disk" and cpu == 0 and network_in == 0 and network_out == 0:
        return "unused_volume"

    return "usage_anomaly"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
