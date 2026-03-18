import React, { useState } from "react";

import "../../styles/TrainingView.css";

function TrainingView() {
  const [gpuStatus, setGpuStatus] = useState({
    name: "NVIDIA GTX 1080",
    load: 50,
    temperature: 70,
  });
  const [taskQueue, setTaskQueue] = useState([]);
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(32);
  const [imageSize, setImageSize] = useState(416);
  const [learningRate, setLearningRate] = useState(0.001);

  const handleStartTraining = () => {
    setTaskQueue([...taskQueue, "Training task started..."]);
  };

  return (
    <div className="training-view">
      <div className="form">
        <div>
          <label>1. Dataset:</label>
          <select>
            <option>Dataset 1</option>
            <option>Dataset 2</option>
          </select>
        </div>
        <div>
          <label>2. Model:</label>
          <select>
            <option>YOLOv5</option>
            <option>YOLOv4</option>
          </select>
        </div>
        <div>
          <label>3. Hyperparameters:</label>
          <div>
            <label>Epochs:</label>
            <input
              type="number"
              value={epochs}
              onChange={(e) => setEpochs(e.target.value)}
            />
          </div>
          <div>
            <label>Batch Size:</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
            />
          </div>
          <div>
            <label>Image Size:</label>
            <input
              type="number"
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
            />
          </div>
          <div>
            <label>Learning Rate:</label>
            <input
              type="number"
              value={learningRate}
              onChange={(e) => setLearningRate(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="status">
        <h3>GPU Status:</h3>
        <p>
          {gpuStatus.name} - Load: {gpuStatus.load}% - Temp:{" "}
          {gpuStatus.temperature}°C
        </p>
        <h3>Task Queue:</h3>
        <ul>
          {taskQueue.map((task, index) => (
            <li key={index}>{task}</li>
          ))}
        </ul>
        <button onClick={handleStartTraining}>Start Training</button>
      </div>
    </div>
  );
}

export default TrainingView;
