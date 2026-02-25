import React from "react";

const VersionList = ({ versions, currentVersionId, onSelectVersion }) => {
  return (
    <div className="version-list">
      {versions.length === 0 ? (
        <div className="no-versions">
          <p>Нет версий</p>
          <p className="hint">Создайте первую версию датасета</p>
        </div>
      ) : (
        <></>
      )}
    </div>
  );
};

export default VersionList;
