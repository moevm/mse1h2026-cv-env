import React, { useState } from "react";
import { API_BASE_URL } from "../../services/api";

const GRAPHIC_TYPES = [
  { key: "pr_curve", label: "Precision-Recall Curve" },
  { key: "precision_curve", label: "Precision vs Confidence" },
  { key: "recall_curve", label: "Recall vs Confidence" },
  { key: "f1_curve", label: "F1 vs Confidence" },
  { key: "confusion_matrix", label: "Confusion Matrix" },
];

const CompareModal = ({ experiments, onClose, collection }) => {
  const [selectedExpPerType, setSelectedExpPerType] = useState(() => {
    const initial = {};
    GRAPHIC_TYPES.forEach((type) => {
      initial[type.key] = experiments[0]?.id || null;
    });
    return initial;
  });

  const handleRadioChange = (typeKey, expId) => {
    setSelectedExpPerType((prev) => ({ ...prev, [typeKey]: expId }));
  };

  const getImageUrl = (exp, typeKey) => {
    const url = exp.graphics_urls?.[typeKey];
    if (url) {
      return `${API_BASE_URL}${url}?workspace_path=${encodeURIComponent(collection.workspacePath)}`;
    }
    return null;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="compare-modal-header">
          <h2>📊 Сравнение экспериментов</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="compare-modal-content">
          {/* Таблица с метриками */}
          <h3>Сравнение метрик</h3>
          <div className="metrics-table-container">
            <table className="compare-metrics-table">
              <thead>
                <tr>
                  <th>Метрика</th>
                  {experiments.map((exp) => (
                    <th key={exp.id}>{exp.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="metric-name">mAP50</td>
                  {experiments.map((exp) => (
                    <td key={exp.id} className="metric-value">
                      {exp.map50?.toFixed(4) || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="metric-name">Precision</td>
                  {experiments.map((exp) => (
                    <td key={exp.id} className="metric-value">
                      {exp.precision?.toFixed(4) || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="metric-name">Recall</td>
                  {experiments.map((exp) => (
                    <td key={exp.id} className="metric-value">
                      {exp.recall?.toFixed(4) || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="metric-name">F1 Score</td>
                  {experiments.map((exp) => (
                    <td key={exp.id} className="metric-value">
                      {exp.f1?.toFixed(4) || "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Графики */}
          {GRAPHIC_TYPES.map((type) => {
            const currentExpId = selectedExpPerType[type.key];
            const currentExp = experiments.find((exp) => exp.id === currentExpId);
            const imageUrl = currentExp ? getImageUrl(currentExp, type.key) : null;

            return (
              <div key={type.key} className="graphic-section">
                <h3>{type.label}</h3>
                <div className="graphic-image-container">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={type.label}
                      onError={(e) => {
                        e.target.style.display = "none";
                        if (e.target.nextSibling) {
                          e.target.nextSibling.style.display = "flex";
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className="no-graphic"
                    style={{ display: imageUrl ? "none" : "flex" }}
                  >
                    📷 График не доступен для этого эксперимента
                  </div>
                </div>
                <div className="radio-group">
                  {experiments.map((exp) => (
                    <label key={exp.id} className="radio-label">
                      <input
                        type="radio"
                        name={type.key}
                        value={exp.id}
                        checked={selectedExpPerType[type.key] === exp.id}
                        onChange={() => handleRadioChange(type.key, exp.id)}
                      />
                      <span>{exp.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CompareModal;
