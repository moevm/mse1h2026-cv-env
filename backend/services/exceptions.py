class PauseTrainingException(Exception):
    """Исключение для остановки обучения при паузе."""
    pass

class StopTrainingException(Exception):
    """Исключение для принудительной остановки обучения."""
    pass