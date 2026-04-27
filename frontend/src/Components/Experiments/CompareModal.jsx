// components/CompareModal.jsx
import React, { useState } from "react";
import { Bar } from "react-chartjs-2";
import { API_BASE_URL } from "../../services/api";

const GRAPHIC_TYPES = [
  { key: "pr_curve", label: "Precision-Recall Curve" },
  { key: "precision_curve", label: "Precision vs Confidence" },
  { key: "recall_curve", label: "Recall vs Confidence" },
  { key: "f1_curve", label: "F1 vs Confidence" },
  { key: "confusion_matrix", label: "Confusion Matrix" },
];

const CompareModal = ({ experiments, onClose }) => {
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
    if (url) return `${API_BASE_URL}${url}`;
    return null;
  };

  const barChartData = {
    labels: experiments.map((exp) => exp.name),
    datasets: [
      {
        label: "mAP50",
        data: experiments.map((exp) => exp.map50 || 0),
        backgroundColor: "rgba(54, 162, 235, 0.7)",
        borderRadius: 4,
      },
      {
        label: "Precision",
        data: experiments.map((exp) => exp.precision || 0),
        backgroundColor: "rgba(255, 99, 132, 0.7)",
        borderRadius: 4,
      },
      {
        label: "Recall",
        data: experiments.map((exp) => exp.recall || 0),
        backgroundColor: "rgba(75, 192, 192, 0.7)",
        borderRadius: 4,
      },
      {
        label: "F1 Score",
        data: experiments.map((exp) => exp.f1 || 0),
        backgroundColor: "rgba(153, 102, 255, 0.7)",
        borderRadius: 4,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      y: {
        beginAtZero: true,
        max: 1,
        title: { display: true, text: "Score" },
      },
      x: {
        title: { display: true, text: "Experiment" },
      },
    },
    plugins: {
      legend: { position: "top" },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(3)}`,
        },
      },
    },
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
          <h3>Основные метрики</h3>
          <div className="bar-chart-section">
            <Bar data={barChartData} options={barOptions} />
          </div>

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
