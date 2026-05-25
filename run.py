import os
import subprocess
import sys
import time

def main():
    print("🚀 Запуск проекта (Backend + Frontend)...")

    root_dir = os.path.abspath(os.path.dirname(__file__) or ".")
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    if os.name == 'nt':
        python_executable = os.path.join(root_dir, "venv", "Scripts", "python.exe")
    else:
        python_executable = os.path.join(root_dir, "venv", "bin", "python")

    if not os.path.exists(python_executable):
        print("❌ Виртуальное окружение не найдено! Сначала запустите install.py")
        sys.exit(1)

    backend_cmd = [python_executable, "-m", "uvicorn", "main:app", "--reload"]
    frontend_cmd = ["npm", "run", "dev"]

    processes = []
    use_shell = os.name == 'nt'

    try:
        print("Запуск бэкенда (FastAPI)...")
        p_backend = subprocess.Popen(backend_cmd, cwd=backend_dir, shell=use_shell)
        processes.append(p_backend)

        print("Запуск фронтенда (Vite)...")
        p_frontend = subprocess.Popen(frontend_cmd, cwd=frontend_dir, shell=use_shell)
        processes.append(p_frontend)

        print("\n Нажмите Ctrl+C для остановки...\n")

        while True:
            time.sleep(1)
            if p_backend.poll() is not None:
                print("⚠️ Бэкенд неожиданно остановился.")
                break
            if p_frontend.poll() is not None:
                print("⚠️ Фронтенд неожиданно остановился.")
                break

    except KeyboardInterrupt:
        print("\n🛑 Получен сигнал остановки...")
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        
        time.sleep(5)
        for p in processes:
            if p.poll() is None:
                p.kill()
                
        print("Проект успешно остановлен")

if __name__ == "__main__":
    main()