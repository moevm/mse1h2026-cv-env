import React, { useState } from "react";

import "../../styles/ExperimentsView.css";

const ExperimentsView = () => {
  const [experiments, setExperiments] = useState([
    {
      name: "Exp 1",
      model: "YOLOv5",
      map50: 0.8,
      precision: 0.75,
      recall: 0.74,
      status: "Completed",
    },
    {
      name: "Exp 2",
      model: "YOLOv4",
      map50: 0.85,
      precision: 0.78,
      recall: 0.76,
      status: "In Progress",
    },
  ]);

  const handleNewExperiment = () => {
    alert("Create New Experiment");
  };

  const handleCompareExperiments = () => {
    alert("Compare Experiments");
  };

  return (
    <div className="experiments-view">
      <div className="filters">
        <button>Filter by Model</button>
        <button onClick={handleNewExperiment}>New Experiment</button>
        <button onClick={handleCompareExperiments}>Compare Experiments</button>
      </div>
      <div className="experiment-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Model</th>
              <th>map50</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {experiments.map((exp, index) => (
              <tr key={index}>
                <td>{exp.name}</td>
                <td>{exp.model}</td>
                <td>{exp.map50}</td>
                <td>{exp.precision}</td>
                <td>{exp.recall}</td>
                <td>{exp.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExperimentsView;
