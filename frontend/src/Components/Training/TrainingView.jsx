import React, { useState } from "react";

import "../../styles/TrainingView.css";

function TrainingView() {
  const [gpuStatus, setGpuStatus] = useState({
    name: "NVIDIA GTX 1080",
    load: 50,
    temperature: 70,
  });
  const [taskQueue, setTaskQueue] = useState([]);

  const [epochs, setEpochs] = useState(100);
  const [batch, setBatch] = useState(16);
  const [imagesz, setImagesz] = useState(640);
  const [device, setDevice] = useState("auto");
  const [workers, setWorkers] = useState(8);
  const [patience, setPatience] = useState(50);
  const [save, setSave] = useState(true);
  const [save_period, setSavePeriod] = useState(-1);
  const [cache, setCache] = useState(false);
  const [optimizer, setOptimizer] = useState("SGD");
  const [lr0, setLr0] = useState(0.01);
  const [lrf, setLrf] = useState(0.01);
  const [momentum, setMomentum] = useState(0.937);
  const [weight_decay, setWeightDecay] = useState(0.0005);
  const [warmup_epochs, setWarmupEpochs] = useState(3);
  const [warmup_momentum, setWarmupMomentum] = useState(0.8);
  const [warmup_bias_lr, setWarmupBiasLr] = useState(0.1);

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
            <label>epochs:</label>
            <input
              type="number"
              value={epochs}
              onChange={(e) => setEpochs(e.target.value)}
            />
          </div>
          <div>
            <label>batch:</label>
            <input
              type="number"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
            />
          </div>
          <div>
            <label>imagesz:</label>
            <input
              type="number"
              value={imagesz}
              onChange={(e) => setImagesz(e.target.value)}
            />
          </div>
          <div>
            <label>device:</label>
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value)}
            >
              <option value="auto">auto</option>
              <option value="cpu">CPU</option>
              <option value="0">GPU 0</option>
              <option value="1">GPU 1</option>
              <option value="-1">Auto-select most idle GPU</option>
            </select>
          </div>
          <div>
            <label>workers:</label>
            <input
              type="number"
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
            />
          </div>
          <div>
            <label>patience:</label>
            <input
              type="number"
              value={patience}
              onChange={(e) => setPatience(e.target.value)}
            />
          </div>
          <div>
            <label>save:</label>
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
            />
          </div>
          <div>
            <label>save_period:</label>
            <input
              type="number"
              value={save_period}
              onChange={(e) => setSavePeriod(e.target.value)}
            />
          </div>
          <div>
            <label>cache:</label>
            <input
              type="checkbox"
              checked={cache}
              onChange={(e) => setCache(e.target.value)}
            />
          </div>
          <div>
            <label>optimizer:</label>
            <select
              value={optimizer}
              onChange={(e) => setOptimizer(e.target.value)}
            >
              <option value="auto">auto</option>
              <option value="SGD">SGD</option>
              <option value="MuSGD">MuSGD</option>
              <option value="Adam">Adam</option>
              <option value="Adamax">Adamax</option>
              <option value="AdamW">AdamW</option>
              <option value="NAdam">NAdam</option>
              <option value="RAdam">RAdam</option>
              <option value="RMSProp">RMSProp</option>
            </select>
          </div>
          <div>
            <label>lr0:</label>
            <input
              type="number"
              value={lr0}
              onChange={(e) => setLr0(e.target.value)}
            />
          </div>
          <div>
            <label>lrf:</label>
            <input
              type="number"
              value={lrf}
              onChange={(e) => setLrf(e.target.value)}
            />
          </div>
          <div>
            <label>momentum:</label>
            <input
              type="number"
              value={momentum}
              onChange={(e) => setMomentum(e.target.value)}
            />
          </div>
          <div>
            <label>weight_decay:</label>
            <input
              type="number"
              value={weight_decay}
              onChange={(e) => setWeightDecay(e.target.value)}
            />
          </div>
          <div>
            <label>warmup_epochs:</label>
            <input
              type="number"
              value={warmup_epochs}
              onChange={(e) => setWarmupEpochs(e.target.value)}
            />
          </div>
          <div>
            <label>warmup_momentum:</label>
            <input
              type="number"
              value={warmup_momentum}
              onChange={(e) => setWarmupMomentum(e.target.value)}
            />
          </div>
          <div>
            <label>warmup_bias_lr:</label>
            <input
              type="number"
              value={warmup_bias_lr}
              onChange={(e) => setWarmupBiasLr(e.target.value)}
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
