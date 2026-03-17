import "../../styles/ImageAnnotator.css";

const AnnotationToolbar = ({
  currentTool,
  onToolSelect,
  onZooomIncr,
  onZoomDecr,
  onApprove,
}) => {
  return (
    <div className="annotation-toolbar">
      <div className="toolbar-buttons">
        <button
          className={`tool-button ${currentTool === "rectangle" ? "active" : ""}`}
          onClick={() =>
            onToolSelect(currentTool === "rectangle" ? null : "rectangle")
          }
          title="Прямоугольник"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="4"
              y="4"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </svg>
        </button>

        <button
          className={`tool-button ${currentTool === "polygon" ? "active" : ""}`}
          onClick={() =>
            onToolSelect(currentTool === "polygon" ? null : "polygon")
          }
          title="Ломаная линия"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 20L8 8L16 12L20 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>

        <button className="tool-button" onClick={onZooomIncr} title="Масштаб +">
          +
        </button>

        <button className="tool-button" onClick={onZoomDecr} title="Масштаб -">
          -
        </button>
      </div>
    </div>
  );
};

export default AnnotationToolbar;
