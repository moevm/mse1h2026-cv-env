import React, { useState, useEffect, useRef } from "react";
import "../../styles/ImageAnnotator.css";

const AnnotationPopup = ({ position, classes, onSave, onCancel }) => {
  const [className, setClassName] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [showNewClassInput, setShowNewClassInput] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    if (popupRef.current) {
      const popup = popupRef.current;
      const rect = popup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = position.x;
      let top = position.y - rect.height - 10;

      if (left + rect.width > viewportWidth) {
        left = viewportWidth - rect.width - 10;
      }
      if (left < 10) {
        left = 10;
      }

      if (top < 10) {
        top = position.y + 20;
      }
      if (top + rect.height > viewportHeight) {
        top = viewportHeight - rect.height - 10;
      }

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }
  }, [position]);

  function handleSave() {
    if (showNewClassInput && className.trim()) {
      onSave(null, className.trim());
    } else if (selectedClass) {
      onSave(selectedClass, null);
    }
  }

  // clear
  useEffect(() => {
    setClassName("");
    setSelectedClass("");
    setShowNewClassInput(false);
  }, [position]);

  return (
    <div className="annotation-popup" ref={popupRef}>
      <div className="popup-header">
        <h4>Выберите класс</h4>
        <button className="popup-close" onClick={onCancel}>
          ×
        </button>
      </div>

      <div className="popup-content">
        {!showNewClassInput ? (
          <>
            {classes.length > 0 ? (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="class-select"
              >
                <option value="">Выберите существующий класс</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="no-classes-message">Нет созданных классов</p>
            )}

            <button
              className="new-class-button"
              onClick={() => setShowNewClassInput(true)}
            >
              + Создать новый класс
            </button>
          </>
        ) : (
          <div className="new-class-input">
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Введите название класса"
              autoFocus
            />
            <div className="new-class-actions">
              <button
                className="back-button"
                onClick={() => setShowNewClassInput(false)}
              >
                ← Назад
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="popup-footer">
        <button className="cancel-button" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="save-button"
          onClick={handleSave}
          disabled={
            !(
              (showNewClassInput && className.trim()) ||
              (!showNewClassInput && selectedClass)
            )
          }
        >
          Сохранить
        </button>
      </div>
    </div>
  );
};

export default AnnotationPopup;
